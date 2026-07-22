import * as THREE from "three";

/**
 * lat/lng → Vector3 on a sphere of radius r.
 * Lifted verbatim from the prototype (README "3D Scene Spec"):
 *   phi = (90 - lat)·π/180, theta = (lng + 180)·π/180
 *   x = -r·sinφ·cosθ, y = r·cosφ, z = r·sinφ·sinθ
 */
export function ll2v(lat, lng, r) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Inverse of ll2v: a world/local point → { lat, lng }.
 * Used for pin-drop hit testing in Round 2.
 */
export function v2ll(v) {
  const n = v.clone().normalize();
  const lat = 90 - (Math.acos(n.y) * 180) / Math.PI;
  let lng = (Math.atan2(n.z, -n.x) * 180) / Math.PI - 180;
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return { lat, lng };
}
