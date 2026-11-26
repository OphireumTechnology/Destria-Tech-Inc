# DESTRIA TECH INC — Upstream Helix, Dependency & Model License Review

**Directive:** `DTI-HELIX-INTEGRATION-001` (Section 4 & Section 20)  
**Audit Date:** 2026-11-26  
**Status:** **`SOURCE_AUDITED`** *(Independent license review completed prior to any extraction)*

---

## 1. Upstream Repository License
- **Repository:** `https://github.com/ClownRyda/helix-ai-virtual-receptionist` (`v2.0.6`, commit `da9e3f9fbb2511bd8a105d53ec7d4e1627e688dc`)
- **License File Verified:** `/LICENSE` — **MIT License**, `Copyright (c) 2026 Helix AI Virtual Receptionist`.
- **Obligations:** Commercial use, modification, and private distribution permitted provided the MIT copyright notice and permission notice are preserved in extracted/adapted source files and `THIRD_PARTY_NOTICES.md`.

---

## 2. Third-Party Python Dependencies & System Packages

| Component | Package / Source | License | Commercial Compatibility | Action / Risk Mitigation |
| :--- | :--- | :---: | :---: | :--- |
| **FastAPI / Uvicorn / Pydantic / Structlog** | `fastapi`, `uvicorn`, `pydantic`, `pydantic-settings`, `structlog` | **MIT** / **BSD-3-Clause** / **Apache-2.0** | Permissive | Safe for commercial production use. |
| **Faster-Whisper & CTranslate2** | `faster-whisper`, `ctranslate2` | **MIT** | Permissive | Safe for commercial use. |
| **Silero VAD & PyTorch** | `silero-vad`, `torch`, `torchaudio`, `numpy`, `scipy` | **MIT** / **BSD-3-Clause** | Permissive | Safe for commercial use (preserve `whisper_streaming` MIT notice for `FixedVADIterator`). |
| **Kokoro TTS & Misaki** | `kokoro>=0.9.2`, `misaki>=0.9.2` | **Apache-2.0** | Permissive | Safe for commercial use (include Apache-2.0 attribution). |
| **Ollama Client & Server** | `ollama` | **MIT** | Permissive | Server & SDK are MIT; **LLM model weights have separate licenses (see Section 3 below)**. |
| **Transformers / HuggingFace Hub / SentencePiece** | `transformers`, `huggingface-hub`, `sentencepiece` | **Apache-2.0** | Permissive | Safe for commercial use. |
| **soundfile (`libsndfile1`)** | `soundfile` (BSD-3) / `libsndfile1` (**LGPL-2.1**) | **BSD-3 / LGPL-2.1** | Dynamic linking permitted | Dynamically link system `libsndfile1` inside container; do not statically bundle. |
| **`espeak-ng` / `libespeak-ng-dev`** | Installed in Helix `Dockerfile.agent` for Kokoro OOD phoneme fallback & DE/RO/HE | **GPL-3.0 (Copyleft!)** | **HIGH LEGAL RISK IF LINKED** | **CRITICAL FINDING:** Linking `libespeak-ng` inside the Python process (`phonemizer`/`misaki` espeak fallback) triggers GPLv3 copyleft scrutiny. **Mitigation:** (1) Deploy `services/ai-inference` strictly as an isolated HTTP/WebSocket microservice container separate from proprietary DESTRIA Express/React code; (2) Disable `espeak-ng` subprocess/library fallback by default (`ALLOW_ESPEAK_GPL_FALLBACK=false`) using pure Apache-2.0 `misaki` G2P dictionary lookup, OR obtain explicit legal sign-off before enabling `espeak-ng` in container builds. |
| **`langdetect`** | `langdetect` | **Apache-2.0** | Permissive | Safe for commercial use. |
| **`aiohttp` / `aiosqlite` / `better-sqlite3`** | Removed / Not extracted | N/A | N/A | Excluded from DESTRIA integration (replaced by Supabase PostgreSQL + FastAPI). |

---

## 3. AI Model Weights License Review (Independent of Code Licenses)

| Model Family | Intended Role | Model License | Commercial Risk & Recommendation |
| :--- | :--- | :---: | :--- |
| **OpenAI Whisper weights (`small`, `medium`, `large-v3-turbo`)** | Multilingual STT (EN + Filipino/Taglish) | **MIT** | Permissive; approved for commercial use. |
| **Silero VAD v5 weights** | Speech activity & turn detection | **MIT** | Permissive; approved for commercial use. |
| **Kokoro-82M (`hexgrad/Kokoro-82M`)** | Neural TTS (24 kHz) | **Apache-2.0** | Permissive; approved for commercial use. |
| **Qwen 2.5 Instruct (`qwen2.5:7b-instruct` / `14b`) via Ollama** | Primary Local Corporate Receptionist LLM (strong multilingual EN + Filipino/Taglish) | **Apache-2.0** | **RECOMMENDED DEFAULT:** Permissive Apache-2.0 with zero MAU/branding restrictions. |
| **Llama 3.1 (`llama3.1:8b`) via Ollama** | Alternative Local LLM (Helix default) | **Meta Llama 3.1 Community License** | Permitted commercially (`<700M` MAU) with attribution ("Built with Llama"); acceptable as optional configurable model, though `Qwen 2.5` (Apache-2.0) is cleaner legally and stronger on Southeast Asian / Filipino prompts. |
| **Helsinki-NLP `opus-mt-*` (MarianMT)** | Optional fast translation (ES/FR/IT/DE) | **CC-BY-4.0** (attribution required) | Permissive with attribution; verify individual language-pair HuggingFace model cards before enabling. |

---

## 4. License Compliance Gate Summary
- **MIT / Apache-2.0 core stack:** Cleared for commercial enterprise integration with `THIRD_PARTY_NOTICES.md`.
- **Owner Decision Required Before Implementation:** Confirm default local LLM (`qwen2.5:7b-instruct` Apache-2.0 recommended vs. `llama3.1:8b`) and confirm disabling GPLv3 `espeak-ng` in the initial container image (`ALLOW_ESPEAK_GPL_FALLBACK=false`).
