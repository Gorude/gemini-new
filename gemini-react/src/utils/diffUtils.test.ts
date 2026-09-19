import { describe, it, expect } from 'vitest';
import { computeLineDiff, computeSnippetDiff, getDiffStats } from './diffUtils';

describe('diffUtils', () => {
  describe('computeLineDiff', () => {
    it('detecta linhas inalteradas, adicionadas e removidas', () => {
      const oldCode = 'linha 1\nlinha 2\nlinha 3';
      const newCode = 'linha 1\nlinha 2 modificada\nlinha 3\nlinha 4';

      const diff = computeLineDiff(oldCode, newCode);
      expect(diff.length).toBeGreaterThanOrEqual(4);

      const stats = getDiffStats(diff);
      expect(stats.additions).toBeGreaterThan(0);
      expect(stats.deletions).toBeGreaterThan(0);
    });

    it('trata arquivos idênticos sem adições ou deleções', () => {
      const code = 'function test() {\n  return true;\n}';
      const diff = computeLineDiff(code, code);

      expect(diff.every(d => d.type === 'unchanged')).toBe(true);
      const stats = getDiffStats(diff);
      expect(stats.additions).toBe(0);
      expect(stats.deletions).toBe(0);
    });
  });

  describe('computeSnippetDiff', () => {
    it('cria diff enfocado com targetContent e replacementContent', () => {
      const full = 'const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;';
      const target = 'const b = 2;';
      const rep = 'const b = 99;\nconst b2 = 100;';

      const diff = computeSnippetDiff(target, rep, full);
      expect(diff.some(d => d.type === 'removed' && d.content.includes('const b = 2'))).toBe(true);
      expect(diff.some(d => d.type === 'added' && d.content.includes('const b = 99'))).toBe(true);
      expect(diff.some(d => d.type === 'unchanged' && d.content.includes('const a = 1'))).toBe(true);
    });
  });
});
