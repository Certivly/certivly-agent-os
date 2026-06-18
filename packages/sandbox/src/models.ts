export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type FilePatch = {
  filePath: string;
  beforeHash: string;
  afterHash: string;
  diff: string;
};

export interface Sandbox {
  id: string;

  /**
   * Initializes the sandbox environment (e.g. creating directories, copying files, git worktree).
   */
  create(): Promise<void>;

  /**
   * Executes a shell command within the sandbox.
   * @param command The command string to run
   * @returns The execution result containing stdout, stderr, and exitCode.
   */
  execute(command: string): Promise<ExecutionResult>;

  /**
   * Reads a file from the sandbox.
   * @param filePath Relative path from sandbox root.
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Writes content to a file in the sandbox.
   * @param filePath Relative path from sandbox root.
   * @param content The new content.
   */
  writeFile(filePath: string, content: string): Promise<void>;

  /**
   * Computes patches for the modified files in the sandbox.
   */
  generatePatches(): Promise<FilePatch[]>;

  /**
   * Cleans up and destroys the sandbox environment.
   */
  destroy(): Promise<void>;
}
