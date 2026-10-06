// 全部声音由 WebAudio 现场合成：玻璃轻碰、抬起气声、读卡头扫描、插入咔哒、弹出、beat 的小节拍……
// 浏览器只允许在用户手势之后发声，所以 AudioContext 在第一次触摸/按键时才创建。
import type { Beat } from "./types";

type Ctx = AudioContext;

export class Sound {
  ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled: boolean;
  private beatTimer = 0;
  private beatStart = 0;
  private beatBpm = 128;
  private nextStep = 0;
  private stepIndex = 0;
  private lastTick = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /** 在用户手势里调用 */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.55;
      this.sfx.connect(this.master);
      this.music = ctx.createGain();
      this.music.gain.value = 0.32;
      this.music.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // iOS / 微信：在手势里放一个静音样本，才算真正解锁
      try {
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, 22050);
        s.connect(ctx.destination);
        s.start(0);
      } catch {
        /* ignore */
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  // ———————————————— 开场（克制：气息、笔声、单音铃、空气、低频暖垫） ————————————————
  /** 开始：一口很轻的气息 + 一个柔和的低音 */
  opPowerOn() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.9, 0.012, "bandpass", 700, this.sfx!, 2200, 0.8);
    this.osc("sine", 220, t, 1.1, 0.025, this.sfx!, 330, 0.18);
  }
  /** 描线：一层几乎听不见的五度和声，跟着笔尖走完 */
  opLaser(dur: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.014, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    g.connect(this.sfx!);
    for (const f of [440, 659.3]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.7);
    }
    this.noise(t, dur, 0.004, "highpass", 6500, this.sfx!);
  }
  /** 红点落下：一声干净的单音铃 */
  opDing() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.osc("sine", 1318.5, t, 2.4, 0.05, this.sfx!, undefined, 0.006);
    this.osc("sine", 2637, t, 1.2, 0.01, this.sfx!, undefined, 0.006);
    this.osc("sine", 3951, t, 0.6, 0.004, this.sfx!, undefined, 0.006);
  }
  /** 入盒：一阵柔和的空气 */
  opWhoosh() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 1.1, 0.022, "bandpass", 380, this.sfx!, 1500, 0.9);
  }
  /** 拉远开始：低频暖垫，慢起慢落 */
  opBoom() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.osc("sine", 55, t, 3.2, 0.09, this.sfx!, undefined, 0.35);
    this.osc("sine", 110, t, 2.6, 0.03, this.sfx!, undefined, 0.4);
  }
  /** 拉远：一层慢慢打开的三角波和声 + 零星几声很轻的玻璃声 */
  opSwell(dur: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.8);
    f.connect(g).connect(this.sfx!);
    for (const fr of [220, 329.6, 392, 493.9]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = fr;
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 1.9);
    }
    [0.35, 0.9, 1.5, 2.2, 2.9].forEach((k, i) => {
      const at = t + k * (dur / 3.6);
      const f0 = [2349, 1976, 2637, 1760, 2093][i];
      [1, 2.31].forEach((m, j) => this.osc("sine", f0 * m, at, 0.9 / (j + 1), 0.012 / (j + 1.5), this.sfx!));
    });
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  private get ready() {
    return !!(this.ctx && this.enabled && this.ctx.state === "running");
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, gain: number, out: AudioNode, f2?: number, attack = 0.004) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, gain: number, type: BiquadFilterType, f: number, out: AudioNode, f2?: number, q = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f, t);
    if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** 玻璃轻碰：几个不等间隔的高频分音，快速衰减 */
  tick(strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (t - this.lastTick < 0.035) return;
    this.lastTick = t;
    const f0 = 1900 + Math.random() * 500;
    [1, 2.31, 4.17, 6.53].forEach((k, i) =>
      this.osc("sine", f0 * k, t, 0.09 + 0.16 / (i + 1), (0.06 * strength) / (i + 1.4), this.sfx!),
    );
    this.noise(t, 0.02, 0.02 * strength, "highpass", 6000, this.sfx!);
  }

  /** 读完：一串上行的玻璃和弦 */
  shimmer() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [1568, 1976, 2349, 3136].forEach((f, i) =>
      [1, 2.31, 4.17].forEach((k, j) => this.osc("sine", f * k, t + i * 0.055, 0.5 / (j + 1), 0.03 / (j + 1.2), this.sfx!)),
    );
  }

  lift() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.32, 0.035, "bandpass", 700, this.sfx!, 2600, 1.2);
    this.osc("sine", 2600, t + 0.05, 0.5, 0.015, this.sfx!);
  }

  /** 读卡头扫描：低频嗡 + 一串解码小哔声 */
  scan(dur: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 62;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(240, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.06);
    g.gain.setValueAtTime(0.05, t + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(f).connect(g).connect(this.sfx!);
    o.start(t);
    o.stop(t + dur + 0.1);
    for (let i = 0; i < 7; i++) this.osc("square", 1800 + ((i * 523) % 900), t + (i + 0.5) * (dur / 7.5), 0.03, 0.012, this.sfx!);
    this.osc("triangle", 1320, t + dur, 0.18, 0.04, this.sfx!);
    this.osc("triangle", 1980, t + dur + 0.07, 0.24, 0.035, this.sfx!);
  }

  clunk() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.045, 0.12, "lowpass", 1400, this.sfx!);
    this.osc("sine", 120, t, 0.16, 0.22, this.sfx!, 48);
    this.osc("square", 2200, t + 0.012, 0.02, 0.02, this.sfx!);
  }

  eject() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.04, 0.08, "lowpass", 1800, this.sfx!);
    this.osc("sine", 70, t, 0.14, 0.16, this.sfx!, 140);
    this.osc("sine", 420, t + 0.05, 0.3, 0.03, this.sfx!, 760);
  }

  error() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.osc("square", 196, t, 0.12, 0.04, this.sfx!);
    this.osc("square", 196, t + 0.18, 0.12, 0.04, this.sfx!);
  }

  launch() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.osc("triangle", f, t + i * 0.06, 0.5, 0.05, this.sfx!));
  }

  /** 进入转场里的每一下（launch.ts 按时间点调用） */
  launchCue(core: string, name: string, n?: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const out = this.sfx!;
    if (core === "beat") {
      if (name === "kick") {
        this.osc("sine", 160, t, 0.32, 0.5, out, 40, 0.002);
        this.noise(t, 0.03, 0.08, "lowpass", 2400, out);
        this.osc("sawtooth", 55, t, 0.4, 0.05, out, undefined, 0.006);
      } else if (name === "hat") this.noise(t, 0.06, 0.07, "highpass", 8000, out);
      else if (name === "rise") this.noise(t, 0.5, 0.05, "bandpass", 500, out, 6000, 1.4);
      else if (name === "drop") {
        this.osc("sine", 110, t, 0.9, 0.35, out, 30, 0.002);
        this.noise(t, 1.1, 0.06, "highpass", 5000, out);
        [440, 554.4, 659.3, 880].forEach((f) => this.osc("sawtooth", f, t, 0.7, 0.018, out, undefined, 0.01));
      }
    } else if (core === "stay") {
      if (name === "wipe") this.noise(t, 0.4, 0.03, "bandpass", 900, out, 2200, 0.8);
      else if (name === "open") this.osc("sine", 392, t, 0.5, 0.05, out, 587, 0.03);
      else if (name === "look") this.osc("sine", 1400, t, 0.05, 0.02, out, 1100);
      else if (name === "blink") {
        this.noise(t, 0.03, 0.04, "bandpass", 3000, out);
        this.noise(t + 0.09, 0.03, 0.03, "bandpass", 2600, out);
      } else if (name === "dive") {
        this.osc("sine", 220, t, 0.45, 0.08, out, 55, 0.2);
        this.noise(t, 0.4, 0.04, "lowpass", 1600, out, 200);
      } else if (name === "wake") [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.osc("sine", f, t + i * 0.04, 1.4, 0.035, out, undefined, 0.05));
    } else if (core === "dot") {
      if (name === "wipe") this.osc("square", 220, t, 0.18, 0.025, out, 110);
      else if (name === "cursor") this.osc("square", 880, t, 0.05, 0.03, out);
      else if (name === "era") this.era(n ?? 0);
      else if (name === "shrink") this.osc("square", 660, t, 0.22, 0.03, out, 110);
      else if (name === "off") this.osc("square", 1760, t, 0.04, 0.025, out);
    }
  }

  empty() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [0, 0.14, 0.28].forEach((d, i) => this.noise(t + d, 0.08, 0.05 / (i + 1), "bandpass", 900, this.sfx!, 500, 4));
  }

  hmm() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.osc("sine", 330, t, 0.45, 0.03, this.sfx!, 262, 0.08);
  }

  /** dot 进化：每个时代一种音色 */
  era(n: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const out = this.sfx!;
    switch (n) {
      case 0:
        this.osc("square", 880, t, 0.06, 0.03, out);
        break;
      case 1:
        this.osc("square", 440, t, 0.05, 0.035, out);
        this.osc("square", 660, t + 0.05, 0.05, 0.03, out);
        break;
      case 2:
        [523, 659, 784].forEach((f, i) => this.osc("square", f, t + i * 0.045, 0.05, 0.03, out));
        break;
      case 3: {
        const ctx = this.ctx!;
        const car = ctx.createOscillator(),
          mod = ctx.createOscillator(),
          mg = ctx.createGain(),
          g = ctx.createGain();
        car.frequency.value = 392;
        mod.frequency.value = 392 * 3.5;
        mg.gain.setValueAtTime(600, t);
        mg.gain.exponentialRampToValueAtTime(10, t + 0.35);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        mod.connect(mg).connect(car.frequency);
        car.connect(g).connect(out);
        car.start(t);
        mod.start(t);
        car.stop(t + 0.45);
        mod.stop(t + 0.45);
        break;
      }
      case 4:
        this.osc("sawtooth", 523, t, 0.4, 0.025, out, 1046);
        break;
      default:
        [261.6, 329.6, 392, 523.3].forEach((f) => this.osc("sawtooth", f * 0.5, t, 1.1, 0.012, out, undefined, 0.25));
    }
  }

  // ———————— 彩蛋 ————————
  /** 发现彩蛋：一串上行的玻璃音（五声音阶）+ 一声单音铃 */
  egg() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [1318.5, 1568, 1760, 2093, 2637].forEach((f, i) =>
      [1, 2.31, 4.17].forEach((k, j) => this.osc("sine", f * k, t + i * 0.07, 0.5 / (j + 1), 0.05 / (j + 1.3), this.sfx!)),
    );
    this.osc("sine", 1046.5, t + 0.38, 2.2, 0.05, this.sfx!, undefined, 0.01);
    this.osc("sine", 1568, t + 0.38, 1.6, 0.02, this.sfx!, undefined, 0.01);
  }
  /** 甩阵列：一大串玻璃互相轻碰，越来越稀 */
  cascade() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const scale = [2093, 2349, 2637, 3136, 3520, 4186];
    let at = 0;
    for (let i = 0; i < 22; i++) {
      const f0 = scale[(i * 7 + (i >> 1)) % scale.length] * (i % 3 === 0 ? 0.5 : 1);
      const s = 0.9 - i * 0.032;
      [1, 2.31, 4.17].forEach((k, j) => this.osc("sine", f0 * k, t + at, 0.12 + 0.3 / (j + 1), (0.04 * s) / (j + 1.4), this.sfx!));
      at += 0.025 + i * 0.006;
    }
  }
  /** 红点弹跳 / 屏保撞墙：短促的软木声 */
  bounce(strength = 1) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.osc("sine", 520 + strength * 220, t, 0.12, 0.06 * strength, this.sfx!, 180, 0.002);
    this.noise(t, 0.03, 0.02 * strength, "bandpass", 1800, this.sfx!);
  }
  /** 屏保正中角落：大三和弦 + 高处的铃 */
  corner() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.osc("triangle", f, t + i * 0.05, 1.6, 0.045, this.sfx!));
    [2637, 3136, 3951].forEach((f, i) => this.osc("sine", f, t + 0.3 + i * 0.09, 1.2, 0.02, this.sfx!));
  }
  /** stay 被戳：一声软软的"啵"，越戳越高越急 */
  poke(n: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const f = 300 + Math.min(n, 6) * 70;
    this.osc("sine", f * 1.6, t, 0.14, 0.06, this.sfx!, f, 0.003);
  }
  /** dot 被点：一个 8-bit 小音，音高随次数爬升 */
  blip(n: number) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const steps = [0, 2, 4, 7, 9];
    const f = 440 * Math.pow(2, (steps[n % 5] + 12 * (Math.floor(n / 5) % 3)) / 12);
    this.osc("square", f, t, 0.06, 0.025, this.sfx!);
  }
  /** 熄灯 / 开灯：日光灯管的嗡声和咔哒 */
  lamp(on: boolean) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.04, 0.08, "bandpass", 2400, this.sfx!, undefined, 3);
    if (!on) {
      this.osc("sine", 110, t, 0.5, 0.03, this.sfx!, 50, 0.005);
      return;
    }
    [0.08, 0.22, 0.31, 0.5].forEach((d) => this.noise(t + d, 0.05, 0.05, "bandpass", 2400, this.sfx!, undefined, 3));
    const ctx = this.ctx!;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = 100;
    g.gain.setValueAtTime(0.0001, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.006, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 600;
    o.connect(f).connect(g).connect(this.sfx!);
    o.start(t + 0.5);
    o.stop(t + 2.5);
  }
  /** 隐藏卡带登场：一段 8-bit 小号角（方波琶音 + 收尾和弦） */
  fanfare() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    const notes = [392, 523.25, 659.25, 783.99, 659.25, 783.99, 1046.5];
    const at = [0, 0.09, 0.18, 0.27, 0.42, 0.51, 0.66];
    notes.forEach((f, i) => this.osc("square", f, t + at[i], i === notes.length - 1 ? 0.9 : 0.1, 0.03, this.sfx!));
    [523.25, 659.25, 783.99].forEach((f) => this.osc("triangle", f, t + 0.66, 1.2, 0.03, this.sfx!));
    this.noise(t + 0.66, 0.6, 0.02, "highpass", 5000, this.sfx!);
  }
  /** 命令行敲键 */
  key() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.018, 0.025, "highpass", 3500, this.sfx!);
  }
  /** 刻录：一道上扫的气声 + 定音 */
  burn() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.7, 0.03, "bandpass", 600, this.sfx!, 4000, 2);
    this.osc("sine", 1568, t + 0.6, 1.4, 0.04, this.sfx!, undefined, 0.01);
  }

  // ———————— beat：读取 beat 卡带时的小节拍 ————————
  startBeat(bpm: number) {
    if (!this.ctx || this.beatTimer) return;
    this.beatBpm = bpm;
    const now = this.ctx.currentTime + 0.06;
    this.beatStart = now;
    this.nextStep = now;
    this.stepIndex = 0;
    this.beatTimer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stopBeat() {
    if (this.beatTimer) clearInterval(this.beatTimer);
    this.beatTimer = 0;
  }

  get beatPlaying() {
    return !!this.beatTimer && this.ready;
  }

  /** 画面跟音频时钟对齐 */
  beatClock(): Beat | null {
    if (!this.beatPlaying) return null;
    const period = 60 / this.beatBpm;
    const x = (this.ctx!.currentTime - this.beatStart) / period;
    if (x < 0) return null;
    return { phase: (x - Math.floor(x)) * period, period, count: Math.floor(x) };
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const step = 60 / this.beatBpm / 4;
    const out = this.music!;
    // A 小调五声：A C D E G
    const bass = [55, 55, 65.41, 55, 73.42, 55, 82.41, 65.41];
    while (this.nextStep < ctx.currentTime + 0.12) {
      const t = this.nextStep,
        i = this.stepIndex;
      if (this.ready) {
        if (i % 4 === 0) this.osc("sine", 150, t, 0.22, 0.5, out, 42, 0.002);
        if (i % 4 === 2) this.noise(t, 0.05, 0.05, "highpass", 8000, out);
        if (i % 16 === 12) this.noise(t, 0.12, 0.06, "bandpass", 1800, out, 900, 0.7);
        if (i % 2 === 1 || i % 8 === 0) {
          const f = bass[(i >> 1) % 8] * (i % 32 >= 16 ? 1.122 : 1);
          this.osc("sawtooth", f, t, step * 1.6, 0.05, out, undefined, 0.006);
        }
        if (i % 8 === 6) this.osc("triangle", 880 * (i % 32 >= 16 ? 1.122 : 1), t, 0.12, 0.02, out);
      }
      this.nextStep += step;
      this.stepIndex++;
    }
  }
}
