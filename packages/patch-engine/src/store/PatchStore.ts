import * as fs from "fs";
import * as path from "path";
import { Patch } from "../models/Patch";

export class PatchStore {
  constructor(private outputDir: string = ".agentos/patches") {}

  public async save(patch: Patch): Promise<void> {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(this.outputDir, `${patch.id}.json`),
      JSON.stringify(patch, null, 2)
    );
  }

  public async load(patchId: string): Promise<Patch | null> {
    const filePath = path.join(this.outputDir, `${patchId}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
    return null;
  }
}
