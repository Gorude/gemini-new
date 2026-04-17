import React from 'react';
import { 
  Globe, 
  Loader2, 
  ChevronDown, 
  X, 
  RotateCcw, 
  Copy, 
  Check, 
  FileText, 
  Trash2, 
  Download, 
  AlertCircle, 
  Lightbulb, 
  ChevronRight,
  Edit2,
  ShieldCheck
} from 'lucide-react';
import { type Message, safeMarkdown } from '../services/gemini';
import { MODEL_LIMITS } from '../constants';

interface MessageItemProps {
  msg: Message;
  isLoading: boolean;
  editingMsgId: string | null;
  editingMsgText: string;
  copiedId: string | null;
  expandedSourcesMsgId: string | null;
  imagenModel: string;
  isContext: boolean;
  onEditPrompt: (id: string, text: string) => void;
  onSaveEdit: (id: string) => void;
  onSetEditingMsgText: (text: string) => void;
  onCancelEdit: () => void;
  onRegenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, id: string) => void;
  onToggleSources: (id: string | null) => void;
  onFactCheck: (id: string) => void;
  onSelectionChange?: (text: string, pos: { x: number, y: number }, messageId: string) => void;
}

const MessageItem: React.FC<MessageItemProps> = React.memo(({
  msg,
  isLoading,
  editingMsgId,
  editingMsgText,
  copiedId,
  expandedSourcesMsgId,
  imagenModel,
  isContext,
  onEditPrompt,
  onSaveEdit,
  onSetEditingMsgText,
  onCancelEdit,
  onRegenerate,
  onDelete,
  onCopy,
  onToggleSources,
  onFactCheck,
  onSelectionChange
}) => {
  const handleMouseUp = () => {
    if (!onSelectionChange) return;

    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Enviar coordenadas e texto selecionado
      onSelectionChange(
        selection.toString().trim(),
        { x: rect.left + window.scrollX, y: rect.top + window.scrollY - 100 }, // Posicionar acima da seleção
        msg.id
      );
    }
  };
  const isEditing = editingMsgId === msg.id;

  return (
    <div id={`msg-${msg.id}`} className={`group/msg relative flex flex-col w-full mb-4 ${msg.role === 'ai' ? '' : 'items-end'} transition-all duration-300`}>
      {/* Context Indicator Line */}
      {isContext && (
        <div className="absolute -left-4 top-0 bottom-0 border-l-2 border-indigo-500/50 opacity-0 group-hover/msg:opacity-100 transition-opacity" title="Parte do contexto ativo"></div>
      )}

      {msg.role === 'ai' ? (
        <div className="ai-msg w-full">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 flex items-center justify-center relative">
              {!msg.text && (
                <div className="gemini-spinner absolute inset-0" />
              )}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.9961 24C12.3961 17.6 17.6039 12.4 24 12.0039C17.6039 11.6039 12.3961 6.4 11.9961 0C11.5961 6.4 6.39609 11.6039 0 12.0039C6.39609 12.4 11.5961 17.6 11.9961 24Z" fill="url(#geminiGrad)"/>
                <defs>
                  <linearGradient id="geminiGrad" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#4285F4"/><stop offset="0.5" stopColor="#9B72CB"/><stop offset="1" stopColor="#D96570"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Web Search Sources Icons */}
            {(msg.sources && msg.sources.length > 0 || msg.isSearching) && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-500 ml-1">
                {msg.isSearching && (!msg.sources || msg.sources.length === 0) && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-bold text-amber-500 animate-pulse">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce"></div>
                    {msg.thoughts && !msg.text ? "RACIOCINANDO..." : "PESQUISANDO..."}
                  </div>
                )}
                
                <div className="flex -space-x-1.5 overflow-hidden">
                  {msg.sources?.slice(0, 3).map((src: any, i: number) => {
                    let domain = "";
                    const isProxy = src.uri?.includes('vertexaisearch.cloud.google.com');
                    try {
                      if (isProxy && src.title) {
                        const match = src.title.match(/([a-z0-9-]+\.[a-z.]{2,})/i);
                        domain = match ? match[1].toLowerCase() : src.title.split(/[\s-]/)[0].toLowerCase() + ".com";
                      } else if (!src.uri) {
                        const match = src.title.match(/\[(.*?)\]/);
                        if (match) domain = match[1].toLowerCase();
                        else domain = src.title.split(/[\s-]/)[0].toLowerCase() + ".com";
                      } else {
                       try {
                         let cleanUri = src.uri;
                         if (!cleanUri.includes('://')) {
                           cleanUri = 'https://' + cleanUri.replace(/^\/+/, '');
                         }
                         domain = new URL(cleanUri).hostname;
                       } catch (e) {
                         domain = "google.com";
                       }
                      }
                    } catch(e) {}
                   return (
                     <a 
                       key={i} href={src.uri} target="_blank" rel="noopener noreferrer"
                       className="relative inline-block w-5 h-5 rounded-full border border-[var(--border-light)] bg-white overflow-hidden hover:scale-110 hover:z-10 transition-transform animate-in zoom-in-50 fade-in duration-300 shadow-sm"
                       title={src.title} style={{ animationDelay: `${i * 100}ms` }}
                     >
                       <img 
                         src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} 
                         alt="" 
                         className="w-full h-full object-cover" 
                         onError={(e) => { 
                           (e.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=google.com&sz=64`; 
                         }} 
                       />
                     </a>
                   );
                 })}
                  {msg.sources && msg.sources.length > 4 && (
                    <button onClick={(e) => { e.stopPropagation(); onToggleSources(expandedSourcesMsgId === msg.id ? null : msg.id); }} className="relative inline-block w-5 h-5 rounded-full border border-[var(--border-light)] bg-[var(--bg-chat-active)] flex items-center justify-center text-[8px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-user-bubble)] transition z-20">
                      +{msg.sources.length - 4}
                    </button>
                  )}
                </div>
                
                {msg.sources && msg.sources.length > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); onToggleSources(expandedSourcesMsgId === msg.id ? null : msg.id); }} className="text-[10px] font-bold text-[var(--text-secondary)] tracking-tight opacity-80 uppercase hover:text-[var(--text-primary)] transition flex items-center gap-1">
                    {msg.sources.length} {msg.sources.length === 1 ? 'fonte' : 'fontes'}
                    <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expandedSourcesMsgId === msg.id ? 'rotate-180' : ''}`} />
                  </button>
                )}

                {expandedSourcesMsgId === msg.id && msg.sources && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute top-10 left-10 bg-[var(--bg-sidebar)] shadow-2xl rounded-2xl p-3 min-w-[320px] max-w-[400px] z-[60] border border-[var(--border-light)] animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-2 px-1">
                      <h5 className="text-[10px] font-bold uppercase text-[var(--text-placeholder)] tracking-widest">Todas as Referências</h5>
                      <button onClick={() => onToggleSources(null)} className="text-[var(--text-placeholder)] hover:text-white"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="max-h-[250px] overflow-y-auto space-y-1 custom-scrollbar px-1">
                      {msg.sources.map((src, idx) => {
                        let d = "";
                        const isPx = src.uri.includes('vertexaisearch.cloud.google.com');
                        try { 
                           if (isPx && src.title) {
                              const match = src.title.match(/([a-z0-9-]+\.[a-z.]{2,})/i);
                              d = match ? match[1].toLowerCase() : src.title.split(/[\s-]/)[0].toLowerCase() + ".com";
                           } else {
                              const u = src.uri.replace(/^(https?:\/\/)?(www\.)?/, 'https://');
                              d = new URL(u).hostname;
                           }
                        } catch(e) {}
                        return (
                          <a key={idx} href={src.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition group">
                            <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=64`} className="w-4 h-4 rounded-sm shrink-0" alt="" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-[var(--text-primary)] font-medium truncate group-hover:text-blue-400 transition-colors">{src.title || 'Página da Web'}</span>
                              <span className="text-[9px] text-[var(--text-placeholder)] truncate">{src.uri}</span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(msg.isGrounded || (msg.sources && msg.sources.length > 0)) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-bold text-blue-400 animate-in fade-in slide-in-from-left-2 duration-500">
                <Globe className="w-3 h-3" />
                PESQUISADO NA WEB
              </div>
            )}

            {msg.isVerifying && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-bold text-amber-500 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                VERIFICANDO INFORMAÇÕES...
              </div>
            )}
          </div>

          {msg.thoughts && msg.thoughts.trim() && (
            <details className="thinking-drawer mb-3 group/think">
              <summary className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition select-none py-1.5 px-3 rounded-lg hover:bg-[var(--bg-user-bubble)]/50 w-fit">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium">Mostrar Raciocínio</span>
                <ChevronRight className="w-3 h-3 transition-transform group-open/think:rotate-90" />
              </summary>
              <div className="thought-content mt-2 pl-3 border-l-2 border-amber-500/30 text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {msg.thoughts}
              </div>
            </details>
          )}
          
          {msg.text.includes('❌ **Erro:**') ? (
             <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-4 border border-red-500/30 rounded-lg text-sm">
               <AlertCircle className="w-5 h-5 shrink-0" />
               <div dangerouslySetInnerHTML={{ __html: safeMarkdown(msg.text.replace('❌', '').trim()) }} />
             </div>
          ) : msg.text ? (
            <div 
              onMouseUp={handleMouseUp}
              className="response-body text-[var(--text-primary)] antialiased min-h-[1.5em]"
              dangerouslySetInnerHTML={{ 
                __html: msg.factCheckResults && msg.factCheckResults.length > 0 
                  ? (() => {
                      let textWithMarkers = msg.text;
                      const markers: Record<string, string> = {};
                      
                      const sortedResults = [...msg.factCheckResults].sort((a, b) => b.segment.length - a.segment.length);
                      
                      sortedResults.forEach((res, i) => {
                        const markerId = `FACTCHECKMARKER${i}`;
                        // Escape regex characters
                        const escapedSegment = res.segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        // Usar regex com suporte a múltiplos espaços para maior flexibilidade
                        const flexibleRegex = new RegExp(escapedSegment.split('\\ ').join('\\s+'), 'g');
                        
                        if (flexibleRegex.test(textWithMarkers)) {
                          const className = res.isVerified ? 'fact-verified' : 'fact-unverified';
                          const sourceLink = res.isVerified && res.sourceUrl 
                            ? `<a href="${res.sourceUrl}" target="_blank" class="fact-link" title="Ver fonte original">🔗</a>` 
                            : '';
                          
                          markers[markerId] = `<span class="${className}" title="${res.explanation || ''}">${res.segment}${sourceLink}</span>`;
                          textWithMarkers = textWithMarkers.replace(flexibleRegex, markerId);
                        }
                      });

                      // Converter Markdown
                      let finalHtml = safeMarkdown(textWithMarkers);
                      
                      // Injetar os destaques de volta no HTML final
                      Object.entries(markers).forEach(([id, htmlCode]) => {
                        // Usar replaceAll ou split/join para substituir todas as ocorrências do marcador
                        finalHtml = finalHtml.split(id).join(htmlCode);
                      });
                      
                      return finalHtml;
                    })()
                  : safeMarkdown(msg.text) 
              }}
            />
          ) : null}

          {msg.files && msg.files.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {msg.files.map((file, i) => (
                <div key={i} className="relative group/img rounded-2xl overflow-hidden shadow-2xl border border-[var(--border-light)] bg-black/20">
                  <img src={`data:${file.mimeType};base64,${file.data}`} className="w-full h-auto object-contain block max-h-[500px]" alt="Imagem Gerada" />
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex justify-between items-center">
                    <span className="text-[10px] text-white/70 font-medium">IMAGE GEN · {MODEL_LIMITS[imagenModel]?.name}</span>
                    <button 
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = `data:${file.mimeType};base64,${file.data}`;
                        link.download = file.name;
                        link.click();
                      }}
                      className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-sm"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mt-3 opacity-0 group-hover/msg:opacity-100 transition-opacity translate-y-1 group-hover/msg:translate-y-0 duration-300">
             <button onClick={() => onRegenerate(msg.id)} disabled={isLoading} className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition">
               <RotateCcw className={`w-4 h-4 ${isLoading && !msg.text ? 'animate-spin' : ''}`} />
             </button>
             <button onClick={() => onCopy(msg.text, msg.id + '-copy')} className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition">
               {copiedId === msg.id + '-copy' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
             </button>
             <button onClick={() => onCopy(`\`\`\`markdown\n${msg.text}\n\`\`\``, msg.id + '-md')} className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition">
               {copiedId === msg.id + '-md' ? <Check className="w-4 h-4 text-green-500" /> : <FileText className="w-4 h-4" />}
             </button>
             <button 
                onClick={() => onFactCheck(msg.id)} 
                disabled={isLoading || msg.isVerifying} 
                className={`text-[var(--text-placeholder)] hover:text-blue-400 transition flex items-center gap-1.5 ${msg.isVerifying ? 'text-blue-500 animate-pulse' : ''}`}
                title="Checar fatos na web"
              >
                {msg.isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {msg.factCheckResults && msg.factCheckResults.length > 0 && (
                  <span className="text-[10px] font-bold">FEITO</span>
                )}
              </button>
             <button onClick={() => onDelete(msg.id)} disabled={isLoading} className="text-[var(--text-placeholder)] hover:text-red-400 transition" >
               <Trash2 className="w-3.5 h-3.5" />
             </button>
             {msg.duration !== undefined && (
               <span className="text-[10px] font-normal text-[var(--text-placeholder)] opacity-60 ml-auto">
                 {msg.duration.toFixed(1)}s
               </span>
             )}
          </div>
        </div>
      ) : (
         <div className="flex flex-col items-end max-w-full md:max-w-[95%]">
           {msg.files && msg.files.length > 0 && (
             <div className="flex gap-2 mb-2 flex-wrap justify-end">
               {msg.files.map((f, i) => (
                 <div key={i} className="w-24 h-24 rounded-lg bg-[var(--bg-chat-active)] overflow-hidden border border-[var(--border-main)] opacity-90 relative group">
                   {f.mimeType.startsWith('image/') ? (
                     <img src={`data:${f.mimeType};base64,${f.data}`} className="object-cover w-full h-full" alt="upload" />
                   ) : (
                     <div className="flex flex-col items-center justify-center w-full h-full text-[10px] break-words p-2 text-center text-[var(--text-secondary)] bg-[var(--bg-sidebar)]">
                       <FileText className="w-6 h-6 mb-2 text-indigo-400 opacity-80" />
                       <span className="truncate w-full">{f.name}</span>
                     </div>
                   )}
                 </div>
               ))}
             </div>
           )}
           
           {isEditing ? (
             <div className="w-full flex flex-col gap-2 bg-[var(--bg-sidebar)] p-4 rounded-3xl border border-indigo-500/50 shadow-2xl">
               <textarea autoFocus className="w-full bg-transparent border-none outline-none text-[var(--text-primary)] resize-none" rows={3} value={editingMsgText} onChange={(e) => onSetEditingMsgText(e.target.value)} />
               <div className="flex justify-end gap-2">
                 <button onClick={onCancelEdit} className="px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">Cancelar</button>
                 <button onClick={() => onSaveEdit(msg.id)} className="px-4 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-full hover:bg-indigo-500 transition shadow-lg">Salvar e Enviar</button>
               </div>
             </div>
           ) : (
             <div className="relative group/user bubble-container">
               <div className="user-msg text-[var(--text-primary)] shadow-lg px-5 py-3 bg-[var(--bg-user-bubble)] rounded-3xl rounded-tr-sm">{msg.text}</div>
               <div className="flex items-center gap-3 mt-2 justify-end opacity-0 group-hover/user:opacity-100 transition-opacity">
                 <button onClick={() => onEditPrompt(msg.id, msg.text)} className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition" title="Editar prompt" >
                   <Edit2 className="w-3.5 h-3.5" />
                 </button>
                 <button onClick={() => onCopy(msg.text, msg.id)} className="text-[var(--text-placeholder)] hover:text-[var(--text-primary)] transition" title="Copiar prompt" >
                   {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                 </button>
                 <button onClick={() => onDelete(msg.id)} disabled={isLoading} className="text-[var(--text-placeholder)] hover:text-red-400 transition" title="Deletar mensagem" >
                   <Trash2 className="w-3.5 h-3.5" />
                 </button>
               </div>
             </div>
           )}
         </div>
      )}
    </div>
  );
});

export default MessageItem;
