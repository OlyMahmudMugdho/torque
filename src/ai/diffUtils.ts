export interface DiffHunkItem {
  type: 'context' | 'added' | 'deleted';
  line: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface FileDiffResult {
  path: string;
  originalContent: string;
  newContent: string;
  additions: number;
  deletions: number;
  diffHunks: DiffHunkItem[];
  unifiedDiff: string;
}

export interface ApplyPatchResult {
  success: boolean;
  content: string;
  error?: string;
}

/**
 * Computes an edit script using the Myers diff algorithm.
 */
function myersDiff(a: string[], b: string[]): Array<{ type: 'context' | 'added' | 'deleted'; line: string }> {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];

  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(new Int32Array(v));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) {
        x = v[k + 1 + max];
      } else {
        x = v[k - 1 + max] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[k + max] = x;
      if (x >= n && y >= m) {
        // Backtrack from (n, m) to (0, 0)
        const script: Array<{ type: 'context' | 'added' | 'deleted'; line: string }> = [];
        let curX = n;
        let curY = m;
        for (let d2 = d; d2 > 0; d2--) {
          const vPrev = trace[d2];
          const k2 = curX - curY;
          let prevK: number;
          if (k2 === -d2 || (k2 !== d2 && vPrev[k2 - 1 + max] < vPrev[k2 + 1 + max])) {
            prevK = k2 + 1;
          } else {
            prevK = k2 - 1;
          }
          const prevX = vPrev[prevK + max];
          const prevY = prevX - prevK;

          while (curX > prevX && curY > prevY) {
            script.unshift({ type: 'context', line: a[curX - 1] });
            curX--;
            curY--;
          }
          if (curX > prevX) {
            script.unshift({ type: 'deleted', line: a[curX - 1] });
            curX--;
          } else if (curY > prevY) {
            script.unshift({ type: 'added', line: b[curY - 1] });
            curY--;
          }
        }
        while (curX > 0 && curY > 0) {
          script.unshift({ type: 'context', line: a[curX - 1] });
          curX--;
          curY--;
        }
        return script;
      }
    }
  }
  return [];
}

/**
 * Computes additions, deletions, hunks, and a standard unified diff between original and updated file contents.
 */
export function computeFileDiff(
  path: string,
  original: string,
  updated: string,
  contextLines = 3
): FileDiffResult {
  const normOriginal = original.replace(/\r\n/g, '\n');
  const normUpdated = updated.replace(/\r\n/g, '\n');

  if (normOriginal === normUpdated) {
    return {
      path,
      originalContent: original,
      newContent: updated,
      additions: 0,
      deletions: 0,
      diffHunks: [],
      unifiedDiff: '',
    };
  }

  const origLines = normOriginal.length === 0 ? [] : normOriginal.split('\n');
  const updatedLines = normUpdated.length === 0 ? [] : normUpdated.split('\n');

  const rawOps = myersDiff(origLines, updatedLines);

  let oldLine = 1;
  let newLine = 1;
  let additions = 0;
  let deletions = 0;

  const numberedOps: DiffHunkItem[] = rawOps.map((op) => {
    if (op.type === 'context') {
      return {
        type: 'context',
        line: op.line,
        oldLineNo: oldLine++,
        newLineNo: newLine++,
      };
    } else if (op.type === 'deleted') {
      deletions++;
      return {
        type: 'deleted',
        line: op.line,
        oldLineNo: oldLine++,
      };
    } else {
      additions++;
      return {
        type: 'added',
        line: op.line,
        newLineNo: newLine++,
      };
    }
  });

  const changeIndices: number[] = [];
  for (let i = 0; i < numberedOps.length; i++) {
    if (numberedOps[i].type !== 'context') {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) {
    return {
      path,
      originalContent: original,
      newContent: updated,
      additions: 0,
      deletions: 0,
      diffHunks: [],
      unifiedDiff: '',
    };
  }

  // Group changed lines into hunk ranges based on contextLines
  const ranges: Array<{ start: number; end: number }> = [];
  let curStart = Math.max(0, changeIndices[0] - contextLines);
  let curEnd = Math.min(numberedOps.length - 1, changeIndices[0] + contextLines);

  for (let c = 1; c < changeIndices.length; c++) {
    const idx = changeIndices[c];
    const nextStart = Math.max(0, idx - contextLines);
    const nextEnd = Math.min(numberedOps.length - 1, idx + contextLines);

    if (nextStart <= curEnd + 1) {
      curEnd = Math.max(curEnd, nextEnd);
    } else {
      ranges.push({ start: curStart, end: curEnd });
      curStart = nextStart;
      curEnd = nextEnd;
    }
  }
  ranges.push({ start: curStart, end: curEnd });

  const diffHunks: DiffHunkItem[] = [];
  const cleanPath = path.replace(/^(\.\/|\/)+/, '');
  let unifiedDiff = `--- a/${cleanPath}\n+++ b/${cleanPath}`;

  for (const range of ranges) {
    const hunkLines = numberedOps.slice(range.start, range.end + 1);
    diffHunks.push(...hunkLines);

    let oldCount = 0;
    let newCount = 0;
    let oldStart: number | null = null;
    let newStart: number | null = null;

    for (const item of hunkLines) {
      if (item.type === 'context' || item.type === 'deleted') {
        oldCount++;
        if (oldStart === null && item.oldLineNo !== undefined) {
          oldStart = item.oldLineNo;
        }
      }
      if (item.type === 'context' || item.type === 'added') {
        newCount++;
        if (newStart === null && item.newLineNo !== undefined) {
          newStart = item.newLineNo;
        }
      }
    }

    if (oldStart === null) {
      oldStart = hunkLines[0].newLineNo !== undefined && hunkLines[0].newLineNo > 1 ? hunkLines[0].newLineNo - 1 : 0;
    }
    if (newStart === null) {
      newStart = hunkLines[0].oldLineNo !== undefined && hunkLines[0].oldLineNo > 1 ? hunkLines[0].oldLineNo - 1 : 0;
    }

    const oldHeader = oldCount === 1 ? `${oldStart}` : `${oldStart},${oldCount}`;
    const newHeader = newCount === 1 ? `${newStart}` : `${newStart},${newCount}`;
    unifiedDiff += `\n@@ -${oldHeader} +${newHeader} @@\n`;

    const body = hunkLines.map((h) => {
      const prefix = h.type === 'context' ? ' ' : h.type === 'added' ? '+' : '-';
      return `${prefix}${h.line}`;
    });
    unifiedDiff += body.join('\n');
  }

  return {
    path,
    originalContent: original,
    newContent: updated,
    additions,
    deletions,
    diffHunks,
    unifiedDiff,
  };
}

/**
 * Surgically replaces target with replacement within original content.
 */
export function applyFilePatch(
  original: string,
  target: string,
  replacement: string
): ApplyPatchResult {
  if (typeof original !== 'string') {
    return { success: false, content: '', error: 'Original content must be a string' };
  }
  if (!target || typeof target !== 'string') {
    return { success: false, content: original, error: 'Target string cannot be empty' };
  }
  if (!original.includes(target)) {
    return {
      success: false,
      content: original,
      error: `Target string not found in original content: "${target.length > 50 ? target.slice(0, 50) + '...' : target}"`,
    };
  }

  const content = original.split(target).join(replacement);
  return {
    success: true,
    content,
  };
}
