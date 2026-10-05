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

  // ———————————————— 开场 ————————————————
  /** 开机：一声上扬的电子音 + 一点电流声 */
  opPowerOn() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.osc("sine", 90, t, 0.5, 0.18, this.sfx!, 520, 0.01);
    this.osc("triangle", 1200, t + 0.12, 0.25, 0.03, this.sfx!, 2400);
    this.noise(t, 0.35, 0.03, "bandpass", 3000, this.sfx!, 9000, 2);
  }
  /** 激光刻字：一段随时间扫频的嘶声 + 零星噼啪 */
  opLaser(dur: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.noise(t, dur, 0.05, "bandpass", 2400, this.sfx!, 5200, 6);
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(880, t);
    o.frequency.linearRampToValueAtTime(1320, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.008, t + 0.05);
    g.gain.setValueAtTime(0.008, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx!);
    o.start(t);
    o.stop(t + dur + 0.05);
    for (let i = 0; i < 14; i++) this.noise(t + Math.random() * dur, 0.012, 0.06 * Math.random(), "highpass", 5000, this.sfx!);
  }
  /** 红点落下：一声清亮的"叮" */
  opDing() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    [1318.5, 2637, 3951].forEach((f, i) => this.osc("sine", f, t, 1.2 / (i + 1), 0.07 / (i + 1), this.sfx!));
    this.osc("sine", 110, t, 0.2, 0.12, this.sfx!, 60);
  }
  /** 「入盒」：向上扫的气流 */
  opWhoosh() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.noise(t, 0.7, 0.09, "bandpass", 300, this.sfx!, 4200, 1.4);
  }
  /** 闪光：低频"咚"+ 噪声爆开 */
  opBoom() {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.osc("sine", 72, t, 1.4, 0.5, this.sfx!, 32, 0.004);
    this.osc("triangle", 144, t, 0.5, 0.12, this.sfx!, 60);
    this.noise(t, 0.9, 0.14, "lowpass", 3000, this.sfx!, 200);
  }
  /** 拉远：一层慢慢打开的和声垫音 + 越来越密的玻璃声（卡带一盒盒亮起来） */
  opSwell(dur: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.6);
    f.connect(g).connect(this.sfx!);
    [110, 164.8, 220, 277.2, 329.6].forEach((fr, i) => {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = fr;
        o.detune.value = det + i;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 1.7);
      }
    });
    for (let i = 0; i < 26; i++) {
      const at = t + dur * Math.pow(i / 26, 0.7) + Math.random() * 0.05;
      const f0 = 1700 + Math.random() * 1600;
      [1, 2.31, 4.17].forEach((k, j) => this.osc("sine", f0 * k, at, 0.12 + 0.2 / (j + 1), 0.022 / (j + 1.3), this.sfx!));
    }
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
