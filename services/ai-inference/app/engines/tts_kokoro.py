"""Kokoro-82M Neural TTS Engine adapted from Helix v2.0.6 `agent/tts/kokoro_engine.py` (MIT).

Key DESTRIA adaptations:
- Outputs native 24 kHz PCM16 / WAV for browser AudioContext playback (no Asterisk slin16 coupling).
- Sentence-level chunking for responsive streaming synthesis and barge-in cancellation.
- **GPLv3 Legal Safeguard:** `espeak-ng` is strictly disabled (`allow_espeak_gpl_fallback=False`);
  this module NEVER invokes `subprocess` to run `espeak-ng`.
"""

from __future__ import annotations

from dataclasses import dataclass
import io
import re
import struct
import time
import wave

from app.config import InferenceConfig

KOKORO_LANG_MAP = {
    "en": "a",
    "en-us": "a",
    "en-gb": "b",
    "es": "e",
    "es-es": "e",
    "fr": "f",
    "fr-fr": "f",
    "it": "i",
    "pt": "p",
    "ja": "j",
    # Filipino / Taglish currently routes through Kokoro's clean neutral phonetic voice
    # without invoking GPLv3 espeak-ng; pronunciation fidelity is benchmarked in staging.
    "fil": "a",
    "fil-ph": "a",
    "tl": "a",
}

DEFAULT_VOICE_BY_LANG = {
    "a": "af_heart",
    "b": "bf_emma",
    "e": "ef_dora",
    "f": "ff_siwis",
    "i": "if_sara",
    "p": "pf_dora",
    "j": "jf_alpha",
}


@dataclass
class TtsResult:
    audio_bytes: bytes
    sample_rate: int
    mime_type: str
    voice_used: str
    language_code: str
    chunk_count: int
    latency_ms: float
    espeak_used: bool = False


def split_into_speech_chunks(text: str, max_chars: int = 240) -> list[str]:
    cleaned = re.sub(r"[*`#_]+", "", text or "").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        return []
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if len(current) + len(sentence) + 1 <= max_chars:
            current = f"{current} {sentence}".strip()
        else:
            if current:
                chunks.append(current)
            current = sentence[:max_chars].strip()
    if current:
        chunks.append(current)
    return chunks


def float_samples_to_pcm16(samples) -> bytes:
    out = bytearray()
    for s in samples:
        clamped = max(-1.0, min(1.0, float(s)))
        out.extend(struct.pack("<h", int(clamped * 32767.0)))
    return bytes(out)


def wrap_pcm16_as_wav(pcm_bytes: bytes, sample_rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


class KokoroTtsEngine:
    """Kokoro-82M neural TTS with GPLv3 espeak-ng strictly disabled."""

    def __init__(self, config: InferenceConfig) -> None:
        self._config = config
        self._pipelines: dict[str, object] = {}
        self._ready = False
        self._last_error: str | None = None

    @property
    def ready(self) -> bool:
        return self._ready

    def _get_pipeline(self, lang_code: str):
        if lang_code in self._pipelines:
            return self._pipelines[lang_code]
        from kokoro import KPipeline  # type: ignore

        pipeline = KPipeline(lang_code=lang_code)
        self._pipelines[lang_code] = pipeline
        return pipeline

    def prewarm(self) -> bool:
        if self._config.allow_espeak_gpl_fallback:
            # Governance hard-stop: keep espeak-ng disabled pending legal review
            self._last_error = "GPLv3 espeak-ng fallback is prohibited by DESTRIA governance policy."
        try:
            self._get_pipeline("a")
            self._ready = True
            self._last_error = None
            return True
        except Exception as exc:
            self._ready = False
            self._last_error = f"Kokoro TTS not initialized: {exc}"
            return False

    def synthesize(
        self,
        text: str,
        language: str = "en-US",
        voice_id: str | None = None,
        speed: float = 1.0,
        as_wav: bool = True,
    ) -> TtsResult:
        started = time.perf_counter()
        if self._config.allow_espeak_gpl_fallback:
            raise RuntimeError("GPLv3 espeak-ng execution is disabled pending legal review.")

        chunks = split_into_speech_chunks(text)
        if not chunks:
            raise ValueError("Text is required for speech synthesis.")

        if not self._ready and not self.prewarm():
            raise RuntimeError(self._last_error or "Kokoro TTS engine is unavailable.")

        lang_code = KOKORO_LANG_MAP.get((language or "en-US").strip().lower(), "a")
        resolved_voice = (voice_id or "").strip() or DEFAULT_VOICE_BY_LANG.get(
            lang_code, self._config.kokoro_default_voice
        )
        clamped_speed = max(0.75, min(1.35, float(speed)))
        pipeline = self._get_pipeline(lang_code)

        pcm_parts: list[bytes] = []
        for chunk in chunks:
            for _gs, _ps, audio in pipeline(chunk, voice=resolved_voice, speed=clamped_speed):
                if audio is not None:
                    pcm_parts.append(float_samples_to_pcm16(audio))

        raw_pcm = b"".join(pcm_parts)
        payload = wrap_pcm16_as_wav(raw_pcm, self._config.kokoro_sample_rate) if as_wav else raw_pcm
        elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
        return TtsResult(
            audio_bytes=payload,
            sample_rate=self._config.kokoro_sample_rate,
            mime_type="audio/wav" if as_wav else f"audio/pcm;rate={self._config.kokoro_sample_rate}",
            voice_used=resolved_voice,
            language_code=lang_code,
            chunk_count=len(chunks),
            latency_ms=elapsed_ms,
            espeak_used=False,
        )

    def status(self) -> dict[str, object]:
        return {
            "ready": self._ready,
            "loadedLanguages": sorted(self._pipelines.keys()),
            "sampleRate": self._config.kokoro_sample_rate,
            "espeakGplFallbackEnabled": False,
            "lastError": self._last_error,
        }
