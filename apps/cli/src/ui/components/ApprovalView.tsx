import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import * as fs from 'fs';
import type { ApprovalRequestData, ApprovalWarning } from '../approval/ApprovalHelper';

export interface ApprovalViewProps {
  data?: {
    executionResult?: any;
    trustReport?: any;
    patchBundle?: any;
    patternReport?: any;
    repositorySummary?: any;
    planSummary?: any;
    impactReport?: any;
  };
  approvalData?: ApprovalRequestData;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onSavePatch?: (patchPath: string) => void;
}

export const ApprovalView: React.FC<ApprovalViewProps> = ({
  data = {},
  approvalData,
  onApprove,
  onReject,
  onSavePatch,
}) => {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [viewFullDiff, setViewFullDiff] = useState(false);
  const [denialInputMode, setDenialInputMode] = useState(false);
  const [denialReason, setDenialReason] = useState('User rejected proposal');
  const [patchSavedMsg, setPatchSavedMsg] = useState<string | null>(null);

  const filesChanged: string[] = approvalData?.filesChanged ?? (
    (data as any).files?.map((f: any) => typeof f === 'string' ? f : (f.path || f.filePath)) ||
    data.patchBundle?.patches?.map((p: any) => p.filePath || p.path) ||
    []
  );
  const addCount = approvalData?.addCount ?? 0;
  const modifyCount = approvalData?.modifyCount ?? filesChanged.length;
  const deleteCount = approvalData?.deleteCount ?? 0;
  const warnings = approvalData?.warnings ?? [];
  const commandsRun = approvalData?.commandsRun ?? [];
  const verificationVerdict = approvalData?.verificationVerdict ?? (data.trustReport?.passed ? 'verified' : undefined);

  const diffText = approvalData?.fullDiff || approvalData?.diffPreview || (data as any).diffPreview || (data as any).diff || (
    data.patchBundle?.patches?.map((p: any) => p.diff || `--- a/${p.path}\n+++ b/${p.path}`).join('\n\n') || ''
  );

  useInput((char, key) => {
    if (status !== 'pending') return;

    if (denialInputMode) {
      if (key.return) {
        setStatus('rejected');
        setDenialInputMode(false);
        onReject(denialReason);
      } else if (key.backspace || key.delete) {
        setDenialReason(prev => prev.slice(0, -1));
      } else if (char && !key.ctrl) {
        setDenialReason(prev => prev + char);
      }
      return;
    }

    const c = char.toLowerCase();
    if (c === 'a') {
      setStatus('approved');
      onApprove();
    } else if (c === 'd' || c === 'r') {
      setStatus('rejected');
      onReject(denialReason);
    } else if (c === 'v') {
      setViewFullDiff(prev => !prev);
    } else if (c === 's') {
      const patchPath = 'change.patch';
      try {
        fs.writeFileSync(patchPath, diffText || '# Empty patch\n', 'utf8');
        setPatchSavedMsg(`Saved patch to ${patchPath}`);
        if (onSavePatch) onSavePatch(patchPath);
      } catch (err: any) {
        setPatchSavedMsg(`Failed to save patch: ${err.message}`);
      }
    }
  });

  const hasWarnings = warnings.length > 0;
  const borderColor = hasWarnings ? 'yellow' : 'cyan';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} padding={1} marginY={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="column">
          <Text bold color={borderColor}>[APPROVAL REQUEST: {approvalData?.toolName || 'Changes Proposal'}]</Text>
          {((data as any).runId || (data as any).changeSetId) && (
            <Text color="gray">Run / ChangeSet ID: {(data as any).changeSetId || (data as any).runId}</Text>
          )}
        </Box>
        <Text bold color={hasWarnings ? 'yellow' : 'green'}>
          {hasWarnings ? `⚠️ ${warnings.length} WARNING(S)` : '✓ SAFE TO REVIEW'}
        </Text>
      </Box>

      {/* Changes Count & Verdict */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          • Files Changed: <Text bold color="cyan">{filesChanged.length}</Text> (
          <Text color="green">+{addCount}</Text> / <Text color="yellow">~{modifyCount}</Text> / <Text color="red">-{deleteCount}</Text>)
        </Text>
        {verificationVerdict && (
          <Text>
            • Verification Verdict: <Text bold color={verificationVerdict === 'verified' ? 'green' : 'red'}>{verificationVerdict.toUpperCase()}</Text>
          </Text>
        )}
        {commandsRun.length > 0 && (
          <Text>
            • Commands Run: <Text color="gray">{commandsRun.join(', ')}</Text>
          </Text>
        )}
      </Box>

      {/* Warnings Section */}
      {warnings.length > 0 && (
        <Box flexDirection="column" marginBottom={1} padding={1} borderColor="yellow" borderStyle="single">
          <Text bold color="yellow">Warnings:</Text>
          {warnings.map((w: ApprovalWarning, idx: number) => (
            <Text key={idx} color="yellow">  ⚠️ {w.message}</Text>
          ))}
        </Box>
      )}

      {/* Changed Files List */}
      <Text bold>Files to Modify:</Text>
      {filesChanged.length === 0 ? (
        <Text color="gray">  No files modified.</Text>
      ) : (
        filesChanged.map((file: string, idx: number) => (
          <Text key={idx} color="white">  - <Text color="cyan">{file}</Text></Text>
        ))
      )}

      {/* Diff Preview / Full Diff */}
      {diffText.trim().length > 0 && (
        <Box flexDirection="column" marginTop={1} padding={1} backgroundColor="#1e1e1e">
          <Text bold color="yellow">{viewFullDiff ? 'Full Diff:' : 'Diff Preview:'}</Text>
          {(viewFullDiff ? diffText : approvalData?.diffPreview || diffText.slice(0, 300))
            .split('\n')
            .map((line: string, i: number) => {
              let color = 'white';
              if (line.startsWith('+')) color = 'green';
              else if (line.startsWith('-')) color = 'red';
              else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) color = 'cyan';
              return <Text key={i} color={color}>{line}</Text>;
            })}
        </Box>
      )}

      {patchSavedMsg && (
        <Box marginTop={1}>
          <Text bold color="green">✓ {patchSavedMsg}</Text>
        </Box>
      )}

      {/* Action Footer */}
      <Box marginTop={1} flexDirection="column">
        {status === 'pending' ? (
          <Box flexDirection="column">
            <Text color="white">
              [<Text bold color="green">A</Text>]pprove | [<Text bold color="red">D</Text>]eny | [<Text bold color="cyan">V</Text>]iew Full Diff | [<Text bold color="magenta">S</Text>]ave Patch
            </Text>
            {denialInputMode && (
              <Box marginTop={1}>
                <Text color="red">Denial reason: </Text>
                <Text color="yellow">{denialReason}_</Text>
              </Box>
            )}
          </Box>
        ) : status === 'approved' ? (
          <Text bold color="green">✓ APPROVED</Text>
        ) : (
          <Text bold color="red">✗ DENIED: {denialReason}</Text>
        )}
      </Box>
    </Box>
  );
};
