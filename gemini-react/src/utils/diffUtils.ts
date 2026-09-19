export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  totalChanges: number;
}

/**
 * Calcula a subsequência comum mais longa (LCS) entre arrays de linhas
 * para produzir um diff preciso linha por linha.
 */
export function computeLineDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = (oldStr || '').replace(/\r\n/g, '\n').split('\n');
  const newLines = (newStr || '').replace(/\r\n/g, '\n').split('\n');

  const m = oldLines.length;
  const n = newLines.length;

  // Proteção contra arquivos gigantes para evitar matriz O(M*N) excessiva
  if (m * n > 400_000) {
    // Fallback rápido baseado em blocos
    const result: DiffLine[] = [];
    oldLines.forEach((l, i) => result.push({ type: 'removed', content: l, oldLineNo: i + 1 }));
    newLines.forEach((l, i) => result.push({ type: 'added', content: l, newLineNo: i + 1 }));
    return result;
  }

  // Tabela DP para LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Reconstrução inversa do diff
  let i = m;
  let j = n;
  const reversed: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      reversed.push({
        type: 'unchanged',
        content: oldLines[i - 1],
        oldLineNo: i,
        newLineNo: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversed.push({
        type: 'added',
        content: newLines[j - 1],
        newLineNo: j,
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      reversed.push({
        type: 'removed',
        content: oldLines[i - 1],
        oldLineNo: i,
      });
      i--;
    }
  }

  return reversed.reverse();
}

/**
 * Produz um diff enfocado para edições cirúrgicas (edit_file), incluindo
 * algumas linhas de contexto antes e depois do trecho alterado caso o arquivo original seja fornecido.
 */
export function computeSnippetDiff(
  targetContent: string,
  replacementContent: string,
  fullOldContent?: string
): DiffLine[] {
  const normTarget = (targetContent || '').replace(/\r\n/g, '\n');
  const normRep = (replacementContent || '').replace(/\r\n/g, '\n');

  if (fullOldContent) {
    const normFull = fullOldContent.replace(/\r\n/g, '\n');
    const targetIdx = normFull.indexOf(normTarget);

    if (targetIdx !== -1) {
      // Trecho antes
      const beforeText = normFull.slice(0, targetIdx);
      const beforeLines = beforeText.split('\n');
      const startLineNo = Math.max(1, beforeLines.length - 2);
      const contextBefore = beforeLines.slice(-3).map((line, idx) => ({
        type: 'unchanged' as const,
        content: line,
        oldLineNo: startLineNo + idx,
        newLineNo: startLineNo + idx,
      }));

      // Removed (target)
      const targetLines = normTarget.split('\n');
      const removedLines: DiffLine[] = targetLines.map((line, idx) => ({
        type: 'removed' as const,
        content: line,
        oldLineNo: beforeLines.length + idx,
      }));

      // Added (replacement)
      const repLines = normRep.split('\n');
      const addedLines: DiffLine[] = repLines.map((line, idx) => ({
        type: 'added' as const,
        content: line,
        newLineNo: beforeLines.length + idx,
      }));

      // Trecho depois
      const afterText = normFull.slice(targetIdx + normTarget.length);
      const afterLines = afterText.split('\n');
      const contextAfter = afterLines.slice(1, 4).map((line, idx) => ({
        type: 'unchanged' as const,
        content: line,
        oldLineNo: beforeLines.length + targetLines.length + idx,
        newLineNo: beforeLines.length + repLines.length + idx,
      }));

      return [...contextBefore, ...removedLines, ...addedLines, ...contextAfter];
    }
  }

  // Se não encontrar o arquivo original ou for isolado, calcula o diff direto
  const targetLines = normTarget.split('\n');
  const repLines = normRep.split('\n');

  const removed: DiffLine[] = targetLines.map((content, idx) => ({
    type: 'removed',
    content,
    oldLineNo: idx + 1,
  }));

  const added: DiffLine[] = repLines.map((content, idx) => ({
    type: 'added',
    content,
    newLineNo: idx + 1,
  }));

  return [...removed, ...added];
}

/**
 * Extrai contadores de adições e deleções de um diff
 */
export function getDiffStats(lines: DiffLine[]): DiffStats {
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.type === 'added') additions++;
    else if (line.type === 'removed') deletions++;
  }

  return {
    additions,
    deletions,
    totalChanges: additions + deletions,
  };
}
