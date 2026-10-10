export class NumberUtils {
  public static clamp(val: number, min: number, max: number): number {
    return Math.min(Math.max(val, min), max);
  }

  public static isInteger(val: unknown): boolean {
    return Number.isInteger(val);
  }

  public static isFinite(val: unknown): boolean {
    return Number.isFinite(val);
  }

  public static isNaN(val: unknown): boolean {
    return Number.isNaN(val);
  }

  public static round(val: number, decimals: number = 0): number {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  public static toFixed(val: number, digits: number): string {
    return Number(val).toFixed(digits);
  }

  public static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  public static formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  }
}
