# MindMate Landing — Meet Aiko & Yuki

Animated static-demo landing page (separate Next.js app, port **3001** dev / **8081** prod).

## Run

```bash
cd landing && bun install && bun run dev     # http://localhost:3001
bun run build && bun run start               # prod :8081
```

3D assets are served from `../main/` (VRM/FBX) via `/models|/animations` routes — no duplication.

## Layout — full-bleed stage (Oobi-style)

The VRM is the page: a fixed fullscreen canvas with 4 scroll chapters and edge-anchored UI (corner link columns, top wordmark + chapter eyebrow, bottom speech + remote). Camera framing follows chapters — giant close-up (hero) → mid (features) → full-body (playground) → push-in (contact) — and auto-pulls back to full-body for any dance/performance clip, returning afterward.

## Demo

* Pill remote (bottom): **Aiko|Yuki** toggle + **Say Hi** / **Dance** / **Hip-Hop** / **Who is Rahim?** / **Surprise me** + Stop.
* Corner columns: Explore (chapter jumps), Elsewhere (GitHub, live app), Tiny stuff (live status), Say hello (demo shortcuts).
* Button press juice: rim-light flash, speech bubble, heart particles, pre-generated voice line with RMS lip-sync.
* Scroll 4th-wall: she walks/shoves widgets/ghost-backs/passes through the page; one-shot voiced gags; screen shake + hearts.

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
app/page.tsx            # 4 edge-UI chapters + scroll director (poses, framing, gags, voices)
components/HeroStage.tsx PillRemote.tsx EdgeLinks.tsx ScatterText.tsx
lib/landing-engine.ts   # slim 3D fork (no Socket.IO): VRM/FBX retarget, emotes, RMS lip-sync, scroll pose, framing
lib/demo-script.ts      # personas, demo actions, Rahim line, voice maps
lib/mascot-proximity.ts # DOM proximity brain (shove/touch)
lib/three/              # Mixamo retarget + procedural emotes (shared with frontend)
scripts/gen-audio-kokoro.py
```
