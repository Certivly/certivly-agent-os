import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface ApprovalViewProps {
  data: {
    executionResult?: any;
    trustReport?: any;
    patchBundle?: any;
    patternReport?: any;
    repositorySummary?: any;
    planSummary?: any;
    impactReport?: any;
  };
  onApprove: () => void;
  onReject: () => void;
}

export const ApprovalView: React.FC<ApprovalViewProps> = ({ data, onApprove, onReject }) => {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [viewDiff, setViewDiff] = useState(false);

  const riskScore = data.planSummary?.riskScore ?? 0;
  const requiresSandbox = data.planSummary?.requiresSandbox ?? false;
  
  let riskColor = 'green';
  let riskLabel = 'LOW';
  if (riskScore > 50) {
    riskColor = 'red';
    riskLabel = 'HIGH';
  } else if (riskScore > 20) {
    riskColor = 'yellow';
    riskLabel = 'MEDIUM';
  }

  const patches = data.patchBundle?.patches ?? [];
  const fileSummary = data.repositorySummary ?? { files: 0, symbols: 0 };

  useInput((char, key) => {
    if (status !== 'pending') return;

    if (char.toLowerCase() === 'a') {
      setStatus('approved');
      onApprove();
    } else if (char.toLowerCase() === 'r') {
      setStatus('rejected');
      onReject();
    } else if (char.toLowerCase() === 'v') {
      setViewDiff(prev => !prev);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={riskColor} padding={1} marginY={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={riskColor}>[PROPOSED CHANGES & PATCH BUNDLE]</Text>
        <Text bold backgroundColor={riskColor} color="black"> RISK: {riskLabel} ({riskScore}%) </Text>
      </Box>

      {/* Summary Box */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>• Files indexed: <Text color="cyan">{fileSummary.files}</Text> | Symbols: <Text color="cyan">{fileSummary.symbols}</Text></Text>
        <Text>• Sandbox isolation: <Text color={requiresSandbox ? 'green' : 'yellow'}>{requiresSandbox ? 'ACTIVE' : 'INACTIVE'}</Text></Text>
        <Text>• Trust Evaluation: <Text color={data.trustReport?.passed ? 'green' : 'red'}>{data.trustReport?.passed ? 'PASSED' : 'FAILED'}</Text></Text>
        {data.trustReport?.regressions?.length > 0 && (
          <Text color="red">  ⚠️ Warning: Regressions detected in {data.trustReport.regressions.length} test paths</Text>
        )}
      </Box>

      {/* Changed Files */}
      <Text bold>Changed Files:</Text>
      {patches.length === 0 ? (
        <Text color="gray">  No file modifications proposed.</Text>
      ) : (
        patches.map((p: any, idx: number) => (
          <Text key={idx} color="white">
            {p.beforeHash ? (p.afterHash ? '  [Modify]' : '  [Delete]') : '  [Create]'} <Text color="cyan">{p.filePath || p.path}</Text>
          </Text>
        ))
      )}

      {/* Detailed Diff View */}
      {viewDiff && patches.length > 0 && (
        <Box flexDirection="column" marginTop={1} padding={1} backgroundColor="#1e1e1e">
          <Text bold color="yellow">Diff Preview:</Text>
          {patches.map((p: any, idx: number) => (
            <Box key={idx} flexDirection="column" marginTop={1}>
              <Text color="cyan">--- {p.filePath || p.path}</Text>
              {p.diff ? (
                p.diff.split('\n').map((line: string, i: number) => {
                  let color = 'white';
                  if (line.startsWith('+')) color = 'green';
                  else if (line.startsWith('-')) color = 'red';
                  return <Text key={i} color={color}>{line}</Text>;
                })
              ) : (
                <Text color="gray">Binary or empty diff</Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        {status === 'pending' ? (
          <Box flexDirection="row" justifyContent="space-between">
            <Text color="yellow">Press <Text bold color="green">[A]pprove</Text> to apply | <Text bold color="red">[R]eject</Text> to discard | <Text bold color="cyan">[V]iew diff</Text></Text>
            <Text color="gray">Waiting for user approval...</Text>
          </Box>
        ) : status === 'approved' ? (
          <Text bold color="green">✓ APPROVED: Patch bundle successfully applied to your workspace.</Text>
        ) : (
          <Text bold color="red">✗ REJECTED: Changes discarded. No modifications were made.</Text>
        )}
      </Box>
    </Box>
  );
};
