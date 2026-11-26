"""Runnable Python unittest suite for DESTRIA AI Inference Service (`services/ai-inference`).

Verifies authentication, immutable config validation, Silero/FixedWindow VAD
512-sample framing, Whisper hallucination & beam clamping, Kokoro GPLv3
espeak-ng hard-block, multilingual EN/Filipino/Taglish/ES/FR detection,
local Ollama HTTP client against a live local test server, bounded concurrency
queues, request cancellation, timeouts, and circuit breaker protection.
"""

from __future__ import annotations

import asyncio
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import math
from pathlib import Path
import struct
import sys
import threading
import time
import unittest

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.auth import verify_service_auth
from app.config import InferenceConfig
from app.engines.llm_ollama import OllamaLlmEngine
from app.engines.stt_whisper import (
    WhisperSttEngine,
    extract_pcm_duration,
    normalize_whisper_language,
    pcm16_to_wav_bytes,
)
from app.engines.translate import LocalTranslationEngine, detect_language_fast
from app.engines.tts_kokoro import (
    KokoroTtsEngine,
    split_into_speech_chunks,
    wrap_pcm16_as_wav,
)
from app.engines.vad_silero import FixedWindowVadSession, SileroVadManager
from app.runtime import (
    CircuitBreakerOpenError,
    InferenceRuntime,
    InferenceTimeoutError,
    QueueFullError,
    RequestCancelledError,
)


def _generate_pcm16_tone(duration_sec: float, amplitude: float, sample_rate: int = 16000) -> bytes:
    n = int(duration_sec * sample_rate)
    out = bytearray()
    for i in range(n):
        val = int(max(-1.0, min(1.0, amplitude * math.sin(2.0 * math.pi * 440.0 * i / sample_rate))) * 32767)
        out.extend(struct.pack("<h", val))
    return bytes(out)


class _MockOllamaHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/tags":
            body = json.dumps({"models": [{"name": "qwen2.5:7b-instruct"}]}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if self.path == "/api/chat":
            user_msg = payload["messages"][-1]["content"]
            reply = f"DESTRIA AI Receptionist (Qwen2.5 local): Received '{user_msg[:60]}'."
            body = json.dumps({
                "model": payload.get("model", "qwen2.5:7b-instruct"),
                "message": {"role": "assistant", "content": reply},
                "eval_count": 14,
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


class InferenceServiceTests(unittest.TestCase):
    def test_immutable_config_defaults_and_clamping(self) -> None:
        cfg = InferenceConfig.from_env({
            "WHISPER_BEAM_SIZE": "99",
            "COMPUTE_DEVICE": "invalid-device",
            "AI_INFERENCE_SHARED_SECRET": "super-secret-value-at-least-32-bytes-long",
        })
        self.assertEqual(cfg.ollama_model, "qwen2.5:7b-instruct")
        self.assertEqual(cfg.whisper_beam_size, 5)
        self.assertEqual(cfg.compute_device, "auto")
        self.assertFalse(cfg.allow_espeak_gpl_fallback)
        summary = cfg.safe_public_summary()
        self.assertNotIn("shared_secret", json.dumps(summary))
        self.assertNotIn("super-secret-value", json.dumps(summary))
        self.assertTrue(summary["authConfigured"])

    def test_constant_time_service_auth_fail_closed(self) -> None:
        secret = "dti-private-inference-shared-secret-2026"
        self.assertEqual(verify_service_auth(None, secret), (False, "MISSING_SERVICE_AUTH"))
        self.assertEqual(verify_service_auth("Bearer wrong-token", secret), (False, "INVALID_SERVICE_AUTH"))
        self.assertEqual(verify_service_auth(f"Bearer {secret}", secret), (True, "OK"))
        self.assertEqual(verify_service_auth(f"Bearer {secret}", "short"), (False, "SERVICE_AUTH_NOT_CONFIGURED"))

    def test_fixed_window_vad_speech_start_and_end(self) -> None:
        vad = SileroVadManager()
        vad.prewarm()
        # Loud 440Hz speech-energy tone -> speechStart
        speech_pcm = _generate_pcm16_tone(0.15, amplitude=0.25)
        res_start = vad.process("sess-vad-1", speech_pcm, sample_rate=16000)
        self.assertTrue(res_start.speech_detected)
        self.assertTrue(res_start.speech_start)

        # Silence for > 600ms -> speechEnd
        silence_pcm = b"\x00" * (16000 * 2)
        res_end = vad.process("sess-vad-1", silence_pcm, sample_rate=16000)
        self.assertTrue(res_end.speech_end)
        self.assertFalse(res_end.speech_detected)

        with self.assertRaises(ValueError):
            FixedWindowVadSession(lambda _w, _sr: 0.0, sampling_rate=44100)

    def test_whisper_wav_conversion_and_language_normalization(self) -> None:
        pcm = _generate_pcm16_tone(0.5, amplitude=0.1)
        wav = pcm16_to_wav_bytes(pcm, 16000)
        self.assertEqual(wav[:4], b"RIFF")
        self.assertAlmostEqual(extract_pcm_duration(wav, 16000), 0.5, places=2)
        self.assertEqual(normalize_whisper_language("tl"), "fil-PH")
        self.assertEqual(normalize_whisper_language("en"), "en-US")
        self.assertEqual(normalize_whisper_language("es"), "es-ES")
        self.assertEqual(normalize_whisper_language("fr"), "fr-FR")

        cfg = InferenceConfig.from_env({"COMPUTE_DEVICE": "cuda"})
        stt = WhisperSttEngine(cfg)
        self.assertEqual(stt._resolve_device_plan(), [("cuda", "float16"), ("cpu", "int8")])

    def test_kokoro_espeak_gpl_hard_disabled_and_chunking(self) -> None:
        chunks = split_into_speech_chunks("Hello! **Welcome** to DESTRIA TECH INC. How can I assist you today?", max_chars=45)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertNotIn("**", " ".join(chunks))

        wav = wrap_pcm16_as_wav(b"\x00\x00" * 240, 24000)
        self.assertEqual(wav[:4], b"RIFF")

        cfg_gpl = InferenceConfig.from_env({"ALLOW_ESPEAK_GPL_FALLBACK": "true"})
        tts = KokoroTtsEngine(cfg_gpl)
        with self.assertRaises(RuntimeError):
            tts.synthesize("Hello world")

    def test_multilingual_detection_and_local_ollama_qwen25(self) -> None:
        self.assertEqual(detect_language_fast("Kumusta po, kailangan namin ng enterprise CRM system"), "fil-PH")
        self.assertEqual(detect_language_fast("Hola, necesito ayuda con un proyecto para nuestra empresa"), "es-ES")
        self.assertEqual(detect_language_fast("Bonjour, nous avons besoin d'aide pour un projet"), "fr-FR")
        self.assertEqual(detect_language_fast("We need a custom enterprise cloud architecture"), "en-US")

        server = HTTPServer(("127.0.0.1", 0), _MockOllamaHandler)
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            llm = OllamaLlmEngine(base_url=f"http://127.0.0.1:{port}", model="qwen2.5:7b-instruct")
            self.assertTrue(llm.probe_ready())
            res = llm.generate_reply(
                system_prompt="You are the AI receptionist for DESTRIA TECH INC.",
                user_message="Hello, I need an enterprise ERP system.",
                knowledge_context=["CEO: Desmond Hinds"],
            )
            self.assertIn("Qwen2.5 local", res.reply_text)
            self.assertEqual(res.model, "qwen2.5:7b-instruct")

            translator = LocalTranslationEngine(llm, enable_marian_fast_path=False)
            tr = translator.translate("Hello welcome", target_lang="fil-PH", source_lang="en-US")
            self.assertEqual(tr.engine, "ollama_qwen")
            self.assertEqual(tr.target_language, "fil-PH")
        finally:
            server.shutdown()
            server.server_close()

    def test_bounded_queues_timeout_cancellation_and_circuit_breaker(self) -> None:
        cfg = InferenceConfig.from_env({
            "MAX_CONCURRENT_LLM": "1",
            "INFERENCE_CB_THRESHOLD": "2",
            "INFERENCE_CB_RESET_SECONDS": "30",
        })
        rt = InferenceRuntime(config=cfg)

        async def _scenario() -> None:
            # 1. Queue full rejection when semaphore saturated
            async def slow_ok() -> str:
                await asyncio.sleep(0.12)
                return "done"

            first = asyncio.create_task(rt.run_bounded("llm", 2.0, slow_ok, request_id="req-1"))
            await asyncio.sleep(0.02)
            with self.assertRaises(QueueFullError):
                await rt.run_bounded("llm", 2.0, slow_ok, request_id="req-2")
            self.assertEqual(await first, "done")

            # 2. Request cancellation (barge-in)
            async def very_slow() -> str:
                await asyncio.sleep(2.0)
                return "stale"

            barge_task = asyncio.create_task(rt.run_bounded("llm", 5.0, very_slow, request_id="req-barge"))
            await asyncio.sleep(0.02)
            self.assertTrue(rt.cancel_request("req-barge"))
            with self.assertRaises(RequestCancelledError):
                await barge_task

            # 3. Timeout & circuit breaker opening after threshold=2 failures
            async def hanging() -> str:
                await asyncio.sleep(0.3)
                return "late"

            with self.assertRaises(InferenceTimeoutError):
                await rt.run_bounded("tts", 0.05, hanging)
            with self.assertRaises(InferenceTimeoutError):
                await rt.run_bounded("tts", 0.05, hanging)
            with self.assertRaises(CircuitBreakerOpenError):
                await rt.run_bounded("tts", 0.5, lambda: "blocked")

        asyncio.run(_scenario())
        snap = rt.health_snapshot()
        self.assertIn("resources", snap)
        self.assertTrue(snap["circuitBreakers"]["tts"]["open"])


if __name__ == "__main__":
    unittest.main()
