// SEE-THROUGH OCCLUDERS: café umbrellas, tree canopies, awnings, bunting and banners that sit
// between the camera and the skater dissolve in a soft dithered hole around him, so the
// player is never hidden behind decoration. One shared set of uniforms, set once per frame
// from the skater's projected position; any material passed to seeThrough() honours it.
// Only fragments that are clearly IN FRONT of the skater (closer to the camera by > ~1.2 m)
// are cut, so whatever he is riding on or standing beside stays solid.
import * as THREE from '../vendor/three.module.min.js';

const U = { uHole: { value: new THREE.Vector2(-1e4, -1e4) }, uHoleR: { value: 0 }, uHoleZ: { value: 0 } };

export function seeThrough(mat) {
  if (!mat || mat.userData.seeThrough) return mat;
  mat.userData.seeThrough = true;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHole = U.uHole; sh.uniforms.uHoleR = U.uHoleR; sh.uniforms.uHoleZ = U.uHoleZ;
    sh.fragmentShader = 'uniform vec2 uHole;\nuniform float uHoleR;\nuniform float uHoleZ;\n' + sh.fragmentShader.replace('void main() {', `void main() {
  if (uHoleR > 0.0 && gl_FragCoord.z < uHoleZ) {
    float dd = distance(gl_FragCoord.xy, uHole) / uHoleR;
    if (dd < 1.0) {
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      if (n > smoothstep(0.62, 1.0, dd)) discard;
    }
  }`);
  };
  mat.needsUpdate = true;
  return mat;
}

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _sz = new THREE.Vector2();
// Call once per frame after the camera has moved, before rendering.
export function updateHole(camera, renderer, pos, enabled = true) {
  if (!enabled) { U.uHoleR.value = 0; return; }
  renderer.getDrawingBufferSize(_sz);
  _p.set(pos.x, pos.y + 0.85, pos.z);                       // the skater's middle
  _q.copy(camera.position).sub(_p); const d = _q.length();
  if (d < 0.5) { U.uHoleR.value = 0; return; }
  _q.multiplyScalar(Math.min(1.2, d * 0.4) / d).add(_p);    // a point ~1.2 m toward the lens
  _q.project(camera);
  U.uHoleZ.value = _q.z * 0.5 + 0.5;
  _p.project(camera);
  U.uHole.value.set((_p.x * 0.5 + 0.5) * _sz.x, (_p.y * 0.5 + 0.5) * _sz.y);
  U.uHoleR.value = 0.2 * Math.min(_sz.x, _sz.y * 0.75);
}
