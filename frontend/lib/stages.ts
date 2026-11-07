/** Scroll progress (0..1) -> scene stage (0..4), with a pause on every chapter. */
const K: [number, number][] = [
  [0, 0], [0.07, 0],
  [0.18, 1], [0.28, 1],
  [0.4, 2], [0.5, 2],
  [0.62, 3], [0.72, 3],
  [0.84, 4], [1, 4],
];

export function stageOf(p: number): number {
  for (let i = 1; i < K.length; i++) {
    if (p <= K[i][0]) {
      const [p0, s0] = K[i - 1];
      const [p1, s1] = K[i];
      return s0 + (s1 - s0) * ((p - p0) / (p1 - p0 || 1));
    }
  }
  return 4;
}

/** Scroll position (0..1) to jump to for each chapter. */
export const CHAPTER_P = [0, 0.23, 0.45, 0.67, 0.9];

export const smooth = (x: number) => x * x * (3 - 2 * x);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
