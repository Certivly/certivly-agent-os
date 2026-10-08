export class LanguageDetector {
  public detect(files: string[]): string[] {
    const languages = new Set<string>();

    for (const file of files) {
      if (file.endsWith(".ts") || file.endsWith(".tsx")) languages.add("TypeScript");
      if (file.endsWith(".js") || file.endsWith(".jsx")) languages.add("JavaScript");
      if (file.endsWith(".rs")) languages.add("Rust");
      if (file.endsWith(".go")) languages.add("Go");
      if (file.endsWith(".py")) languages.add("Python");
    }

    return Array.from(languages).sort(); // sort for determinism
  }
}
