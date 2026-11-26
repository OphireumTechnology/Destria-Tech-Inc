# Third-Party Notices & Upstream Attribution (`services/ai-inference`)

This isolated Python AI Inference Service selectively adapts modular speech and
language inference components from **Helix AI Virtual Receptionist** (`v2.0.6`,
commit `da9e3f9fbb2511bd8a105d53ec7d4e1627e688dc`, MIT License), refactored for
DESTRIA TECH INC's browser-native unified website AI Front Desk (excluding all
Asterisk SIP/RTP telephony, SQLite storage, unauthenticated config mutation, and
hidden easter-egg code).

---

## Upstream Helix MIT License Notice

```text
MIT License

Copyright (c) 2026 Helix AI Virtual Receptionist

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Adapted Modules & Third-Party Model Licenses

| Local File | Upstream Helix `v2.0.6` Source | Key DESTRIA Adaptations | Model / Dependency License |
| :--- | :--- | :--- | :--- |
| `app/engines/vad_silero.py` | `agent/vad/silero_engine.py` | `FixedVADIterator` 512-sample 16 kHz framing, non-interactive `trust_repo=True`, per-session state registry & bounded eviction | Silero VAD (`MIT`) |
| `app/engines/stt_whisper.py` | `agent/stt/whisper_engine.py` | Multilingual EN/TL/Taglish detection, validated `beam_size` (1–5), CUDA->CPU fallback on missing CUDA libs, hallucination filter | Faster-Whisper / Whisper weights (`MIT`) |
| `app/engines/tts_kokoro.py` | `agent/tts/kokoro_engine.py` | 24 kHz browser PCM/WAV sentence chunking; **GPLv3 `espeak-ng` strictly disabled (`ALLOW_ESPEAK_GPL_FALLBACK=false`)** | Kokoro-82M (`Apache-2.0`) |
| `app/engines/translate.py` | `agent/llm/translate_engine.py` | MarianMT CTranslate2 fast-path + Ollama `qwen2.5:7b-instruct` fallback + English/Filipino/Taglish detection | MarianMT (`CC-BY-4.0`) / CTranslate2 (`MIT`) |
| `app/engines/llm_ollama.py` | Rebuilt cleanly (excluded `intent_engine.py` / `ari_agent.py`) | Local Ollama `qwen2.5:7b-instruct` grounded corporate reasoning, request cancellation, zero paid API fallback, zero easter eggs | Qwen2.5-7B-Instruct (`Apache-2.0`) |
