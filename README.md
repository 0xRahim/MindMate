# MindMate : AI-Powered Virtual Assistant 

An early version of an agentic virtual assistant framework designed to combine conversational AI with a customizable knowledge base and task automation.


---
![Alt Text](https://raw.githubusercontent.com/0xRahim/MindMate/refs/heads/main/main/animations/cropped.gif)

## Overview

The goal of this project is to create a personal AI assistant that is:

* Knowledge-aware
* Extensible
* Task-oriented
* Easy to customize

Rather than being a general-purpose chatbot, the assistant is designed to operate within a specific knowledge domain defined by the user.

---

## Current Features

* Conversational AI assistant
* Hardcoded knowledge base support
* Context-aware responses based on provided knowledge
* Modular architecture for future expansion
* Early agent orchestration foundation
* Simple framework for adding custom actions and tools

---

## Project Status

This is the initial version of the VA Harness.

The current focus is validating the core architecture and interaction model before introducing more advanced capabilities such as dynamic knowledge ingestion, memory systems, and automation workflows.

---

## Roadmap

### Knowledge Base

* [x] Hardcoded knowledge base
* [ ] File-based knowledge ingestion
* [ ] Markdown document support
* [ ] Obsidian vault integration
* [ ] Semantic search and retrieval
* [ ] Knowledge synchronization

### Agent Capabilities

* [x] Basic assistant workflow
* [ ] Multi-step reasoning
* [ ] Long-term memory
* [ ] Tool calling
* [ ] Agent planning
* [ ] Multi-agent workflows

### Automation SDK

* [ ] Custom task registration
* [ ] Workflow definitions
* [ ] Event-driven actions
* [ ] Plugin architecture
* [ ] External service integrations

---

## Architecture

```text
Browser
  ├── Next.js frontend/ (:8080, bun)
  │      ├── 3D stage (three.js + three-vrm, Mixamo retarget)
  │      ├── A/V sync state machine (expression + animation commit on first audio)
  │      ├── /api/chat  (Gemini 2.5 Flash JSON mode + keyword fallback)
  │      └── /models|/animations  (serve 3D assets from main/)
  │
  ├── Kokoro TTS audio-model/ (:5000, Socket.IO PCM stream)
  │
  └── main/{models,animations}/  (3D assets, bind-mounted read-only)
```

Future versions will replace the hardcoded knowledge layer with an Obsidian-backed knowledge system and expand the task harness into a full SDK-driven automation platform.

## Running

```bash
# Dev (frontend only, TTS optional at :5000)
cd frontend && bun install && bun run dev     # http://127.0.0.1:3000

# Full stack (Podman)
./mindmate.sh start --build   # frontend :8080 + TTS :5000
./mindmate.sh logs -f         # follow logs
./mindmate.sh stop            # stop, keep images
```

Config via `.env` (see `.env.example`): `GEMINI_API_KEY`, `FRONTEND_PORT`, `TTS_PORT`.
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

This project is intentionally minimal in its current state. The objective of the first release is to establish a stable foundation for knowledge-driven assistants and future agent automation capabilities rather than delivering a complete production-ready platform.


