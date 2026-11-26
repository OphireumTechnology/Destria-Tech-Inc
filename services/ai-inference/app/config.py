"""Immutable environment configuration for DESTRIA AI Inference Service.

Strictly read-only configuration loaded from environment variables.
Unlike upstream Helix `agent/api.py`, this service NEVER writes or mutates
`.env` files on disk and NEVER returns secrets over HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass
import os


def _parse_bool(raw: str | None, default: bool) -> bool:
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(raw: str | None, default: int, min_val: int, max_val: int) -> int:
    try:
        parsed = int(str(raw).strip()) if raw is not None and str(raw).strip() else default
    except (ValueError, TypeError):
        return default
    return max(min_val, min(max_val, parsed))


def _parse_float(raw: str | None, default: float, min_val: float, max_val: float) -> float:
    try:
        parsed = float(str(raw).strip()) if raw is not None and str(raw).strip() else default
    except (ValueError, TypeError):
        return default
    return max(min_val, min(max_val, parsed))


@dataclass(frozen=True)
class InferenceConfig:
    host: str
    port: int
    shared_secret: str
    compute_device: str
    ollama_base_url: str
    ollama_model: str
    whisper_model: str
    whisper_compute_type: str
    whisper_beam_size: int
    kokoro_default_voice: str
    kokoro_sample_rate: int
    allow_espeak_gpl_fallback: bool
    enable_marian_fast_path: bool
    prewarm_models_on_startup: bool
    max_audio_bytes: int
    max_concurrent_vad: int
    max_concurrent_stt: int
    max_concurrent_llm: int
    max_concurrent_tts: int
    max_concurrent_translate: int
    stt_timeout_seconds: float
    llm_timeout_seconds: float
    tts_timeout_seconds: float
    translate_timeout_seconds: float
    circuit_breaker_threshold: int
    circuit_breaker_reset_seconds: float

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "InferenceConfig":
        source = env if env is not None else os.environ

        raw_device = (source.get("COMPUTE_DEVICE") or "auto").strip().lower()
        compute_device = raw_device if raw_device in {"auto", "cuda", "cpu"} else "auto"

        raw_compute_type = (source.get("WHISPER_COMPUTE_TYPE") or "auto").strip().lower()
        if raw_compute_type not in {"auto", "int8", "float16", "float32"}:
            raw_compute_type = "auto"

        # Governance lock: espeak-ng (GPLv3) is strictly disabled unless explicitly reviewed & opted in.
        allow_espeak = _parse_bool(source.get("ALLOW_ESPEAK_GPL_FALLBACK"), False)

        return cls(
            host=(source.get("INFERENCE_HOST") or "127.0.0.1").strip(),
            port=_parse_int(source.get("INFERENCE_PORT"), 8000, 1, 65535),
            shared_secret=(source.get("AI_INFERENCE_SHARED_SECRET") or "").strip(),
            compute_device=compute_device,
            ollama_base_url=(source.get("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").strip().rstrip("/"),
            ollama_model=(source.get("OLLAMA_MODEL") or "qwen2.5:7b-instruct").strip(),
            whisper_model=(source.get("WHISPER_MODEL") or "small").strip(),
            whisper_compute_type=raw_compute_type,
            whisper_beam_size=_parse_int(source.get("WHISPER_BEAM_SIZE"), 2, 1, 5),
            kokoro_default_voice=(source.get("KOKORO_DEFAULT_VOICE") or "af_heart").strip(),
            kokoro_sample_rate=_parse_int(source.get("KOKORO_SAMPLE_RATE"), 24000, 16000, 48000),
            allow_espeak_gpl_fallback=allow_espeak,
            enable_marian_fast_path=_parse_bool(source.get("ENABLE_MARIAN_FAST_PATH"), True),
            prewarm_models_on_startup=_parse_bool(source.get("PREWARM_MODELS_ON_STARTUP"), True),
            max_audio_bytes=_parse_int(source.get("FRONTDESK_MAX_AUDIO_BYTES"), 5 * 1024 * 1024, 32 * 1024, 10 * 1024 * 1024),
            max_concurrent_vad=_parse_int(source.get("MAX_CONCURRENT_VAD"), 8, 1, 64),
            max_concurrent_stt=_parse_int(source.get("MAX_CONCURRENT_STT"), 2, 1, 16),
            max_concurrent_llm=_parse_int(source.get("MAX_CONCURRENT_LLM"), 2, 1, 16),
            max_concurrent_tts=_parse_int(source.get("MAX_CONCURRENT_TTS"), 4, 1, 32),
            max_concurrent_translate=_parse_int(source.get("MAX_CONCURRENT_TRANSLATE"), 4, 1, 32),
            stt_timeout_seconds=_parse_float(source.get("STT_TIMEOUT_SECONDS"), 20.0, 2.0, 120.0),
            llm_timeout_seconds=_parse_float(source.get("LLM_TIMEOUT_SECONDS"), 30.0, 3.0, 120.0),
            tts_timeout_seconds=_parse_float(source.get("TTS_TIMEOUT_SECONDS"), 12.0, 2.0, 60.0),
            translate_timeout_seconds=_parse_float(source.get("TRANSLATE_TIMEOUT_SECONDS"), 8.0, 1.0, 45.0),
            circuit_breaker_threshold=_parse_int(source.get("INFERENCE_CB_THRESHOLD"), 5, 1, 50),
            circuit_breaker_reset_seconds=_parse_float(source.get("INFERENCE_CB_RESET_SECONDS"), 30.0, 5.0, 300.0),
        )

    def safe_public_summary(self) -> dict[str, object]:
        """Returns non-secret operational settings for /v1/health diagnostics."""
        return {
            "computeDevice": self.compute_device,
            "ollamaModel": self.ollama_model,
            "whisperModel": self.whisper_model,
            "whisperBeamSize": self.whisper_beam_size,
            "kokoroDefaultVoice": self.kokoro_default_voice,
            "kokoroSampleRate": self.kokoro_sample_rate,
            "espeakGplFallbackEnabled": self.allow_espeak_gpl_fallback,
            "marianFastPathEnabled": self.enable_marian_fast_path,
            "maxAudioBytes": self.max_audio_bytes,
            "authConfigured": bool(self.shared_secret),
        }
