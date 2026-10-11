import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import type { VRM } from "@pixiv/three-vrm";

// Mixamo → VRM bone map (official pixiv recipe, ported from main/index.html).
const MIXAMO_VRM_RIG_MAP: Record<string, string> = {
  mixamorigHips: "hips",
  mixamorigSpine: "spine",
  mixamorigSpine1: "chest",
  mixamorigSpine2: "upperChest",
  mixamorigNeck: "neck",
  mixamorigHead: "head",
  mixamorigLeftShoulder: "leftShoulder",
  mixamorigLeftArm: "leftUpperArm",
  mixamorigLeftForeArm: "leftLowerArm",
  mixamorigLeftHand: "leftHand",
  mixamorigRightShoulder: "rightShoulder",
  mixamorigRightArm: "rightUpperArm",
  mixamorigRightForeArm: "rightLowerArm",
  mixamorigRightHand: "rightHand",
  mixamorigLeftUpLeg: "leftUpperLeg",
  mixamorigLeftLeg: "leftLowerLeg",
  mixamorigLeftFoot: "leftFoot",
  mixamorigLeftToeBase: "leftToes",
  mixamorigRightUpLeg: "rightUpperLeg",
  mixamorigRightLeg: "rightLowerLeg",
  mixamorigRightFoot: "rightFoot",
  mixamorigRightToeBase: "rightToes",
};

export function loadMixamoAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip> {
  return new FBXLoader().loadAsync(url).then((asset) => {
    const clip =
      THREE.AnimationClip.findByName(asset.animations, "mixamo.com") ?? asset.animations[0];
    if (!clip) throw new Error("No animation in " + url);

    const restRotInv = new THREE.Quaternion();
    const parentRestWQ = new THREE.Quaternion();
    const q = new THREE.Quaternion();
    const mixHips = asset.getObjectByName("mixamorigHips");
    const motionH = mixHips ? mixHips.position.y : 1;
    let vrmH = 1;
    try {
      vrmH = vrm.humanoid.normalizedRestPose.hips?.position?.[1] ?? 1;
    } catch {
      /* keep 1 */
    }
    const hipsScale = Math.abs(motionH) > 1e-6 ? vrmH / motionH : 1;
    const isVRM0 = (vrm.meta as unknown as { metaVersion?: string })?.metaVersion === "0";
    const tracks: THREE.KeyframeTrack[] = [];

    for (const track of clip.tracks) {
      const [mixBone, prop] = track.name.split(".");
      // Head + neck stay under procedural control (gaze, emotes, expressions):
      // baked Mixamo head tracks come out as rolls on these VRM models.
      if (mixBone === "mixamorigHead" || mixBone === "mixamorigNeck") continue;
      const vrmKey = MIXAMO_VRM_RIG_MAP[mixBone];
      const vrmNode = vrmKey ? vrm.humanoid.getNormalizedBoneNode(vrmKey as never) : null;
      const fbxNode = asset.getObjectByName(mixBone);
      if (!vrmKey || !vrmNode || !fbxNode) continue;
      fbxNode.getWorldQuaternion(restRotInv).invert();
      (fbxNode.parent as THREE.Object3D).getWorldQuaternion(parentRestWQ);
      if (track instanceof THREE.QuaternionKeyframeTrack) {
        for (let i = 0; i < track.values.length; i += 4) {
          q.fromArray(track.values, i).premultiply(parentRestWQ).multiply(restRotInv);
          q.toArray(track.values, i);
        }
        const vals = isVRM0
          ? (track.values as unknown as number[]).map((v, i) => (i % 2 === 0 ? -v : v))
          : track.values.slice();
        tracks.push(
          new THREE.QuaternionKeyframeTrack(`${vrmNode.name}.${prop}`, track.times, vals),
        );
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        const vals = (track.values as unknown as number[]).map(
          (v, i) => (isVRM0 && i % 3 !== 1 ? -v : v) * hipsScale,
        );
        tracks.push(new THREE.VectorKeyframeTrack(`${vrmNode.name}.${prop}`, track.times, vals));
      }
    }
    return new THREE.AnimationClip("vrmAnim", clip.duration, tracks);
  });
}
