"""DESTRIA TECH INC — Isolated Private FastAPI AI Inference Service.

Exposes OpenAPI-documented local inference endpoints over private networking ONLY:
- GET  /v1/livez           (loopback liveness)
- GET  /v1/health          (authenticated health, queue depths, CPU/GPU resources)
- GET  /v1/ready           (authenticated readiness — 200 ONLY when all models prewarmed)
- POST /v1/vad             (Silero VAD 16 kHz PCM16 512-sample framing)
- POST /v1/stt             (Faster-Whisper multilingual EN/TL/Taglish)
- POST /v1/llm/reply       (Ollama Qwen2.5-7B-Instruct grounded corporate reasoning)
- POST /v1/tts             (Kokoro-82M 24 kHz neural speech, espeak-ng disabled)
- POST /v1/translate       (MarianMT fast-path + Ollama fallback + language detect)
- POST /v1/cancel/{req_id} (barge-in cancellation for in-flight inference)
"""

from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.auth import verify_service_auth
from app.config import InferenceConfig
from app.runtime import (
    CircuitBreakerOpenError,
    InferenceRuntime,
    InferenceTimeoutError,
    QueueFullError,
    RequestCancelledError,
)


class VadRequest(BaseModel):
    sessionId: str = Field(min_length=3, max_length=128)
    sampleRate: int = Field(default=16000)
    pcm16Base64: str = Field(min_length=4, max_length=2_000_000)
    resetState: bool = False


class SttRequest(BaseModel):
    sessionId: str | None = Field(default=None, max_length=128)
    requestId: str | None = Field(default=None, max_length=128)
    audioBase64: str = Field(min_length=8, max_length=7_500_000)
    sampleRate: int = Field(default=16000, ge=8000, le=48000)
    languageHint: str | None = Field(default=None, max_length=16)
    beamSize: int | None = Field(default=None, ge=1, le=5)


class LlmTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant|ai)$")
    content: str = Field(min_length=1, max_length=2000)


class LlmReplyRequest(BaseModel):
    sessionId: str = Field(min_length=3, max_length=128)
    requestId: str | None = Field(default=None, max_length=128)
    systemPrompt: str = Field(min_length=10, max_length=12000)
    userMessage: str = Field(min_length=1, max_length=2500)
    history: list[LlmTurn] = Field(default_factory=list)
    knowledgeContext: list[str] = Field(default_factory=list)
    temperature: float = Field(default=0.35, ge=0.0, le=1.0)
    maxTokens: int = Field(default=320, ge=32, le=1024)


class TtsRequest(BaseModel):
    requestId: str | None = Field(default=None, max_length=128)
    text: str = Field(min_length=1, max_length=1800)
    language: str = Field(default="en-US", max_length=16)
    voiceId: str | None = Field(default=None, max_length=64)
    speed: float = Field(default=1.0, ge=0.75, le=1.35)
    format: str = Field(default="wav", pattern="^(wav|pcm16)$")


class TranslateRequest(BaseModel):
    requestId: str | None = Field(default=None, max_length=128)
    text: str = Field(min_length=1, max_length=2500)
    sourceLang: str | None = Field(default=None, max_length=16)
    targetLang: str = Field(default="en-US", max_length=16)


def _map_runtime_error(exc: Exception) -> HTTPException:
    if isinstance(exc, QueueFullError):
        return HTTPException(status_code=429, detail={"code": "QUEUE_FULL", "message": str(exc)})
    if isinstance(exc, InferenceTimeoutError):
        return HTTPException(status_code=504, detail={"code": "INFERENCE_TIMEOUT", "message": str(exc)})
    if isinstance(exc, RequestCancelledError):
        return HTTPException(status_code=499, detail={"code": "REQUEST_CANCELLED", "message": str(exc)})
    if isinstance(exc, CircuitBreakerOpenError):
        return HTTPException(status_code=503, detail={"code": "CIRCUIT_BREAKER_OPEN", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": str(exc)})
    return HTTPException(status_code=503, detail={"code": "ENGINE_UNAVAILABLE", "message": str(exc)})


def create_app(runtime: InferenceRuntime | None = None) -> FastAPI:
    rt = runtime or InferenceRuntime(InferenceConfig.from_env())

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if rt.config.prewarm_models_on_startup:
            await asyncio.to_thread(rt.prewarm_all)
        yield

    app = FastAPI(
        title="DESTRIA TECH INC — Private Local AI Inference Service",
        version="1.0.0",
        docs_url="/v1/docs",
        openapi_url="/v1/openapi.json",
        lifespan=lifespan,
    )

    def require_service_auth(
        x_service_auth: str | None = Header(default=None, alias="X-Service-Auth"),
        authorization: str | None = Header(default=None, alias="Authorization"),
    ) -> None:
        ok, code = verify_service_auth(x_service_auth or authorization, rt.config.shared_secret)
        if not ok:
            status = 503 if code == "SERVICE_AUTH_NOT_CONFIGURED" else 401
            raise HTTPException(status_code=status, detail={"code": code, "message": "Service authentication failed."})

    @app.get("/v1/livez")
    async def livez() -> dict[str, object]:
        return {"status": "alive", "service": "destria-ai-inference"}

    @app.get("/v1/health", dependencies=[Depends(require_service_auth)])
    async def health() -> dict[str, object]:
        return rt.health_snapshot()

    @app.get("/v1/ready", dependencies=[Depends(require_service_auth)])
    async def ready(response: Response) -> dict[str, object]:
        snapshot = rt.health_snapshot()
        if not snapshot["ready"]:
            response.status_code = 503
        return snapshot

    @app.post("/v1/vad", dependencies=[Depends(require_service_auth)])
    async def vad_endpoint(body: VadRequest) -> dict[str, object]:
        if body.sampleRate not in (8000, 16000):
            raise HTTPException(status_code=400, detail={"code": "INVALID_SAMPLE_RATE", "message": "VAD requires 8000 or 16000 Hz PCM16."})
        try:
            pcm_bytes = base64.b64decode(body.pcm16Base64, validate=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"code": "INVALID_AUDIO_ENCODING", "message": "Invalid base64 PCM16 payload."}) from exc
        if len(pcm_bytes) > rt.config.max_audio_bytes:
            raise HTTPException(status_code=413, detail={"code": "AUDIO_PAYLOAD_TOO_LARGE", "message": "Audio frame exceeds configured limit."})
        try:
            res = await rt.run_bounded(
                "vad",
                timeout_seconds=1.5,
                fn=lambda: rt.vad.process(body.sessionId, pcm_bytes, body.sampleRate, body.resetState),
            )
            return {
                "speechDetected": res.speech_detected,
                "probability": res.probability,
                "speechStart": res.speech_start,
                "speechEnd": res.speech_end,
                "backend": res.backend,
                "latencyMs": res.latency_ms,
            }
        except Exception as exc:
            raise _map_runtime_error(exc) from exc

    @app.post("/v1/stt", dependencies=[Depends(require_service_auth)])
    async def stt_endpoint(body: SttRequest) -> dict[str, object]:
        try:
            audio_bytes = base64.b64decode(body.audioBase64, validate=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"code": "INVALID_AUDIO_ENCODING", "message": "Invalid base64 audio payload."}) from exc
        if len(audio_bytes) > rt.config.max_audio_bytes:
            raise HTTPException(status_code=413, detail={"code": "AUDIO_PAYLOAD_TOO_LARGE", "message": "Audio payload exceeds configured byte cap."})
        try:
            res = await rt.run_bounded(
                "stt",
                timeout_seconds=rt.config.stt_timeout_seconds,
                request_id=body.requestId,
                fn=lambda: asyncio.to_thread(
                    rt.stt.transcribe,
                    audio_bytes,
                    body.sampleRate,
                    body.languageHint,
                    body.beamSize,
                ),
            )
            return {
                "text": res.text,
                "language": res.language,
                "languageProbability": res.language_probability,
                "durationSec": res.duration_sec,
                "latencyMs": res.latency_ms,
                "deviceUsed": res.device_used,
                "beamSizeUsed": res.beam_size_used,
            }
        except Exception as exc:
            raise _map_runtime_error(exc) from exc

    @app.post("/v1/llm/reply", dependencies=[Depends(require_service_auth)])
    async def llm_reply_endpoint(body: LlmReplyRequest) -> dict[str, object]:
        try:
            history_dicts = [{"role": t.role, "content": t.content} for t in body.history]
            res = await rt.run_bounded(
                "llm",
                timeout_seconds=rt.config.llm_timeout_seconds,
                request_id=body.requestId,
                fn=lambda: asyncio.to_thread(
                    rt.llm.generate_reply,
                    body.systemPrompt,
                    body.userMessage,
                    history_dicts,
                    body.knowledgeContext,
                    body.temperature,
                    body.maxTokens,
                ),
            )
            return {
                "replyText": res.reply_text,
                "model": res.model,
                "tokensGenerated": res.tokens_generated,
                "latencyMs": res.latency_ms,
            }
        except Exception as exc:
            raise _map_runtime_error(exc) from exc

    @app.post("/v1/tts", dependencies=[Depends(require_service_auth)])
    async def tts_endpoint(body: TtsRequest) -> dict[str, object]:
        try:
            res = await rt.run_bounded(
                "tts",
                timeout_seconds=rt.config.tts_timeout_seconds,
                request_id=body.requestId,
                fn=lambda: asyncio.to_thread(
                    rt.tts.synthesize,
                    body.text,
                    body.language,
                    body.voiceId,
                    body.speed,
                    body.format == "wav",
                ),
            )
            return {
                "audioBase64": base64.b64encode(res.audio_bytes).decode("ascii"),
                "mimeType": res.mime_type,
                "sampleRate": res.sample_rate,
                "voiceUsed": res.voice_used,
                "chunkCount": res.chunk_count,
                "latencyMs": res.latency_ms,
                "espeakUsed": res.espeak_used,
            }
        except Exception as exc:
            raise _map_runtime_error(exc) from exc

    @app.post("/v1/translate", dependencies=[Depends(require_service_auth)])
    async def translate_endpoint(body: TranslateRequest) -> dict[str, object]:
        try:
            res = await rt.run_bounded(
                "translate",
                timeout_seconds=rt.config.translate_timeout_seconds,
                request_id=body.requestId,
                fn=lambda: asyncio.to_thread(
                    rt.translator.translate,
                    body.text,
                    body.targetLang,
                    body.sourceLang,
                ),
            )
            return {
                "translatedText": res.translated_text,
                "sourceLanguage": res.source_language,
                "targetLanguage": res.target_language,
                "engine": res.engine,
                "latencyMs": res.latency_ms,
            }
        except Exception as exc:
            raise _map_runtime_error(exc) from exc

    @app.post("/v1/cancel/{request_id}", dependencies=[Depends(require_service_auth)])
    async def cancel_endpoint(request_id: str) -> dict[str, object]:
        cancelled = rt.cancel_request(request_id)
        return {"requestId": request_id, "cancelled": cancelled}

    return app


# Uvicorn entry point (`uvicorn app.main:app --host 127.0.0.1 --port 8000`)
try:
    app = create_app()
except Exception:
    app = None  # Allows unit testing modules in minimal Python environments
