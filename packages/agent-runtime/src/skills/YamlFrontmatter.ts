export interface ParsedFrontmatter<T = Record<string, any>> {
  data: T;
  content: string;
}

export class YamlFrontmatter {
  public static parse<T = Record<string, any>>(rawText: string): ParsedFrontmatter<T> {
    const trimmed = rawText.trimStart();
    if (!trimmed.startsWith('---')) {
      return {
        data: {} as T,
        content: rawText.trim(),
      };
    }

    const firstIndex = trimmed.indexOf('---');
    const secondIndex = trimmed.indexOf('---', firstIndex + 3);

    if (secondIndex === -1) {
      return {
        data: {} as T,
        content: rawText.trim(),
      };
    }

    const frontmatterBlock = trimmed.slice(firstIndex + 3, secondIndex).trim();
    const content = trimmed.slice(secondIndex + 3).trim();

    const data = this.parseYamlBlock(frontmatterBlock) as T;
    return { data, content };
  }

  public static stringify(data: Record<string, any>, content: string): string {
    const yamlLines: string[] = ['---'];
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (value.length === 0) {
          yamlLines.push(`${key}: []`);
        } else {
          yamlLines.push(`${key}:`);
          for (const item of value) {
            yamlLines.push(`  - ${String(item)}`);
          }
        }
      } else if (typeof value === 'object') {
        yamlLines.push(`${key}:`);
        for (const [subKey, subVal] of Object.entries(value)) {
          yamlLines.push(`  ${subKey}: ${JSON.stringify(subVal)}`);
        }
      } else if (typeof value === 'string') {
        if (value.includes(':') || value.includes('#') || value.includes('\n') || value.includes('"')) {
          yamlLines.push(`${key}: ${JSON.stringify(value)}`);
        } else {
          yamlLines.push(`${key}: ${value}`);
        }
      } else {
        yamlLines.push(`${key}: ${value}`);
      }
    }
    yamlLines.push('---');
    yamlLines.push('');
    yamlLines.push(content.trim());
    yamlLines.push('');
    return yamlLines.join('\n');
  }

  private static parseYamlBlock(block: string): Record<string, any> {
    const lines = block.split(/\r?\n/);
    const result: Record<string, any> = {};

    let currentKey: string | null = null;
    let currentArray: any[] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Check array item continuation: e.g. "  - item"
      if (currentKey && trimmed.startsWith('- ')) {
        const itemVal = this.parseScalar(trimmed.slice(2).trim());
        if (!currentArray) {
          currentArray = [];
          result[currentKey] = currentArray;
        }
        currentArray.push(itemVal);
        continue;
      }

      // Key-value pair: e.g. "name: value" or "tools:"
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim();
        const rawVal = trimmed.slice(colonIdx + 1).trim();

        if (rawVal === '') {
          // Could be starting an array or object
          currentKey = key;
          currentArray = null;
          result[key] = [];
        } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
          // Inline array: e.g. [read_file, edit_file]
          const inner = rawVal.slice(1, -1).trim();
          const items = inner ? inner.split(',').map((s) => this.parseScalar(s.trim())) : [];
          result[key] = items;
          currentKey = null;
          currentArray = null;
        } else {
          result[key] = this.parseScalar(rawVal);
          currentKey = null;
          currentArray = null;
        }
      }
    }

    return result;
  }

  private static parseScalar(val: string): any {
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    if (!isNaN(Number(val)) && val !== '') return Number(val);
    return val;
  }
}
