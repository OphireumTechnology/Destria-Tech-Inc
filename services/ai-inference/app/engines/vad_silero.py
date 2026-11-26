"""Silero VAD Engine adapted from Helix v2.0.6 `agent/vad/silero_engine.py` (MIT).

Preserves Helix's 512-sample FixedVADIterator buffering and `trust_repo=True`
non-interactive startup fix, refactored for per-session web browser audio
streams with bounded session eviction and deterministic energy-based fallback
when PyTorch/Silero weights are unavailable in lightweight test environments.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
import math
import struct
import time
from typing import Callable


@dataclass
class VadResult:
    speech_detected: bool
    probability: float
    speech_start: bool
    speech_end: bool
    backend: str
    latency_ms: float


def pcm16_to_floats(pcm_bytes: bytes) -> list[float]:
    sample_count = len(pcm_bytes) // 2
    if sample_count <= 0:
        return []
    ints = struct.unpack(f"<{sample_count}h", pcm_bytes[: sample_count * 2])
    return [val / 32768.0 for val in ints]


def _rms_probability(samples: list[float]) -> float:
    if not samples:
        return 0.0
    mean_sq = sum(s * s for s in samples) / len(samples)
    rms = math.sqrt(mean_sq)
    # Normalize RMS speech level (~0.02..0.15) smoothly onto [0.0, 1.0]
    return max(0.0, min(1.0, rms * 14.0))


class FixedWindowVadSession:
    """Buffers arbitrary-length 16 kHz PCM into exact 512-sample Silero windows."""

    def __init__(
        self,
        scorer: Callable[[list[float], int], float],
        threshold: float = 0.5,
        sampling_rate: int = 16000,
        min_silence_ms: int = 550,
    ) -> None:
        if sampling_rate not in (8000, 16000):
            raise ValueError("VAD supports 8000 Hz or 16000 Hz mono PCM16 only.")
        self._scorer = scorer
        self._threshold = threshold
        self._sampling_rate = sampling_rate
        self._window_size = 512 if sampling_rate == 16000 else 256
        self._min_silence_samples = int(sampling_rate * min_silence_ms / 1000)
        self._buffer: list[float] = []
        self._triggered = False
        self._temp_end = 0
        self._current_sample = 0
        self.last_probability = 0.0
        self.last_activity = time.monotonic()

    @property
    def is_speaking(self) -> bool:
        return self._triggered

    def reset(self) -> None:
        self._buffer.clear()
        self._triggered = False
        self._temp_end = 0
        self._current_sample = 0
        self.last_probability = 0.0
        self.last_activity = time.monotonic()

    def process_pcm16(self, pcm_bytes: bytes) -> tuple[bool, float, bool, bool]:
        self.last_activity = time.monotonic()
        samples = pcm16_to_floats(pcm_bytes)
        if not samples:
            return self._triggered, self.last_probability, False, False

        self._buffer.extend(samples)
        speech_start = False
        speech_end = False
        max_prob = self.last_probability

        while len(self._buffer) >= self._window_size:
            window = self._buffer[: self._window_size]
            del self._buffer[: self._window_size]
            self._current_sample += len(window)
            prob = float(self._scorer(window, self._sampling_rate))
            self.last_probability = prob
            max_prob = max(max_prob, prob)

            if prob >= self._threshold and self._temp_end:
                self._temp_end = 0

            if prob >= self._threshold and not self._triggered:
                self._triggered = True
                speech_start = True
                speech_end = False
            elif prob < (self._threshold - 0.15) and self._triggered:
                if not self._temp_end:
                    self._temp_end = self._current_sample
                if self._current_sample - self._temp_end >= self._min_silence_samples:
                    self._triggered = False
                    self._temp_end = 0
                    speech_end = True

        return self._triggered, round(max_prob, 4), speech_start, speech_end


class SileroVadManager:
    """Manages Silero VAD singleton weights + bounded per-session states."""

    def __init__(self, max_sessions: int = 256, threshold: float = 0.5) -> None:
        self._max_sessions = max_sessions
        self._threshold = threshold
        self._sessions: OrderedDict[str, FixedWindowVadSession] = OrderedDict()
        self._silero_model = None
        self._backend = "uninitialized"
        self._ready = False
        self._last_error: str | None = None

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def backend(self) -> str:
        return self._backend

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def prewarm(self) -> bool:
        """Loads Silero VAD non-interactively (trust_repo=True) or falls back cleanly."""
        try:
            import torch  # type: ignore

            torch.set_num_threads(1)
            model, _ = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                trust_repo=True,
            )
            self._silero_model = model
            self._backend = "silero_torch"
            self._ready = True
            self._last_error = None
            return True
        except Exception as exc:
            self._silero_model = None
            self._backend = "rms_energy_fallback"
            self._ready = True
            self._last_error = f"Silero unavailable, using RMS fallback: {exc}"
            return True

    def _score_window(self, window: list[float], sample_rate: int) -> float:
        if self._silero_model is not None:
            import torch  # type: ignore

            with torch.no_grad():
                tensor = torch.tensor(window, dtype=torch.float32)
                return float(self._silero_model(tensor, sample_rate).item())
        return _rms_probability(window)

    def _get_or_create_session(self, session_id: str, sample_rate: int) -> FixedWindowVadSession:
        existing = self._sessions.get(session_id)
        if existing is not None:
            self._sessions.move_to_end(session_id)
            return existing
        while len(self._sessions) >= self._max_sessions:
            self._sessions.popitem(last=False)
        session = FixedWindowVadSession(
            scorer=self._score_window,
            threshold=self._threshold,
            sampling_rate=sample_rate,
        )
        self._sessions[session_id] = session
        return session

    def reset_session(self, session_id: str) -> None:
        session = self._sessions.get(session_id)
        if session is not None:
            session.reset()

    def process(self, session_id: str, pcm_bytes: bytes, sample_rate: int = 16000, reset: bool = False) -> VadResult:
        started = time.perf_counter()
        if not self._ready:
            self.prewarm()
        session = self._get_or_create_session(session_id, sample_rate)
        if reset:
            session.reset()
        speaking, prob, started_flag, ended_flag = session.process_pcm16(pcm_bytes)
        elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
        return VadResult(
            speech_detected=speaking or started_flag,
            probability=prob,
            speech_start=started_flag,
            speech_end=ended_flag,
            backend=self._backend,
            latency_ms=elapsed_ms,
        )

    def status(self) -> dict[str, object]:
        return {
            "ready": self._ready,
            "backend": self._backend,
            "activeSessions": len(self._sessions),
            "lastError": self._last_error,
        }
