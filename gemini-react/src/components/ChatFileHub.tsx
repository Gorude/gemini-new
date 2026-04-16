import React from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  File, 
  Download, 
  Search,
  ArrowLeft,
  User as UserIcon,
  Bot
} from 'lucide-react';
import { type Message } from '../services/gemini';
import { type PendingFile } from '../types';

interface ChatFileHubProps {
  messages: Message[];
  onClose: () => void;
}

const ChatFileHub: React.FC<ChatFileHubProps> = ({ messages, onClose }) => {
  // Extrair todos os arquivos de todas as mensagens
  const allFiles = messages.flatMap(m => 
    (m.files || []).map(f => ({ ...f, sender: m.role, timestamp: m.id }))
  );

  const [filter, setFilter] = React.useState<'all' | 'images' | 'docs'>('all');
  const [search, setSearch] = React.useState('');

  const filteredFiles = allFiles.filter(f => {
    const matchesFilter = 
      filter === 'all' || 
      (filter === 'images' && f.mimeType.startsWith('image/')) ||
      (filter === 'docs' && !f.mimeType.startsWith('image/'));
    
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase());
    
    return matchesFilter && matchesSearch;
  });

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-6 h-6 text-blue-400" />;
    if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('text')) return <FileText className="w-6 h-6 text-emerald-400" />;
    return <File className="w-6 h-6 text-amber-400" />;
  };

  const handleDownload = (file: PendingFile) => {
    const link = document.createElement('a');
    link.href = `data:${file.mimeType};base64,${file.data}`;
    link.download = file.name;
    link.click();
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-main)] animate-in fade-in duration-300">
      {/* Header interno do Hub */}
      <div className="p-6 md:p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose}
              className="p-2.5 hover:bg-[var(--bg-chat-hover)] rounded-xl transition-all border border-transparent hover:border-[var(--border-light)] group"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)] group-hover:text-white" />
            </button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Arquivos do Chat</h2>
              <p className="text-xs text-[var(--text-placeholder)] mt-1 font-medium uppercase tracking-wider">
                {allFiles.length} {allFiles.length === 1 ? 'item encontrado' : 'itens encontrados'}
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar: Busca e Filtros */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-placeholder)]" />
            <input 
              type="text" 
              placeholder="Buscar pelo nome do arquivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--bg-chat-hover)] border border-[var(--border-light)] rounded-2xl pl-11 pr-4 py-3 outline-none focus:border-blue-500/50 transition-all text-sm"
            />
          </div>
          <div className="flex items-center gap-2 p-1 bg-[var(--bg-chat-hover)] border border-[var(--border-light)] rounded-2xl w-full md:w-auto">
            <button 
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filter === 'all' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-[var(--text-placeholder)] hover:text-white'}`}
            >
              Todos
            </button>
            <button 
              onClick={() => setFilter('images')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filter === 'images' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-[var(--text-placeholder)] hover:text-white'}`}
            >
              Imagens
            </button>
            <button 
              onClick={() => setFilter('docs')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filter === 'docs' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-[var(--text-placeholder)] hover:text-white'}`}
            >
              Documentos
            </button>
          </div>
        </div>
      </div>

      {/* Grid de Arquivos */}
      <div className="flex-1 overflow-y-auto px-6 md:px-8 pb-8 custom-scrollbar">
        {filteredFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
            <div className="w-20 h-20 bg-[var(--bg-chat-hover)] rounded-full flex items-center justify-center mb-6">
              <File className="w-10 h-10" />
            </div>
            <p className="text-lg font-medium">Nenhum arquivo encontrado</p>
            <p className="text-sm">Tente mudar o filtro ou a busca</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {filteredFiles.map((file, i) => (
              <div 
                key={i} 
                className="group relative bg-[var(--bg-chat-hover)] border border-[var(--border-light)] rounded-2xl overflow-hidden hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-900/10 transition-all duration-300 flex flex-col"
              >
                {/* Preview Area */}
                <div className="aspect-square w-full bg-black/20 flex items-center justify-center relative overflow-hidden">
                  {file.mimeType.startsWith('image/') ? (
                    <img 
                      src={`data:${file.mimeType};base64,${file.data}`} 
                      alt={file.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      {getFileIcon(file.mimeType)}
                      <span className="text-[10px] font-bold text-[var(--text-placeholder)] uppercase">{file.mimeType.split('/')[1]}</span>
                    </div>
                  )}
                  
                  {/* Overlay Actions */}
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={() => handleDownload(file)}
                      className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all transform scale-90 group-hover:scale-100 duration-300 shadow-xl"
                      title="Download"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Info Area */}
                <div className="p-3">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate" title={file.name}>
                    {file.name}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      {(file as any).sender === 'ai' ? (
                        <Bot className="w-3 h-3 text-blue-400" />
                      ) : (
                        <UserIcon className="w-3 h-3 text-[var(--text-placeholder)]" />
                      )}
                      <span className="text-[10px] text-[var(--text-placeholder)] font-medium">
                        {(file as any).sender === 'ai' ? 'IA' : 'Você'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatFileHub;
