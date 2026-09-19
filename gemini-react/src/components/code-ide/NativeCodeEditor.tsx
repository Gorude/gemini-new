import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { ChevronDown } from 'lucide-react';

interface NativeCodeEditorProps {
  code: string;
  onChange: (value: string) => void;
  activeFilePath: string;
  isLoading?: boolean;
  theme?: string;
  readOnly?: boolean;
}

export const NativeCodeEditor: React.FC<NativeCodeEditorProps> = ({
  code,
  onChange,
  activeFilePath,
  isLoading = false,
  theme = 'dark',
  readOnly = false,
}) => {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const userScrollTopRef = useRef<number>(0);
  const isAutoScrollingRef = useRef(false);
  const activeFilePathRef = useRef(activeFilePath);
  useEffect(() => { activeFilePathRef.current = activeFilePath; }, [activeFilePath]);
  const [userScrolledFile, setUserScrolledFile] = useState<string | null>(null);
  const userScrolledUp = userScrolledFile === activeFilePath;

  // Seleciona a extensão de linguagem adequada baseada na extensão do arquivo
  const extensions = useMemo(() => {
    const ext = activeFilePath.split('.').pop()?.toLowerCase();
    const exts = [
      EditorView.lineWrapping,
    ];

    if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') {
      exts.push(javascript({ jsx: true, typescript: ext.startsWith('t') }));
    } else if (ext === 'css') {
      exts.push(css());
    } else {
      // HTML como padrão (inclui suporte nativo a tags <style> e <script> embutidas)
      exts.push(html());
    }

    return exts;
  }, [activeFilePath]);

  // Captura eventos de rolagem da roda do mouse imediatamente para destravar o scroll sem fricção
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const scroller = container.querySelector('.cm-scroller') as HTMLElement | null;
      if (!scroller) return;

      if (e.deltaY < 0) {
        // Roda para CIMA: destrava imediatamente o auto-scroll e salva posição
        userScrolledUpRef.current = true;
        setUserScrolledFile(activeFilePathRef.current);
        userScrollTopRef.current = Math.max(0, scroller.scrollTop + e.deltaY);
      } else if (e.deltaY > 0) {
        // Roda para BAIXO: se chegou perto do rodapé, retoma o acompanhamento
        const dist = scroller.scrollHeight - (scroller.scrollTop + e.deltaY) - scroller.clientHeight;
        if (dist <= 30) {
          userScrolledUpRef.current = false;
          queueMicrotask(() => setUserScrolledFile(null));
        } else {
          userScrollTopRef.current = scroller.scrollTop + e.deltaY;
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Monitora scroll manual do usuário para não forçar a rolagem para baixo se ele inspecionar o código
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = (e: Event) => {
      if (isAutoScrollingRef.current) return;
      const target = e.target as HTMLElement;
      if (!target || !target.classList.contains('cm-scroller')) return;

      const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      userScrollTopRef.current = target.scrollTop;

      if (distanceFromBottom > 45) {
        userScrolledUpRef.current = true;
        setUserScrolledFile(activeFilePathRef.current);
      } else if (distanceFromBottom <= 20) {
        userScrolledUpRef.current = false;
        setUserScrolledFile(null);
      }
    };

    container.addEventListener('scroll', handleScroll, true);
    return () => container.removeEventListener('scroll', handleScroll, true);
  }, []);

  useEffect(() => {
    userScrolledUpRef.current = false;
    userScrollTopRef.current = 0;
  }, [activeFilePath]);

  // Gerencia a rolagem durante o streaming de código:
  // Se o usuário rolou para cima/inspecionando: MANTÉM a posição exata, impedindo que o CodeMirror resete para o topo (0).
  // Se o usuário está acompanhando: rola suavemente até o rodapé.
  useLayoutEffect(() => {
    const scroller = containerRef.current?.querySelector('.cm-scroller') as HTMLElement | null;
    if (!scroller) return;

    if (userScrolledUpRef.current) {
      if (userScrollTopRef.current !== undefined) {
        scroller.scrollTop = userScrollTopRef.current;
        requestAnimationFrame(() => {
          if (userScrolledUpRef.current && scroller && userScrollTopRef.current !== undefined) {
            scroller.scrollTop = userScrollTopRef.current;
          }
        });
      }
    } else if (isLoading) {
      isAutoScrollingRef.current = true;
      scroller.scrollTop = scroller.scrollHeight;
      requestAnimationFrame(() => {
        if (scroller && !userScrolledUpRef.current) {
          scroller.scrollTop = scroller.scrollHeight;
        }
        isAutoScrollingRef.current = false;
      });
    }
  }, [code, isLoading]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col overflow-hidden bg-zinc-950 native-code-editor select-text relative"
    >
      <CodeMirror
        ref={editorRef}
        value={code}
        height="100%"
        theme={theme === 'light' ? 'light' : oneDark}
        extensions={extensions}
        onChange={onChange}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          history: true,
          foldGutter: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
        style={{
          height: '100%',
          width: '100%',
          fontSize: '13px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        }}
      />

      {/* Botão flutuante para retomar acompanhamento quando o usuário rolou para inspecionar */}
      {userScrolledUp && isLoading && (
        <div className="absolute bottom-4 right-6 z-30 animate-in fade-in zoom-in-95 duration-200">
          <button
            type="button"
            onClick={() => {
              userScrolledUpRef.current = false;
              setUserScrolledFile(null);
              const scroller = containerRef.current?.querySelector('.cm-scroller') as HTMLElement | null;
              if (scroller) {
                isAutoScrollingRef.current = true;
                scroller.scrollTop = scroller.scrollHeight;
                requestAnimationFrame(() => {
                  isAutoScrollingRef.current = false;
                });
              }
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold shadow-lg shadow-black/60 transition-all hover:scale-105 active:scale-95"
            title="Rolar para acompanhar o código sendo gerado"
          >
            <ChevronDown className="w-4 h-4 animate-bounce" />
            <span>Acompanhar escrita</span>
          </button>
        </div>
      )}
    </div>
  );
};
