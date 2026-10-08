import * as crypto from 'crypto';

export function computeSha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export interface DiffOp {
  type: 'equal' | 'delete' | 'insert';
  text: string;
}

export function computeMyersDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return b.map(line => ({ type: 'insert', text: line }));
  if (m === 0) return a.map(line => ({ type: 'delete', text: line }));

  const max = n + m;
  const vOffset = max;
  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];

  // d = 0 initialization
  let x0 = 0;
  let y0 = 0;
  while (x0 < n && y0 < m && a[x0] === b[y0]) {
    x0++;
    y0++;
  }
  v[0 + vOffset] = x0;
  trace.push(new Int32Array(v));

  if (x0 >= n && y0 >= m) {
    return backtrackMyers(trace, a, b, vOffset);
  }

  for (let d = 1; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[k - 1 + vOffset] < v[k + 1 + vOffset])) {
        x = v[k + 1 + vOffset];
      } else {
        x = v[k - 1 + vOffset] + 1;
      }
      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v[k + vOffset] = x;

      if (x >= n && y >= m) {
        trace.push(new Int32Array(v));
        return backtrackMyers(trace, a, b, vOffset);
      }
    }
    trace.push(new Int32Array(v));
  }

  return backtrackMyers(trace, a, b, vOffset);
}

function backtrackMyers(trace: Int32Array[], a: string[], b: string[], vOffset: number): DiffOp[] {
  let x = a.length;
  let y = b.length;
  const ops: DiffOp[] = [];

  for (let d = trace.length - 1; d > 0; d--) {
    const prevV = trace[d - 1];
    const k = x - y;

    let prevK: number;
    if (k === -d || (k !== d && prevV[k - 1 + vOffset] < prevV[k + 1 + vOffset])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = prevV[prevK + vOffset];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', text: a[x - 1] });
      x--;
      y--;
    }

    if (x === prevX) {
      ops.push({ type: 'insert', text: b[y - 1] });
      y--;
    } else {
      ops.push({ type: 'delete', text: a[x - 1] });
      x--;
    }
  }

  while (x > 0 && y > 0) {
    ops.push({ type: 'equal', text: a[x - 1] });
    x--;
    y--;
  }

  return ops.reverse();
}

/**
 * Generates a standard unified diff string between original and modified text.
 */
export function generateUnifiedDiff(
  original: string,
  modified: string,
  filename: string = 'file',
  contextLines: number = 3
): string {
  if (original === modified) {
    return '';
  }

  const cleanFilename = filename.replace(/\\/g, '/');

  // Handle new file
  if (!original) {
    const modLines = modified.split(/\r?\n/);
    if (modLines.length > 0 && modLines[modLines.length - 1] === '') {
      modLines.pop();
    }
    const count = modLines.length;
    return `--- /dev/null\n+++ b/${cleanFilename}\n@@ -0,0 +1,${count} @@\n${modLines.map(l => `+${l}`).join('\n')}\n`;
  }

  // Handle deleted file
  if (!modified) {
    const origLines = original.split(/\r?\n/);
    if (origLines.length > 0 && origLines[origLines.length - 1] === '') {
      origLines.pop();
    }
    const count = origLines.length;
    return `--- a/${cleanFilename}\n+++ /dev/null\n@@ -1,${count} +0,0 @@\n${origLines.map(l => `-${l}`).join('\n')}\n`;
  }

  const origLines = original.split(/\r?\n/);
  if (origLines.length > 0 && origLines[origLines.length - 1] === '') {
    origLines.pop();
  }
  const modLines = modified.split(/\r?\n/);
  if (modLines.length > 0 && modLines[modLines.length - 1] === '') {
    modLines.pop();
  }

  const ops = computeMyersDiff(origLines, modLines);

  // Annotate ops with 1-based line numbers
  interface AnnotatedOp {
    op: DiffOp;
    origLine: number;
    modLine: number;
  }

  const annotated: AnnotatedOp[] = [];
  let curOrig = 1;
  let curMod = 1;

  for (const op of ops) {
    annotated.push({
      op,
      origLine: curOrig,
      modLine: curMod,
    });
    if (op.type === 'equal') {
      curOrig++;
      curMod++;
    } else if (op.type === 'delete') {
      curOrig++;
    } else if (op.type === 'insert') {
      curMod++;
    }
  }

  // Group diff changes into hunks with context
  const changeIndices: number[] = [];
  for (let i = 0; i < annotated.length; i++) {
    if (annotated[i].op.type !== 'equal') {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) {
    return '';
  }

  interface HunkRange {
    start: number;
    end: number;
  }

  const hunkRanges: HunkRange[] = [];
  let currentHunk: HunkRange = {
    start: Math.max(0, changeIndices[0] - contextLines),
    end: Math.min(annotated.length - 1, changeIndices[0] + contextLines),
  };

  for (let i = 1; i < changeIndices.length; i++) {
    const idx = changeIndices[i];
    const changeStart = Math.max(0, idx - contextLines);
    const changeEnd = Math.min(annotated.length - 1, idx + contextLines);

    if (changeStart <= currentHunk.end) {
      currentHunk.end = Math.max(currentHunk.end, changeEnd);
    } else {
      hunkRanges.push(currentHunk);
      currentHunk = { start: changeStart, end: changeEnd };
    }
  }
  hunkRanges.push(currentHunk);

  // Render hunks
  const hunkTexts: string[] = [];

  for (const hunk of hunkRanges) {
    const hunkOps = annotated.slice(hunk.start, hunk.end + 1);
    const origCount = hunkOps.filter(o => o.op.type === 'equal' || o.op.type === 'delete').length;
    const modCount = hunkOps.filter(o => o.op.type === 'equal' || o.op.type === 'insert').length;

    const firstOrig = hunkOps.find(o => o.op.type === 'equal' || o.op.type === 'delete');
    const firstMod = hunkOps.find(o => o.op.type === 'equal' || o.op.type === 'insert');

    const origStart = firstOrig ? firstOrig.origLine : (hunkOps[0]?.origLine ?? 1);
    const modStart = firstMod ? firstMod.modLine : (hunkOps[0]?.modLine ?? 1);

    const header = `@@ -${origStart},${origCount} +${modStart},${modCount} @@`;
    const lines = hunkOps.map(o => {
      if (o.op.type === 'equal') return ` ${o.op.text}`;
      if (o.op.type === 'delete') return `-${o.op.text}`;
      return `+${o.op.text}`;
    });

    hunkTexts.push(`${header}\n${lines.join('\n')}`);
  }

  return `--- a/${cleanFilename}\n+++ b/${cleanFilename}\n${hunkTexts.join('\n')}\n`;
}
