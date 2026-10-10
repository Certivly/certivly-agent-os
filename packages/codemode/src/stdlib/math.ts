/**
 * Standard library math and statistics utilities for CodeMode scripts.
 */

export const MathUtils = {
  sum(numbers: number[]): number {
    return numbers.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
  },

  mean(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return this.sum(numbers) / numbers.length;
  },

  median(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  },

  min(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return Math.min(...numbers);
  },

  max(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return Math.max(...numbers);
  },

  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  },

  round(value: number, decimals: number = 0): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  },

  variance(numbers: number[]): number {
    if (numbers.length <= 1) return 0;
    const avg = this.mean(numbers);
    const sumSq = numbers.reduce((acc, n) => acc + Math.pow(n - avg, 2), 0);
    return sumSq / numbers.length;
  },

  stdDev(numbers: number[]): number {
    return Math.sqrt(this.variance(numbers));
  },

  percentile(numbers: number[], p: number): number {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  },
};
