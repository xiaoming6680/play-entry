/*
 * 运动曲线与阻尼弹簧。
 * 改编自 RhineLabUI 的 src/motion.ts（https://github.com/LBEILC/RhineLabUI）
 * Copyright (c) 2026 LBEILC — MIT License，全文见 public/licenses/RhineLabUI-MIT.txt
 * 改动：去掉原片时间轴相关函数；波浪和呼吸改成卡带架的参数。
 */

/** 五次平滑（两端速度、加速度为 0） */
export const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (10 + t * (-15 + 6 * t));
};
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const bell = (x: number, width: number) => Math.exp(-0.5 * (x / width) ** 2);

/**
 * 选中波：从选中的卡带沿架子向两边传开，带正负波谷，约 3 秒衰减完。
 * distance 以卡位为单位，age 以秒为单位。
 */
export function selectionWave(distance: number, age: number) {
  if (age < 0 || age > 3) return 0;
  const front = age * 9;
  return (
    0.62 *
    smooth(age / 0.18) *
    Math.exp(-age * 1.25) *
    Math.cos((distance - front) * 0.62) *
    bell(distance - front, 3.1)
  );
}

/** 停手后的呼吸：两个周期叠加，相邻卡带略微错相；最大约 0.11 */
export function idleWave(slot: number, lane: number, time: number) {
  return (
    0.08 * Math.sin((time * Math.PI * 2) / 7 + slot * 0.34 - lane * 0.5) +
    0.03 * Math.sin((time * Math.PI * 2) / 11.5 - slot * 0.19 + lane * 0.31)
  );
}

export interface Spring {
  value: number;
  velocity: number;
}
export const spring = (value = 0): Spring => ({ value, velocity: 0 });

/** 保留速度的临界阻尼：快速改目标时从当前运动接续，不回弹 */
export function damp(s: Spring, target: number, rate: number, dt: number) {
  const delta = s.value - target;
  const impulse = s.velocity + rate * delta;
  const decay = Math.exp(-rate * dt);
  s.value = target + (delta + impulse * dt) * decay;
  s.velocity = (s.velocity - rate * impulse * dt) * decay;
}

/** 欠阻尼弹簧（用于"咔"地弹出这种需要一点过冲的动作） */
export function bouncy(s: Spring, target: number, stiffness: number, damping: number, dt: number) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const a = -stiffness * (s.value - target) - damping * s.velocity;
    s.velocity += a * h;
    s.value += s.velocity * h;
  }
}

/** 角度的指数趋近（每秒按 rate 收敛） */
export const approach = (v: number, target: number, rate: number, dt: number) =>
  target + (v - target) * Math.exp(-rate * dt);
