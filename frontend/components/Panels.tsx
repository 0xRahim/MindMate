"use client";
import { useState } from "react";
import { Play, Square, Zap, ZapOff } from "lucide-react";
import { Btn, Field, Panel, Section, Slider } from "@/components/ui";
import { EMOTES } from "@/lib/three/emotes";
import { cn } from "@/lib/design/cn";
import type { WatchedSession } from "@/lib/jules/useJulesPoll";

export const VOICES = [
  ["af_heart", "Heart — US F"], ["af_bella", "Bella — US F"], ["af_nicole", "Nicole — US F"],
  ["af_sarah", "Sarah — US F"], ["af_sky", "Sky — US F"], ["am_adam", "Adam — US M"],
  ["am_michael", "Michael — US M"], ["bf_emma", "Emma — GB F"], ["bf_isabella", "Isabella — GB F"],
  ["bm_george", "George — GB M"], ["bm_lewis", "Lewis — GB M"],
] as const;

export function StatusPanel(props: {
  ttsUrl: string; setTtsUrl: (v: string) => void;
  connected: boolean; ttsLabel: string; ttsMsg: string; amp: number;
  onConnect: () => void; onDisconnect: () => void;
  vrmStatus: string; models: { name: string; url: string }[];
  onPickModel: (m: { name: string; url: string }) => void;
  onFile: (f: File) => void;
}) {
  return (
    <Panel label="Status">
      <Section title="Kokoro TTS">
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", props.connected ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-rose-500")} />
          <span className="flex-1 text-[11px] text-white/60">{props.ttsLabel}</span>
        </div>
        <Field value={props.ttsUrl} onChange={props.setTtsUrl} placeholder="http://127.0.0.1:5000" />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Btn variant="success" onClick={props.onConnect}><Zap size={12} /> Connect</Btn>
          <Btn variant="secondary" onClick={props.onDisconnect} disabled={!props.connected}><ZapOff size={12} /> Cut</Btn>
        </div>
        {props.ttsMsg && <div className="mt-1.5 text-[10px] leading-relaxed text-white/60">{props.ttsMsg}</div>}
        {props.connected && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide text-white/40">Lip</span>
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-cyan-300 transition-[width] duration-75" style={{ width: `${props.amp}%` }} />
            </div>
            <span className="w-7 text-right text-[10px] tabular-nums text-white/60">{props.amp}%</span>
          </div>
        )}
      </Section>
      <Section title="VRM Model">
        <input
          type="file"
          accept=".vrm"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onFile(f); }}
          className="w-full cursor-pointer rounded-lg border border-dashed border-cyan-300/40 bg-cyan-400/5 px-2.5 py-1.5 text-[11px] text-white/60"
        />
        {props.models.length > 0 && (
          <div className="mt-2">
            <div className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-white/40">From server</div>
            <div className="grid grid-cols-2 gap-1.5">
              {props.models.map((m) => (
                <Btn key={m.url} variant="secondary" onClick={() => props.onPickModel(m)} className="text-[11px]">
                  {m.name.replace(/\.vrm$/i, "").slice(0, 18)}
                </Btn>
              ))}
            </div>
          </div>
        )}
        <div className="mt-1.5 text-[10px] leading-relaxed text-white/60">{props.vrmStatus || "No model loaded."}</div>
      </Section>
    </Panel>
  );
}

export function InteractPanel(props: {
  replyText: string; setReplyText: (v: string) => void;
  voice: string; setVoice: (v: string) => void;
  speed: number; setSpeed: (v: number) => void;
  canSpeak: boolean; onSpeak: () => void; onStop: () => void;
  anims: { name: string; url: string }[];
  onPlayAnim: (a: { name: string; url: string }) => void;
  nowPlaying: string | null; animStatus: string;
  canStopAnim: boolean; onStopAnim: () => void;
  loop: boolean; onToggleLoop: () => void;
  activeEmote: string; onEmote: (id: string) => void;
}) {
  return (
    <Panel label="Interact">
      <Section title="Manual Speak">
        <Field value={props.replyText} onChange={props.setReplyText} placeholder="Type text to synthesize…" multiline />
        <div className="mt-2 flex items-end gap-2">
          <select
            value={props.voice}
            onChange={(e) => props.setVoice(e.target.value)}
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[12px] text-white [&>option]:bg-neutral-900"
          >
            {VOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div className="w-[86px] shrink-0">
            <label className="mb-1 flex items-center justify-between text-[10px] text-white/55">
              Speed <strong className="text-cyan-300">{props.speed.toFixed(2)}x</strong>
            </label>
            <input type="range" min={0.5} max={2} step={0.05} value={props.speed} onChange={(e) => props.setSpeed(parseFloat(e.target.value))} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Btn onClick={props.onSpeak} disabled={!props.canSpeak || !props.replyText.trim()}><Play size={12} /> Speak</Btn>
          <Btn variant="danger" onClick={props.onStop}><Square size={12} /> Stop</Btn>
        </div>
      </Section>
      <Section title="Animations" right={props.anims.length ? `(${props.anims.length})` : ""}>
        <div className="grid grid-cols-3 gap-1.5">
          {props.anims.map((a) => {
            const name = a.name.replace(/\.fbx$/i, "");
            return (
              <button
                key={a.url}
                onClick={() => props.onPlayAnim({ name, url: a.url })}
                className={cn(
                  "rounded-md border px-1 py-1.5 text-center text-[10px] font-semibold leading-snug transition",
                  props.nowPlaying === name
                    ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-200"
                    : "border-white/10 bg-white/5 text-white/55 hover:border-cyan-300/50 hover:text-white",
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Btn variant="secondary" onClick={props.onStopAnim} disabled={!props.canStopAnim}><Square size={12} /> Stop</Btn>
          <Btn variant="secondary" onClick={props.onToggleLoop}>Loop: {props.loop ? "On" : "Off"}</Btn>
        </div>
        {props.animStatus && <div className="mt-1.5 text-[10px] text-white/60">{props.animStatus}</div>}
      </Section>
      <Section title="Emotes" right={EMOTES.find((e) => e.id === props.activeEmote)?.hint ?? ""}>
        <div className="grid grid-cols-4 gap-1.5">
          {EMOTES.map((e) => (
            <button
              key={e.id}
              onClick={() => props.onEmote(e.id)}
              className={cn(
                "rounded-md border px-1 py-1.5 text-[10px] font-semibold transition",
                props.activeEmote === e.id
                  ? "border-fuchsia-400/60 bg-fuchsia-400/15 text-fuchsia-200"
                  : "border-white/10 bg-white/5 text-white/55 hover:border-fuchsia-300/50 hover:text-white",
              )}
            >
              {e.label}
            </button>
          ))}
        </div>
      </Section>
    </Panel>
  );
}

export function DebugPanel(props: {
  onResetView: () => void;
  face: Record<string, number>; onFace: (k: string, v: number) => void;
  onResetFace: () => void; blinkAuto: boolean; onToggleBlink: () => void;
}) {
  return (
    <Panel label="Debug">
      <Section title="Stage View">
        <Btn variant="secondary" onClick={props.onResetView}>Reset view</Btn>
      </Section>
      <Section title="Expression Debug">
        <div className="grid grid-cols-2 gap-2.5">
          {(["mouthOpen", "smile", "blink", "surprise"] as const).map((k) => (
            <Slider
              key={k}
              label={k}
              value={props.face[k] ?? 0}
              display={(props.face[k] ?? 0).toFixed(2)}
              min={0} max={1} step={0.01}
              onChange={(v) => props.onFace(k, v)}
            />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Btn variant="secondary" onClick={props.onResetFace}>Reset Face</Btn>
          <Btn variant="secondary" onClick={props.onToggleBlink}>Blink: {props.blinkAuto ? "Auto" : "Off"}</Btn>
        </div>
      </Section>
    </Panel>
  );
}

/** Long agentic tasks (Jules): start, watch live state, follow up, cancel. */
export function JulesPanel(props: {
  sessions: WatchedSession[];
  creating: boolean;
  createError: string | null;
  onCreate: (prompt: string) => void;
  onCancel: (id: string) => void;
  onMessage: (id: string, text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
  const submit = () => {
    const t = draft.trim();
    if (!t || props.creating) return;
    setDraft("");
    props.onCreate(t);
  };
  return (
    <Panel label="Jules · long tasks">
      <Section title="New task (auto-creates PR)">
        <Field
          value={draft}
          onChange={setDraft}
          placeholder="/code add tests for the chat API…"
          multiline
        />
        <div className="mt-2">
          <Btn onClick={submit} disabled={!draft.trim() || props.creating}>
            <Play size={12} /> {props.creating ? "Starting…" : "Start task"}
          </Btn>
        </div>
        {props.createError && (
          <div className="mt-1.5 text-[10px] leading-relaxed text-amber-300/90">{props.createError}</div>
        )}
        <div className="mt-1.5 text-[10px] leading-relaxed text-white/40">
          Tip: chat messages starting with /code, /fix, /task or “add tests / fix bug / refactor…” route here automatically. Anything else is instant Gemini chat.
        </div>
      </Section>
      <Section title="Watched" right={props.sessions.length ? `(${props.sessions.length})` : ""}>
        {props.sessions.length === 0 && (
          <div className="text-[11px] italic text-white/35">No tasks yet — start one above or via chat.</div>
        )}
        <div className="flex flex-col gap-2">
          {props.sessions.map((s) => (
            <div key={s.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] font-bold text-white">
                  {s.title ?? s.id}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
                    s.done && !s.error
                      ? "bg-emerald-400/15 text-emerald-300"
                      : s.done
                        ? "bg-rose-400/15 text-rose-300"
                        : "bg-violet-400/15 text-violet-300",
                  )}
                >
                  {s.done ? (s.error ? "Failed" : "Done") : (s.state ?? "…")}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-white/40">{s.id}</div>
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] text-cyan-300 hover:underline">
                  {s.url}
                </a>
              )}
              {s.prUrl && (
                <a href={s.prUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] text-emerald-300 hover:underline">
                  PR: {s.prTitle ?? s.prUrl}
                </a>
              )}
              {s.lastAgentMessage && (
                <div className="mt-1 text-[11px] leading-relaxed text-white/65">{s.lastAgentMessage}</div>
              )}
              {s.error && !s.done && (
                <div className="mt-1 text-[10px] text-amber-300/90">{s.error}</div>
              )}
              {!s.done && (
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    value={followUps[s.id] ?? ""}
                    onChange={(e) => setFollowUps((f) => ({ ...f, [s.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const t = (followUps[s.id] ?? "").trim();
                        if (t) {
                          props.onMessage(s.id, t);
                          setFollowUps((f) => ({ ...f, [s.id]: "" }));
                        }
                      }
                    }}
                    placeholder="Follow-up…"
                    className="h-[30px] min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2 text-[12px] text-white outline-none placeholder:text-white/35 focus:border-cyan-300/60"
                  />
                  <Btn
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => {
                      const t = (followUps[s.id] ?? "").trim();
                      if (t) {
                        props.onMessage(s.id, t);
                        setFollowUps((f) => ({ ...f, [s.id]: "" }));
                      }
                    }}
                  >
                    Send
                  </Btn>
                  <button
                    onClick={() => props.onCancel(s.id)}
                    title="Cancel task"
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <Square size={11} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </Panel>
  );
}
