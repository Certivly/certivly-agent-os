import { CrashInjector } from './CrashInjector';
import { CorruptionSimulator } from './CorruptionSimulator';

export class DaemonChaos {
  constructor(
    private crashInjector: CrashInjector,
    private corruptionSimulator: CorruptionSimulator
  ) {}

  public async runChaosSuite() {
    console.log("Starting Chaos Suite...");
    
    await this.crashInjector.injectRandomCrashes();
    await this.corruptionSimulator.corruptSessionFiles();
    await this.corruptionSimulator.corruptDaemonState();

    console.log("Chaos Suite complete.");
  }
}
