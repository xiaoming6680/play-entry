// 3D 卡带仓库：中间一条主架循环放游戏卡带，四周是一望无际的空白库存。
// 只负责按主循环给的 Frame 画画；业务逻辑都在 main.ts。
import {
  CanvasTexture,
  Color,
  ColorManagement,
  ExtrudeGeometry,
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  NoColorSpace,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  ShaderMaterial,
  Shape,
  Sphere,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { CoreBank } from "../cores";
import { PLATE } from "../cores/common";
import { damp, idleWave, selectionWave, smooth, spring, type Spring } from "../motion";
import type { Frame, Item, Pick, Rect, Stage, Theme } from "../types";
import { capFragment, DIM, sideFragment, vertex } from "./shaders";

ColorManagement.enabled = false;

const PITCH = 0.98; // 卡位间距（沿架子）
const LANE = 4.5; // 架子间距
const PREVIEW_LIFT = 1.5;
const HOVER_LIFT = 0.28;
const READ_LIFT = 4.3;
const FOV = 24;
const wrap = (v: number, n: number) => ((v % n) + n) % n;
const DEG = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const THEMES: Record<Theme, { shell: string; plate: string; fog: string; accent: string; dark: number }> = {
  light: { shell: "#F3F5F7", plate: PLATE.light, fog: "#E7EAEE", accent: "#FF3B2F", dark: 0 },
  dark: { shell: "#1D232B", plate: PLATE.dark, fog: "#0E1115", accent: "#FF4B3E", dark: 1 },
};

const LED: Record<string, [string, number]> = {
  dev: ["#FF3B2F", 2],
  preview: ["#FFB020", 1],
  live: ["#2FD47A", 1],
  paused: ["#8B939D", 1],
  blank: ["#8B939D", 0],
};

/** 点亮波：半径（卡位）= 2.5 + 30·t^1.7，越往外越快，配合镜头拉远。这里反过来求某个距离被点亮的时刻 */
const igniteTime = (d: number) => (d <= 2.5 ? 0 : Math.pow((d - 2.5) / 30, 1 / 1.7));

interface Opts {
  lite: boolean;
}
interface Pose {
  az: number;
  el: number;
  dist: number;
  ty: number;
  fx: number;
  fy: number;
}

export function createScene3D(host: HTMLElement, bank: CoreBank, opts: Opts): Stage {
  return new Scene3D(host, bank, opts);
}

class Scene3D implements Stage {
  readonly kind = "3d" as const;
  ready: Promise<void>;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 2, 260);
  private mesh!: InstancedMesh;
  private capMat!: ShaderMaterial;
  private sideMat!: ShaderMaterial;
  private heroTex: CanvasTexture;
  private atlasTex: CanvasTexture;
  private labelTex: CanvasTexture;
  private seen = { hero: -1, atlas: -1, labels: -1 };
  private items: Item[] = [];
  private readonly maxCount: number;
  private count = 0;
  private laneOf: Int16Array;
  private slotOf: Int32Array;
  private readIndex = -1;
  private aA!: InstancedBufferAttribute;
  private aB!: InstancedBufferAttribute;
  private aTint!: InstancedBufferAttribute;
  private aLed!: InstancedBufferAttribute;
  private aE!: InstancedBufferAttribute;
  private lifts = new Map<number, Spring>();
  private cam = {
    az: spring(4 * DEG),
    el: spring(2 * DEG),
    dist: spring(12),
    ty: spring(PREVIEW_LIFT + DIM.H / 2),
    tz: spring(0),
    tx: spring(0),
    fx: spring(0.5),
    fy: spring(0.5),
  };
  private read = { extra: spring(0), yaw: spring(0), frost: spring(0.74) };
  private readSlot = 0;
  private focus: Rect | null = null;
  private w = 1;
  private h = 1;
  private theme: Theme = "light";
  private col = { shell: new Color(), plate: new Color(), fog: new Color(), accent: new Color() };
  private target = { shell: new Color(), plate: new Color(), fog: new Color(), accent: new Color() };
  private dummy = new Object3D();
  private tmpColor = new Color();
  private m4 = new Matrix4();
  private v3 = new Vector3();
  private ray = new Raycaster();
  private frustum = new Frustum();
  private sphere = new Sphere(new Vector3(), 2.8);
  private lastFrame: Frame | null = null;
  private lost = false;
  onLost: (() => void) | null = null;
  // 动态画质：帧率低于约 27fps 时逐级降低渲染分辨率，降到底再缩短视距；都不够才让 main 切 2D
  private dpr: number;
  private dprFloor: number;
  private fogFar = 120;
  private perfAcc = 0;
  private perfN = 0;
  private lastAvg = 0;
  private lastDraw = 0;

  constructor(
    private host: HTMLElement,
    private bank: CoreBank,
    opts: Opts,
  ) {
    this.maxCount = opts.lite ? 1900 : 3400;
    this.laneOf = new Int16Array(this.maxCount);
    this.slotOf = new Int32Array(this.maxCount);
    const dpr = Math.min(window.devicePixelRatio || 1, opts.lite ? 1.5 : 2);
    this.dpr = dpr; // 只降不升：降过一次说明这台机器吃力，本次会话就保持
    this.dprFloor = Math.min(dpr, opts.lite ? 0.75 : 0.85);
    this.renderer = new WebGLRenderer({
      antialias: dpr < 2,
      alpha: true,
      powerPreference: opts.lite ? "default" : "high-performance",
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = "gl";
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
      this.onLost?.();
    });
    host.appendChild(this.renderer.domElement);

    const tex = (c: HTMLCanvasElement) => {
      const t = new CanvasTexture(c);
      t.colorSpace = NoColorSpace;
      t.generateMipmaps = true;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.anisotropy = 4;
      return t;
    };
    this.heroTex = tex(bank.hero);
    this.atlasTex = tex(bank.atlas);
    this.labelTex = tex(bank.labels);
    this.buildMesh();
    this.setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light", true);
    this.resize();
    // 先编译着色器，避免进场第一帧卡顿
    this.ready = new Promise((res) => {
      requestAnimationFrame(() => {
        try {
          this.renderer.compile(this.scene, this.camera);
        } catch {
          /* ignore */
        }
        res();
      });
    });
  }

  private buildMesh() {
    const { W, H, T, CH, R } = DIM;
    const s = new Shape();
    const x0 = -W / 2,
      x1 = W / 2;
    s.moveTo(x0 + R, 0);
    s.lineTo(x1 - R, 0);
    s.quadraticCurveTo(x1, 0, x1, R);
    s.lineTo(x1, H - CH);
    s.lineTo(x1 - CH, H);
    s.lineTo(x0 + R, H);
    s.quadraticCurveTo(x0, H, x0, H - R);
    s.lineTo(x0, R);
    s.quadraticCurveTo(x0, 0, x0 + R, 0);
    const bevel = 0.035;
    const geo = new ExtrudeGeometry(s, {
      depth: T - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 4,
    });
    geo.translate(0, 0, -(T - bevel * 2) / 2);
    geo.computeVertexNormals();
    // 让盖面的法线是严格的 ±Z（倒角处插值会让盖面判断出错）
    const n = geo.getAttribute("normal");
    const capGroup = geo.groups[0];
    for (let i = capGroup.start; i < capGroup.start + capGroup.count; i++) {
      const idx = geo.index ? geo.index.getX(i) : i;
      n.setXYZ(idx, 0, 0, Math.sign(n.getZ(idx)) || 1);
    }

    const mk = (size: number) => new InstancedBufferAttribute(new Float32Array(this.maxCount * size), size);
    this.aA = mk(4);
    this.aB = mk(4);
    this.aTint = mk(3);
    this.aLed = mk(3);
    this.aE = mk(2);
    geo.setAttribute("aA", this.aA);
    geo.setAttribute("aB", this.aB);
    geo.setAttribute("aTint", this.aTint);
    geo.setAttribute("aLed", this.aLed);
    geo.setAttribute("aE", this.aE);

    const u = {
      uShell: { value: this.col.shell },
      uPlate: { value: this.col.plate },
      uFog: { value: this.col.fog },
      uAccent: { value: this.col.accent },
      uLightDir: { value: new Vector3(-0.38, 0.78, 0.55) },
      uFogDist: { value: new Vector2(46, 120) },
      uFogY: { value: new Vector2(-1.5, 1.2) },
      uDark: { value: 0 },
      uTime: { value: 0 },
      uGlint: { value: -1 },
      uGlowPos: { value: new Vector3() },
      uGlowCol: { value: new Color(1, 1, 1) },
      uGlowStr: { value: 0 },
    };
    this.capMat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: capFragment,
      uniforms: {
        ...u,
        uAtlas: { value: this.atlasTex },
        uGrid: { value: new Vector2(1, 1) },
        uAtlasLod: { value: 4.2 },
        uHero: { value: this.heroTex },
        uHeroSize: { value: this.bank.heroSize },
        uLabels: { value: this.labelTex },
        uLGrid: { value: new Vector2(2, 1) },
      },
    });
    this.sideMat = new ShaderMaterial({ vertexShader: vertex, fragmentShader: sideFragment, uniforms: u });
    this.mesh = new InstancedMesh(geo, [this.capMat, this.sideMat], this.maxCount);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  setItems(items: Item[]) {
    this.items = items;
    (this.capMat.uniforms.uGrid.value as Vector2).set(this.bank.cols, this.bank.rows);
    (this.capMat.uniforms.uLGrid.value as Vector2).set(this.bank.labelCols, this.bank.labelRows);
    this.atlasTex.dispose();
    this.labelTex.dispose();
    this.seen.atlas = this.seen.labels = -1;
  }

  setTheme(theme: Theme, instant = false) {
    this.theme = theme;
    const t = THEMES[theme];
    this.target.shell.set(t.shell);
    this.target.plate.set(t.plate);
    this.target.fog.set(t.fog);
    this.target.accent.set(t.accent);
    if (instant) {
      this.col.shell.copy(this.target.shell);
      this.col.plate.copy(this.target.plate);
      this.col.fog.copy(this.target.fog);
      this.col.accent.copy(this.target.accent);
      this.capMat.uniforms.uDark.value = t.dark;
    }
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  private get portrait() {
    return this.w / this.h < 0.85 || this.w < 700;
  }

  // ——————————————————————— 每帧 ———————————————————————
  draw(f: Frame) {
    if (this.lost) return;
    this.lastFrame = f;
    // 用真实帧间隔（主循环的 dt 截断在 0.1 秒，会低估很卡的机器）
    const now = performance.now();
    if (this.lastDraw) this.tune((now - this.lastDraw) / 1000);
    this.lastDraw = now;
    const dt = Math.min(0.05, f.dt);
    this.lerpTheme(dt, f.reduced);
    this.uploadTextures();
    this.updateCamera(f, dt);
    this.layout(f, dt);
    this.capMat.uniforms.uTime.value = f.t;
    this.capMat.uniforms.uGlint.value = f.glint;
    this.renderer.render(this.scene, this.camera);
    this.measureFocus();
  }

  private tune(dt: number) {
    if (!(dt > 0) || dt > 1.5) return; // 忽略切后台回来这种尖刺
    this.perfAcc += dt;
    this.perfN++;
    if (this.perfAcc < 1 || this.perfN < 4) return;
    const avg = this.perfAcc / this.perfN;
    this.perfAcc = this.perfN = 0;
    this.lastAvg = avg;
    if (avg <= 0.037) return;
    if (this.dpr > this.dprFloor + 1e-3) {
      this.dpr = Math.max(this.dprFloor, this.dpr * 0.8);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(this.w, this.h, false);
    } else if (this.fogFar > 85) this.fogFar = 85;
  }

  /** 已经降到最低画质还是很卡（main 据此切 2D） */
  struggling() {
    return this.dpr <= this.dprFloor + 1e-3 && this.fogFar <= 85 && this.lastAvg > 0.05;
  }

  private lerpTheme(dt: number, reduced: boolean) {
    const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
    this.col.shell.lerp(this.target.shell, k);
    this.col.plate.lerp(this.target.plate, k);
    this.col.fog.lerp(this.target.fog, k);
    this.col.accent.lerp(this.target.accent, k);
    const u = this.capMat.uniforms.uDark;
    u.value += (THEMES[this.theme].dark - u.value) * k;
    this.sideMat.uniforms.uDark.value = u.value;
  }

  private uploadTextures() {
    const b = this.bank;
    if (b.heroVersion !== this.seen.hero) {
      this.heroTex.needsUpdate = true;
      this.seen.hero = b.heroVersion;
    }
    if (b.atlasVersion !== this.seen.atlas) {
      this.atlasTex.needsUpdate = true;
      this.seen.atlas = b.atlasVersion;
    }
    if (b.labelsVersion !== this.seen.labels) {
      this.labelTex.needsUpdate = true;
      this.seen.labels = b.labelsVersion;
    }
  }

  // ——— 镜头 ———
  private poses() {
    const P = this.portrait;
    const aspect = this.w / this.h;
    const tan = Math.tan((FOV / 2) * DEG);
    // 开场特写：卡带占画面 80%（竖屏按宽度算）
    const closeDist = Math.max(DIM.H / 0.8 / (2 * tan), DIM.W / 0.8 / (2 * tan * aspect));
    const browse: Pose = P
      ? { az: 30, el: 29, dist: 62, ty: 2.4, fx: 0.5, fy: 0.33 }
      : { az: 38, el: 27, dist: 50, ty: 2.2, fx: 0.4, fy: 0.5 };
    const close: Pose = { az: 3, el: 2, dist: closeDist, ty: READ_LIFT + DIM.H / 2, fx: 0.5, fy: 0.5 };
    const read: Pose = P
      ? { az: 8, el: 5, dist: 28, ty: 0, fx: 0.5, fy: 0.3 }
      : { az: 15, el: 7, dist: 15.5, ty: 0, fx: 0.3, fy: 0.5 };
    return { browse, close, read };
  }

  private updateCamera(f: Frame, dt: number) {
    const c = this.cam;
    const { browse, close, read } = this.poses();
    const reading = f.reading && f.mode !== "boot";
    let goal: Pose = reading ? { ...read, ty: PREVIEW_LIFT + this.read.extra.value + DIM.H / 2 } : browse;
    c.tz.value = f.rail * PITCH; // 主架位置直接跟随（rail 自己有阻尼）
    if (f.intro !== null || (f.mode === "boot" && f.intro === null)) {
      // 开场：从一盒卡带的特写一镜拉远到整片仓库（不用弹簧，按进度精确摆位）
      const p = f.intro ?? 0;
      const ed = smooth(p);
      const ea = smooth((p - 0.12) / 0.88);
      const set = (s: Spring, v: number) => ((s.value = v), (s.velocity = 0));
      set(c.az, lerp(close.az, browse.az, ea) * DEG);
      set(c.el, lerp(close.el, browse.el, ea) * DEG);
      set(c.dist, Math.exp(lerp(Math.log(close.dist), Math.log(browse.dist), ed)));
      set(c.ty, lerp(close.ty, browse.ty, ed));
      set(c.fx, lerp(close.fx, browse.fx, ed));
      set(c.fy, lerp(close.fy, browse.fy, ed));
      set(c.tx, 0);
    } else {
      if (!reading && !f.reduced) {
        // 浏览时镜头缓慢漂移，鼠标带一点视差，仓库不再是一张静止的图
        const px = f.parallax?.x ?? 0,
          py = f.parallax?.y ?? 0;
        goal = {
          ...goal,
          az: goal.az + 1.3 * Math.sin((f.t * Math.PI * 2) / 14) + px * 3,
          el: goal.el + 0.6 * Math.sin((f.t * Math.PI * 2) / 19 + 1) - py * 1.6,
        };
      }
      const rate = f.reduced ? 60 : reading ? 3.6 : 3.2;
      damp(c.az, goal.az * DEG, rate, dt);
      damp(c.el, goal.el * DEG, rate, dt);
      damp(c.dist, goal.dist, rate, dt);
      damp(c.tx, reading ? 0 : f.lateral * LANE, rate * 1.6, dt);
      damp(c.ty, goal.ty, rate, dt);
      damp(c.fx, goal.fx, rate, dt);
      damp(c.fy, goal.fy, rate, dt);
    }
    // 读取时远处的仓库退进雾里，把注意力留给这盒卡带
    const fog = this.capMat.uniforms.uFogDist.value as Vector2;
    const fn = reading ? 22 : Math.min(46, this.fogFar - 40),
      ff = reading ? 44 : this.fogFar;
    fog.x += (fn - fog.x) * (1 - Math.exp(-dt * 3));
    fog.y += (ff - fog.y) * (1 - Math.exp(-dt * 3));

    const target = this.v3.set(c.tx.value, c.ty.value, c.tz.value);
    const ce = Math.cos(c.el.value);
    this.camera.position.set(
      target.x + Math.sin(c.az.value) * ce * c.dist.value,
      target.y + Math.sin(c.el.value) * c.dist.value,
      target.z + Math.cos(c.az.value) * ce * c.dist.value,
    );
    this.camera.lookAt(target);
    this.camera.setViewOffset(this.w, this.h, (0.5 - c.fx.value) * this.w, (0.5 - c.fy.value) * this.h, this.w, this.h);
    this.camera.updateMatrixWorld();
  }

  // ——— 覆盖范围：按镜头视锥和雾的远端，算出这一帧该画的卡位 ———
  private cells: { l: number; s: number; d: number }[] = [];
  private coverage(fogFar: number) {
    const cam = this.camera;
    const o = cam.position;
    const maxD = fogFar + 4;
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    const ndc = new Vector2();
    for (const u of [-1.15, -0.4, 0.4, 1.15])
      for (const v of [-1.15, -0.4, 0.4, 1.15]) {
        ndc.set(u, v);
        this.ray.setFromCamera(ndc, cam);
        const d = this.ray.ray.direction;
        for (const y of [-0.6, DIM.H + PREVIEW_LIFT + 1]) {
          let t = d.y !== 0 ? (y - o.y) / d.y : maxD;
          if (!(t > 0) || t > maxD) t = maxD;
          const px = o.x + d.x * t,
            pz = o.z + d.z * t;
          x0 = Math.min(x0, px);
          x1 = Math.max(x1, px);
          z0 = Math.min(z0, pz);
          z1 = Math.max(z1, pz);
        }
      }
    const l0 = Math.max(-26, Math.floor(x0 / LANE) - 1),
      l1 = Math.min(26, Math.ceil(x1 / LANE) + 1);
    const center = Math.round(o.z / PITCH);
    const s0 = Math.max(center - 160, Math.floor(z0 / PITCH) - 2),
      s1 = Math.min(center + 60, Math.ceil(z1 / PITCH) + 2);
    this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m4);
    const cells = this.cells;
    cells.length = 0;
    const c = this.sphere.center;
    for (let s = s1; s >= s0; s--)
      for (let l = l0; l <= l1; l++) {
        c.set(l * LANE, DIM.H / 2 + 0.5, s * PITCH);
        const d = c.distanceTo(o);
        if (d > maxD || !this.frustum.intersectsSphere(this.sphere)) continue;
        cells.push({ l, s, d });
      }
    // 由近到远画，减少过度绘制；超出上限时丢掉最远的
    cells.sort((a, b) => a.d - b.d);
    if (cells.length > this.maxCount) cells.length = this.maxCount;
    return cells;
  }

  private layout(f: Frame, dt: number) {
    const n = this.items.length;
    if (!n) return;
    const fogFar = (this.capMat.uniforms.uFogDist.value as Vector2).y;
    const cells = this.coverage(fogFar);
    const aA = this.aA.array as Float32Array,
      aB = this.aB.array as Float32Array,
      aT = this.aTint.array as Float32Array,
      aL = this.aLed.array as Float32Array,
      aE = this.aE.array as Float32Array;
    const tint = new Color(),
      led = new Color();
    const t = f.t;
    const sel = f.slot;
    const rd = this.read;
    const reading = f.reading;
    const booting = f.mode === "boot";
    // 读取的那盒：先升起，再转正面向镜头；返回时先转正，再下降（避免和邻居穿插）
    if (reading || (rd.extra.value < 0.02 && Math.abs(rd.yaw.value) < 0.01) || booting) this.readSlot = sel;
    const yawTarget = reading && rd.extra.value > 1.2 ? this.cam.az.value * 0.95 + f.spin : 0;
    damp(rd.yaw, yawTarget, f.reduced ? 60 : 7, dt);
    const upright = Math.abs(rd.yaw.value - yawTarget) < 0.05 || reading;
    if (f.intro !== null || (booting && f.intro === null)) {
      // 开场：这盒卡带先悬浮在架子上方（不被前排挡住），镜头拉远时落回卡位
      rd.extra.value = (READ_LIFT - PREVIEW_LIFT) * (1 - smooth((f.intro ?? 0) / 0.6));
      rd.extra.velocity = 0;
    } else damp(rd.extra, reading ? READ_LIFT - PREVIEW_LIFT : upright ? 0 : rd.extra.value, f.reduced ? 60 : 4.2, dt);
    damp(rd.frost, reading ? 1 : 0.7, 6, dt);
    // 选中卡带的颜色光：跟着它走，换卡带时颜色渐变
    const u = this.capMat.uniforms;
    const it = this.items[wrap(sel, n)];
    const glowTarget = it.kind === "blank" ? 0 : f.ignite === Infinity ? 1 : f.ignite < 0 ? 0.5 : Math.min(1, 0.5 + f.ignite);
    // 主色太浅（比如 stay 的纸白）就用第二色当光色
    this.tmpColor.set(it.color);
    if (this.tmpColor.r * 0.299 + this.tmpColor.g * 0.587 + this.tmpColor.b * 0.114 > 0.8) this.tmpColor.set(it.color2);
    (u.uGlowCol.value as Color).lerp(this.tmpColor, 1 - Math.exp(-dt * 5));
    u.uGlowStr.value += (glowTarget - u.uGlowStr.value) * (1 - Math.exp(-dt * 4));
    (u.uGlowPos.value as Vector3).set(0, PREVIEW_LIFT + rd.extra.value + DIM.H * 0.55, f.rail * PITCH);
    // 主架"跑道灯"：每隔一阵，一道光从选中的卡带沿架子向两头跑出去
    const pulseAge = booting || reading || f.reduced ? -1 : (t % 6.5) - 0.8;
    const pulsePos = pulseAge * 22;
    const beatK = f.beat ? Math.exp((-f.beat.phase / f.beat.period) * 7) * f.beatAmp : 0;

    const keep = new Set<number>();
    this.readIndex = -1;
    let i = 0;
    for (const { l, s } of cells) {
      this.laneOf[i] = l;
      this.slotOf[i] = s;
      const main = l === 0;
      const idx = wrap(s, n);
      const item = main ? this.items[idx] : null;
      const seed = hash(l * 131 + s * 7.3);
      const dist = Math.hypot(s - sel, l * 1.35);
      const isSel = main && s === sel;
      const isRead = main && s === this.readSlot;
      // —— 点亮波 ——
      let vis = 1,
        rise = 0,
        flash = 0;
      if (f.ignite !== Infinity && !f.reduced) {
        if (f.ignite < 0) vis = isSel ? 1 : 0;
        else if (!isSel) {
          const local = f.ignite - igniteTime(dist);
          vis = local <= 0 ? 0 : smooth(local / 0.4);
          rise = -1.8 * (1 - smooth(local / 0.55));
          flash = local > 0 ? Math.exp(-local * 3.2) * (main ? 1.6 : 0.7) : 0;
        }
      }
      // —— 高度 ——
      let y = rise;
      if (!f.reduced) {
        y += f.idle * idleWave(s, l, t);
        for (const w of f.waves) y += selectionWave(Math.hypot(s - w.slot, l * 1.35), t - w.t0);
        if (beatK) y += 0.16 * beatK * Math.exp(-dist / 7);
      }
      const hovered = f.hoverSlot === s && f.hoverLane === l && !isSel;
      const key = (l + 64) * 100000 + (s + 50000);
      let sp = this.lifts.get(key);
      const want = hovered ? HOVER_LIFT : isSel ? PREVIEW_LIFT : 0;
      if (want || sp) {
        if (!sp) {
          sp = spring(isSel && booting ? PREVIEW_LIFT : 0);
          this.lifts.set(key, sp);
        }
        damp(sp, want, 9, dt);
        y += sp.value;
        if (Math.abs(sp.value) > 1e-4 || want) keep.add(key);
      }
      if (main && pulseAge > 0) {
        const k = Math.exp(-((Math.abs(s - sel) - pulsePos) ** 2) / 3) * Math.max(0, 1 - pulseAge / 3.2);
        flash += 0.55 * k;
      }
      if (main && beatK) flash += 0.4 * beatK * Math.exp(-Math.abs(s - sel) / 4);

      let yaw = 0;
      let frost = 1,
        reveal = 0,
        hero = 0;
      if (isRead) {
        y += rd.extra.value;
        yaw = rd.yaw.value;
        frost = rd.frost.value;
        reveal = f.reveal;
        hero = isSel ? 1 : 0;
        // 插入：往画面下方滑出；弹出时由 main 的弹簧带回
        y -= f.insert * 9.5;
        this.readIndex = i;
      } else if (isSel) {
        frost = rd.frost.value;
        hero = 1;
      }
      this.dummy.position.set(l * LANE, y, s * PITCH);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      const o4 = i * 4,
        o3 = i * 3,
        o2 = i * 2;
      aA[o4] = item ? idx : -1;
      aA[o4 + 1] = item ? idx : n; // n = 空白库存的贴签格
      aA[o4 + 2] = hero;
      aA[o4 + 3] = seed;
      aB[o4] = frost;
      aB[o4 + 1] = reveal;
      if (item) {
        const [lc, mode] = LED[item.status] ?? LED.blank;
        led.set(lc);
        aB[o4 + 2] = vis < 1 && !isSel ? 0 : mode;
        aB[o4 + 3] = item.kind === "blank" ? 0 : 1;
        tint.set(item.color);
      } else {
        led.set("#7A2A24");
        aB[o4 + 2] = seed > 0.88 && vis >= 1 ? 3 : 0;
        aB[o4 + 3] = 0;
        tint.setRGB(0, 0, 0);
      }
      aT[o3] = tint.r;
      aT[o3 + 1] = tint.g;
      aT[o3 + 2] = tint.b;
      aL[o3] = led.r;
      aL[o3 + 1] = led.g;
      aL[o3 + 2] = led.b;
      aE[o2] = vis;
      aE[o2 + 1] = flash;
      i++;
    }
    for (const k of this.lifts.keys()) if (!keep.has(k)) this.lifts.delete(k);
    this.count = i;
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const [a, size] of [
      [this.aA, 4],
      [this.aB, 4],
      [this.aTint, 3],
      [this.aLed, 3],
      [this.aE, 2],
    ] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, i * size);
      a.needsUpdate = true;
    }
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, i * 16);
  }

  private measureFocus() {
    const i = this.readIndex;
    if (i < 0) {
      this.focus = null;
      return;
    }
    this.mesh.getMatrixAt(i, this.m4);
    const { W, H, T } = DIM;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const cx of [-W / 2, W / 2])
      for (const cy of [0, H])
        for (const cz of [-T / 2, T / 2]) {
          this.v3.set(cx, cy, cz).applyMatrix4(this.m4).project(this.camera);
          const sx = (this.v3.x * 0.5 + 0.5) * this.w,
            sy = (-this.v3.y * 0.5 + 0.5) * this.h;
          x0 = Math.min(x0, sx);
          x1 = Math.max(x1, sx);
          y0 = Math.min(y0, sy);
          y1 = Math.max(y1, sy);
        }
    this.focus = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  focusRect() {
    return this.focus;
  }

  /** 开场「入盒」用：选中卡带正面在屏幕上的四个角（左上、右上、右下、左下） */
  faceQuad() {
    const i = this.readIndex;
    if (i < 0) return null;
    this.mesh.getMatrixAt(i, this.m4);
    const { W, H, T } = DIM;
    return [
      [-W / 2, H],
      [W / 2, H],
      [W / 2, 0],
      [-W / 2, 0],
    ].map(([x, y]) => {
      this.v3.set(x, y, T / 2).applyMatrix4(this.m4).project(this.camera);
      return { x: (this.v3.x * 0.5 + 0.5) * this.w, y: (-this.v3.y * 0.5 + 0.5) * this.h };
    });
  }

  private screenOf(x: number, y: number, z: number) {
    this.v3.set(x, y, z).project(this.camera);
    return { x: (this.v3.x * 0.5 + 0.5) * this.w, y: (-this.v3.y * 0.5 + 0.5) * this.h };
  }

  slotAxis() {
    const z = (this.lastFrame?.rail ?? 0) * PITCH;
    const a = this.screenOf(0, 1.5, z),
      b = this.screenOf(0, 1.5, z + PITCH);
    return { x: b.x - a.x, y: b.y - a.y };
  }

  laneAxis() {
    const z = (this.lastFrame?.rail ?? 0) * PITCH;
    const a = this.screenOf(0, 1.5, z),
      b = this.screenOf(LANE, 1.5, z);
    return { x: b.x - a.x, y: b.y - a.y };
  }

  pick(x: number, y: number): Pick | null {
    if (!this.count) return null;
    const ndc = new Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    this.mesh.boundingSphere = null;
    const hit = this.ray.intersectObject(this.mesh, false)[0];
    if (!hit || hit.instanceId == null) return null;
    return { lane: this.laneOf[hit.instanceId], slot: this.slotOf[hit.instanceId] };
  }

  dispose() {
    this.renderer.dispose();
    this.mesh.geometry.dispose();
    this.capMat.dispose();
    this.sideMat.dispose();
    [this.heroTex, this.atlasTex, this.labelTex].forEach((t: Texture) => t.dispose());
    this.renderer.domElement.remove();
  }
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
