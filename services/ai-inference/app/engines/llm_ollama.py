"""Local Ollama Qwen2.5-7B-Instruct reasoning client (zero paid API fallback).

Replaces Helix's Asterisk-coupled `intent_engine.py` and `ari_agent.py` with a
clean, cancellable corporate reasoning adapter targeting local Ollama
`qwen2.5:7b-instruct` (Apache-2.0) — zero hidden easter eggs and zero automatic
paid cloud API fallback.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import time
import urllib.error
import urllib.request


@dataclass
class LlmReplyResult:
    reply_text: str
    model: str
    tokens_generated: int
    latency_ms: float
    cancelled: bool = False


class OllamaLlmEngine:
    """Private loopback HTTP client for local Ollama (`qwen2.5:7b-instruct`)."""

    def __init__(self, base_url: str, model: str, timeout_seconds: float = 30.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._ready = False
        self._available_models: list[str] = []
        self._last_error: str | None = None

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def model(self) -> str:
        return self._model

    def probe_ready(self) -> bool:
        """Checks Ollama `/api/tags` reachability and verifies target model presence."""
        req = urllib.request.Request(f"{self._base_url}/api/tags", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                if resp.status != 200:
                    self._ready = False
                    self._last_error = f"Ollama returned HTTP {resp.status}"
                    return False
                data = json.loads(resp.read().decode("utf-8"))
                models = [str(m.get("name", "")) for m in data.get("models", []) if isinstance(m, dict)]
                self._available_models = models
                model_prefix = self._model.split(":")[0]
                matched = any(m == self._model or m.startswith(f"{model_prefix}:") for m in models)
                self._ready = matched
                self._last_error = None if matched else f"Model '{self._model}' not pulled in Ollama."
                return self._ready
        except Exception as exc:
            self._ready = False
            self._last_error = f"Ollama unreachable at {self._base_url}: {exc}"
            return False

    def generate_reply(
        self,
        system_prompt: str,
        user_message: str,
        history: list[dict[str, str]] | None = None,
        knowledge_context: list[str] | None = None,
        temperature: float = 0.35,
        max_tokens: int = 350,
    ) -> LlmReplyResult:
        started = time.perf_counter()
        messages: list[dict[str, str]] = []

        kb_block = ""
        if knowledge_context:
            safe_snippets = [str(item).strip() for item in knowledge_context if str(item).strip()][:8]
            if safe_snippets:
                kb_block = "\n\nVERIFIED APPROVED PUBLIC CORPORATE KNOWLEDGE:\n" + "\n".join(
                    f"- {snippet}" for snippet in safe_snippets
                )

        messages.append({"role": "system", "content": f"{system_prompt.strip()}{kb_block}"})

        for turn in (history or [])[-12:]:
            role = "assistant" if turn.get("role") in {"assistant", "ai"} else "user"
            content = str(turn.get("content") or turn.get("text") or "").strip()
            if content:
                messages.append({"role": role, "content": content[:1500]})

        messages.append({"role": "user", "content": user_message.strip()[:2000]})

        payload = json.dumps(
            {
                "model": self._model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": max(0.0, min(1.0, float(temperature))),
                    "num_predict": max(32, min(1024, int(max_tokens))),
                },
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            f"{self._base_url}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout_seconds) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            self._ready = False
            self._last_error = f"Ollama chat request failed: {exc}"
            raise RuntimeError(self._last_error) from exc

        reply_text = str(((raw.get("message") or {}).get("content")) or "").strip()
        tokens = int(raw.get("eval_count") or len(reply_text.split()))
        elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
        self._ready = True
        self._last_error = None
        return LlmReplyResult(
            reply_text=reply_text,
            model=str(raw.get("model") or self._model),
            tokens_generated=tokens,
            latency_ms=elapsed_ms,
        )

    def status(self) -> dict[str, object]:
        return {
            "ready": self._ready,
            "model": self._model,
            "availableModelsCount": len(self._available_models),
            "lastError": self._last_error,
        }
