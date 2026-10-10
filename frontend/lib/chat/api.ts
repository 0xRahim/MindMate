export type ChatPreset = {
  text: string;
  animation: string | null;
  animation_loop: boolean;
  emote: string;
  expression: string | null;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function postChat(
  message: string,
  history: ChatMessage[],
): Promise<ChatPreset> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: history.slice(-12) }),
  });
  if (!res.ok) throw new Error("API " + res.status);
  const preset = (await res.json()) as ChatPreset & { error?: string };
  if (preset.error) throw new Error(preset.error);
  return preset;
}
