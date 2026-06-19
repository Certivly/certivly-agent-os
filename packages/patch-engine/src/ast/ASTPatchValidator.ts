import { ParserRegistry } from "@agent-os/parser";

export class ASTPatchValidator {
  constructor(private parserRegistry: ParserRegistry) {}

  public validate(code: string, filePath: string = "dummy.ts"): boolean {
    const lang = this.parserRegistry.detectLanguage(filePath);
    const wrapper = this.parserRegistry.getParser(lang);
    if (!wrapper) return false;
    
    const parser = wrapper.getRawParser();
    if (!parser) return false;

    try {
      const tree = parser.parse(code);
      const isError = typeof tree.rootNode.hasError === 'function' ? tree.rootNode.hasError() : tree.rootNode.hasError;
      return !isError;
    } catch (e) {
      return false;
    }
  }
}

