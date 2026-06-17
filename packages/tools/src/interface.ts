import { JsonObject } from '@agent-os/shared';

export interface Tool {
  name: string;
  description: string;
  execute(args: JsonObject): Promise<string>;
}
