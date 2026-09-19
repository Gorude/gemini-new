import React, { useMemo, useState } from 'react';
import { Check, Copy, FileCode, Plus, Minus, ChevronDown, ChevronRight } from 'lucide-react';
import { computeSnippetDiff, computeLineDiff, getDiffStats, type DiffLine } from '../../utils/diffUtils';

interface HarnessDiffViewerProps {
  diff: {
    targetContent?: string;
    replacementContent?: string;
    oldContent?: string;
    newContent?: string;
    isFullRewrite?: boolean;
  };
  path?: string;
  defaultExpanded?: boolean;
}

export const HarnessDiffViewer: React.FC<HarnessDiffViewerProps> = ({
  diff,
  path = '/index.html',
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Calcula as linhas do diff
  const diffLines = useMemo<DiffLine[]>(() => {
    if (diff.targetContent !== undefined && diff.replacementContent !== undefined) {
      return computeSnippetDiff(diff.targetContent, diff.replacementContent, diff.oldContent);
    }
    if (diff.oldContent !== undefined && diff.newContent !== undefined) {
      return computeLineDiff(diff.oldContent, diff.newContent);
    }
    if (diff.replacementContent) {
      return diff.replacementContent.split('\n').map((l, i) => ({
        type: 'added' as const,
        content: l,
        newLineNo: i + 1,
      }));
    }
    return [];
  }, [diff]);

  const stats = useMemo(() => getDiffStats(diffLines), [diffLines]);

  const handleCopy = () => {
    const textToCopy = diff.newContent || diff.replacementContent || '';
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (diffLines.length === 0) return null;

  return (
    <div className="w-full my-2 border border-(--border-light) bg-zinc-950/90 rounded-xl overflow-hidden shadow-md text-xs font-mono transition-all">
      {/* Cabeçalho do Diff */}
      <div className="px-3 py-2 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between select-none">
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="flex items-center gap-2 text-zinc-300 hover:text-white transition cursor-pointer"
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
          )}
          <FileCode className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-xs text-zinc-200">{path}</span>
          <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
            {diff.isFullRewrite ? 'Reescrita completa' : 'Edição cirúrgica'}
          </span>
        </button>

        <div className="flex items-center gap-2">
          {stats.additions > 0 && (
            <span className="flex items-center gap-0.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[10px] font-semibold">
              <Plus className="w-2.5 h-2.5" />
              {stats.additions}
            </span>
          )}
          {stats.deletions > 0 && (
            <span className="flex items-center gap-0.5 text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded text-[10px] font-semibold">
              <Minus className="w-2.5 h-2.5" />
              {stats.deletions}
            </span>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition ml-1"
            title="Copiar código modificado"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Corpo do Diff */}
      {isExpanded && (
        <div className="max-h-72 overflow-y-auto overflow-x-auto custom-scrollbar p-1 text-[11px] leading-5">
          {diffLines.map((line, idx) => {
            const isAdd = line.type === 'added';
            const isDel = line.type === 'removed';

            return (
              <div
                key={idx}
                className={`flex items-start font-mono transition-colors ${
                  isAdd
                    ? 'bg-emerald-500/15 text-emerald-300 border-l-2 border-emerald-500'
                    : isDel
                    ? 'bg-red-500/15 text-red-300 border-l-2 border-red-500'
                    : 'text-zinc-400 hover:bg-zinc-900/40'
                }`}
              >
                {/* Linha Antiga */}
                <span className="w-9 shrink-0 text-right pr-2 select-none text-[10px] text-zinc-400 opacity-60">
                  {line.oldLineNo ?? ''}
                </span>
                {/* Linha Nova */}
                <span className="w-9 shrink-0 text-right pr-2 select-none text-[10px] text-zinc-400 opacity-60">
                  {line.newLineNo ?? ''}
                </span>
                {/* Marcador (+ / - / espaço) */}
                <span className="w-4 shrink-0 text-center select-none font-bold opacity-80">
                  {isAdd ? '+' : isDel ? '-' : ' '}
                </span>
                {/* Conteúdo */}
                <span className="flex-1 whitespace-pre-wrap break-all pr-2">
                  {line.content || '\u00A0'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
