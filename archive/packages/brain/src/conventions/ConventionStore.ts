import { Convention } from "../models/Convention";

export class ConventionStore {
  private conventions: Map<string, Convention> = new Map();

  public save(convention: Convention): void {
    this.conventions.set(convention.id, convention);
  }

  public saveMany(conventions: Convention[]): void {
    for (const c of conventions) {
      this.save(c);
    }
  }

  public getAll(): Convention[] {
    // Sort deterministically
    return Array.from(this.conventions.values()).sort((a, b) => a.id.localeCompare(b.id));
  }
}
