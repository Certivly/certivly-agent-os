/**
 * Standard library date and time utilities for CodeMode scripts.
 */

export const DateUtils = {
  nowISO(): string {
    return new Date().toISOString();
  },

  formatISO(date: Date | number | string): string {
    return new Date(date).toISOString();
  },

  addDays(date: Date | string | number, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },

  addHours(date: Date | string | number, hours: number): Date {
    const d = new Date(date);
    d.setTime(d.getTime() + hours * 3600 * 1000);
    return d;
  },

  diffMs(dateA: Date | string | number, dateB: Date | string | number): number {
    return Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime());
  },

  formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(1)}s`;
    const min = Math.floor(sec / 60);
    const remSec = Math.round(sec % 60);
    return `${min}m ${remSec}s`;
  },

  isBefore(dateA: Date | string | number, dateB: Date | string | number): boolean {
    return new Date(dateA).getTime() < new Date(dateB).getTime();
  },

  isAfter(dateA: Date | string | number, dateB: Date | string | number): boolean {
    return new Date(dateA).getTime() > new Date(dateB).getTime();
  },
};
