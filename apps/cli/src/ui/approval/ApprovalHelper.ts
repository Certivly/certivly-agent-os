export interface ApprovalWarning {
  type:
    | 'deletes_files'
    | 'touches_lockfile'
    | 'touches_package_scripts'
    | 'touches_ci'
    | 'touches_config'
    | 'large_diff'
    | 'binary_change';
  message: string;
}

export interface FileChangeInfo {
  path: string;
  kind?: 'add' | 'modify' | 'delete';
  diff?: string;
  isBinary?: boolean;
}

export interface ApprovalRequestData {
  id: string;
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  reason?: string;
  filesChanged: string[];
  addCount: number;
  modifyCount: number;
  deleteCount: number;
  diffPreview: string;
  fullDiff: string;
  verificationVerdict?: string;
  commandsRun: string[];
  warnings: ApprovalWarning[];
}

export function detectApprovalWarnings(files: FileChangeInfo[]): ApprovalWarning[] {
  const warnings: ApprovalWarning[] = [];

  // 1. deletes files
  const hasDelete = files.some(
    f => f.kind === 'delete' || (f.diff && /^(deleted file|--- a\/.*\n\+\+\+ \/dev\/null)/m.test(f.diff))
  );
  if (hasDelete) {
    warnings.push({
      type: 'deletes_files',
      message: 'Deletes files: One or more files are being deleted',
    });
  }

  // 2. touches lockfile
  const lockfileRegex = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock)$/i;
  const touchesLockfile = files.some(f => lockfileRegex.test(f.path));
  if (touchesLockfile) {
    warnings.push({
      type: 'touches_lockfile',
      message: 'Touches lockfile: Dependency lockfile is being modified',
    });
  }

  // 3. touches package scripts
  const touchesPackageScripts = files.some(
    f => /package\.json$/i.test(f.path) && (!f.diff || /"scripts"\s*:/i.test(f.diff))
  );
  if (touchesPackageScripts) {
    warnings.push({
      type: 'touches_package_scripts',
      message: 'Touches package scripts: package.json scripts configuration is being modified',
    });
  }

  // 4. touches CI
  const ciRegex = /(\.github\/(workflows|actions)|\.gitlab-ci\.ya?ml|\.circleci\/|Jenkinsfile|azure-pipelines\.ya?ml)/i;
  const touchesCi = files.some(f => ciRegex.test(f.path));
  if (touchesCi) {
    warnings.push({
      type: 'touches_ci',
      message: 'Touches CI: CI/CD workflow configuration is being modified',
    });
  }

  // 5. touches config
  const configRegex = /(\.config\.(js|ts|mjs|cjs|json)|tsconfig.*\.json|agentos\.config\.json|\.env(\..+)?|\.eslintrc.*|\.prettierrc.*)$/i;
  const touchesConfig = files.some(f => configRegex.test(f.path));
  if (touchesConfig) {
    warnings.push({
      type: 'touches_config',
      message: 'Touches config: Critical project configuration is being modified',
    });
  }

  // 6. large diff
  let totalDiffLines = 0;
  for (const f of files) {
    if (f.diff) {
      totalDiffLines += f.diff.split('\n').length;
    }
  }
  if (totalDiffLines > 300 || files.length >= 10) {
    warnings.push({
      type: 'large_diff',
      message: `Large diff: Changeset contains ${totalDiffLines} lines across ${files.length} files`,
    });
  }

  // 7. binary change
  const hasBinary = files.some(
    f => f.isBinary || (f.diff && /Binary files .* differ/i.test(f.diff))
  );
  if (hasBinary) {
    warnings.push({
      type: 'binary_change',
      message: 'Binary change: Non-text binary file modifications detected',
    });
  }

  return warnings;
}

export function projectApprovalState(eventPayload: {
  id?: string;
  sessionId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  reason?: string;
  files?: FileChangeInfo[];
  verificationVerdict?: string;
  commandsRun?: string[];
}): ApprovalRequestData {
  const toolName = eventPayload.toolName || 'tool';
  const args = eventPayload.args || {};
  const rawFiles = eventPayload.files || [];

  // If no files passed explicitly, try to extract file from tool args
  if (rawFiles.length === 0) {
    const candidatePath = (args.path || args.file || args.filePath || args.targetFile) as string | undefined;
    if (candidatePath) {
      const diff = (args.diff || args.content || args.patch) as string | undefined;
      rawFiles.push({
        path: candidatePath,
        kind: toolName === 'write_file' ? 'modify' : 'modify',
        diff,
      });
    }
  }

  let addCount = 0;
  let modifyCount = 0;
  let deleteCount = 0;

  for (const f of rawFiles) {
    if (f.kind === 'add') addCount++;
    else if (f.kind === 'delete') deleteCount++;
    else modifyCount++;
  }

  const filesChanged = rawFiles.map(f => f.path);
  const warnings = detectApprovalWarnings(rawFiles);

  const fullDiff = rawFiles.map(f => f.diff || `--- a/${f.path}\n+++ b/${f.path}`).join('\n\n');
  const previewLines = fullDiff.split('\n').slice(0, 15);
  const diffPreview = previewLines.join('\n') + (fullDiff.split('\n').length > 15 ? '\n...' : '');

  return {
    id: eventPayload.id || `appr-${Date.now()}`,
    sessionId: eventPayload.sessionId || 'default',
    toolName,
    args,
    reason: eventPayload.reason,
    filesChanged,
    addCount,
    modifyCount,
    deleteCount,
    diffPreview,
    fullDiff,
    verificationVerdict: eventPayload.verificationVerdict,
    commandsRun: eventPayload.commandsRun || [],
    warnings,
  };
}
