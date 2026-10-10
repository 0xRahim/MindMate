import type * as THREE from "three";

export type BoneGetter = (name: string) => THREE.Object3D | null;
export type EmoteId = "idle" | "wave" | "nod" | "dance" | "think" | "bounce" | "shrug" | "point";

export const EMOTES: { id: EmoteId; label: string; hint: string }[] = [
  { id: "idle", label: "Idle", hint: "Rest" },
  { id: "wave", label: "Wave", hint: "Wave" },
  { id: "nod", label: "Nod", hint: "Nod" },
  { id: "dance", label: "Dance", hint: "Dance" },
  { id: "think", label: "Think", hint: "Think" },
  { id: "bounce", label: "Bounce", hint: "Bounce" },
  { id: "shrug", label: "Shrug", hint: "Shrug" },
  { id: "point", label: "Point", hint: "Point" },
];

// All poses ported 1:1 from main/index.html (normalised bones).
export function naturalArms(get: BoneGetter) {
  const lU = get("leftUpperArm"), rU = get("rightUpperArm");
  const lL = get("leftLowerArm"), rL = get("rightLowerArm");
  const lH = get("leftHand"), rH = get("rightHand");
  if (lU) { lU.rotation.x = 0.06; lU.rotation.y = 0; lU.rotation.z = -1.22; }
  if (rU) { rU.rotation.x = 0.06; rU.rotation.y = 0; rU.rotation.z = 1.22; }
  if (lL) { lL.rotation.x = 0.08; lL.rotation.y = 0; lL.rotation.z = 0; }
  if (rL) { rL.rotation.x = 0.08; rL.rotation.y = 0; rL.rotation.z = 0; }
  if (lH) lH.rotation.set(0, 0, 0);
  if (rH) rH.rotation.set(0, 0, 0);
}

export function baseIdle(get: BoneGetter, t: number) {
  const sp = get("spine"), ch = get("chest"), uc = get("upperChest");
  const nk = get("neck"), hd = get("head");
  const sw = Math.sin(t * 0.9) * 0.032;
  const bob = Math.sin(t * 1.1) * 0.013;
  const br = Math.sin(t * 1.25) * 0.016;
  if (sp) { sp.rotation.z = sw * 0.22; sp.position.y = br * 0.4; }
  if (ch) ch.rotation.z = sw * 0.3;
  if (uc) uc.rotation.y = sw * 0.45;
  if (nk) nk.rotation.y = Math.sin(t * 0.7) * 0.04;
  if (hd) { hd.rotation.y = Math.sin(t * 0.6) * 0.04; hd.rotation.x = bob; }
}

function wave(get: BoneGetter, t: number) {
  naturalArms(get);
  const u = get("rightUpperArm"), l = get("rightLowerArm"), h = get("rightHand");
  const s = Math.sin(t * 10) * 0.7;
  if (u) { u.rotation.z = 0.18; u.rotation.x = -0.18; u.rotation.y = 0.45; }
  if (l) { l.rotation.z = -0.35 + s * 0.22; l.rotation.x = -0.12; }
  if (h) h.rotation.z = 0.18 + s * 0.4;
}

function nod(get: BoneGetter, t: number) {
  naturalArms(get);
  const h = get("head"), n = get("neck");
  const nd = Math.sin(t * 5.5) * 0.16 + 0.06;
  if (h) { h.rotation.x = nd; h.rotation.y = Math.sin(t * 0.6) * 0.03; }
  if (n) n.rotation.x = nd * 0.45;
}

function dance(get: BoneGetter, t: number) {
  const b = Math.sin(t * 3.2), b2 = Math.cos(t * 3.2), b4 = Math.sin(t * 6.4);
  const hp = get("hips"), sp = get("spine"), ch = get("chest");
  const lU = get("leftUpperArm"), rU = get("rightUpperArm");
  const lL = get("leftLowerArm"), rL = get("rightLowerArm");
  const nk = get("neck"), hd = get("head");
  if (hp) { hp.rotation.y = b * 0.22; hp.rotation.z = b * 0.09; }
  if (sp) { sp.rotation.z = -b * 0.14; sp.rotation.y = b2 * 0.08; sp.position.y = Math.abs(b4) * 0.05; }
  if (ch) ch.rotation.z = b * 0.1;
  if (nk) nk.rotation.y = b2 * 0.07;
  if (hd) { hd.rotation.y = b * 0.06; hd.rotation.z = b2 * 0.04; }
  if (lU) { lU.rotation.z = -(0.85 + b2 * 0.38); lU.rotation.x = b * 0.18; }
  if (rU) { rU.rotation.z = 0.85 + b * 0.38; rU.rotation.x = b2 * 0.18; }
  if (lL) lL.rotation.x = 0.28 + b * 0.22;
  if (rL) rL.rotation.x = 0.28 + b2 * 0.22;
}

function think(get: BoneGetter, t: number) {
  const slow = Math.sin(t * 0.6) * 0.04;
  const lU = get("leftUpperArm"), lL = get("leftLowerArm"), lH = get("leftHand");
  const rU = get("rightUpperArm"), rL = get("rightLowerArm");
  const hd = get("head"), nk = get("neck");
  if (lU) { lU.rotation.z = -0.55; lU.rotation.x = 0.35; lU.rotation.y = -0.25; }
  if (lL) lL.rotation.x = 1.15;
  if (lH) lH.rotation.x = 0.25;
  if (rU) { rU.rotation.z = 0.55; rU.rotation.x = 0.45; rU.rotation.y = 0.35; }
  if (rL) rL.rotation.x = 1.35;
  if (hd) { hd.rotation.z = 0.1 + slow; hd.rotation.y = slow * 1.2; }
  if (nk) nk.rotation.x = 0.04;
}

function bounce(get: BoneGetter, t: number) {
  const b = Math.abs(Math.sin(t * 4.2)), b2 = Math.sin(t * 4.2);
  const sp = get("spine"), hp = get("hips");
  const lU = get("leftUpperArm"), rU = get("rightUpperArm"), hd = get("head");
  if (hp) hp.position.y = b * 0.06;
  if (sp) { sp.rotation.z = b2 * 0.04; sp.position.y = b * 0.04; }
  if (hd) hd.rotation.x = -b * 0.04;
  if (lU) { lU.rotation.z = -1.15 + b2 * 0.18; lU.rotation.x = -b * 0.08; }
  if (rU) { rU.rotation.z = 1.15 - b2 * 0.18; rU.rotation.x = -b * 0.08; }
}

function shrug(get: BoneGetter, t: number) {
  const e = 0.5 + 0.5 * Math.sin(t * 1.8);
  const lU = get("leftUpperArm"), rU = get("rightUpperArm");
  const lL = get("leftLowerArm"), rL = get("rightLowerArm");
  const lS = get("leftShoulder"), rS = get("rightShoulder");
  const nk = get("neck"), hd = get("head");
  if (lS) lS.rotation.z = -e * 0.3;
  if (rS) rS.rotation.z = e * 0.3;
  if (lU) { lU.rotation.z = -(0.7 + e * 0.3); lU.rotation.x = 0.4; }
  if (rU) { rU.rotation.z = 0.7 + e * 0.3; rU.rotation.x = 0.4; }
  if (lL) lL.rotation.x = 0.9;
  if (rL) rL.rotation.x = 0.9;
  if (nk) nk.rotation.x = e * 0.06;
  if (hd) hd.rotation.z = Math.sin(t * 0.7) * 0.06;
}

function point(get: BoneGetter, t: number) {
  naturalArms(get);
  const p = Math.sin(t * 2.5) * 0.04;
  const rU = get("rightUpperArm"), rL = get("rightLowerArm");
  const rH = get("rightHand"), hd = get("head");
  if (rU) { rU.rotation.z = 0.35; rU.rotation.x = 0.5 - p; rU.rotation.y = 0.2; }
  if (rL) rL.rotation.x = 0.15;
  if (rH) { rH.rotation.x = -0.15 + p; rH.rotation.y = 0.1; }
  if (hd) { hd.rotation.y = 0.1 - p; hd.rotation.x = -0.05; }
}

export const EMOTE_MAP: Record<EmoteId, (get: BoneGetter, t: number) => void> = {
  idle: (g, t) => { naturalArms(g); void t; },
  wave, nod, dance, think, bounce, shrug, point,
};
