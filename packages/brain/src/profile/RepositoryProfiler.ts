import { RepositoryProfile } from "../models/RepositoryProfile";
import { FrameworkDetector } from "./FrameworkDetector";
import { LanguageDetector } from "./LanguageDetector";
import { ArchitectureDetector } from "./ArchitectureDetector";

export class RepositoryProfiler {
  constructor(
    private frameworkDetector: FrameworkDetector = new FrameworkDetector(),
    private languageDetector: LanguageDetector = new LanguageDetector(),
    private architectureDetector: ArchitectureDetector = new ArchitectureDetector()
  ) {}

  public profile(
    packageJson: any, 
    files: string[], 
    directories: string[]
  ): RepositoryProfile {
    const framework = this.frameworkDetector.detect(packageJson);
    const packageManager = this.frameworkDetector.detectPackageManager(files);
    const testingFramework = this.frameworkDetector.detectTestingFramework(packageJson);
    const languages = this.languageDetector.detect(files);
    const architectureStyle = this.architectureDetector.detect(directories);

    // Confidence metric is entirely deterministic based on presence of key indicators
    let confidence = 0.0;
    if (framework) confidence += 0.3;
    if (packageManager) confidence += 0.2;
    if (languages.length > 0) confidence += 0.3;
    if (architectureStyle !== "standard") confidence += 0.2;

    return {
      framework,
      packageManager,
      testingFramework,
      architectureStyle,
      languages,
      confidence: Math.min(confidence, 1.0)
    };
  }
}
