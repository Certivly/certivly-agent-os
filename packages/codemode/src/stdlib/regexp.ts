export class RegExpUtils {
  /**
   * Escapes special characters for safe regular expression interpolation.
   */
  public static escape(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Validates whether a regex pattern string is syntactically valid.
   */
  public static isValid(pattern: string, flags?: string): boolean {
    try {
      new RegExp(pattern, flags);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely tests if a string matches a pattern without throwing on syntax errors.
   */
  public static test(pattern: string | RegExp, str: string, flags?: string): boolean {
    try {
      const re = typeof pattern === 'string' ? new RegExp(pattern, flags) : pattern;
      return re.test(str);
    } catch {
      return false;
    }
  }

  /**
   * Finds all matches and captures in a string.
   */
  public static matchAll(pattern: string, flags: string = 'g', str: string): RegExpMatchArray[] {
    try {
      const activeFlags = flags.includes('g') ? flags : flags + 'g';
      const re = new RegExp(pattern, activeFlags);
      return Array.from(str.matchAll(re));
    } catch {
      return [];
    }
  }

  /**
   * Replaces matches using an asynchronous replacer function.
   */
  public static async replaceAsync(
    str: string,
    regex: RegExp,
    asyncFn: (match: string, ...args: any[]) => Promise<string>
  ): Promise<string> {
    const promises: Promise<string>[] = [];
    str.replace(regex, (match, ...args) => {
      promises.push(asyncFn(match, ...args));
      return match;
    });
    const replacements = await Promise.all(promises);
    let i = 0;
    return str.replace(regex, () => replacements[i++]);
  }
}
