// 卡带的着色器。不用屏幕空间折射（手机上太贵）：
// 正面在着色器里按视线方向偏移去采样"核心贴图"，模拟核心藏在玻璃后面；磨砂度 = 模糊半径 + 乳白度；
// 解密 = 一条自上而下移动的清晰前沿，前沿处是读卡头红线。整片仓库一个 InstancedMesh、一次绘制。

export const DIM = { W: 3.2, H: 3.8, T: 0.44, CH: 0.6, R: 0.14 };

const common = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNL;
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vViewL;
  varying vec4 vA;   // x 核心格(-1 无)  y 贴签格  z 是否主角  w 随机
  varying vec4 vB;   // x 磨砂  y 解密前沿  z 状态灯模式  w 染色强度
  varying vec3 vTint;
  varying vec3 vLed;
  varying vec2 vE;   // x 可见度（点亮波）  y 闪光
`;

export const vertex = /* glsl */ `
  attribute vec4 aA;
  attribute vec4 aB;
  attribute vec3 aTint;
  attribute vec3 aLed;
  attribute vec2 aE;
  ${common}
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 w = m * vec4(position, 1.0);
    mat3 r = mat3(m);
    vWorld = w.xyz;
    vN = normalize(r * normal);
    vNL = normal;
    vLocal = position;
    vViewL = transpose(r) * (cameraPosition - w.xyz);
    vA = aA; vB = aB; vTint = aTint; vLed = aLed; vE = aE;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const uniforms = /* glsl */ `
  uniform vec3 uShell;
  uniform vec3 uPlate;
  uniform vec3 uFog;
  uniform vec3 uAccent;
  uniform vec3 uLightDir;
  uniform vec2 uFogDist;
  uniform vec2 uFogY;
  uniform float uDark;
  uniform float uTime;
  uniform float uGlint;
  uniform vec3 uGlowPos;
  uniform vec3 uGlowCol;
  uniform float uGlowStr;
  const float W = ${DIM.W.toFixed(3)};
  const float H = ${DIM.H.toFixed(3)};
  float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // 雾不混颜色而是变透明：远处的卡带直接融进页面背景（CSS 渐变），明暗切换也自然
  vec4 finish(vec3 col, vec3 N, vec3 V, float gloss) {
    vec3 L = normalize(uLightDir);
    float ndl = max(dot(N, L), 0.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 70.0);
    col *= mix(0.84, 1.04, ndl) * (N.y > 0.5 ? 1.04 : 1.0);
    col += fres * mix(vec3(0.22), vec3(0.10, 0.13, 0.16), uDark);
    col += spec * gloss * mix(0.45, 0.3, uDark);
    // 底部接触阴影 + 远处雾 + 低处雾（架子底部隐进雾里）
    col *= mix(mix(0.66, 0.5, uDark), 1.0, max(smoothstep(-0.2, 1.6, vLocal.y), vA.z * 0.75));
    float d = distance(vWorld, cameraPosition);
    float f = smoothstep(uFogDist.x, uFogDist.y, d);
    float low = 1.0 - smoothstep(uFogY.x, uFogY.y, vWorld.y);
    // 选中的卡带用自己的颜色照亮周围：浅色主题像有色光打在白玻璃上（相乘），深色主题像发光（相加）
    vec3 gd = vWorld - uGlowPos;
    float gk = uGlowStr * exp(-dot(gd, gd) / 120.0) * (0.55 + 0.45 * max(dot(N, normalize(-gd + vec3(0.0, 1.0, 0.0))), 0.0));
    col = mix(col, col * mix(vec3(1.0), uGlowCol * 1.15 + 0.08, 0.45), gk * (1.0 - uDark));
    col += uGlowCol * gk * 0.32 * uDark;
    // 点亮瞬间的闪光：主架用游戏色，库存用一点冷白
    col += vE.y * mix(vec3(0.55, 0.62, 0.7), vTint, step(0.01, vB.w)) * mix(0.35, 0.6, uDark);
    float fa = clamp(max(f, low * 0.92), 0.0, 1.0);
    col = mix(col, uFog, fa * 0.35);
    float a = (1.0 - fa) * vE.x;
    return vec4(col * a, a);
  }
`;

export const capFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec2 uGrid;
  uniform float uAtlasLod;
  uniform sampler2D uHero;
  uniform float uHeroSize;
  uniform sampler2D uLabels;
  uniform vec2 uLGrid;
  ${common}
  ${uniforms}
  const vec2 CMIN = vec2(-1.5, 0.64);
  const float CS = 3.0;

  vec3 core(vec2 uv, float blur, float lod0) {
    vec2 c = clamp(uv, 0.002, 0.998);
    vec3 res = uPlate * (0.96 + 0.06 * uv.y);
    if (vA.z > 0.5) {
      if (blur < 0.003) {
        res = textureLod(uHero, c, lod0).rgb;
      } else {
        float lod = log2(max(1.0, blur * uHeroSize * 0.35));
        float a0 = hash12(gl_FragCoord.xy) * 6.2831;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 10; i++) {
          float fi = float(i);
          float a = a0 + fi * 2.39996;
          float r = sqrt((fi + 0.5) / 10.0) * blur;
          acc += textureLod(uHero, clamp(c + vec2(cos(a), sin(a)) * r, 0.0, 1.0), lod).rgb;
        }
        res = acc / 10.0;
      }
    } else if (vA.x >= 0.0) {
      float ci = floor(vA.x + 0.5);
      vec2 cell = vec2(ci - uGrid.x * floor(ci / uGrid.x + 0.001), floor(ci / uGrid.x + 0.001));
      vec2 inset = clamp(c, 0.04, 0.96);
      vec2 t = vec2((cell.x + inset.x) / uGrid.x, 1.0 - (cell.y + 1.0 - inset.y) / uGrid.y);
      res = textureLod(uAtlas, t, blur * uAtlasLod).rgb;
    }
    return res;
  }

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 col;
    float gloss = 1.0;
    // 贴图的 mip 级别要在分支外面算（分支里的导数不可靠，会出噪点）
    vec2 lpRaw = (vLocal.xy - vec2(-1.42, 0.15)) / vec2(1.87, 0.44);
    float li = floor(vA.y + 0.5);
    vec2 lcell = vec2(li - uLGrid.x * floor(li / uLGrid.x + 0.001), floor(li / uLGrid.x + 0.001));
    vec2 lpc = clamp(lpRaw, 0.01, 0.99);
    vec3 labelCol = texture2D(uLabels, vec2((lcell.x + lpc.x) / uLGrid.x, 1.0 - (lcell.y + 1.0 - lpc.y) / uLGrid.y)).rgb;
    vec2 cuvRaw = (vLocal.xy - CMIN) / CS;
    float lod0 = max(0.0, log2(max(length(dFdx(cuvRaw)), length(dFdy(cuvRaw))) * uHeroSize));
    if (vNL.z < 0.5) {
      col = uShell * 0.9;
    } else {
      float frost = vB.x, reveal = vB.y;
      float hn = vLocal.y / H;
      const float F = 0.11;
      float edge = 1.0 - (1.0 + 2.0 * F) * reveal;
      float clearMask = smoothstep(edge, edge + 2.0 * F, hn);
      float fr = frost * (1.0 - clearMask);

      // 视差：核心板在玻璃后 0.24，折射让偏移再小一点
      vec3 vl = normalize(vViewL);
      vec2 p = vLocal.xy - vl.xy / max(vl.z, 0.25) * 0.24 * 0.68;
      vec2 uv = (p - CMIN) / CS;
      bool inCore = uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0;
      float blur = fr * (vA.z > 0.5 ? 0.085 : 1.0);
      vec3 inner = inCore ? core(uv, blur, lod0) : uPlate * (0.95 + 0.06 * hn);
      // 金手指：底部一排铜色触点（在玻璃里面）
      if (p.y > 0.03 && p.y < 0.11 && abs(p.x) < 1.32) {
        float k = fract((p.x + 1.32) / 0.24);
        float pad = smoothstep(0.12, 0.2, k) * (1.0 - smoothstep(0.8, 0.88, k));
        inner = mix(inner, mix(vec3(0.80, 0.56, 0.31), vec3(0.62, 0.47, 0.32), uDark), pad * (1.0 - fr * 0.55));
      }
      float grain = hash12(floor(gl_FragCoord.xy * 0.8)) - 0.5;
      vec3 milk = uShell;
      vec3 frosted = mix(inner, milk, mix(0.4, 0.3, uDark) + 0.05 * grain) + grain * 0.03 * fr;
      vec3 clearC = inner * 0.97 + 0.015;
      col = mix(clearC, frosted, fr);
      col += vTint * vB.w * fr * mix(0.10, 0.16, uDark);
      gloss = mix(1.0, 0.35, fr);

      // 贴签（贴在玻璃外面，磨砂时也清楚）
      vec2 lp = lpRaw;
      if (lp.x > 0.0 && lp.x < 1.0 && lp.y > 0.0 && lp.y < 1.0) {
        col = labelCol * mix(1.0, 0.86, uDark);
        gloss = 0.2;
      }
      // 防滑竖纹
      if (vLocal.x > 0.64 && vLocal.x < 1.4 && vLocal.y > 0.2 && vLocal.y < 0.54) {
        float k = fract((vLocal.x - 0.64) / 0.126);
        col *= 1.0 - 0.08 * (1.0 - smoothstep(0.3, 0.42, k)) * (1.0 - fr * 0.4);
      }
      // 外沿一圈更亮（玻璃厚度）
      float ex = 1.6 - abs(vLocal.x);
      float ey = min(vLocal.y, H - vLocal.y);
      float ec = (W * 0.5 + H - 0.6 - (vLocal.x + vLocal.y)) * 0.7071;
      float e = min(min(ex, ey), ec);
      col += (1.0 - smoothstep(0.0, 0.07, e)) * mix(0.16, 0.08, uDark);
      // 斜向一道反光
      float sh = vLocal.x * 0.55 + vLocal.y * 0.85 - 1.9 + vA.w * 0.6;
      col += exp(-sh * sh * 6.0) * 0.05 * (1.0 - fr * 0.5);
      // 读完时一道高光从左上扫到右下（只给主角卡带）
      if (vA.z > 0.5 && uGlint > 0.0 && uGlint < 1.0) {
        float gx = (vLocal.x + 1.6) / W * 0.6 + (1.0 - hn) * 0.4;
        float gd = (gx - (uGlint * 1.6 - 0.3)) * 9.0;
        col += exp(-gd * gd) * mix(0.32, 0.22, uDark);
      }
      // 读卡头
      if (reveal > 0.0 && reveal < 1.0) {
        float d = (hn - (edge + F)) * H;
        col = mix(col, uAccent, exp(-d * d / 0.0006));
        col += uAccent * exp(-d * d / 0.03) * 0.28;
      }
    }
    gl_FragColor = finish(col, N, V, gloss);
  }
`;

export const sideFragment = /* glsl */ `
  ${common}
  ${uniforms}
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 col = uShell * mix(0.95, 1.05, step(0.5, vNL.y));
    col += vTint * vB.w * mix(0.10, 0.16, uDark);
    if (vNL.y > 0.5 && vLocal.y > H - 0.05) {
      // 顶脊：左端游戏色色标，右端状态灯
      if (vLocal.x > -1.46 && vLocal.x < -0.8 && abs(vLocal.z) < 0.16) col = mix(col, vTint, 0.85 * step(0.01, vB.w));
      float d = length(vec2(vLocal.x - 0.62, vLocal.z));
      float mode = vB.z;
      float on = mode < 0.5 ? 0.0 : mode < 1.5 ? 1.0 : mode < 2.5 ? (0.25 + 0.75 * step(0.0, sin(uTime * 3.9))) : 0.18;
      vec3 led = mix(mix(vec3(0.55), vec3(0.2), uDark), vLed, on);
      col = mix(col, led, 1.0 - smoothstep(0.05, 0.075, d));
      col += vLed * on * exp(-d * d / 0.03) * 0.5;
    }
    gl_FragColor = finish(col, N, V, 0.6);
  }
`;
