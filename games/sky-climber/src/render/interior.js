// Sky Climber VR — 窓の奥の部屋（インテリアマッピング）。窓 1 枚の板に、光線と箱の交差を計算して
// 奥の壁・床・天井・側壁・家具・カーテン・照明を描く。部屋の 3D モデルを置かずに奥行きが出る（両眼でも正しい視差）。
import * as THREE from 'three';

export function makeInteriorMaterial({ winW, winH, sillH, theme }) {
  const night = theme === 'night', dusk = theme === 'dusk';
  return new THREE.ShaderMaterial({
    uniforms: {
      uDay: { value: night ? 0.08 : dusk ? 0.55 : 1.0 },
      uWarm: { value: new THREE.Color(night ? 0xffbf78 : dusk ? 0xffd09a : 0xfff0d8).multiplyScalar(night ? 1.5 : dusk ? 1.2 : 1) },
      uFogColor: { value: new THREE.Color(0x9fb4c8) }, uFogDensity: { value: 0.0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec4 aRoom; // x=種(0-1) y=照明(0/1) z=カーテン(0-1) w=模様
      varying vec3 vLocal; varying vec3 vCam; varying vec4 vRoom; varying float vDist;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 wp = m * vec4(position, 1.0);
        vCam = (inverse(m) * vec4(cameraPosition, 1.0)).xyz;
        vLocal = position; vRoom = aRoom;
        vec4 mv = viewMatrix * wp; vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uDay; uniform vec3 uWarm; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime;
      varying vec3 vLocal; varying vec3 vCam; varying vec4 vRoom; varying float vDist;
      const float W = ${winW.toFixed(3)}; const float H = ${winH.toFixed(3)}; const float SILL = ${sillH.toFixed(3)};
      vec3 pal(float t) { return 0.55 + 0.35 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t)); }
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        vec3 ro = vLocal, rd = normalize(vLocal - vCam);
        float seed = floor(vRoom.x * 1023.0 + 0.5) / 1023.0;   // 補間の誤差で乱数が画素ごとに変わらないよう丸める
        float D = 2.6 + hash(seed * 91.0) * 1.6;           // 部屋の奥行き
        float RW = 2.8;                                     // 部屋の幅（窓より広い）
        float FY = -H * 0.5 - SILL, CY = FY + 2.55;         // 床と天井の高さ
        // 箱の内側の面との交差
        float tz = (-D - ro.z) / rd.z;
        float tx = ((rd.x > 0.0 ? RW * 0.5 : -RW * 0.5) - ro.x) / rd.x;
        float ty = ((rd.y > 0.0 ? CY : FY) - ro.y) / rd.y;
        float t = min(tz, min(tx, ty));
        vec3 p = ro + rd * t;
        vec3 wallC = mix(pal(seed * 3.1) * 0.85, vec3(0.86, 0.84, 0.80), 0.55);
        vec3 c;
        if (t == tz) { // 奥の壁: 壁紙の縞・額縁・棚
          c = wallC * (0.92 + 0.08 * step(0.5, fract(p.x * (4.0 + vRoom.w * 6.0))));
          vec2 fr = vec2(p.x - (hash(seed * 7.0) - 0.5) * 1.2, p.y - (FY + 1.55));
          if (abs(fr.x) < 0.32 && abs(fr.y) < 0.22) c = abs(fr.x) > 0.28 || abs(fr.y) > 0.18 ? vec3(0.35, 0.24, 0.14) : pal(seed * 11.0 + 0.3) * 0.8;
          if (abs(p.y - (FY + 1.0)) < 0.02 && abs(p.x + 0.6) < 0.5) c = vec3(0.4, 0.3, 0.2);
        } else if (t == tx) { c = wallC * 0.8; }
        else if (rd.y < 0.0) { // 床: 板張り
          float plank = fract(p.z * 5.0); c = vec3(0.45, 0.32, 0.2) * (0.8 + 0.2 * hash(floor(p.z * 5.0) + seed * 13.0)) * (plank < 0.04 ? 0.7 : 1.0);
          if (hash(seed * 3.0) > 0.5) c = mix(c, pal(seed * 5.0) * 0.6, step(abs(p.x), 0.8) * step(abs(p.z + D * 0.5), 0.6)); // じゅうたん
        } else { c = vec3(0.92, 0.9, 0.86); }
        // 家具（部屋ごとに種類が違う: ソファ・本棚・机とテレビ）: 光線と箱の交差
        float kind = hash(seed * 41.0);
        vec3 fsz = kind < 0.4 ? vec3(1.3, 0.72, 0.75) : kind < 0.7 ? vec3(0.95, 1.85, 0.34) : vec3(1.2, 0.55, 0.5);
        vec3 bmin = vec3(-1.1 + hash(seed * 17.0) * 0.9, FY, -D + 0.04), bmax = bmin + fsz;
        vec3 i0 = (bmin - ro) / rd, i1 = (bmax - ro) / rd;
        vec3 tmin = min(i0, i1), tmax = max(i0, i1);
        float tn = max(max(tmin.x, tmin.y), tmin.z), tf = min(min(tmax.x, tmax.y), tmax.z);
        float tvGlow = 0.0;
        if (tn < tf && tn > 0.0 && tn < t) { t = tn; vec3 q = ro + rd * tn; p = q;
          vec3 fc = pal(seed * 23.0 + 0.5);
          if (kind < 0.4) { c = fc * (q.y > bmax.y - 0.01 ? 0.8 : 0.55); if (q.y > bmin.y + 0.42 && q.z < bmin.z + 0.2) c *= 0.8; }              // ソファ（背もたれ）
          else if (kind < 0.7) { vec2 sh = vec2((q.x - bmin.x) * 14.0, (q.y - FY) / 0.37); c = mix(vec3(0.36, 0.25, 0.16), pal(floor(sh.x) * 0.37 + floor(sh.y) * 0.21 + seed) * 0.7, step(0.12, fract(sh.y)) * step(0.1, fract(sh.x))); } // 本棚（背表紙）
          else { c = vec3(0.32, 0.22, 0.14) * (q.y > bmax.y - 0.01 ? 1.0 : 0.7); }                                                                     // 机
        }
        // テレビ（机の部屋）: 奥の壁の画面が明滅して、部屋を青白く照らす
        if (kind >= 0.7) { vec3 tvc = vec3(bmin.x + 0.6, FY + 1.05, -D + 0.02); float ttv = (tvc.z - ro.z) / rd.z; vec3 q = ro + rd * ttv;
          float fl = 0.55 + 0.45 * sin(uTime * 7.0 + seed * 90.0) * sin(uTime * 2.3 + seed * 30.0);
          if (abs(q.x - tvc.x) < 0.42 && abs(q.y - tvc.y) < 0.25 && ttv < t + 0.05) { c = mix(vec3(0.25, 0.45, 1.0), vec3(1.0, 0.85, 0.7), 0.5 + 0.5 * sin(uTime * 1.3 + q.x * 9.0)) * fl * 2.2; t = ttv; p = q; tvGlow = -1.0; }
          else tvGlow = fl * vRoom.y; }
        // 人影（点いた部屋の一部）: 奥をゆっくり横切る
        if (vRoom.y > 0.5 && hash(seed * 77.0) > 0.6) { float px = sin(uTime * 0.25 + seed * 50.0) * 0.9, tp = (-D * 0.62 - ro.z) / rd.z; vec3 q = ro + rd * tp;
          float body = step(abs(q.x - px), 0.19) * step(FY, q.y) * step(q.y, FY + 1.42) + step(length(q.xy - vec2(px, FY + 1.58)), 0.13);
          if (body > 0.0 && tp < t) { c = vec3(0.08, 0.07, 0.09); t = tp; p = q; } }
        // 照明: 点いた部屋は天井の灯りから、消えた部屋は窓からの外光が奥へ減る
        float lit = vRoom.y;
        vec3 lamp = vec3(0.0, CY - 0.05, -D * 0.5);
        float ld = length(p - lamp);
        vec3 light = mix(vec3(0.0), uWarm * (1.35 / (0.6 + ld * ld * 0.35)), lit);
        light += vec3(0.75, 0.8, 0.9) * uDay * (0.55 / (1.0 + (-p.z) * 0.55));
        if (tvGlow > 0.0) light += vec3(0.25, 0.4, 0.9) * tvGlow * 0.5 / (0.5 + (-p.z + D) * 0.4);
        if (tvGlow < 0.0) light = vec3(1.0);
        // 天井と壁・床と壁の入隅を少し暗く（接する所の陰）
        light *= 0.72 + 0.28 * smoothstep(0.0, 0.35, min(min(p.y - FY, CY - p.y), min(RW * 0.5 - abs(p.x), p.z + D)) + 0.02);
        if (t == ty && rd.y > 0.0 && lit > 0.5) light += uWarm * smoothstep(0.35, 0.0, length(p.xz - lamp.xz)) * 2.5; // 天井の灯り
        c *= light + 0.04;
        // カーテン: 窓のすぐ奥（z=-0.18）の布。左右から閉じる量は部屋ごと。ひだの陰影つき
        float tc = (-0.18 - ro.z) / rd.z; vec3 pc = ro + rd * tc;
        float open = mix(0.15, 0.85, vRoom.z);
        if (abs(pc.x) > W * 0.5 * open && tc < t) {
          float sway = sin(uTime * 1.1 + seed * 30.0 + pc.y * 2.0) * 0.012 * (0.5 - pc.y / H);  // 風でゆれる（すそほど大きい）
          float fold = 0.72 + 0.28 * sin((pc.x + sway) * 45.0 + seed * 20.0);
          vec3 cc = mix(pal(seed * 31.0 + 0.1), vec3(0.95, 0.93, 0.88), 0.45) * fold;
          c = cc * (vec3(0.6, 0.62, 0.66) * uDay * 1.1 + uWarm * lit * 0.9 + 0.05);
        }
        // 窓ガラスの奥の暗さ（窓の縁ほど少し暗い）
        c *= 1.0 - 0.3 * smoothstep(0.33, 0.5, max(abs(vLocal.x) / W, abs(vLocal.y) / H));
        c *= mix(vec3(1.0), 0.75 + 0.5 * pal(seed * 9.0), 0.25 * lit);   // 部屋ごとの灯りの色味
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
        gl_FragColor = vec4(mix(c, uFogColor, fog), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
