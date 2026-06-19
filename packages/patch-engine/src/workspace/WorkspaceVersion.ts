import * as crypto from "crypto";
import * as fs from "fs";

export class WorkspaceVersion {
  // Simplistic determinism for tests
  public computeHash(files: string[]): string {
    const hash = crypto.createHash("sha256");
    for (const file of files.sort()) {
      if (fs.existsSync(file)) {
        hash.update(file);
        hash.update(fs.readFileSync(file));
      }
    }
    return hash.digest("hex");
  }
}
