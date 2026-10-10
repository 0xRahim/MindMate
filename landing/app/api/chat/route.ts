import { NextResponse } from "next/server";

/** Static demo brain — no AI, no Gemini. Deterministic mapping for the landing demo. */
export type DemoPreset = {
  text: string;
  animation: string | null;
  animation_loop: boolean;
  emote: string;
  expression: string | null;
};

const RAHIM_LINE =
  "Rahim? Oh, he's the guy who hunts bugs all day but somehow never finds the one in my heart... because there isn't one, it's perfect.";

export function demoPreset(kind: "hi" | "dance" | "rahim" | "wow"): DemoPreset {
  switch (kind) {
    case "hi":
      return { text: "Hey! So amazing to see you! I'm live on the landing page!", animation: "Idle", animation_loop: true, emote: "wave", expression: "happy" };
    case "dance":
      return { text: "Let's dance! I love moving with you!", animation: "Rumba Dancing", animation_loop: true, emote: "dance", expression: "happy" };
    case "rahim":
      return { text: RAHIM_LINE, animation: "Plotting", animation_loop: true, emote: "point", expression: "happy" };
    case "wow":
      return { text: "Oh wow, that's absolutely incredible!", animation: "Crazy Gesture", animation_loop: false, emote: "bounce", expression: "surprised" };
  }
}

export async function POST(req: Request) {
  let body: { kind?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const kind = (body.kind ?? "hi") as "hi" | "dance" | "rahim" | "wow";
  if (!["hi", "dance", "rahim", "wow"].includes(kind))
    return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  return NextResponse.json(demoPreset(kind));
}

export async function GET() {
  return NextResponse.json({
    kinds: ["hi", "dance", "rahim", "wow"],
    rahimLine: RAHIM_LINE,
  });
}
