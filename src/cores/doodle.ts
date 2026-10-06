// 彩蛋「刻点什么」：空白卡带连点 7 下以后，可以在它的核心里画画。
// 画在一张离屏画布上（贴图坐标 0..1），所有空白卡带（选中的大图 + 整片仓库的图集）都画它；刻录后存进 localStorage。
const SIZE = 512;
const KEY = "mk-doodle";
const ON_KEY = "mk-doodle-on";

const cv = document.createElement("canvas");
cv.width = cv.height = SIZE;
const g = cv.getContext("2d")!;
let dirty = false; // 画了但还没刻录
let has = false;
let last: { u: number; v: number } | null = null;

function get(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string | null) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* 隐私模式：只在这次打开时有效 */
  }
}

// 读回上次刻录的画
const saved = get(KEY);
if (saved) {
  const img = new Image();
  img.onload = () => {
    g.drawImage(img, 0, 0, SIZE, SIZE);
    has = true;
  };
  img.src = saved;
}

export const doodle = {
  canvas: cv,
  get enabled() {
    return get(ON_KEY) === "1" || enabledNow;
  },
  enable() {
    enabledNow = true;
    set(ON_KEY, "1");
  },
  get has() {
    return has;
  },
  get dirty() {
    return dirty;
  },
  /** 在核心井里吗（u、v 为贴图坐标） */
  inWell(u: number, v: number) {
    return Math.hypot(u - 0.5, v - 0.5) < 0.42 * 0.98;
  },
  start(u: number, v: number) {
    last = { u, v };
    dot(u, v);
  },
  move(u: number, v: number) {
    if (!last) return;
    g.strokeStyle = INK;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = SIZE * 0.022;
    g.beginPath();
    g.moveTo(last.u * SIZE, last.v * SIZE);
    g.lineTo(u * SIZE, v * SIZE);
    g.stroke();
    last = { u, v };
    has = dirty = true;
  },
  end() {
    last = null;
  },
  /** 刻录：存起来 */
  burn() {
    dirty = false;
    set(KEY, has ? cv.toDataURL("image/png") : null);
  },
  erase() {
    g.clearRect(0, 0, SIZE, SIZE);
    has = false;
    dirty = false;
    set(KEY, null);
  },
};
let enabledNow = false;
const INK = "#FF3B2F";

function dot(u: number, v: number) {
  g.fillStyle = INK;
  g.beginPath();
  g.arc(u * SIZE, v * SIZE, SIZE * 0.011, 0, Math.PI * 2);
  g.fill();
  has = dirty = true;
}
