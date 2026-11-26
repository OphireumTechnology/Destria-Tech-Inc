"""Runtime controller: prewarming, bounded queues, timeouts, cancellation, circuit breaker & telemetry."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import resource
import time
from typing import Any, Awaitable, Callable, TypeVar

from app.config import InferenceConfig
from app.engines.llm_ollama import OllamaLlmEngine
from app.engines.stt_whisper import WhisperSttEngine
from app.engines.translate import LocalTranslationEngine
from app.engines.tts_kokoro import KokoroTtsEngine
from app.engines.vad_silero import SileroVadManager

T = TypeVar("T")


class QueueFullError(RuntimeError):
    """Raised when a bounded inference engine queue has no free slot."""


class InferenceTimeoutError(TimeoutError):
    """Raised when an inference operation exceeds its configured budget."""


class RequestCancelledError(RuntimeError):
    """Raised when an active request is explicitly cancelled (e.g., voice barge-in)."""


class CircuitBreakerOpenError(RuntimeError):
    """Raised when consecutive failures trip the local engine circuit breaker."""


@dataclass
class EngineCircuitBreaker:
    threshold: int
    reset_seconds: float
    failures: int = 0
    opened_at: float | None = None

    def check(self) -> None:
        if self.opened_at is None:
            return
        if (time.monotonic() - self.opened_at) >= self.reset_seconds:
            # Half-open recovery trial
            self.opened_at = None
            self.failures = max(0, self.threshold - 1)
            return
        raise CircuitBreakerOpenError("Inference engine circuit breaker is currently open.")

    def record_success(self) -> None:
        self.failures = 0
        self.opened_at = None

    def record_failure(self) -> None:
        self.failures += 1
        if self.failures >= self.threshold:
            self.opened_at = time.monotonic()

    def status(self) -> dict[str, object]:
        return {
            "open": self.opened_at is not None and (time.monotonic() - self.opened_at) < self.reset_seconds,
            "consecutiveFailures": self.failures,
            "threshold": self.threshold,
        }


def _read_rss_memory_mb() -> float:
    try:
        # On Linux ru_maxrss is in kilobytes
        usage = resource.getrusage(resource.RUSAGE_SELF)
        return round(usage.ru_maxrss / 1024.0, 2)
    except Exception:
        return 0.0


def _read_gpu_vram_mb() -> float | None:
    try:
        import torch  # type: ignore

        if torch.cuda.is_available():
            return round(torch.cuda.memory_allocated() / (1024.0 * 1024.0), 2)
    except Exception:
        return None
    return None


class InferenceRuntime:
    """Central runtime owning engines, bounded queues, cancellation, and health telemetry."""

    def __init__(
        self,
        config: InferenceConfig | None = None,
        vad: SileroVadManager | None = None,
        stt: WhisperSttEngine | None = None,
        tts: KokoroTtsEngine | None = None,
        llm: OllamaLlmEngine | None = None,
        translator: LocalTranslationEngine | None = None,
    ) -> None:
        self.config = config or InferenceConfig.from_env()
        self.started_at = time.monotonic()
        self.vad = vad or SileroVadManager()
        self.stt = stt or WhisperSttEngine(self.config)
        self.tts = tts or KokoroTtsEngine(self.config)
        self.llm = llm or OllamaLlmEngine(
            base_url=self.config.ollama_base_url,
            model=self.config.ollama_model,
            timeout_seconds=self.config.llm_timeout_seconds,
        )
        self.translator = translator or LocalTranslationEngine(
            ollama_engine=self.llm,
            enable_marian_fast_path=self.config.enable_marian_fast_path,
        )

        self._semaphores = {
            "vad": asyncio.Semaphore(self.config.max_concurrent_vad),
            "stt": asyncio.Semaphore(self.config.max_concurrent_stt),
            "llm": asyncio.Semaphore(self.config.max_concurrent_llm),
            "tts": asyncio.Semaphore(self.config.max_concurrent_tts),
            "translate": asyncio.Semaphore(self.config.max_concurrent_translate),
        }
        self._in_flight_counts = {k: 0 for k in self._semaphores}
        self._breakers = {
            name: EngineCircuitBreaker(
                threshold=self.config.circuit_breaker_threshold,
                reset_seconds=self.config.circuit_breaker_reset_seconds,
            )
            for name in ("stt", "llm", "tts", "translate")
        }
        self._active_tasks: dict[str, asyncio.Task[Any]] = {}
        self._cancelled_ids: set[str] = set()
        self._prewarmed = False

    def prewarm_all(self) -> dict[str, bool]:
        results = {
            "vad": self.vad.prewarm(),
            "stt": self.stt.prewarm(),
            "tts": self.tts.prewarm(),
            "llm": self.llm.probe_ready(),
        }
        self._prewarmed = True
        return results

    def cancel_request(self, request_id: str) -> bool:
        self._cancelled_ids.add(request_id)
        if len(self._cancelled_ids) > 1000:
            self._cancelled_ids.pop()
        task = self._active_tasks.get(request_id)
        if task is not None and not task.done():
            task.cancel()
            return True
        return False

    async def run_bounded(
        self,
        engine_name: str,
        timeout_seconds: float,
        fn: Callable[[], T] | Callable[[], Awaitable[T]],
        request_id: str | None = None,
    ) -> T:
        if request_id and request_id in self._cancelled_ids:
            raise RequestCancelledError(f"Request '{request_id}' was cancelled before execution.")

        breaker = self._breakers.get(engine_name)
        if breaker is not None:
            breaker.check()

        sem = self._semaphores[engine_name]
        if sem.locked():
            raise QueueFullError(f"Engine '{engine_name}' bounded concurrency queue is full.")

        await sem.acquire()
        self._in_flight_counts[engine_name] += 1

        async def _invoke() -> T:
            res = fn()
            if asyncio.iscoroutine(res) or isinstance(res, Awaitable):
                return await res  # type: ignore[return-value]
            return res  # type: ignore[return-value]

        task = asyncio.create_task(_invoke())
        if request_id:
            self._active_tasks[request_id] = task

        try:
            result = await asyncio.wait_for(task, timeout=timeout_seconds)
            if request_id and request_id in self._cancelled_ids:
                raise RequestCancelledError(f"Request '{request_id}' cancelled during completion.")
            if breaker is not None:
                breaker.record_success()
            return result
        except asyncio.CancelledError as exc:
            raise RequestCancelledError(f"Request '{request_id or engine_name}' cancelled.") from exc
        except asyncio.TimeoutError as exc:
            task.cancel()
            if breaker is not None:
                breaker.record_failure()
            raise InferenceTimeoutError(
                f"Engine '{engine_name}' exceeded {timeout_seconds:.1f}s timeout."
            ) from exc
        except Exception:
            if breaker is not None:
                breaker.record_failure()
            raise
        finally:
            self._in_flight_counts[engine_name] = max(0, self._in_flight_counts[engine_name] - 1)
            if request_id:
                self._active_tasks.pop(request_id, None)
            sem.release()

    def is_ready(self) -> bool:
        return bool(self.vad.ready and self.stt.ready and self.tts.ready and self.llm.ready)

    def health_snapshot(self) -> dict[str, object]:
        ready = self.is_ready()
        return {
            "status": "healthy" if ready else "degraded",
            "ready": ready,
            "prewarmed": self._prewarmed,
            "uptimeSeconds": round(time.monotonic() - self.started_at, 2),
            "config": self.config.safe_public_summary(),
            "engines": {
                "vad": self.vad.status(),
                "stt": self.stt.status(),
                "tts": self.tts.status(),
                "llm": self.llm.status(),
                "translate": self.translator.status(),
            },
            "queues": {
                name: {
                    "inFlight": self._in_flight_counts[name],
                    "maxConcurrent": getattr(self.config, f"max_concurrent_{name}"),
                }
                for name in self._semaphores
            },
            "circuitBreakers": {name: cb.status() for name, cb in self._breakers.items()},
            "resources": {
                "rssMemoryMb": _read_rss_memory_mb(),
                "gpuVramMb": _read_gpu_vram_mb(),
            },
        }
