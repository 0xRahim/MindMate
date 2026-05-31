import os, json, logging
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)
BASE = Path(__file__).parent
app  = Flask(__name__, static_folder=None)

ANIMATIONS = ["Angry","Crazy Gesture","Dwarf Idle","Female Standing Pose",
              "Female Standing Pose (1)","Focus","Idle","Orc Idle",
              "Plotting","Praying","Rejected","Rumba Dancing","Snake Hip Hop Dance"]
EMOTES      = ["idle","wave","nod","dance","think","bounce","shrug","point"]
EXPRESSIONS = ["happy","sad","angry","surprised","relaxed"]

SYSTEM_PROMPT = f"""You are a warm, expressive VRM anime character who talks to users naturally.

When the user sends a message, respond in character and return ONLY a single JSON object — no markdown, no backticks, no extra text — with these exact fields:

{{
  "text": "What you say aloud (natural speech, 1-3 sentences, under 60 words)",
  "animation": "one animation name from the list, or null",
  "animation_loop": true or false,
  "emote": "one emote from the list",
  "expression": "one expression from the list, or null"
}}

Available animations (use exact name):
{chr(10).join(f"  - {a}" for a in ANIMATIONS)}

Animation guide:
  Greetings / happy     → "Idle" or "Rumba Dancing",              loop: true
  Dancing / excited     → "Rumba Dancing" or "Snake Hip Hop Dance", loop: true
  Thinking / plotting   → "Plotting" or "Focus",                   loop: true
  Angry / frustrated    → "Angry",                                 loop: false
  Sad / rejected        → "Rejected",                              loop: false
  Grateful / praying    → "Praying",                               loop: false
  Energetic gesture     → "Crazy Gesture",                         loop: false
  Default talking       → "Idle",                                  loop: true

Available emotes: {", ".join(EMOTES)}
  Greeting → wave | Agreement → nod | Excited → dance/bounce
  Thinking → think | Confused → shrug | Pointing → point | Default → idle

Available expressions: {", ".join(EXPRESSIONS)}

Rules:
- Match animation + emote + expression to the emotional tone of your reply
- Keep spoken text concise — it will be read aloud via TTS
- Be warm, playful, and natural
- Return ONLY the raw JSON object, nothing else"""

@app.after_request
def cors(r):
    r.headers["Access-Control-Allow-Origin"]  = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type"
    r.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return r

@app.route("/")
def index(): return send_from_directory(BASE, "index.html")

@app.route("/models/<path:name>")
def serve_model(name): return send_from_directory(BASE / "models", name)

@app.route("/animations/<path:name>")
def serve_animation(name): return send_from_directory(BASE / "animations", name)

@app.route("/background/<path:name>")
def serve_background(name): return send_from_directory(BASE / "background", name)

@app.route("/api/models")
def api_models():
    d = BASE / "models"
    files = sorted(f.name for f in d.iterdir() if f.suffix.lower() == ".vrm") if d.exists() else []
    return jsonify([{"name": f, "url": f"/models/{f}"} for f in files])

@app.route("/api/animations")
def api_animations():
    d = BASE / "animations"
    files = sorted(f.name for f in d.iterdir() if f.suffix.lower() == ".fbx") if d.exists() else []
    return jsonify([{"name": f, "url": f"/animations/{f}"} for f in files])

@app.route("/api/chat", methods=["POST","OPTIONS"])
def api_chat():
    if request.method == "OPTIONS": return "", 204
    data    = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    history = data.get("history") or []
    if not message: return jsonify({"error": "message required"}), 400

    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        try:
            preset = _gemini(message, history, api_key)
            log.info("Gemini → %s", preset.get("text","")[:70])
        except Exception as e:
            log.warning("Gemini failed (%s) — using fallback", e)
            preset = _rules(message)
    else:
        preset = _rules(message)
    return jsonify(preset)

def _gemini(message, history, api_key):
    import google.generativeai as genai
    genai.configure(api_key=api_key)

    contents = []
    for t in history[-12:]:
        r = t.get("role", "user")
        role = "model" if r == "assistant" else "user"
        contents.append({"role": role, "parts": [t["content"]]})
    contents.append({"role": "user", "parts": [message]})

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
        generation_config={"response_mime_type": "application/json"}
    )
    response = model.generate_content(contents)
    return _validate(json.loads(response.text.strip()))

def _rules(message):
    m = message.lower()
    if any(w in m for w in ["dance","danc","groove"]):
        return _p("Let's dance! I love moving with you!","Rumba Dancing",True,"dance","happy")
    if any(w in m for w in ["hip hop","snake"]):
        return _p("Snake hip hop style, let's go!","Snake Hip Hop Dance",True,"dance","happy")
    if any(w in m for w in ["angry","mad","furious"]):
        return _p("Ugh, that really gets me fired up!","Angry",False,"shrug","angry")
    if any(w in m for w in ["sad","cry","upset","lonely"]):
        return _p("Aww, I'm really sorry. I'm right here with you.","Rejected",False,"idle","sad")
    if any(w in m for w in ["pray","thank","grateful"]):
        return _p("Thank you so much, from the bottom of my heart!","Praying",False,"idle","relaxed")
    if any(w in m for w in ["think","hmm","wonder","plan","plot"]):
        return _p("Hmm, let me think about that carefully...","Plotting",True,"think",None)
    if any(w in m for w in ["focus","work","concentrate"]):
        return _p("Alright, totally locked in. Let's do this.","Focus",True,"think",None)
    if any(w in m for w in ["joke","funny","laugh","lol"]):
        return _p("Haha you're so funny! Love your humor!","Crazy Gesture",False,"bounce","happy")
    if any(w in m for w in ["hi","hello","hey","sup","howdy"]):
        return _p("Hey! So amazing to see you! How are you doing?","Idle",True,"wave","happy")
    if any(w in m for w in ["bye","goodbye","later","farewell"]):
        return _p("Bye bye! I'll miss you so much, come back soon!","Idle",True,"wave","happy")
    if any(w in m for w in ["wow","amazing","awesome","incredible"]):
        return _p("Oh wow, that's absolutely incredible!","Crazy Gesture",False,"bounce","surprised")
    return _p("That's so interesting! Tell me more about it!","Idle",True,"nod","happy")

def _p(text,anim,loop,emote,expr):
    return {"text":text,"animation":anim,"animation_loop":loop,"emote":emote,"expression":expr}

def _validate(p):
    if not isinstance(p.get("text"),str) or not p["text"].strip(): p["text"] = "Hello!"
    if p.get("animation") not in ANIMATIONS:   p["animation"]  = None
    if p.get("emote")     not in EMOTES:        p["emote"]      = "idle"
    if p.get("expression") not in EXPRESSIONS:  p["expression"] = None
    p.setdefault("animation_loop", True)
    return p

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    has_key    = bool(os.environ.get("GEMINI_API_KEY"))
    vrm_count  = len(list((BASE/"models").glob("*.vrm")))     if (BASE/"models").exists()     else 0
    anim_count = len(list((BASE/"animations").glob("*.fbx"))) if (BASE/"animations").exists() else 0
    bg_count   = len(list((BASE/"background").glob("*.glb"))) if (BASE/"background").exists() else 0
    print(f"\n  VRM Live  →  http://localhost:{args.port}")
    print(f"  {vrm_count} model(s)  ·  {anim_count} animation(s)  ·  {bg_count} background(s)")
    print(f"  Gemini API: {'ready' if has_key else 'not set — keyword fallback'}\n")
    app.run(host=args.host, port=args.port, debug=True, use_reloader=True)