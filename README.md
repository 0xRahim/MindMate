# MindMate : AI-Powered Virtual Assistant

🌐 **Live demo (landing):** https://mindmate-kappa-seven.vercel.app/
⭐ **Open source:** https://github.com/0xRahim/MindMate

An agentic virtual assistant framework that combines conversational AI with a 3D anime companion stage, voice interaction, and background coding quests.

---


## Overview

MindMate is a personal AI companion that lives on a live 3D stage:

* **Knowledge-aware** — Gemini brain with live web lookup when built-in knowledge runs out
* **Voice-first** — mic input, Kokoro TTS streaming voice, RMS lip-sync and expressions
* **Agentic stage** — VRM + three.js companion (Aiko & Yuki) that idles, thinks, dances and performs
* **Task-oriented** — background Jules coding quests with PR delivery while she keeps chatting
* **Extensible** — modular architecture for custom actions and tools

Two apps ship in this repo: the **live companion app** (`frontend/`) and the **static landing demo** (`landing/`, deployed above — same stage, pre-generated voice, zero backend).

---

## Current Features

* Conversational AI via Gemini 2.5 Flash (JSON mode) with keyword fallback when no API key is set
* Live web lookup when her knowledge runs out
* Voice-first chat: mic input by default, text tucked behind the keyboard key
* Kokoro TTS 24kHz PCM streaming with A/V-sync state machine (animation + emote commit on first audio)
* VRM stage: three.js + three-vrm, Mixamo clip retargeting, procedural emotes, scroll-driven walk/gags
* Two personas: Hoshizora Aiko (cheerful idol) & Kurogane Yuki (cool kuudere) — switchable mid-chat
* Background Jules quests (`/code …`) — long-horizon coding sessions that drop a PR link in chat
* Pill presets (Say Hi / Dance / Hip-Hop / Who is Rahim? / Surprise me) wired through the live chat API
* Self-contained landing deployment: VRM/FBX bundled in `public/`, no env vars needed

---

## Project Status

Working companion app + deployed landing demo.

The current focus is deepening the knowledge layer (Obsidian vault, semantic search) and expanding background quests, while keeping the stage, voice pipeline, and chat API stable.

---

## Roadmap

### Knowledge Base

* [x] Hardcoded knowledge base
* [x] Live web lookup
* [ ] File-based knowledge ingestion
* [ ] Markdown document support
* [ ] Obsidian vault integration
* [ ] Semantic search and retrieval
* [ ] Knowledge synchronization

### Agent Capabilities

* [x] Basic assistant workflow
* [x] Voice-first interaction (mic + TTS + lip-sync)
* [x] Background coding quests (Jules sessions + PR delivery)
* [ ] Multi-step reasoning
* [ ] Long-term memory
* [ ] Agent planning
* [ ] Multi-agent workflows

### Automation SDK

* [x] Custom task registration (`/code` task prefix)
* [ ] Workflow definitions
* [ ] Event-driven actions
* [ ] Plugin architecture
* [ ] External service integrations

---

## Architecture

```text
Browser
  ├── frontend/ (:3000 dev / :8080 prod, bun)
  │      ├── 3D stage (three.js + three-vrm, Mixamo retarget)
  │      ├── A/V sync state machine (expression + animation commit on first audio)
  │      ├── /api/chat  (Gemini 2.5 Flash JSON mode + keyword fallback)
  │      ├── /api/jules (background quest proxy, key stays server-side)
  │      └── /models|/animations  (serve 3D assets from main/)
  │
  ├── landing/ (:3001 dev / :8081 prod, live on Vercel)
  │      ├── Static demo: same stage engine, pre-generated voice, no backend
  │      └── VRM/FBX bundled in public/ (ASSETS_DIR / ../main fallback)
  │
  ├── Kokoro TTS audio-model/ (:5000, Socket.IO PCM stream)
  │
  └── main/{models,animations}/  (3D assets, bind-mounted read-only)
```

Future versions will replace the hardcoded knowledge layer with an Obsidian-backed knowledge system and expand the task harness into a full SDK-driven automation platform.

## Running

```bash
# Live companion app (needs GEMINI_API_KEY for full brain, TTS optional at :5000)
cd frontend && bun install && bun run dev     # http://127.0.0.1:3000

# Landing demo (no keys needed — static audio + bundled 3D)
cd landing && bun install && bun run dev      # http://127.0.0.1:3001

# Full stack (Podman)
./mindmate.sh start --build   # frontend :8080 + TTS :5000
./mindmate.sh logs -f         # follow logs
./mindmate.sh stop            # stop, keep images
```

Config via `.env` (see `.env.example`): `GEMINI_API_KEY`, `JULES_API_KEY`, `JULES_SOURCE`, `FRONTEND_PORT`, `TTS_PORT`.
Without `GEMINI_API_KEY` the chat API uses its keyword fallback.

---

## Vision

The long-term vision is to provide a customizable AI operating layer where users can:

* Connect their personal knowledge base
* Build domain-specific assistants
* Automate repetitive tasks
* Extend functionality through a lightweight SDK
* Create specialized workflows without modifying the assistant core

---

## Example Use Cases

* Personal knowledge assistant
* Internal team documentation assistant
* Research companion
* Productivity automation assistant
* Custom workflow execution agent


## Notes

Star / fork / PRs welcome at https://github.com/0xRahim/MindMate — the landing demo above is the fastest way to meet Aiko before self-hosting the full app.
