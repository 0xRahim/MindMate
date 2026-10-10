"use client";
import { Play, Square, Zap, ZapOff } from "lucide-react";
import { Btn, Field, Panel, Section, Slider } from "@/components/ui";
import { EMOTES } from "@/lib/three/emotes";
import { cn } from "@/lib/design/cn";

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
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", props.connected ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-rose-500")} />
          <span className="flex-1 text-[11px] text-neutral-500">{props.ttsLabel}</span>
        </div>
        <Field value={props.ttsUrl} onChange={props.setTtsUrl} placeholder="http://localhost:5000" />
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Btn variant="success" onClick={props.onConnect}><Zap size={12} /> Connect</Btn>
          <Btn variant="secondary" onClick={props.onDisconnect} disabled={!props.connected}><ZapOff size={12} /> Cut</Btn>
        </div>
        {props.ttsMsg && <div className="mt-1.5 text-[10px] leading-relaxed text-neutral-500">{props.ttsMsg}</div>}
        {props.connected && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide text-neutral-400">Lip</span>
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-violet-100">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width] duration-75" style={{ width: `${props.amp}%` }} />
            </div>
            <span className="w-7 text-right text-[10px] tabular-nums text-neutral-500">{props.amp}%</span>
          </div>
        )}
      </Section>
      <Section title="VRM Model">
        <input
          type="file"
          accept=".vrm"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onFile(f); }}
          className="w-full cursor-pointer rounded-lg border border-dashed border-violet-300 bg-violet-50/50 px-2.5 py-1.5 text-[11px] text-neutral-500"
        />
        {props.models.length > 0 && (
          <div className="mt-2">
            <div className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-neutral-400">From server</div>
            <div className="grid grid-cols-2 gap-1.5">
              {props.models.map((m) => (
                <Btn key={m.url} variant="secondary" onClick={() => props.onPickModel(m)} className="text-[11px]">
                  {m.name.replace(/\.vrm$/i, "").slice(0, 18)}
                </Btn>
              ))}
            </div>
          </div>
        )}
        <div className="mt-1.5 text-[10px] leading-relaxed text-neutral-500">{props.vrmStatus || "No model loaded."}</div>
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
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[12px]"
          >
            {VOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div className="w-[86px] shrink-0">
            <label className="mb-1 flex items-center justify-between text-[10px] text-neutral-500">
              Speed <strong className="text-violet-600">{props.speed.toFixed(2)}x</strong>
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
                    ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                    : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-cyan-400 hover:text-cyan-600",
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
        {props.animStatus && <div className="mt-1.5 text-[10px] text-neutral-500">{props.animStatus}</div>}
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
                  ? "border-violet-500 bg-violet-100 text-violet-700"
                  : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-violet-400 hover:text-violet-600",
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
  charPos: { x: number; y: number; z: number; lift: number };
  onPos: (p: { x: number; y: number; z: number; lift: number }) => void;
  sofa: string; onResetPos: () => void; onCamHome: () => void;
  face: Record<string, number>; onFace: (k: string, v: number) => void;
  onResetFace: () => void; blinkAuto: boolean; onToggleBlink: () => void;
}) {
  const { charPos } = props;
  return (
    <Panel label="Debug">
      <Section title="Character Position" right={props.sofa}>
        <div className="grid grid-cols-2 gap-2.5">
          <Slider label="Left / Right" value={charPos.x} display={charPos.x.toFixed(2)} min={-4} max={4} step={0.05} onChange={(v) => props.onPos({ ...charPos, x: v })} />
          <Slider label="Fwd / Back" value={charPos.z} display={charPos.z.toFixed(2)} min={-4} max={4} step={0.05} onChange={(v) => props.onPos({ ...charPos, z: v })} />
          <Slider label="Lift" value={charPos.lift} display={charPos.lift.toFixed(2)} min={-1} max={3} step={0.02} onChange={(v) => props.onPos({ ...charPos, lift: v })} />
          <Slider label="Cam height trim" value={charPos.y} display={charPos.y.toFixed(2)} min={-2} max={2} step={0.02} onChange={(v) => props.onPos({ ...charPos, y: v })} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Btn variant="secondary" onClick={props.onResetPos}>Reset</Btn>
          <Btn variant="secondary" onClick={props.onCamHome}>Home Cam</Btn>
        </div>
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
