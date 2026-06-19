import { ParserRegistry } from "@agent-os/parser";
import { PatchOperation } from "../models/Patch";

export class ASTPatchBuilder {
  constructor(private parserRegistry: ParserRegistry) {}

  public buildAstInsert(targetPath: string, contextNode: string, codeToInsert: string): PatchOperation {
    const lang = this.parserRegistry.detectLanguage(targetPath);
    const wrapper = this.parserRegistry.getParser(lang);
    // Real implementation would use parser.parse() and locate node
    return {
      type: "AST_INSERT",
      targetPath,
      astNodeContext: contextNode,
      payload: codeToInsert
    };
  }

  public buildAstReplace(targetPath: string, contextNode: string, replacementCode: string): PatchOperation {
    const lang = this.parserRegistry.detectLanguage(targetPath);
    const wrapper = this.parserRegistry.getParser(lang);
    return {
      type: "AST_REPLACE",
      targetPath,
      astNodeContext: contextNode,
      payload: replacementCode
    };
  }

  public buildAstRemove(targetPath: string, contextNode: string): PatchOperation {
    const lang = this.parserRegistry.detectLanguage(targetPath);
    const wrapper = this.parserRegistry.getParser(lang);
    return {
      type: "AST_REMOVE",
      targetPath,
      astNodeContext: contextNode
    };
  }
}

