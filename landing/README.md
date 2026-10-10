# MindMate Landing — Meet Aiko & Yuki

Animated static-demo landing page (separate Next.js app, port **3001** dev / **8081** prod).

## Run

```bash
cd landing && bun install && bun run dev     # http://localhost:3001
bun run build && bun run start               # prod :8081
```

3D assets are served from `../main/` (VRM/FBX) via `/models|/animations` routes — no duplication.

## Demo

* Buttons: **Say Hi** (`Idle`+wave), **Dance** (`Rumba Dancing`), **Hip-Hop** (`Snake Hip Hop Dance`), **Who is Rahim?** (`Plotting`+point + your 💘 line), **Surprise me** (`Crazy Gesture`).
* Model switcher: **Hoshizora Aiko** (cheerful idol, pink) ↔ **Kurogane Yuki** (cool kuudere, cyan). Order follows sorted `/api/models`.
* Button press juice: camera dolly-in, rim-light flash, typewriter speech bubble, heart particles, pre-generated voice line with analyser lip-sync.
* Scroll 4th-wall: fixed canvas, character walks left/right with scroll (`--mascot-x` tilts cards), one-shot gags (walk/climb/pull/bye), screen shake + hearts.

## Audio

`public/audio/*.mp3` are the committed voice lines (single voice): `hi-aiko`, `hi-yuki`, `dance`, `wow`, `rahim` (shared lines serve both personas). The demo talks with zero backend. Lip-sync is RMS-envelope driven (see `LandingEngine.updateLipSync`).

Regenerate with the real voice model:

```bash
cd audio-model && pip install -r requirements.txt
python ../landing/scripts/gen-audio-kokoro.py --out ../landing/public/audio
# then: ffmpeg -i public/audio/rahim.wav public/audio/rahim.mp3 (×5)
```

Kokoro voices: Aiko=`af_heart@1.05`, Yuki=`af_sky@0.95`.

## Structure

```
app/page.tsx            # hero + features + how-it-works + CTA, scroll director
components/HeroStage.tsx DemoControls.tsx
lib/landing-engine.ts   # slim 3D fork (no Socket.IO): VRM/FBX retarget, emotes, analyser lip-sync, scroll pose
lib/demo-script.ts      # personas, demo actions, Rahim line
lib/three/              # Mixamo retarget + procedural emotes (shared with frontend)
scripts/gen-audio-kokoro.py
```
