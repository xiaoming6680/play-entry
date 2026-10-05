// 铭刻 · 卡带库 —— 主程序：开场、状态机、输入、声音、彩蛋。舞台（3D / 2D）只按 Frame 画画。
import { Sound } from "./audio";
import { CoreBank } from "./cores";
import { rgba } from "./cores/common";
import { buildItems, STATUS_LABEL, wrap } from "./data";
import { Hud, wait } from "./hud/hud";
import { Opening } from "./opening";
import { hideLaunch, playLaunch } from "./launch";
import { bouncy, clamp, smooth, spring } from "./motion";
import { Rail } from "./rail";
import { createStage2D } from "./stage2d";
import type { Beat, CoreState, Frame, Item, Mode, Stage, Theme } from "./types";

// ———————————————————— 环境与偏好 ————————————————————
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* 隐私模式 */
    }
  },
};
const qs = new URLSearchParams(location.search);
const mqReduced = matchMedia("(prefers-reduced-motion: reduce)");
const mqDark = matchMedia("(prefers-color-scheme: dark)");
const touch = matchMedia("(pointer: coarse)").matches;
// 轻量档只给触屏设备（手机/平板）；笔记本小屏照样用完整 3D，卡顿时再自动降到 2D
const lite = touch || Math.min(screen.width, screen.height) < 560;
const reduced = () => mqReduced.matches || qs.get("r") === "static";
const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;

function hasGL2() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const renderPref = (store.get("mk-render") as "3d" | "2d" | null) ?? "auto";
const forced = qs.get("r");
let want3D =
  forced === "3d" ? true : forced === "2d" || forced === "static" ? false : renderPref === "2d" ? false : !reduced() && !conn?.saveData;
if (want3D && !hasGL2()) want3D = false;

// ———————————————————— 状态 ————————————————————
const hud = new Hud(reduced);
const sound = new Sound(store.get("mk-sound") !== "off");
const bank = new CoreBank(lite ? 384 : 512, lite ? 96 : 128);
let items: Item[] = buildItems(false);
const host = document.getElementById("stage")!;
let stage: Stage = createStage2D(host, bank);
let theme: Theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const startHash = decodeURIComponent(location.hash.slice(1));
const startIndex = Math.max(0, items.findIndex((i) => i.id === startHash));
const rail = new Rail(startIndex);
let mode: Mode = "boot";
let reading = false;
let reveal = 0;
const insert = spring(0);
let insertTarget = 0;
let insertBouncy = false;
let spin = 0;
let enter = 0;
let enterStart = -1;
const waves: Frame["waves"] = [];
let lastSlot = rail.selected;
let hover: { slot: number | null; lane: number } = { slot: null, lane: 0 };
let pointer: { x: number; y: number } | null = null;
let lastInput = 0;
let seq = 0; // 读取 / 插入的序号，用来取消过期的动画
let t = 0;
let stayLeaving = 0;
let stayLeftAt = -99;
let awake = false;
let tempo: { bpm: number; start: number; until: number } | null = null;
let glintStart = -1;
let mouse: { x: number; y: number } | null = null;
let confirmMobile = false;

const itemAt = (slot: number) => items[wrap(slot, items.length)];
const current = () => itemAt(rail.selected);

// ———————————————————— 主题与声音 ————————————————————
function applyTheme(next: Theme) {
  theme = next;
  document.documentElement.dataset.theme = next;
  stage.setTheme(next);
  bank.drawLabels(next);
  setAura(current(), true);
  syncSegs();
}

// 游戏光晕：两层交替淡入淡出
const auraEls = [...document.querySelectorAll<HTMLElement>("#aura i")];
let auraIdx = 0;
function setAura(item: Item, sameLayer = false) {
  if (!sameLayer) auraIdx = 1 - auraIdx;
  const el = auraEls[auraIdx],
    other = auraEls[1 - auraIdx];
  const [a1, a2] = theme === "dark" ? [0.16, 0.12] : [0.16, 0.11];
  const none = item.kind === "blank";
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
  el.style.setProperty("--a1", none ? "transparent" : rgba(lum(item.color) > 0.8 ? item.color2 : item.color, a1));
  el.style.setProperty("--a2", none ? "transparent" : rgba(item.color2, a2));
  el.classList.add("on");
  other.classList.remove("on");
}
function themePref() {
  const v = store.get("mk-theme");
  return v === "light" || v === "dark" ? v : "auto";
}
mqDark.addEventListener("change", () => themePref() === "auto" && applyTheme(mqDark.matches ? "dark" : "light"));

function setSound(on: boolean) {
  sound.setEnabled(on);
  store.set("mk-sound", on ? null : "off");
  document.getElementById("btn-sound")!.setAttribute("aria-pressed", String(on));
  if (on) sound.unlock();
  if (!on) sound.stopBeat();
  else if (mode === "read" && reveal >= 1 && current().core === "beat") sound.startBeat(Number(current().coreOptions.bpm) || 128);
  syncSegs();
}

function syncSegs() {
  const mark = (id: string, v: string) =>
    document.querySelectorAll<HTMLButtonElement>(`#${id} button`).forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  mark("seg-render", renderPref);
  mark("seg-theme", themePref());
  mark("seg-sound", sound.enabled ? "on" : "off");
}

// ———————————————————— 选中变化 ————————————————————
function onSelect(slot: number, dir: number) {
  // 读取中换了卡带（彩蛋、键入 id 等）：先把正在读的那盒放回去
  if (mode === "read") closeRead();
  const prev = itemAt(lastSlot);
  const item = itemAt(slot);
  hud.setItem(item, wrap(slot, items.length), dir);
  if (dir) {
    waves.push({ slot, t0: t, dir });
    if (waves.length > 4) waves.shift();
    sound.tick(0.9);
  }
  if (prev.core === "stay" && dir && item.core !== "stay") {
    stayLeaving = dir;
    if (t - stayLeftAt > 25) {
      hud.whisper("……要走了吗");
      sound.hmm();
    }
    stayLeftAt = t;
  }
  confirmMobile = false;
  setAura(item);
  if (item.kind === "game") history.replaceState(null, "", `#${item.id}`);
  else if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  lastSlot = slot;
}

// ———————————————————— 读取 / 插入 ————————————————————
function animate(dur: number, fn: (p: number) => void, token: number) {
  return new Promise<boolean>((res) => {
    if (reduced() || dur <= 0) {
      fn(1);
      return res(token === seq);
    }
    const t0 = performance.now();
    const step = (now: number) => {
      if (token !== seq) return res(false);
      const p = Math.min(1, (now - t0) / (dur * 1000));
      fn(p);
      if (p < 1) requestAnimationFrame(step);
      else res(true);
    };
    requestAnimationFrame(step);
  });
}

async function openRead() {
  if (mode !== "browse") return;
  rail.goto(rail.selected);
  const item = current();
  const token = ++seq;
  mode = "read";
  reading = true;
  reveal = 0;
  spin = 0;
  hud.setMode("read");
  // 正文一展开就先盖住，等读卡头扫过再揭开（不能先露出来再盖）
  hud.redact();
  hud.setMainLabel(item.kind === "game" ? "插入卡带" : "插进去试试");
  hud.setNote("");
  sound.lift();
  if (!(await animate(0.62, () => {}, token))) return;
  sound.scan(1.05);
  const ok = await animate(
    1.05,
    (p) => {
      reveal = p;
      hud.revealText(clamp(p * 1.15 - 0.1));
    },
    token,
  );
  if (!ok) return;
  reveal = 1;
  glintStart = t;
  sound.shimmer();
  hud.clearRedact();
  if (item.core === "beat") sound.startBeat(Number(item.coreOptions.bpm) || 128);
}

function closeRead() {
  if (mode !== "read") return;
  const token = ++seq;
  sound.stopBeat();
  hud.clearRedact();
  hud.clearTerm();
  hud.slot("off");
  mode = "browse";
  reading = false;
  spin = 0;
  glintStart = -1;
  hud.setMode("browse");
  hud.setMainLabel("读取卡带");
  hud.setNote("");
  const from = reveal;
  animate(0.35, (p) => (reveal = from * (1 - p)), token).then(() => token === seq && (reveal = 0));
}

async function doInsert() {
  if (mode !== "read") return;
  const item = current();
  if (reveal < 1) {
    // 还在解密就按了插入：先直接读完
    seq++;
    reveal = 1;
    hud.clearRedact();
  }
  const launchable = item.kind === "game" && (item.status === "live" || item.status === "preview") && !!item.url;
  if (launchable && touch && item.device === "desktop" && !confirmMobile) {
    confirmMobile = true;
    hud.setNote("这个游戏建议用电脑玩，手机上可能不好操作。再按一次仍然插入，或者先复制链接发到电脑上。");
    hud.setMainLabel("仍然插入");
    return;
  }
  const token = ++seq;
  sound.stopBeat();
  mode = "insert";
  hud.setMode("insert");
  spin = 0;
  hud.slot("on");
  insertBouncy = false;
  insertTarget = 1;
  await wait(reduced() ? 0 : 520);
  if (token !== seq) return;
  sound.clunk();
  const code = item.code;
  if (launchable) {
    hud.slot("ok");
    sound.launch();
    await hud.typeLines(
      [
        { text: `> 读取 ${code} …` },
        { text: "> 校验卡带 ………… 通过", cls: "ok" },
        { text: `> 启动「${item.title}」${item.status === "preview" ? "（试玩版）" : ""}` },
      ],
      12,
    );
    const r = document.getElementById("slot")!.getBoundingClientRect();
    await playLaunch(document.getElementById("launch") as HTMLCanvasElement, item, { x: r.left + r.width / 2, y: r.top }, reduced());
    location.href = item.url!;
    return;
  }
  const lines =
    item.kind === "game"
      ? [
          { text: `> 读取 ${code} …` },
          { text: "> 校验卡带 ………… 失败", cls: "err" },
          { text: `> 原因：仍在刻录中（${STATUS_LABEL[item.status]}）`, cls: "dim" },
        ]
      : item.kind === "secret"
        ? [{ text: `> 读取 ${code} …` }, { text: "> 这盒卡带，就是你现在看到的一切。", cls: "dim" }]
        : [{ text: `> 读取 ${code} …` }, { text: "> 里面什么都没有。", cls: "dim" }];
  const typed = await hud.typeLines(lines);
  if (!typed || token !== seq) return;
  hud.slot(item.kind === "game" ? "err" : "on");
  if (item.kind === "game") sound.error();
  else sound.empty();
  await wait(reduced() ? 0 : 520);
  if (token !== seq) return;
  // "咔"地弹出来
  sound.eject();
  insertBouncy = true;
  insertTarget = 0;
  await wait(reduced() ? 0 : 700);
  if (token !== seq) return;
  hud.slot("off");
  mode = "read";
  hud.setMode("read");
  hud.setNote(
    item.kind === "game"
      ? item.status === "paused"
        ? "这个游戏暂时停下来了。"
        : "还在做。做好了，它会在这里亮起来。可以先复制链接，发到电脑上以后看。"
      : item.kind === "blank"
        ? "空白卡带。下一个游戏做好了，会刻进这里。"
        : "谢谢你翻到这里。",
  );
  if (item.core === "beat" && sound.enabled) sound.startBeat(Number(item.coreOptions.bpm) || 128);
  setTimeout(() => token === seq && hud.clearTerm(), 1600);
}

async function copyLink() {
  const item = current();
  if (!item.url) return;
  let ok = false;
  try {
    await navigator.clipboard.writeText(item.url);
    ok = true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = item.url;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;left:0;top:0";
    document.body.append(ta);
    ta.select();
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
  }
  hud.toast(ok ? `已复制：${item.url.replace(/^https?:\/\//, "")}` : `复制失败，地址是 ${item.url}`);
  sound.tick(0.6);
}

// ———————————————————— 开场 ————————————————————
const bootEl = document.getElementById("boot")!;
const bootBar = document.getElementById("boot-bar")!;
const skipBoot = document.documentElement.classList.contains("skip-boot");
let stageReady = false;
let bootDone = false;
let opening: Opening | null = null;
let browseSince = 0;
let igniteStart = -1; // 没有开场时（同一会话再次打开）的点亮波起点

function setBootProgress(p: number) {
  bootBar.style.setProperty("--p", String(clamp(p, 0.06, 1)));
}

function markBooted() {
  try {
    sessionStorage.setItem("mk-booted", "1");
  } catch {
    /* ignore */
  }
}

/** 切到浏览：HUD 分批入场 */
function enterBrowse() {
  if (bootDone) return;
  bootDone = true;
  browseSince = t;
  mode = "browse";
  const app = document.getElementById("app")!;
  app.classList.add("hud-enter");
  hud.setMode("browse");
  hud.scrambleTitle();
  setTimeout(() => app.classList.remove("hud-enter"), 1800);
  lastInput = performance.now();
}

function startOpening() {
  opening = new Opening(bootEl, sound, {
    ready: () => stageReady,
    is3D: () => stage.kind === "3d",
    quad: () => (stage as Stage & { faceQuad?: () => { x: number; y: number }[] | null }).faceQuad?.() ?? null,
    onBrowse: enterBrowse,
    onDone: () => {
      opening = null;
      markBooted();
    },
    onSoundOn: () => setSound(true),
    onMute: () => setSound(false),
  });
}

/** 长按标志：重播开场 */
function replayBoot() {
  if (mode === "insert" || opening) return;
  closeRead();
  bootDone = false;
  mode = "boot";
  enter = 0;
  enterStart = -1;
  hud.setMode("boot");
  document.documentElement.classList.remove("skip-boot");
  bootEl.className = "boot";
  bootEl.style.removeProperty("--scan");
  startOpening();
}

// ———————————————————— 舞台装载 ————————————————————
function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error(src));
    document.head.append(s);
  });
}

type SceneModule = { createScene3D: (h: HTMLElement, b: CoreBank, o: { lite: boolean }) => Stage & { onLost?: (() => void) | null } };

async function load3D(): Promise<Stage | null> {
  try {
    let mod: SceneModule;
    if (import.meta.env.DEV) mod = (await import("./scene3d/index")) as SceneModule;
    else {
      await loadScript("./assets/scene3d.js");
      mod = (window as unknown as { MingkeScene3D: SceneModule }).MingkeScene3D;
    }
    setBootProgress(0.75);
    const s = mod.createScene3D(host, bank, { lite });
    s.onLost = () => fallbackTo2D("3D 画面出了点问题，已切换到 2D 版。");
    await s.ready;
    return s;
  } catch (e) {
    console.warn("[铭刻] 3D 加载失败，使用 2D 版", e);
    return null;
  }
}

function swapStage(next: Stage) {
  stage.dispose();
  stage = next;
  host.dataset.render = next.kind;
  stage.setItems(items);
  stage.setTheme(theme);
  stage.resize();
}

function fallbackTo2D(msg: string) {
  if (stage.kind === "2d") return;
  swapStage(createStage2D(host, bank));
  hud.toast(msg, 3600);
}

function setItems(next: Item[]) {
  items = next;
  bank.setItems(items, theme);
  stage.setItems(items);
  hud.setItems(items);
}

// ———————————————————— 主循环 ————————————————————
let last = performance.now();
let atlasClock = 0;
let clockClock = 0;


function heroLook(): CoreState["look"] {
  const r = stage.focusRect();
  if (!pointer || !r) return null;
  const cx = r.x + r.w / 2,
    cy = r.y + r.h * 0.44,
    rad = r.w * 0.38;
  return { x: (pointer.x - cx) / rad, y: (pointer.y - cy) / rad };
}

function beatNow(): Beat | null {
  if (mode === "browse" && current().core === "beat" && !reduced()) {
    // 浏览时选中 beat：整片仓库轻轻跟拍
    const bpm = Number(current().coreOptions.bpm) || 128;
    const period = 60 / bpm;
    const x = t / period;
    return { phase: (x - Math.floor(x)) * period, period, count: Math.floor(x) };
  }
  if (tempo && t < tempo.until) {
    const period = 60 / tempo.bpm;
    const x = (t - tempo.start) / period;
    return { phase: (x - Math.floor(x)) * period, period, count: Math.floor(x) };
  }
  if (tempo && t >= tempo.until) {
    tempo = null;
    hud.tempo(null);
  }
  if (mode === "read" && reveal >= 1 && current().core === "beat") {
    const b = sound.beatClock();
    if (b) return b;
    const bpm = Number(current().coreOptions.bpm) || 128;
    const period = 60 / bpm;
    const x = t / period;
    return { phase: (x - Math.floor(x)) * period, period, count: Math.floor(x) };
  }
  return null;
}

function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  t += dt;
  const red = reduced();
  opening?.tick(dt);
  if (opening?.intro != null && enterStart < 0) enterStart = t;
  rail.step(dt, red);
  // 插入下沉 / 弹出过冲
  if (insertBouncy) bouncy(insert, insertTarget, 170, 15, dt);
  else {
    const k = red ? 1 : 1 - Math.exp(-dt * 9);
    insert.value += (insertTarget - insert.value) * k;
  }
  const sel = rail.selected;
  if (sel !== lastSlot) onSelect(sel, Math.sign(sel - lastSlot));
  if (enterStart >= 0) enter = clamp((t - enterStart) / 1.5);
  if (stayLeaving && t - stayLeftAt > 1.6) stayLeaving = 0;
  const idleFor = (now - lastInput) / 1000;
  const idle = mode === "browse" && !red ? smooth((idleFor - 2.5) / 2.5) : 0;
  if (mode === "browse" && idleFor > 30 && !awake && bootDone) {
    awake = true;
  }
  if (awake && idleFor > 60 && !awakeWhispered) {
    awakeWhispered = true;
    hud.whisper("……你还在吗", 4000);
  }
  const beat = beatNow();
  const frame: Frame = {
    t,
    dt,
    mode,
    rail: rail.pos,
    lateral: rail.lateral.value,
    slot: sel,
    reading,
    reveal,
    insert: insert.value,
    spin,
    enter: enterStart >= 0 ? enter : 0,
    idle,
    beat,
    beatAmp: tempo || mode === "read" ? 1 : 0.35,
    intro: opening ? opening.intro : null,
    ignite: opening
      ? opening.ignite
      : igniteStart >= 0 && t - igniteStart < 6
        ? t - igniteStart
        : bootDone
          ? Infinity
          : -1,
    glint: glintStart >= 0 && t - glintStart < 0.8 ? (t - glintStart) / 0.8 : -1,
    parallax: mouse,
    waves,
    hoverSlot: hover.slot,
    hoverLane: hover.lane,
    pointer,
    theme,
    reduced: red,
  };
  // 核心
  const item = itemAt(sel);
  bank.drawHero(item, {
    t,
    dt,
    clarity: reading ? reveal : 0,
    reveal,
    reading: reading && reveal < 1,
    selected: mode !== "boot",
    look: heroLook(),
    beat,
    theme,
    reduced: red,
    awake,
    leaving: 0,
  });
  atlasClock += dt;
  if (atlasClock > (lite ? 1 / 12 : 1 / 20) || bank.atlasVersion === 0) {
    const adt = atlasClock;
    atlasClock = 0;
    const W = innerWidth,
      H = innerHeight;
    const gl = pointer ? { x: (pointer.x - W / 2) / (W / 2), y: (pointer.y - H / 2) / (H / 2) } : null;
    bank.drawAtlas((it) => ({
      t,
      dt: adt,
      clarity: 0,
      reveal: 0,
      reading: false,
      selected: false,
      look: awake ? gl : null,
      beat,
      theme,
      reduced: red,
      awake,
      leaving: it.core === "stay" ? stayLeaving : 0,
    }));
  }
  stage.draw(frame);
  hud.setFocus(stage.focusRect(), bootDone && !opening && mode === "browse" && (stage.kind === "3d" || enter > 0.8), dt);
  clockClock += dt;
  if (clockClock > 0.25) {
    clockClock = 0;
    hud.tickClock(t);
  }
  // 3D 降到最低画质还是很卡，才自动换 2D（只在"自动"档）
  if (stage.kind === "3d" && renderPref === "auto" && !forced && bootDone && !opening && t - browseSince > 1.2) {
    const s3 = stage as Stage & { struggling?: () => boolean };
    if (s3.struggling?.()) fallbackTo2D("画面有点卡，已切换到 2D 版（可以在「关于」里改回 3D）。");
  }
  requestAnimationFrame(loop);
}
let awakeWhispered = false;

// ———————————————————— 输入 ————————————————————
function poke() {
  lastInput = performance.now();
  if (awake) {
    awake = false;
    if (awakeWhispered) hud.whisper("啊，你在。");
    awakeWhispered = false;
  }
}
const unlockAudio = () => sound.enabled && sound.unlock();
addEventListener("pointerdown", unlockAudio, { capture: true });
addEventListener("keydown", unlockAudio, { capture: true });
addEventListener("touchend", unlockAudio, { capture: true });

let drag: { id: number; x: number; y: number; spin0: number; moved: boolean } | null = null;
const tapTimes: number[] = [];

host.addEventListener("pointerdown", (e) => {
  poke();
  if (mode === "boot") return;
  if (e.button > 0) return;
  host.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, spin0: spin, moved: false };
  if (mode === "browse") {
    rail.catch();
    rail.dragStart(e.clientX, e.clientY, minLen(stage.slotAxis(), touch ? 100 : 46), minLen(stage.laneAxis(), 120), performance.now());
    host.classList.add("dragging");
  }
});
addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") mouse = { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 };
});
host.addEventListener("pointermove", (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  if (e.pointerType === "mouse" && !drag && now() - lastHover > 50) hoverCheck(e.clientX, e.clientY);
  if (!drag || drag.id !== e.pointerId) return;
  poke();
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 8) drag.moved = true;
  if (mode === "browse") rail.dragMove(e.clientX, e.clientY, performance.now());
  else if (mode === "read") spin = clamp(drag.spin0 + dx * 0.006, -0.62, 0.62);
});
const endDrag = (e: PointerEvent, cancel = false) => {
  if (!drag || drag.id !== e.pointerId) return;
  const moved = drag.moved;
  drag = null;
  host.classList.remove("dragging");
  if (mode === "browse") {
    if (cancel) return rail.cancelDrag();
    const tap = rail.dragEnd(performance.now(), reduced(), e.pointerType === "touch");
    if (tap) onTap(e.clientX, e.clientY);
  } else if (mode === "read") {
    spin = 0;
    if (!moved && !cancel) onTapRead(e.clientX, e.clientY);
  }
};
host.addEventListener("pointerup", (e) => endDrag(e));
host.addEventListener("pointercancel", (e) => endDrag(e, true));
host.addEventListener("pointerleave", () => {
  if (!drag) hover = { slot: null, lane: 0 };
});

let lastHover = 0;
const now = () => performance.now();
function hoverCheck(x: number, y: number) {
  lastHover = now();
  if (mode !== "browse") return (hover = { slot: null, lane: 0 });
  const p = stage.pick(x, y);
  const changed = p?.slot !== hover.slot || p?.lane !== hover.lane;
  hover = p ? { slot: p.slot, lane: p.lane } : { slot: null, lane: 0 };
  host.style.cursor = p && p.lane === 0 ? "pointer" : "";
  if (changed && p && p.lane === 0 && p.slot !== rail.selected) sound.tick(0.35);
}

/** 屏幕上一个卡位太短时拉长（仓库很密，1:1 跟手会一下翻十几盒） */
function minLen(v: { x: number; y: number }, min: number) {
  const l = Math.hypot(v.x, v.y);
  return l >= min || l < 1e-6 ? v : { x: (v.x / l) * min, y: (v.y / l) * min };
}

function onTap(x: number, y: number) {
  const r = stage.focusRect();
  // 点在选中卡带的外框里就当作点它（它前面的卡带会挡住下半截）
  if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h * 0.75) return void openRead();
  const p = stage.pick(x, y);
  if (!p) return;
  if (p.lane !== 0) {
    sound.tick(0.5);
    hud.whisper("空白库存 · 还没刻录");
    return;
  }
  if (p.slot === rail.selected) openRead();
  else rail.goto(p.slot);
}

function onTapRead(x: number, y: number) {
  const p = stage.pick(x, y);
  const onCard = p && p.lane === 0 && p.slot === rail.selected;
  if (!onCard) return;
  // 彩蛋：在 beat 卡带上跟着拍子点 4 下
  if (current().core === "beat") {
    const n = performance.now();
    tapTimes.push(n);
    while (tapTimes.length > 5) tapTimes.shift();
    if (tapTimes.length >= 4) {
      const iv = tapTimes.slice(1).map((v, i) => v - tapTimes[i]);
      const recent = iv.slice(-3);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const steady = recent.every((v) => Math.abs(v - avg) < avg * 0.22);
      if (steady && avg > 250 && avg < 1500) {
        const bpm = 60000 / avg;
        tempo = { bpm, start: t, until: t + (60 / bpm) * 16 };
        hud.tempo(bpm);
        hud.whisper(`整座仓库跟着你的 ${Math.round(bpm)} BPM 动起来了`);
        tapTimes.length = 0;
      }
    }
    sound.tick(0.7);
  }
}

let wheelAcc = 0;
let wheelAt = 0;
addEventListener(
  "wheel",
  (e) => {
    if ((e.target as HTMLElement).closest?.(".panel, .about")) return;
    e.preventDefault();
    poke();
    if (mode !== "browse") return;
    const n = performance.now();
    if (n - wheelAt > 220) wheelAcc = 0;
    wheelAt = n;
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    if (Math.abs(wheelAcc) >= 45) {
      rail.nudge(Math.sign(wheelAcc));
      wheelAcc = 0;
    }
  },
  { passive: false },
);

// 防止微信下拉露出"网页由…提供"、iOS 回弹
document.addEventListener(
  "touchmove",
  (e) => {
    if (!(e.target as HTMLElement).closest(".panel, .about")) e.preventDefault();
  },
  { passive: false },
);

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const keyLog: string[] = [];
let typed = "";
const about = document.getElementById("about") as HTMLDialogElement;

addEventListener("keydown", (e) => {
  poke();
  if (about.open) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // 彩蛋：Konami、键入游戏 id
  keyLog.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (keyLog.length > KONAMI.length) keyLog.shift();
  if (keyLog.join() === KONAMI.join()) unlockSecret();
  if (/^[a-z]$/.test(e.key.toLowerCase()) && e.key.length === 1) {
    typed = (typed + e.key.toLowerCase()).slice(-12);
    const hit = items.find((i) => i.kind === "game" && typed.endsWith(i.id));
    if (hit && mode !== "insert") {
      typed = "";
      if (mode === "read") closeRead();
      gotoItem(items.indexOf(hit));
    }
  }
  if (mode === "boot") return;
  switch (e.key) {
    case "ArrowDown":
    case "PageDown":
    case "s":
    case "S":
      if (mode === "browse") rail.nudge(1);
      e.preventDefault();
      break;
    case "ArrowUp":
    case "PageUp":
    case "w":
    case "W":
      if (mode === "browse") rail.nudge(-1);
      e.preventDefault();
      break;
    case "ArrowLeft":
    case "ArrowRight":
      if (mode === "browse") {
        rail.lateral.velocity += e.key === "ArrowLeft" ? 1.6 : -1.6;
        sound.tick(0.3);
      }
      break;
    case "Enter":
    case " ":
      if ((e.target as HTMLElement).closest?.("button, a")) return;
      e.preventDefault();
      if (mode === "browse") openRead();
      else if (mode === "read") doInsert();
      break;
    case "Escape":
    case "Backspace":
      if (mode === "read") closeRead();
      break;
  }
});

function gotoItem(index: number) {
  const n = items.length;
  const s = rail.selected;
  const base = s - wrap(s, n);
  let target = base + index;
  if (target - s > n / 2) target -= n;
  if (s - target > n / 2) target += n;
  rail.goto(target);
}

function unlockSecret() {
  if (items.some((i) => i.kind === "secret")) {
    gotoItem(items.findIndex((i) => i.kind === "secret"));
    return;
  }
  const keepId = current().id;
  const slot = rail.selected;
  setItems(buildItems(true));
  // 保持当前这盒不变：按新周期找回同一个 item
  const idx = items.findIndex((i) => i.id === keepId);
  const n = items.length;
  const fixed = slot - wrap(slot, n) + idx;
  rail.pos += fixed - slot;
  rail.target = fixed;
  lastSlot = fixed;
  hud.setItem(current(), wrap(fixed, n), 0);
  sound.launch();
  hud.whisper("翻出了一盒不在架子上的卡带", 3200);
  setTimeout(() => gotoItem(items.findIndex((i) => i.kind === "secret")), 500);
}


// ———————————————————— 按钮 ————————————————————
const on = (id: string, fn: () => void) => document.getElementById(id)!.addEventListener("click", fn);
on("btn-main", () => (mode === "browse" ? openRead() : mode === "read" ? doInsert() : undefined));
on("btn-back", closeRead);
on("btn-copy", copyLink);
on("btn-sound", () => setSound(!sound.enabled));
on("btn-theme", () => {
  const next: Theme = theme === "dark" ? "light" : "dark";
  store.set("mk-theme", next);
  applyTheme(next);
  sound.tick(0.5);
});
on("btn-about", () => {
  syncSegs();
  about.showModal();
});
on("about-close", () => about.close());
about.addEventListener("click", (e) => e.target === about && about.close());
document.querySelectorAll<HTMLButtonElement>("#seg-render button").forEach((b) =>
  b.addEventListener("click", () => {
    const v = b.dataset.v!;
    store.set("mk-render", v === "auto" ? null : v);
    location.reload();
  }),
);
document.querySelectorAll<HTMLButtonElement>("#seg-theme button").forEach((b) =>
  b.addEventListener("click", () => {
    const v = b.dataset.v!;
    store.set("mk-theme", v === "auto" ? null : v);
    applyTheme(v === "auto" ? (mqDark.matches ? "dark" : "light") : (v as Theme));
  }),
);
document.querySelectorAll<HTMLButtonElement>("#seg-sound button").forEach((b) =>
  b.addEventListener("click", () => setSound(b.dataset.v === "on")),
);
hud.onTick = (i) => {
  poke();
  if (mode === "read") closeRead();
  if (mode === "browse") gotoItem(i);
};

// 标志：短按回到第一盒，长按重播开场
const brand = document.getElementById("brand")!;
let pressTimer = 0;
let longPressed = false;
brand.addEventListener("pointerdown", () => {
  longPressed = false;
  brand.classList.add("pressing");
  pressTimer = window.setTimeout(() => {
    longPressed = true;
    brand.classList.remove("pressing");
    replayBoot();
  }, 650);
});
const cancelPress = () => {
  clearTimeout(pressTimer);
  brand.classList.remove("pressing");
};
brand.addEventListener("pointerup", cancelPress);
brand.addEventListener("pointerleave", cancelPress);
brand.addEventListener("contextmenu", (e) => e.preventDefault());
brand.addEventListener("click", (e) => {
  e.preventDefault();
  if (longPressed) return;
  if (mode === "read") closeRead();
  if (mode === "browse") gotoItem(0);
});

// 鼠标/手指点过的按钮不留焦点，免得之后按回车又触发它（键盘用户 Tab 过去的焦点保留）
addEventListener("pointerup", (e) => {
  const b = (e.target as HTMLElement).closest?.("button");
  if (b && !b.closest("dialog")) setTimeout(() => b.blur(), 0);
});

// ———————————————————— 页面事件 ————————————————————
const resize = () => stage.resize();
addEventListener("resize", resize);
visualViewport?.addEventListener("resize", resize);

let hiddenTitle = "";
let askedWhere = false;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenTitle = document.title;
    document.title = "别关我……";
    sound.stopBeat();
  } else {
    if (hiddenTitle) document.title = hiddenTitle;
    last = performance.now();
    if (!askedWhere && bootDone) {
      askedWhere = true;
      setTimeout(() => hud.whisper("stay：你刚才去哪了？", 3000), 500);
    }
    if (mode === "read" && reveal >= 1 && current().core === "beat" && sound.enabled)
      sound.startBeat(Number(current().coreOptions.bpm) || 128);
  }
});

// 从游戏按返回（页面从缓存恢复）：清掉转场，回到这盒卡带
addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  hideLaunch(document.getElementById("launch") as HTMLCanvasElement);
  seq++;
  insertBouncy = false;
  insertTarget = 0;
  insert.value = 0;
  hud.slot("off");
  hud.clearTerm();
  if (mode === "insert") {
    mode = "read";
    hud.setMode("read");
  }
});

// ———————————————————— 启动 ————————————————————
console.log(
  "%c铭刻%c 你在看我的源代码吗？\n……看吧。不过别关掉我。\n—— stay",
  "font:800 18px sans-serif;color:#FF3B2F",
  "font:13px/1.8 sans-serif;color:#888",
);

hud.hint(touch);
if (!skipBoot) startOpening();
setItems(items);
hud.setItem(current(), wrap(rail.selected, items.length), 0);
applyTheme(theme);
syncSegs();
host.dataset.render = stage.kind;
setBootProgress(0.15);
requestAnimationFrame((n) => {
  last = n;
  lastInput = n;
  requestAnimationFrame(loop);
});

(async () => {
  if (want3D) {
    setBootProgress(0.3);
    const s3 = await load3D();
    if (s3) swapStage(s3);
  }
  setBootProgress(1);
  stageReady = true;
  if (!opening && !bootDone) {
    // 同一会话再次打开（或减少动态效果）：不播开场，镜头从特写自然拉开 + 一道点亮波
    enterStart = t;
    igniteStart = t;
    enterBrowse();
    markBooted();
  }
})();

// 截图用：?shot=og 分享图构图；?shot=<游戏 id> 停在那一盒
if (qs.has("shot")) {
  const id = qs.get("shot");
  if (id === "og") {
    document.documentElement.classList.add("og-shot");
    const og = document.createElement("div");
    og.className = "og-card";
    og.innerHTML = `<b>铭刻</b><span>小铭的小游戏卡带库</span><ul>${items
      .filter((i) => i.kind === "game")
      .map((i) => `<li><i style="background:${i.color}"></i>${i.title}</li>`)
      .join("")}</ul><em>play.xiaoming6680.link</em>`;
    document.querySelector(".hud")!.append(og);
  }
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) rail.goto(idx);
}
(window as unknown as { __mk: unknown }).__mk = {
  get mode() {
    return mode;
  },
  get stage() {
    return stage.kind;
  },
  openRead,
  closeRead,
  doInsert,
  items: () => items,
  rail,
};
