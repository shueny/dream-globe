import * as THREE from "three";

/**
 * Radial-gradient white glow on a 64×64 canvas — the sprite texture used by
 * markers and arc travellers (Round 2). Lifted verbatim from the prototype.
 */
export function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.28, "rgba(255,255,255,.9)");
  grd.addColorStop(0.6, "rgba(255,255,255,.28)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
