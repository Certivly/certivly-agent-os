import { GoalSignature } from "./GoalFingerprint";

export class GoalClassifier {
  public classify(signature: GoalSignature): string {
    return `${signature.action}:${signature.domain}:${signature.targetType}`;
  }
}
