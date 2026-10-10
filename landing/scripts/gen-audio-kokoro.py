"""
Regenerate landing voice lines with the real Kokoro voice model.
Run INSIDE the audio-model environment (has torch + kokoro):

  cd audio-model && pip install -r requirements.txt
  python ../landing/scripts/gen-audio-kokoro.py --out ../landing/public/audio

Falls back gracefully: keeps current committed clips if Kokoro unavailable.
Canonical names must match lib/demo-script.ts: hi-aiko, hi-yuki, dance,
wow, rahim (shared lines serve both personas).
Voices: Aiko=af_heart (cheerful, speed 1.05), Yuki=af_sky (cool, speed 0.95).
"""
import argparse
import wave
from pathlib import Path

LINES = {
    "hi-aiko": ("Hey! So amazing to see you! I'm Aiko, live on the landing page!", "af_heart", 1.05),
    "hi-yuki": ("Hn. Hey. Yuki here. Don't make this weird.", "af_sky", 0.95),
    "dance": ("Let's dance! I love moving with you!", "af_heart", 1.1),
    "rahim": (
        "Rahim? Oh, he's the guy who hunts bugs all day but somehow never finds the one in my heart... because there isn't one, it's perfect.",
        "af_heart", 1.05,
    ),
    "wow": ("Oh wow, that's absolutely incredible!", "af_heart", 1.1),
}

SAMPLE_RATE = 24_000


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/audio")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    try:
        from kokoro import KPipeline
        import numpy as np
    except ImportError:
        print("Kokoro not installed — keeping current clips. See audio-model/requirements.txt.")
        return

    pipe = KPipeline(lang_code="a")
    for name, (text, voice, speed) in LINES.items():
        chunks: list[bytes] = []
        import io
        pcm_all = bytearray()
        for _, _, audio in pipe(text, voice=voice, speed=speed, split_pattern=r"\n+"):
            import numpy as _np
            a = _np.asarray(audio, dtype=_np.float32)
            pcm_all += ((_np.clip(a, -1, 1) * 32767).astype(_np.int16).tobytes())
        wav_path = out / f"{name}.wav"
        with wave.open(str(wav_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_RATE)
            w.writeframes(bytes(pcm_all))
        print(f"wrote {wav_path} ({len(pcm_all) // 2 / SAMPLE_RATE:.1f}s) — convert: ffmpeg -i {wav_path} {out / (name + '.mp3')}")


if __name__ == "__main__":
    main()
