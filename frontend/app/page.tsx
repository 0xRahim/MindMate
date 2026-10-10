"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Music2 } from "lucide-react";
import { StageEngine, type CharPos, type ChatState } from "@/lib/stage/engine";
import { TopBar, type PanelId } from "@/components/TopBar";
import { DebugPanel, InteractPanel, StatusPanel } from "@/components/Panels";
import { ChatPanel, type UIMessage } from "@/components/ChatPanel";
import type { ChatMessage } from "@/lib/chat/api";
import { DEFAULT_POS, loadSettings, saveSettings } from "@/lib/settings";

const DEFAULT_TTS =
  process.env.NEXT_PUBLIC_TTS_URL ?? "http://localhost:5000";

export default function Home() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StageEngine | null>(null);
  const animUrlByName = useRef(new Map<string, string>());
  const historyRef = useRef<ChatMessage[]>([]);
  // Read once (lazy init) — persisted debug/panel settings, if any.
  const [stored] = useState(loadSettings);

  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [ttsUrl, setTtsUrl] = useState(stored.ttsUrl ?? DEFAULT_TTS);
  const [ttsConnected, setTtsConnected] = useState(false);
  const [ttsLabel, setTtsLabel] = useState("Not connected");
  const [ttsMsg, setTtsMsg] = useState("");
  const [amp, setAmp] = useState(0);
  const [models, setModels] = useState<{ name: string; url: string }[]>([]);
  const [anims, setAnims] = useState<{ name: string; url: string }[]>([]);
  const [vrmStatus, setVrmStatus] = useState("");
  const [stageStatus, setStageStatus] = useState("");
  const [sofa, setSofa] = useState("");
  const [caption, setCaption] = useState("Load a VRM model to begin.");
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [animStatus, setAnimStatus] = useState("");
  const [replyText, setReplyText] = useState("");
  const [voice, setVoice] = useState(stored.voice ?? "af_heart");
  const [speed, setSpeed] = useState(stored.speed ?? 1.0);
  const [loop, setLoop] = useState(stored.loop ?? true);
  const [activeEmote, setActiveEmote] = useState("idle");
  const [history, setHistory] = useState<UIMessage[]>([]);
  const [chatState, setChatState] = useState<ChatState>("");
  const [charPos, setCharPosState] = useState<CharPos>(stored.charPos ?? DEFAULT_POS);
  const [face, setFace] = useState<Record<string, number>>({});
  const [blinkAuto, setBlinkAuto] = useState(stored.blinkAuto ?? true);
  const [micOn, setMicOn] = useState(false);
  const recogRef = useRef<{ stop: () => void; start: () => void } | null>(null);

  const pushMsg = useCallback((role: UIMessage["role"], text: string) => {
    setHistory((h) => [...h, { role, text }]);
    if (role !== "sys")
      historyRef.current.push({ role: role === "bot" ? "assistant" : "user", content: text });
  }, []);

  // engine lifecycle
  useEffect(() => {
    if (!wrapRef.current || engineRef.current) return;
    const engine = new StageEngine(wrapRef.current, {
      onChatState: setChatState,
      onCaption: setCaption,
      onNowPlaying: setNowPlaying,
      onAnimStatus: setAnimStatus,
      onTts: (label, connected) => { setTtsLabel(label); setTtsConnected(connected); },
      onTtsMsg: setTtsMsg,
      onAmp: setAmp,
      onModels: setModels,
      onAnims: (list) => {
        setAnims(list);
        animUrlByName.current = new Map(
          list.map((a) => [a.name.replace(/\.fbx$/i, ""), a.url]),
        );
      },
      onVrmStatus: setVrmStatus,
      onStageStatus: setStageStatus,
      onCharPos: (p) => setCharPosState(p),
      onSofa: setSofa,
      onMessage: pushMsg,
    });
    engineRef.current = engine;
    // Seed persisted settings into the fresh engine (first mount only).
    // Sofa auto-detect may move her afterwards — onCharPos syncs that back.
    if (stored.charPos) {
      const p = stored.charPos;
      engine.setCharPos(p.x, p.y, p.z, p.lift);
    }
    engine.loopAnimation = stored.loop ?? true;
    engine.setAutoBlink(stored.blinkAuto ?? true);
    engine.fetchServerAssets();
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    // drag & drop VRM
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f?.name.toLowerCase().endsWith(".vrm")) engine.loadVRMBlob(f);
    };
    const onDrag = (e: DragEvent) => e.preventDefault();
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragover", onDrag);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragover", onDrag);
      engine.dispose();
      engineRef.current = null;
    };
  }, [pushMsg]);

  // keep anim URL map in sync
  useEffect(() => {
    animUrlByName.current = new Map(anims.map((a) => [a.name.replace(/\.fbx$/i, ""), a.url]));
  }, [anims]);

  // persist debug/panel settings across reloads
  useEffect(() => {
    saveSettings({ charPos, voice, speed, loop, blinkAuto, ttsUrl });
  }, [charPos, voice, speed, loop, blinkAuto, ttsUrl]);

  const handleSend = useCallback(
    (text: string) => {
      // engine.sendChat emits user/bot/sys messages via onMessage → onMessage → pushMsg.
      void engineRef.current?.sendChat(text, historyRef.current, animUrlByName.current, voice, speed);
    },
    [voice, speed],
  );

  const toggleMic = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { pushMsg("sys", "Speech recognition not supported."); return; }
    if (recogRef.current) {
      recogRef.current.stop();
      recogRef.current = null;
      setMicOn(false);
      setChatState("");
      return;
    }
    try {
      const rec: SpeechRec = new SR();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onstart = () => { setMicOn(true); setChatState("listening"); };
      rec.onend = () => { setMicOn(false); recogRef.current = null; setChatState(""); };
      rec.onerror = (e: { error?: string }) => { setMicOn(false); recogRef.current = null; pushMsg("sys", "Mic error: " + (e.error ?? "?")); };
      rec.onresult = (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => {
        const last = e.results[e.results.length - 1];
        const transcript = last[0].transcript;
        if (last.isFinal) {
          rec.stop();
          setTimeout(() => handleSend(transcript), 80);
        }
      };
      recogRef.current = rec;
      rec.start();
    } catch (e) {
      pushMsg("sys", "Mic error: " + (e as Error).message);
    }
  }, [handleSend, pushMsg]);

  type SpeechRec = {
    continuous: boolean; interimResults: boolean; lang: string;
    onstart: (() => void) | null; onend: (() => void) | null;
    onerror: ((e: { error?: string }) => void) | null;
    onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
    start(): void; stop(): void;
  };

  const onPos = (p: CharPos) => {
    setCharPosState(p);
    engineRef.current?.setCharPos(p.x, p.y, p.z, p.lift);
  };

  const FACE_MAP: Record<string, string[]> = {
    mouthOpen: ["aa"], smile: ["happy"], blink: ["blinkLeft", "blinkRight"], surprise: ["surprised"],
  };
  const onFace = (k: string, v: number) => {
    setFace((f) => ({ ...f, [k]: v }));
    for (const n of FACE_MAP[k] ?? []) engineRef.current?.setExpr(n, v);
  };

  return (
    <main className="relative h-full w-full overflow-hidden" style={{ background: "#08090f" }}>
      {/* 3D viewport — canvas only; overlay lives outside so dispose() can't wipe React DOM */}
      <div ref={wrapRef} className="absolute inset-0 z-[1]" />
      <div className="pointer-events-none absolute bottom-[260px] left-3.5 z-10 max-w-[min(500px,58vw)] rounded-[10px] border border-violet-400/20 bg-[#07020e]/80 p-2.5 px-3.5 backdrop-blur-md">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-cyan-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
          MindMate Live
        </div>
        <div className="text-[13px] leading-relaxed text-neutral-100">{caption}</div>
        {stageStatus && <div className="mt-1 text-[10px] text-neutral-400">{stageStatus}</div>}
      </div>

      {nowPlaying && (
        <div className="fixed left-3.5 top-[60px] z-20 flex items-center gap-1.5 rounded-full border border-cyan-400/60 bg-[#07020e]/90 px-3 py-1.5 text-[10px] font-bold text-cyan-300 shadow-[0_0_14px_rgba(0,240,255,0.2)] backdrop-blur-md">
          <Music2 size={11} />
          {nowPlaying}
        </div>
      )}

      <TopBar active={activePanel} onToggle={setActivePanel} ttsConnected={ttsConnected} />

      {activePanel && (
        <div className="pointer-events-none fixed right-3 top-[58px] z-30 flex justify-end">
          {activePanel === "status" && (
            <StatusPanel
              ttsUrl={ttsUrl} setTtsUrl={setTtsUrl}
              connected={ttsConnected} ttsLabel={ttsLabel} ttsMsg={ttsMsg} amp={amp}
              onConnect={() => engineRef.current?.connectTTS(ttsUrl.trim())}
              onDisconnect={() => engineRef.current?.disconnectTTS()}
              vrmStatus={vrmStatus} models={models}
              onPickModel={(m) => engineRef.current?.loadVRMURL(m.url, m.name)}
              onFile={(f) => engineRef.current?.loadVRMBlob(f)}
            />
          )}
          {activePanel === "interact" && (
            <InteractPanel
              replyText={replyText} setReplyText={setReplyText}
              voice={voice} setVoice={setVoice} speed={speed} setSpeed={setSpeed}
              canSpeak={ttsConnected}
              onSpeak={() => engineRef.current?.speakManual(replyText, voice, speed, "happy")}
              onStop={() => engineRef.current?.stopSpeaking()}
              anims={anims}
              onPlayAnim={(a) => engineRef.current?.playAnimation(a.url, a.name)}
              nowPlaying={nowPlaying} animStatus={animStatus}
              canStopAnim={!!nowPlaying}
              onStopAnim={() => engineRef.current?.stopAnimation()}
              loop={loop}
              onToggleLoop={() => { const v = engineRef.current?.toggleLoop(); if (v !== undefined) setLoop(v); }}
              activeEmote={activeEmote}
              onEmote={(id) => { setActiveEmote(id); engineRef.current?.playEmote(id as "idle"); }}
            />
          )}
          {activePanel === "debug" && (
            <DebugPanel
              charPos={charPos} onPos={onPos} sofa={sofa}
              onResetPos={() => { onPos({ ...DEFAULT_POS }); engineRef.current?.setCamHome(); }}
              onCamHome={() => engineRef.current?.setCamHome()}
              face={face} onFace={onFace}
              onResetFace={() => { engineRef.current?.resetFace(); setFace({}); }}
              blinkAuto={blinkAuto}
              onToggleBlink={() => { const v = !blinkAuto; setBlinkAuto(v); engineRef.current?.setAutoBlink(v); }}
            />
          )}
        </div>
      )}

      <ChatPanel
        history={history}
        chatState={chatState}
        micOn={micOn}
        onSend={handleSend}
        onToggleMic={toggleMic}
      />
    </main>
  );
}
