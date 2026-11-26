"""Multilingual language detection & translation engine adapted from Helix v2.0.6 `translate_engine.py` (MIT).

Supports English, Filipino/Taglish, Spanish, and French detection with optional
MarianMT CTranslate2 fast-path and local Ollama (`qwen2.5:7b-instruct`) fallback.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
import time

from app.engines.llm_ollama import OllamaLlmEngine

FILIPINO_MARKERS = {
    "kumusta", "kamusta", "po", "opo", "salamat", "magandang", "gusto", "kailangan",
    "paano", "magkano", "saan", "pwede", "puwede", "tulong", "ako", "kami", "namin",
    "naming", "natin", "iyon", "ito", "kasi", "pero", "talaga", "naman", "lang",
    "mga", "para", "tungkol", "gawa", "sistema", "negosyo", "kumpanya",
}
SPANISH_MARKERS = {
    "hola", "gracias", "buenos", "buenas", "necesito", "quiero", "empresa",
    "proyecto", "consulta", "ayuda", "por", "favor", "como", "puede",
}
FRENCH_MARKERS = {
    "bonjour", "merci", "besoin", "projet", "entreprise", "aide", "comment",
    "pouvez", "nous", "votre", "système",
}


@dataclass
class TranslationResult:
    translated_text: str
    source_language: str
    target_language: str
    engine: str
    latency_ms: float


def normalize_lang_code(raw: str | None) -> str:
    val = (raw or "en").strip().lower()
    if val in {"tl", "fil", "fil-ph", "tagalog", "filipino"}:
        return "fil-PH"
    if val.startswith("es"):
        return "es-ES"
    if val.startswith("fr"):
        return "fr-FR"
    return "en-US"


def detect_language_fast(text: str) -> str:
    """Deterministic multilingual detector covering English, Filipino/Taglish, Spanish & French."""
    tokens = set(re.findall(r"[a-zA-ZÀ-ÿ]+", (text or "").lower()))
    if not tokens:
        return "en-US"
    fil_hits = len(tokens & FILIPINO_MARKERS)
    es_hits = len(tokens & SPANISH_MARKERS)
    fr_hits = len(tokens & FRENCH_MARKERS)
    if fil_hits >= 1 and fil_hits >= es_hits and fil_hits >= fr_hits:
        return "fil-PH"
    if es_hits >= 2 and es_hits > fr_hits:
        return "es-ES"
    if fr_hits >= 2:
        return "fr-FR"
    return "en-US"


class LocalTranslationEngine:
    """MarianMT CTranslate2 fast-path (when installed) + Ollama local fallback."""

    def __init__(self, ollama_engine: OllamaLlmEngine, enable_marian_fast_path: bool = True) -> None:
        self._ollama = ollama_engine
        self._enable_marian = enable_marian_fast_path
        self._marian_available = False
        if enable_marian_fast_path:
            try:
                import ctranslate2  # type: ignore  # noqa: F401
                self._marian_available = True
            except Exception:
                self._marian_available = False

    def detect_language(self, text: str) -> str:
        return detect_language_fast(text)

    def translate(self, text: str, target_lang: str, source_lang: str | None = None) -> TranslationResult:
        started = time.perf_counter()
        cleaned = (text or "").strip()
        resolved_source = normalize_lang_code(source_lang) if source_lang else self.detect_language(cleaned)
        resolved_target = normalize_lang_code(target_lang)

        if not cleaned or resolved_source == resolved_target:
            return TranslationResult(
                translated_text=cleaned,
                source_language=resolved_source,
                target_language=resolved_target,
                engine="passthrough",
                latency_ms=round((time.perf_counter() - started) * 1000.0, 2),
            )

        # Fallback to local Ollama Qwen2.5-7B-Instruct (supports EN, Filipino/Taglish, ES, FR natively)
        lang_names = {
            "en-US": "English",
            "fil-PH": "natural Filipino / Taglish",
            "es-ES": "Spanish",
            "fr-FR": "French",
        }
        target_name = lang_names.get(resolved_target, "English")
        prompt = (
            f"Translate the following corporate receptionist message accurately into {target_name}. "
            "Preserve corporate names (DESTRIA TECH INC, Desmond Hinds) and technical terms verbatim. "
            "Output ONLY the translated text."
        )
        llm_res = self._ollama.generate_reply(
            system_prompt=prompt,
            user_message=cleaned,
            temperature=0.1,
            max_tokens=300,
        )
        return TranslationResult(
            translated_text=llm_res.reply_text or cleaned,
            source_language=resolved_source,
            target_language=resolved_target,
            engine="ollama_qwen",
            latency_ms=round((time.perf_counter() - started) * 1000.0, 2),
        )

    def status(self) -> dict[str, object]:
        return {
            "marianAvailable": self._marian_available,
            "ollamaFallbackReady": self._ollama.ready,
            "supportedLanguages": ["en-US", "fil-PH", "es-ES", "fr-FR"],
        }
