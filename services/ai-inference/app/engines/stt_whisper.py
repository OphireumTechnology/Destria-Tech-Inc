"""Faster-Whisper STT Engine adapted from Helix v2.0.6 `agent/stt/whisper_engine.py` (MIT).

Preserves Helix v2.0.6 multilingual detection & live beam_size tuning while
adding:
- Safe automatic CUDA -> CPU fallback when CUDA shared libraries are missing
  (Helix v1.6-v1.9.2 reliability repair).
- Hallucination suppression for silent/noise-only audio clips.
- WAV/PCM16 input validation and duration bounds.
"""

from __future__ import annotations

from dataclasses import dataclass
import io
import time
import wave

from app.config import InferenceConfig

HALLUCINATION_PHRASES = {
    "thank you.",
    "thanks for watching.",
    "thanks for watching!",
    "subscribe",
    "you",
    "...",
    "bye.",
}


@dataclass
class SttResult:
    text: str
    language: str
    language_probability: float
    duration_sec: float
    latency_ms: float
    device_used: str
    beam_size_used: int


def extract_pcm_duration(audio_bytes: bytes, sample_rate: int = 16000) -> float:
    if audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE":
        with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate() or sample_rate
            return round(frames / float(rate), 3)
    return round((len(audio_bytes) / 2.0) / float(sample_rate), 3)


def pcm16_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    if pcm_bytes[:4] == b"RIFF" and pcm_bytes[8:12] == b"WAVE":
        return pcm_bytes
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


def normalize_whisper_language(raw_lang: str | None) -> str:
    code = (raw_lang or "en").strip().lower()
    if code in {"tl", "fil", "tagalog", "filipino"}:
        return "fil-PH"
    if code.startswith("es"):
        return "es-ES"
    if code.startswith("fr"):
        return "fr-FR"
    return "en-US"


class WhisperSttEngine:
    """Thread-safe Faster-Whisper CTranslate2 wrapper with CUDA->CPU fallback."""

    def __init__(self, config: InferenceConfig) -> None:
        self._config = config
        self._model = None
        self._device_used = "uninitialized"
        self._compute_type_used = "uninitialized"
        self._ready = False
        self._last_error: str | None = None

    @property
    def ready(self) -> bool:
        return self._ready

    def _resolve_device_plan(self) -> list[tuple[str, str]]:
        desired_device = self._config.compute_device
        desired_compute = self._config.whisper_compute_type
        if desired_device == "cpu":
            return [("cpu", "int8" if desired_compute == "auto" else desired_compute)]
        if desired_device == "cuda":
            return [
                ("cuda", "float16" if desired_compute == "auto" else desired_compute),
                ("cpu", "int8"),
            ]
        # auto: try CUDA float16 first if available, then fall back cleanly to CPU int8
        return [("cuda", "float16"), ("cpu", "int8")]

    def prewarm(self) -> bool:
        if self._model is not None and self._ready:
            return True
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except Exception as exc:
            self._ready = False
            self._last_error = f"faster-whisper not installed: {exc}"
            return False

        last_exc: Exception | None = None
        for device, compute_type in self._resolve_device_plan():
            try:
                self._model = WhisperModel(
                    self._config.whisper_model,
                    device=device,
                    compute_type=compute_type,
                )
                self._device_used = device
                self._compute_type_used = compute_type
                self._ready = True
                self._last_error = None
                return True
            except Exception as exc:
                last_exc = exc
                continue

        self._model = None
        self._ready = False
        self._last_error = f"Failed to initialize Whisper model: {last_exc}"
        return False

    def transcribe(
        self,
        audio_bytes: bytes,
        sample_rate: int = 16000,
        language_hint: str | None = None,
        beam_size: int | None = None,
    ) -> SttResult:
        started = time.perf_counter()
        if not audio_bytes or len(audio_bytes) < 640:
            return SttResult(
                text="",
                language=normalize_whisper_language(language_hint),
                language_probability=0.0,
                duration_sec=extract_pcm_duration(audio_bytes, sample_rate),
                latency_ms=round((time.perf_counter() - started) * 1000.0, 2),
                device_used=self._device_used,
                beam_size_used=self._config.whisper_beam_size,
            )

        if not self._ready and not self.prewarm():
            raise RuntimeError(self._last_error or "Whisper STT model is not ready.")

        clamped_beam = max(1, min(5, beam_size if beam_size is not None else self._config.whisper_beam_size))
        wav_bytes = pcm16_to_wav_bytes(audio_bytes, sample_rate)
        duration_sec = extract_pcm_duration(wav_bytes, sample_rate)

        whisper_lang = None
        if language_hint:
            hint_lower = language_hint.strip().lower()
            if hint_lower.startswith("fil") or hint_lower == "tl":
                whisper_lang = "tl"
            elif hint_lower.startswith("en"):
                whisper_lang = "en"
            elif hint_lower.startswith("es"):
                whisper_lang = "es"
            elif hint_lower.startswith("fr"):
                whisper_lang = "fr"

        segments, info = self._model.transcribe(
            io.BytesIO(wav_bytes),
            language=whisper_lang,
            beam_size=clamped_beam,
            vad_filter=True,
            without_timestamps=True,
        )
        raw_text = " ".join(seg.text.strip() for seg in segments).strip()
        if raw_text.lower() in HALLUCINATION_PHRASES and duration_sec < 1.5:
            raw_text = ""

        detected_lang = normalize_whisper_language(getattr(info, "language", None) or language_hint)
        prob = float(getattr(info, "language_probability", 0.0) or 0.0)
        elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
        return SttResult(
            text=raw_text,
            language=detected_lang,
            language_probability=round(prob, 4),
            duration_sec=duration_sec,
            latency_ms=elapsed_ms,
            device_used=self._device_used,
            beam_size_used=clamped_beam,
        )

    def status(self) -> dict[str, object]:
        return {
            "ready": self._ready,
            "model": self._config.whisper_model,
            "device": self._device_used,
            "computeType": self._compute_type_used,
            "beamSize": self._config.whisper_beam_size,
            "lastError": self._last_error,
        }
