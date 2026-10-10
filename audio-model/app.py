"""
Kokoro TTS — Real-time WebSocket Text-to-Speech API
Flask + Flask-SocketIO + Kokoro

Transport: raw Int16 PCM binary frames (no base64, no WAV headers per chunk).
Client uses Web Audio API to schedule chunks on a timeline for gapless playback.

Wire format per audio_chunk event:
  {
    "index":     <int>    chunk sequence number
    "samples":   <int>    number of int16 samples in this frame
    "graphemes": <str>    text segment this chunk covers
    "pcm":       <bytes>  raw little-endian int16 PCM @ 24 kHz mono
  }

Socket.IO automatically transmits the bytes field as a binary buffer;
the JS client receives it as an ArrayBuffer — zero base64 overhead.
"""

import logging
import threading

import numpy as np
from flask import Flask, jsonify
from flask_socketio import SocketIO, emit

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["SECRET_KEY"] = "kokoro-tts-secret"

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",       # keeps Kokoro's sync inference happy
    logger=False,
    engineio_logger=False,
)

# ── Kokoro pipeline (lazy singleton) ─────────────────────────────────────────
_pipeline      = None
_pipeline_lock = threading.Lock()

SAMPLE_RATE = 24_000   # Kokoro outputs 24 kHz mono float32

VOICES = {
    "af_heart":    "Heart (US Female)",
    "af_bella":    "Bella (US Female)",
    "af_nicole":   "Nicole (US Female)",
    "af_sarah":    "Sarah (US Female)",
    "af_sky":      "Sky (US Female)",
    "am_adam":     "Adam (US Male)",
    "am_michael":  "Michael (US Male)",
    "bf_emma":     "Emma (GB Female)",
    "bf_isabella": "Isabella (GB Female)",
    "bm_george":   "George (GB Male)",
    "bm_lewis":    "Lewis (GB Male)",
}


def get_pipeline():
    """Return the shared KPipeline, creating it on first call (thread-safe)."""
    global _pipeline
    if _pipeline is None:
        with _pipeline_lock:
            if _pipeline is None:
                log.info("Loading Kokoro pipeline …")
                from kokoro import KPipeline          # noqa: PLC0415
                _pipeline = KPipeline(lang_code="a")
                log.info("Kokoro pipeline ready  ✓")
    return _pipeline


def to_pcm16(audio) -> bytes:
    """
    Convert float32 audio [-1.0, 1.0] -> int16 PCM bytes.
    Accepts NumPy array or PyTorch Tensor (Kokoro may return either).
    """
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    elif hasattr(audio, "numpy"):
        audio = audio.numpy()
    audio = np.asarray(audio, dtype=np.float32)
    return (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16).tobytes()


# ── HTTP ──────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return jsonify({"service": "Kokoro TTS WebSocket API", "status": "running"})

@app.route("/voices")
def list_voices():
    return jsonify({"voices": VOICES})

@app.route("/health")
def health():
    return jsonify({"ok": True})


# ── WebSocket ─────────────────────────────────────────────────────────────────
@socketio.on("connect")
def on_connect():
    log.info("Client connected")
    emit("connected", {
        "message":     "Connected to Kokoro TTS",
        "voices":      VOICES,
        "sample_rate": SAMPLE_RATE,
        "encoding":    "pcm_int16_le",   # tell client exactly what to expect
    })


@socketio.on("disconnect")
def on_disconnect():
    log.info("Client disconnected")


@socketio.on("synthesize")
def on_synthesize(data: dict):
    """
    Stream TTS audio back as raw PCM binary frames.

    Client payload:
        { "text": "…", "voice": "af_heart", "speed": 1.0 }

    Server events (in order):
        synthesis_start  →  { text, voice, speed, sample_rate, encoding }
        audio_chunk      →  { index, samples, graphemes, pcm: <ArrayBuffer> }
        synthesis_done   →  { total_chunks, total_samples, duration_sec }
        error            →  { message }
    """
    text  = (data.get("text") or "").strip()
    voice = data.get("voice", "af_heart")
    speed = float(data.get("speed", 1.0))

    # ── Validate ─────────────────────────────────────────────────────────────
    if not text:
        emit("error", {"message": "'text' is required."})
        return
    if voice not in VOICES:
        emit("error", {"message": f"Unknown voice '{voice}'. Valid: {list(VOICES)}"})
        return
    speed = max(0.5, min(2.0, speed))

    log.info("synth | voice=%s speed=%.1f chars=%d", voice, speed, len(text))

    emit("synthesis_start", {
        "text":        text,
        "voice":       voice,
        "speed":       speed,
        "sample_rate": SAMPLE_RATE,
        "encoding":    "pcm_int16_le",
    })

    # ── Generate & stream ────────────────────────────────────────────────────
    try:
        pipeline      = get_pipeline()
        total_chunks  = 0
        total_samples = 0

        for gs, ps, audio in pipeline(
            text,
            voice=voice,
            speed=speed,
            split_pattern=r"\n+",
        ):
            if audio is None or len(audio) == 0:
                continue

            pcm_bytes = to_pcm16(audio)   # raw bytes — no base64, no WAV header

            # Socket.IO transmits the 'pcm' bytes as a binary buffer automatically.
            # The JS client receives data.pcm as an ArrayBuffer.
            emit("audio_chunk", {
                "index":     total_chunks,
                "samples":   len(audio),
                "graphemes": gs or "",
                "pcm":       pcm_bytes,   # ← binary frame
            })

            total_chunks  += 1
            total_samples += len(audio)
            log.debug("  chunk %03d | %d samples (%.2f s)",
                      total_chunks - 1, len(audio), len(audio) / SAMPLE_RATE)

        emit("synthesis_done", {
            "total_chunks":  total_chunks,
            "total_samples": total_samples,
            "duration_sec":  round(total_samples / SAMPLE_RATE, 3),
        })
        log.info("done | %d chunks  %.2f s", total_chunks, total_samples / SAMPLE_RATE)

    except Exception as exc:
        log.exception("synthesis error")
        emit("error", {"message": str(exc)})


@socketio.on("cancel")
def on_cancel():
    log.info("cancel requested")
    emit("cancelled", {"message": "Synthesis cancelled."})


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--host",  default="0.0.0.0")
    parser.add_argument("--port",  type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    # Pre-warm so the first request doesn't pay the model-load cost
    threading.Thread(target=get_pipeline, daemon=True).start()

    log.info("Server starting on %s:%d", args.host, args.port)
    # allow_unsafe_werkzeug is required with Flask-SocketIO >= 5.4 /
    # Werkzeug >= 3 when running the dev server (as we do in the container).
    socketio.run(app, host=args.host, port=args.port, debug=args.debug,
                 allow_unsafe_werkzeug=True)
