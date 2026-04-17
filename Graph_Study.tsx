import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import * as d3 from 'd3-force';

import { Panel, ActionButton, Slider, Modal, Icon, FloatingWindow } from './components/UI';
import { paintNode, paintLink, consolidateLinks } from './utils';
import type { NodeData, RawLink, Group, HoveredBead, ConsolidatedLink, PhysicsConfig } from './types';
import './index.css'; 

type ThemeMode = 'dark' | 'light' | 'system';

interface InternalNode { id: string; x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number; module?: string; }
interface InternalLink { source: string | InternalNode; target: string | InternalNode; name: string; curvature: number; card: string;}
interface EsquemaDB {
    id_esquema: string;
    nome_esquema: string;
}
interface ModuloDB {
    id_modulo: string;
    id_grupo: string | number | null;
}
interface ConexaoDB {
    modulo_origem: string;
    modulo_destino: string;
    tabela_origem: string;
    coluna_origem: string;
    tabela_destino: string;
    coluna_destino: string;
    cardinalidade: string;
}
interface GrupoDB {
    id_grupo: string | number;
    nome_grupo: string;
    cor_hexadecimal: string;
}
interface ImportLinkPayload {
    source: string;
    target: string;
    tableSource: string;
    colSource: string;
    tableTarget: string;
    colTarget: string;
    card: string;
}
interface UsuarioAtual {
    id_usuario: string; // <-- Alterado para string (UUID)
    login: string;
    funcao: 'admin' | 'edit' | 'obs';
    token: string;
}
interface UsuarioDB {
    id_usuario: string; // <-- Alterado para string (UUID)
    login: string;
    funcao: 'admin' | 'edit' | 'obs';
}

// Helper para ler o que tem dentro do token de forma segura
const decodificarToken = (token: string) => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
};

// Helper para ordenar resultados de pesquisa (Prioridade: Exato > Começa Com > Contém)
const ordenarPorRelevancia = (items: string[], query: string) => {
    // Como items já é uma cópia gerada pelo .filter(), usar o .sort() é seguro
    return items.sort((a, b) => {
        if (a === query && b !== query) return -1;
        if (b === query && a !== query) return 1;
        
        const aStarts = a.startsWith(query);
        const bStarts = b.startsWith(query);
        
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        
        return a.localeCompare(b); // Se tiverem o mesmo peso, desempata no alfabeto
    });
};

const App: React.FC = () => {
  const [helpTab, setHelpTab] = useState<'basico' | 'pathfinder' | 'visual' | 'editor' | 'admin'>('basico');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('ebs-accent') || '#7c4dff');
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [bgGraphColor, setBgGraphColor] = useState('#1e1e1e');
  const [showRenameSchema, setShowRenameSchema] = useState(false);
  const [renameSchemaValue, setRenameSchemaValue] = useState('');
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [listaUsuarios, setListaUsuarios] = useState<UsuarioDB[]>([]);
  const [showInternalArrows, setShowInternalArrows] = useState(true);
  const [internalArrowSize, setInternalArrowSize] = useState(4);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [isSwitchingSchema, setIsSwitchingSchema] = useState(false);

// Observadores para a Busca de Tabelas e Controle de Voo
  const pinnedSearchNodeRef = useRef<InternalNode | null>(null);
  const isFlyingRef = useRef<boolean>(false);

  // Função que solta a âncora e acorda o D3
  const releaseSearchPin = useCallback(() => {
      if (pinnedSearchNodeRef.current) {
          pinnedSearchNodeRef.current.fx = undefined;
          pinnedSearchNodeRef.current.fy = undefined;
          pinnedSearchNodeRef.current = null;
          if (internalGraphRef.current) internalGraphRef.current.d3ReheatSimulation();
      }
  }, []);

  // ==========================================
  // ESTADOS DO MINERADOR DE DADOS (BACKGROUND)
  // ==========================================
  const minerInputRef = useRef<HTMLInputElement>(null);
  const [isMining, setIsMining] = useState(false);
  const [miningProgress, setMiningProgress] = useState(0);
  const [miningTimeElapsed, setMiningTimeElapsed] = useState(0);
  const [miningStatusText, setMiningStatusText] = useState('Minerando...');
  const miningTimerRef = useRef<number | null>(null);
  
// ==========================================
  // ESTADOS DO TRAÇADOR DE CAMINHOS
  // ==========================================
  const [showPathfinder, setShowPathfinder] = useState(false);
  const [pathMode, setPathMode] = useState<'modulos' | 'tabelas'>('tabelas');
  const [pathSource, setPathSource] = useState('');
  const [pathTarget, setPathTarget] = useState('');
  const [sourceFocus, setSourceFocus] = useState(false);
  const [targetFocus, setTargetFocus] = useState(false);
  
  // Limite de Conexões no Meio (Agora de 0 a 3)
  const [pathLimit, setPathLimit] = useState(1);

  const [isPathfinding, setIsPathfinding] = useState(false);
  const [isCalculatingPath, setIsCalculatingPath] = useState(false); // NOVO: Indicador de Loading
  
  const [activePathNodes, setActivePathNodes] = useState<Set<string>>(new Set());
  const [activePathLinks, setActivePathLinks] = useState<Set<string>>(new Set());
  
  // Atualizado para incluir a propriedade 'isInternal'
  const [foundPathsList, setFoundPathsList] = useState<{ nodes: string[], steps: any[], score: number, isInternal: boolean }[] | null>(null);
  const [selectedPathIndex, setSelectedPathIndex] = useState(0);
  
  // NOVOS: Controles da lista de caminhos encontrados
  const [pathFilter, setPathFilter] = useState<'all' | 'internal' | 'external'>('all');
  const [visiblePathsLimit, setVisiblePathsLimit] = useState(25);

  const isPathfindingRef = useRef(false);
  const pathAnimationRef = useRef<number | null>(null);
  const [pathAnimState, setPathAnimState] = useState<{ id1: string, id2: string, sourceId: string, progress: number } | null>(null);
  
    const [newUser, setNewUser] = useState<{
        login: string; 
        senha: string; 
        funcao: 'admin' | 'edit' | 'obs' 
    }>({ 
        login: '', 
        senha: '', 
        funcao: 'obs' // Valor inicial permitido dentro da união
    });  
  // Estados de Autenticação
  // Lemos o localStorage assim que o React inicia. 
// Se tiver algo salvo lá, ele já começa logado.
const [usuarioAtual, setUsuarioAtual] = useState<UsuarioAtual | null>(() => {
    const tokenSalvo = localStorage.getItem('ebs_token'); // Agora busca só o token
    if (tokenSalvo) {
        const payload = decodificarToken(tokenSalvo);
        // Verifica se o token existe e se a data de expiração (exp) ainda é válida
        if (payload && payload.exp * 1000 > Date.now()) { 
            return {
                id_usuario: payload.id,
                login: payload.login,
                funcao: payload.funcao,
                token: tokenSalvo
            };
        } else {
            // Se expirou ou foi fraudado, limpa o lixo
            localStorage.removeItem('ebs_token'); 
        }
    }
    return null;
});
  const [loginInput, setLoginInput] = useState('');
  const [senhaInput, setSenhaInput] = useState('');
  const [loginErro, setLoginErro] = useState('');

// Centraliza as requisições para anexar o token automaticamente
  const fetchAutenticado = async (url: string, options: RequestInit = {}) => {
      const headers = {
          'Content-Type': 'application/json',
          ...options.headers,
          'Authorization': usuarioAtual?.token ? `Bearer ${usuarioAtual.token}` : ''
      };
      return fetch(url, { ...options, headers });
  };

  const [lockedNode, setLockedNode] = useState<NodeData | null>(null);

const carregarUsuarios = async () => {
    try {
        const res = await fetchAutenticado('http://172.30.100.193:3000/api/usuarios');
        const dados = await res.json();
        setListaUsuarios(dados);
    } catch (error) {
        console.error("Erro ao carregar usuários:", error);
    }
};

const handleCreateUser = async () => {
    if (!newUser.login || !newUser.senha) return;
    try {
        const res = await fetchAutenticado('http://172.30.100.193:3000/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newUser)
        });

        if (res.ok) {
            // Limpa o formulário
            setNewUser({ login: '', senha: '', funcao: 'obs' });
            // RECARREGA A LISTA IMEDIATAMENTE
            carregarUsuarios(); 
            alert("Usuário cadastrado com sucesso!");
        } else {
            alert("Falha no cadastro. Verifique o console do servidor.");
        }
    } catch (error) {
        console.error("Erro:", error);
    }
};

const handleDeleteUser = async (id: string) => {
    if (!confirm("Deseja realmente remover este usuário?")) return;
    try {
        await fetchAutenticado(`http://172.30.100.193:3000/api/usuarios/${id}`, { method: 'DELETE' });
        carregarUsuarios();
    } catch (error) {
        console.error("Erro ao deletar usuário:", error);
    }
};

  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginErro('');
      
      try {
          const res = await fetch('http://172.30.100.193:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: loginInput, senha: senhaInput })
        });
        
        if (!res.ok) throw new Error('Credenciais inválidas');
        
        // Pega só o token que o backend enviou
        const { token } = await res.json(); 
        
        // Abre o token na memória para montar o usuário ativo na tela
        const payload = decodificarToken(token);
        
        const dadosUsuario: UsuarioAtual = {
            id_usuario: payload.id,
            login: payload.login,
            funcao: payload.funcao,
            token: token
        };
        
        setUsuarioAtual(dadosUsuario);
        
        // OFUSCAÇÃO: Salva no bolso do navegador APENAS o código criptografado
        localStorage.setItem('ebs_token', token);
      } catch (err) { console.error(err); setLoginErro('Usuário ou senha incorretos.'); }
  };

const handleLogout = () => {
    // Agora ele deleta a chave ofuscada
    localStorage.removeItem('ebs_token');
    setUsuarioAtual(null);
    setNodes([]);
    setRawLinks([]);
    setActiveSchemaId('');
  };

  const handleDeleteNodeExecute = async () => {
      if (!deleteNodeConfirmId) return;
      try {
          const res = await fetchAutenticado(`http://172.30.100.193:3000/api/modulos/${activeSchemaId}/${deleteNodeConfirmId}`, { 
              method: 'DELETE' 
          });
          if (!res.ok) throw new Error('Erro ao deletar módulo');

          setNodes(prev => prev.filter(n => n.id !== deleteNodeConfirmId));
          setRawLinks(prev => prev.filter(r => r.source !== deleteNodeConfirmId && r.target !== deleteNodeConfirmId));
          
          setDeleteNodeConfirmId(null);
          setActiveNode(null); 
      } catch (error) {
          console.error("Detalhes da falha ao excluir:", error);
          alert('Falha ao deletar o módulo do banco de dados.');
      }
  };

  const handleRenameSchemaExecute = async () => {
      if (!renameSchemaValue.trim()) return;
      try {
          const response = await fetchAutenticado(`http://172.30.100.193:3000/api/esquemas/${activeSchemaId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nome_esquema: renameSchemaValue })
          });

          if (!response.ok) {
              const textData = await response.text();
              let errorMessage = `Erro HTTP: ${response.status}`;
              try {
                  const errData = JSON.parse(textData);
                  errorMessage = errData.error || errorMessage;
              } catch {
                  errorMessage = `Resposta do Servidor (Status ${response.status}): ${textData}`;
              }
              throw new Error(errorMessage);
          }

          setEsquemas(prev => prev.map(s => 
              s.id_esquema === activeSchemaId ? { ...s, nome_esquema: renameSchemaValue } : s
          ));
          
          setShowRenameSchema(false);
          setRenameSchemaValue('');
      } catch (error: unknown) {
          console.error("Erro ao renomear esquema:", error);
          if (error instanceof Error) {
              alert(`Falha detalhada: ${error.message}`);
          } else {
              alert("Ocorreu um erro desconhecido ao tentar renomear.");
          }
      }
  };

const handleCalculateClick = () => {
      setIsCalculatingPath(true);
      // Um pequeno delay para o React conseguir renderizar a UI de "Calculando..."
      setTimeout(() => {
          calculatePath();
          setIsCalculatingPath(false);
      }, 50);
  };

const clearPath = useCallback(() => {
      isPathfindingRef.current = false;
      setPathAnimState(null);
      if (pathAnimationRef.current) clearInterval(pathAnimationRef.current);
      setIsPathfinding(false);
      setActivePathNodes(new Set());
      setActivePathLinks(new Set());
      setFoundPathsList(null);
      setSelectedPathIndex(0);
  }, []);

  const startPathAnimation = (pNodes: string[], index: number = 0) => {
      isPathfindingRef.current = false;
      setPathAnimState(null);
      if (pathAnimationRef.current) clearInterval(pathAnimationRef.current);
      
      setSelectedPathIndex(index);
      setIsPathfinding(true);
      isPathfindingRef.current = true;
      setActivePathNodes(new Set([pNodes[0]]));
      setActivePathLinks(new Set());
      
      let step = 0;

      const animateNextLink = () => {
          if (!isPathfindingRef.current) return;
          if (step >= pNodes.length - 1) { setPathAnimState(null); return; }
          
          const src = pNodes[step];
          const tgt = pNodes[step + 1];
          const linkId = `${src}->${tgt}`;
          const linkIdReverse = `${tgt}->${src}`;
          
          const startTime = performance.now();
          const duration = 500; 
          
          const timer = setInterval(() => {
              if (!isPathfindingRef.current) { clearInterval(timer); return; }
              let p = (performance.now() - startTime) / duration;
              if (p >= 1) p = 1;
              setPathAnimState({ id1: linkId, id2: linkIdReverse, sourceId: src, progress: p });
              
              if (p >= 1) {
                  clearInterval(timer);
                  setActivePathNodes(prev => new Set(prev).add(tgt));
                  setActivePathLinks(prev => new Set(prev).add(linkId));
                  step++;
                  animateNextLink();
              }
          }, 16);
          pathAnimationRef.current = timer as unknown as number;
      };

      setTimeout(() => { if (isPathfindingRef.current) animateNextLink(); }, 300);
  };

  const calculatePath = () => {
      if (!pathSource || !pathTarget || pathSource === pathTarget) return;

      clearPath();
      setLockedNode(null);

      // Colunas que são armadilhas clássicas (Penalidade Alta)
      const BAD_COLS = new Set(['CURRENCY_CODE', 'CREATED_BY', 'LAST_UPDATED_BY', 'CREATION_DATE', 'LAST_UPDATE_DATE', 'ORG_ID', 'SET_OF_BOOKS_ID', 'LANGUAGE', 'REQUEST_ID', 'STATUS']);

      if (pathMode === 'modulos') {
          // Busca Básica para Módulos
          const adj = new Map<string, string[]>();
          nodes.forEach(n => adj.set(n.id, []));
          graphLinks.forEach(l => {
              const sId = typeof l.source === 'object' ? (l.source as NodeData)?.id : String(l.source);
              const tId = typeof l.target === 'object' ? (l.target as NodeData)?.id : String(l.target);
              if (sId && tId && sId !== tId) { adj.get(sId)?.push(tId); adj.get(tId)?.push(sId); }
          });

          const queue = [{ current: pathSource, pathNodes: [pathSource] }];
          // Adicione a tipagem isInternal: boolean aqui:
          const allFoundPaths: {nodes: string[], steps: any[], score: number, isInternal: boolean}[] = [];
          let iterations = 0;

          while (queue.length > 0 && iterations < 15000) {
              iterations++;
              const { current, pathNodes } = queue.shift()!;
              if (current === pathTarget) {
                  const isInt = pathNodes.length === 1 || pathNodes.every(m => m === pathNodes[0]);
                  allFoundPaths.push({ nodes: pathNodes, steps: [], score: pathNodes.length, isInternal: isInt });
                  if (allFoundPaths.length > 100) break; // Aumentamos o teto
                  continue;
              }
              if (pathNodes.length - 2 >= pathLimit) continue; // Respeita o limite do Seletor

              const neighbors = adj.get(current) || [];
              for (const n of neighbors) {
                  if (!pathNodes.includes(n)) queue.push({ current: n, pathNodes: [...pathNodes, n] });
              }
          }

          if (allFoundPaths.length === 0) { alert(`Nenhuma rota até ${pathLimit} conexões no meio encontrada.`); return; }
          
          allFoundPaths.sort((a,b) => a.score - b.score);
          setFoundPathsList(allFoundPaths);
          startPathAnimation(allFoundPaths[0].nodes, 0);

      } else {
          // Busca Inteligente para Tabelas (Com Scoring)
          const adjT = new Map<string, { neighbor: string, link: RawLink }[]>();
          uniqueTablesList.forEach(t => adjT.set(t, []));
          rawLinks.forEach(r => {
              if (r.tableSource !== r.tableTarget) {
                  adjT.get(r.tableSource)?.push({ neighbor: r.tableTarget, link: r });
                  adjT.get(r.tableTarget)?.push({ neighbor: r.tableSource, link: r });
              }
          });

          const queueT = [{ current: pathSource, pathNodes: [pathSource], pathEdges: [] as { tableA: string, link: RawLink, tableB: string }[] }];
          // Adicione a tipagem isInternal: boolean aqui também:
          const allFoundPaths: {nodes: string[], steps: any[], score: number, isInternal: boolean}[] = [];
          let iterations = 0;

          while (queueT.length > 0 && iterations < 20000) {
              iterations++;
              const { current, pathNodes, pathEdges } = queueT.shift()!;
              
              if (current === pathTarget) {
                  // SISTEMA DE PONTUAÇÃO (Menor é melhor)
                  let score = pathEdges.length * 10; 
                  pathEdges.forEach(e => {
                      const colS = e.link.colSource.toUpperCase();
                      const colT = e.link.colTarget.toUpperCase();
                      if (BAD_COLS.has(colS) || BAD_COLS.has(colT)) score += 1000; // Penalidade Severa
                      else if (!colS.includes('_ID') && !colT.includes('_ID')) score += 50; // Penalidade Leve
                      if (e.link.card === '1:1') score -= 5; // Recompensa
                  });

                  const tSteps = pathEdges.map((e, idx) => {
                      const isFwd = e.link.tableSource === e.tableA;
                      return {
                          stepIdx: idx + 1, tableA: e.tableA, colA: isFwd ? e.link.colSource : e.link.colTarget,
                          tableB: e.tableB, colB: isFwd ? e.link.colTarget : e.link.colSource,
                          modA: isFwd ? (typeof e.link.source === 'object' ? (e.link.source as any).id : e.link.source) : (typeof e.link.target === 'object' ? (e.link.target as any).id : e.link.target),
                          modB: isFwd ? (typeof e.link.target === 'object' ? (e.link.target as any).id : e.link.target) : (typeof e.link.source === 'object' ? (e.link.source as any).id : e.link.source)
                      };
                  });
                  
                  const rawModSequence = [tSteps[0].modA, ...tSteps.map(s => s.modB)];
                  const pNodes = rawModSequence.filter((mod, i, arr) => i === 0 || mod !== arr[i - 1]);

                  const isInt = pNodes.length === 1;

                  allFoundPaths.push({ nodes: pNodes, steps: tSteps, score, isInternal: isInt });
                  if (allFoundPaths.length >= 150) break; // Aumentamos o teto drasticamente
                  continue;
              }

              if (pathEdges.length > pathLimit) continue; // Respeita o Seletor Circular

              const neighbors = adjT.get(current) || [];
              for (const edge of neighbors) {
                  if (!pathNodes.includes(edge.neighbor)) {
                      queueT.push({
                          current: edge.neighbor, pathNodes: [...pathNodes, edge.neighbor],
                          pathEdges: [...pathEdges, { tableA: current, link: edge.link, tableB: edge.neighbor }]
                      });
                  }
              }
          }

          if (allFoundPaths.length === 0) { alert(`Nenhuma rota viável com até ${pathLimit} tabelas no meio encontrada.`); return; }

          allFoundPaths.sort((a,b) => a.score - b.score);
          setFoundPathsList(allFoundPaths);
          startPathAnimation(allFoundPaths[0].nodes, 0);
      }
  };

    useEffect(() => {
        document.body.style.setProperty('--accent', accentColor);
        let hex = accentColor.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const hoverR = Math.max(0, Math.floor(r * 0.85)).toString(16).padStart(2, '0');
        const hoverG = Math.max(0, Math.floor(g * 0.85)).toString(16).padStart(2, '0');
        const hoverB = Math.max(0, Math.floor(b * 0.85)).toString(16).padStart(2, '0');
        document.body.style.setProperty('--accent-hover', `#${hoverR}${hoverG}${hoverB}`);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        const textColor = yiq >= 128 ? '#111827' : '#ffffff';
        document.body.style.setProperty('--accent-text', textColor);
        localStorage.setItem('ebs-accent', accentColor);

        const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="48" fill="#121212" stroke="${accentColor}" stroke-width="2"/><path d="M25 30 Q 35 45, 50 50" stroke="${accentColor}" stroke-width="4" stroke-linecap="round"/><path d="M50 50 Q 65 55, 75 70" stroke="${accentColor}" stroke-width="4" stroke-linecap="round"/><circle cx="25" cy="30" r="7" fill="#1e1e1e" stroke="${accentColor}" stroke-width="3"/><circle cx="75" cy="70" r="7" fill="#1e1e1e" stroke="${accentColor}" stroke-width="3"/><circle cx="50" cy="50" r="14" fill="#1e1e1e" stroke="${accentColor}" stroke-width="5"/><g stroke="#ececec" stroke-width="1.5"><circle cx="50" cy="50" r="2" fill="currentColor"/><circle cx="44" cy="46" r="1.5" fill="currentColor"/><circle cx="56" cy="54" r="1.5" fill="currentColor"/><path d="M44 46 L 50 50 L 56 54" stroke-width="1"/></g></svg>`;      
        const head = document.getElementsByTagName('head')[0];
        const oldLink = document.querySelector("link[rel~='icon']");
        if (oldLink) head.removeChild(oldLink);
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.type = 'image/svg+xml';
        newLink.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;
        head.appendChild(newLink);
    }, [accentColor]);

  useEffect(() => {
    const root = document.body;
    let effectiveTheme = theme;
    if (theme === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = systemDark ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', effectiveTheme);
    setBgGraphColor(effectiveTheme === 'dark' ? '#1e1e1e' : '#e5e7eb');
  }, [theme]);

  const [isLoaded, setIsLoaded] = useState(false);
  const [activeSchemaId, setActiveSchemaId] = useState<string>('');
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [rawLinks, setRawLinks] = useState<RawLink[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  
  const [nodeSize, setNodeSize] = useState(30);
  const [physics, setPhysics] = useState<PhysicsConfig>({ linkDistance: 1000, repulsion: 1000, centralGravity: 0.03 });
  const [panels, setPanels] = useState({ settings: false, right: true });
  
  const [hoverNode, setHoverNode] = useState<NodeData | null>(null);
  const [hoverBead, setHoverBead] = useState<HoveredBead | null>(null);
  const tooltipDivRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, isChecking: false });

  const [searchQuery, setSearchQuery] = useState('');
  const [mainSearchFocus, setMainSearchFocus] = useState(false);
  const [activeNode, setActiveNode] = useState<NodeData | null>(null);
  const [returnToNode, setReturnToNode] = useState<NodeData | null>(null);
  

  const handleCloseEditingBead = () => {
      setEditingBead(null);
      if (returnToNode) {
          setActiveNode(returnToNode);
          setReturnToNode(null);
      }
  };
  
  const handleCloseInternalView = () => {
      setInternalViewNode(null);
      setInternalLockedNode(null);
      setInternalHoverNode(null);
      setInternalSearchQuery('');
      setInternalPhysics(true);
      setTableViewerMode('internal');
      if (returnToNode) {
          setActiveNode(returnToNode);
          setReturnToNode(null);
      }
  };

  const [internalHoverNode, setInternalHoverNode] = useState<string | null>(null);
  const [internalLockedNode, setInternalLockedNode] = useState<string | null>(null);
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [internalSearchFocus, setInternalSearchFocus] = useState(false);

  const [internalPhysics, setInternalPhysics] = useState(true);

  const [tableViewerMode, setTableViewerMode] = useState<'internal' | 'external'>('internal');

  const internalHoverNodeRef = useRef<string | null>(null);
  
  useEffect(() => { internalHoverNodeRef.current = internalHoverNode; }, [internalHoverNode]);

  const [showInternalList, setShowInternalList] = useState(false);
  const [internalViewNode, setInternalViewNode] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(25);

  const [newNodeConn, setNewNodeConn] = useState({ target: '', ts: '', tt: '', colS: '', colT: '', card: '1:N' });
  const [editingLine, setEditingLine] = useState<ConsolidatedLink | null>(null);
  const [newLineData, setNewLineData] = useState({ ts: '', tt: '', colS: '', colT: '', card: '1:N' });
  const [editingBead, setEditingBead] = useState<HoveredBead | null>(null);
  const [groupModalId, setGroupModalId] = useState<number | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [manualNode, setManualNode] = useState({ name: '', group: 0 });
  const [manualLink, setManualLink] = useState({ src: '', tgt: '', ts: '', tt: '', colS: '', colT: '', card: '1:N' });

  const [showSchemaDropdown, setShowSchemaDropdown] = useState(false);
  const [showCreateSchema, setShowCreateSchema] = useState(false);
  const [newSchemaName, setNewSchemaName] = useState('');
  const [showDeleteSchema, setShowDeleteSchema] = useState(false);
  const [deleteGroupConfirmId, setDeleteGroupConfirmId] = useState<number | null>(null);
  const [deleteNodeConfirmId, setDeleteNodeConfirmId] = useState<string | null>(null);

  const graphRef = useRef<React.ComponentRef<typeof ForceGraph2D> | undefined>(undefined);
  const internalGraphRef = useRef<React.ComponentRef<typeof ForceGraph2D> | undefined>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const [internalDim, setInternalDim] = useState({ w: 600, h: 360 });
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const uniqueTablesList = useMemo(() => {
      const tables = new Set<string>();
      rawLinks.forEach(r => { tables.add(r.tableSource); tables.add(r.tableTarget); });
      return Array.from(tables).sort();
  }, [rawLinks]);

  const handleToggleExpand = () => {
      if (expandTimeoutRef.current) clearTimeout(expandTimeoutRef.current);
      if (isExpanded) {
          setIsExpanded(false);
          setPhysics(prev => ({ ...prev, centralGravity: 0.05 }));
      } else {
          setIsExpanded(true);
          setPhysics(prev => ({ ...prev, centralGravity: 0.5 }));
          expandTimeoutRef.current = setTimeout(() => {
              setPhysics(prev => ({ ...prev, centralGravity: 0.0 }));
          }, 250);
      }
  };

  const tooltipScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const handleWheel = (e: WheelEvent) => {
          if ((hoverNode || internalHoverNode) && tooltipScrollRef.current) {
              const { scrollHeight, clientHeight } = tooltipScrollRef.current;
              if (scrollHeight > clientHeight) {
                  e.preventDefault();  
                  e.stopPropagation(); 
                  tooltipScrollRef.current.scrollTop += e.deltaY;
              }
          }
      };
      wrapper.addEventListener('wheel', handleWheel, { passive: false, capture: true });
      return () => wrapper.removeEventListener('wheel', handleWheel, { capture: true });
  }, [hoverNode, internalHoverNode]); 

  const hoverNodeRef = useRef<NodeData | null>(null);
  useEffect(() => { hoverNodeRef.current = hoverNode; }, [hoverNode]);

  // CONTROLE GLOBAL DE TECLADO (Atalhos e ESC)
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          
          // 1. O botão ESC sempre funciona, mesmo se o usuário estiver digitando
          if (e.key === 'Escape') {
              // Verifica do modal mais "acima" para o mais "abaixo" e fecha o primeiro que achar
              if (showThemeModal) { setShowThemeModal(false); return; }
              if (showHelpModal) { setShowHelpModal(false); return; }
              if (showAnalyticsModal) { setShowAnalyticsModal(false); return; }
              if (showUserManagement) { setShowUserManagement(false); return; }
              if (showCreateSchema) { setShowCreateSchema(false); return; }
              if (showDeleteSchema) { setShowDeleteSchema(false); return; }
              if (showRenameSchema) { setShowRenameSchema(false); return; }
              if (deleteGroupConfirmId !== null) { setDeleteGroupConfirmId(null); return; }
              if (deleteNodeConfirmId !== null) { setDeleteNodeConfirmId(null); return; }
              if (groupModalId !== null) { setGroupModalId(null); return; }
              
              if (editingBead !== null) { 
                  setEditingBead(null); 
                  if (returnToNode) { setActiveNode(returnToNode); setReturnToNode(null); }
                  return; 
              }
              if (editingLine !== null) { setEditingLine(null); return; }
              if (activeNode !== null) { setActiveNode(null); return; }
              if (showPathfinder) { setShowPathfinder(false); return; }
              
              // Fecha a Janela Flutuante Interna/Externa
              if (internalViewNode !== null) {
                  setInternalViewNode(null);
                  setInternalLockedNode(null);
                  setInternalHoverNode(null);
                  setInternalSearchQuery('');
                  setInternalPhysics(true);
                  setTableViewerMode('internal');
                  if (returnToNode) { setActiveNode(returnToNode); setReturnToNode(null); }
                  return;
              }
              
              // Limpa seleções no mapa
              if (isPathfindingRef.current) { clearPath(); return; }
              if (internalLockedNode !== null) { setInternalLockedNode(null); return; }
              if (lockedNode !== null) { setLockedNode(null); return; }
          }

          // 2. Bloqueia outras teclas (como T) se estiver digitando em um input
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

          // 3. Atalho de Trava de Foco Visual (Tecla T)
          if (e.key.toLowerCase() === 't') {
              if (isPathfindingRef.current) {
                  clearPath();
              } else if (internalViewNode) {
                  setInternalLockedNode(prev => prev ? null : internalHoverNodeRef.current);
              } else {
                  setLockedNode(prev => prev ? null : hoverNodeRef.current);
              }
          }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
      showThemeModal, showHelpModal, showAnalyticsModal, showUserManagement,
      showCreateSchema, showDeleteSchema, showRenameSchema, deleteGroupConfirmId,
      deleteNodeConfirmId, groupModalId, editingBead, editingLine, activeNode,
      showPathfinder, internalViewNode, internalLockedNode, lockedNode, returnToNode, clearPath
  ]);

const handleMineDataCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!activeSchemaId) {
          alert("Por favor, selecione ou crie um Esquema antes de enriquecer os dados.");
          if (minerInputRef.current) minerInputRef.current.value = '';
          return;
      }

      setIsMining(true);
      setMiningProgress(0);
      setMiningTimeElapsed(0);
      setMiningStatusText('Lendo e Minerando...');
      
      if (miningTimerRef.current) clearInterval(miningTimerRef.current);
      miningTimerRef.current = window.setInterval(() => {
          setMiningTimeElapsed(prev => prev + 1);
      }, 1000);

      const reader = new FileReader();
      
      reader.onload = (e) => {
          const text = e.target?.result as string;
          
          // TRUQUE DE ENGENHARIA: Usamos uma função real em vez de string literal
          // para evitar que o compilador do React quebre as expressões regulares.
          const workerFunction = () => {
              self.onmessage = function(e) {
                  try {
                      const text = e.data;
                      const lines = text.split(/\r?\n/);
                      const totalLines = lines.length;
                      const extractedConnections = [];
                      const seen = new Set(); 

                      const keywords = new Set(['SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'AND', 'OR', 'ORDER', 'GROUP', 'BY', 'HAVING', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'AS', 'IN', 'IS', 'NOT', 'NULL', 'LIKE', 'VIEW']);

                      // Regex nativo (sem problemas de escape de string)
                      const aliasRegex = /(?:FROM|JOIN|,)\s+([A-Z]+[A-Z0-9_]*)(?:\s+(?:AS\s+)?([A-Z0-9_]+))?/g;
                      const joinCondRegex = /([A-Z0-9_]+)\.([A-Z0-9_]+)\s*=\s*([A-Z0-9_]+)\.([A-Z0-9_]+)/g;

                      for (let i = 0; i < totalLines; i++) {
                          if (i === 0) continue; 
                          
                          const line = lines[i].toUpperCase();
                          // Object.create(null) evita conflito com funções nativas do JS como "constructor"
                          const aliasMap = Object.create(null);
                          
                          let matchAlias;
                          aliasRegex.lastIndex = 0;
                          while ((matchAlias = aliasRegex.exec(line)) !== null) {
                              const table = matchAlias[1];
                              const alias = matchAlias[2];
                              if (!keywords.has(table)) {
                                  if (alias && !keywords.has(alias)) aliasMap[alias] = table;
                                  aliasMap[table] = table;
                              }
                          }

                          let matchCond;
                          joinCondRegex.lastIndex = 0;
                          while ((matchCond = joinCondRegex.exec(line)) !== null) {
                              const alias1 = matchCond[1];
                              const col1 = matchCond[2];
                              const alias2 = matchCond[3];
                              const col2 = matchCond[4];

                              const table1 = aliasMap[alias1] || alias1;
                              const table2 = aliasMap[alias2] || alias2;

                              if (table1.includes('_') && table2.includes('_') && table1 !== table2) {
                                  if (table1.endsWith('_V') || table2.endsWith('_V') || table1.endsWith('_DFV') || table2.endsWith('_DFV')) continue;

                                  const linkId = table1 < table2 
                                    ? table1 + '.' + col1 + '-' + table2 + '.' + col2
                                    : table2 + '.' + col2 + '-' + table1 + '.' + col1;
                                    
                                  if (!seen.has(linkId)) {
                                      seen.add(linkId);
                                      const mod1 = table1.split('_')[0];
                                      const mod2 = table2.split('_')[0];

                                      let deducedCard = 'N:1';
                                      
                                      const t1 = table1.toUpperCase();
                                      const t2 = table2.toUpperCase();
                                      const c1 = col1.toUpperCase();
                                      const c2 = col2.toUpperCase();

                                      if ((t1.endsWith('_B') && t2.endsWith('_TL')) || (t1.endsWith('_TL') && t2.endsWith('_B'))) {
                                          deducedCard = '1:1';
                                      }
                                      else if (t1.includes('LINE') && t2.includes('HEADER')) {
                                          deducedCard = 'N:1'; 
                                      }
                                      else if (t1.includes('HEADER') && t2.includes('LINE')) {
                                          deducedCard = '1:N'; 
                                      }
                                      else if (c1 === c2 && (t1.includes(t2) || t2.includes(t1))) {
                                          deducedCard = '1:1'; 
                                      }
                                      else if (t1 === t2) {
                                          deducedCard = '1:N';
                                      }

                                      extractedConnections.push({ 
                                          tableSource: table1, colSource: col1, 
                                          tableTarget: table2, colTarget: col2,
                                          source: mod1, target: mod2, card: deducedCard 
                                      });
                                  }
                              }
                          }

                          if (i % 100 === 0 || i === totalLines - 1) {
                              const percent = Math.floor((i / totalLines) * 100);
                              self.postMessage({ type: 'progress', value: percent });
                          }
                      }

                      self.postMessage({ type: 'done', payload: extractedConnections });
                  } catch (err: any) {
                      self.postMessage({ type: 'error', message: err.toString() });
                  }
              };
          };

          // Transforma a função pura de volta em texto para o navegador injetar no Worker
          const workerCode = `(${workerFunction.toString()})()`;
          const blob = new Blob([workerCode], { type: 'application/javascript' });
          const worker = new Worker(URL.createObjectURL(blob));

          worker.onmessage = (msgEvent) => {
              const { type, value, payload, message } = msgEvent.data;
              
              if (type === 'error') {
                  clearInterval(miningTimerRef.current!);
                  setIsMining(false);
                  alert("Erro interno na leitura do arquivo: " + message);
                  worker.terminate();
              }
              else if (type === 'progress') {
                  setMiningProgress(value);
              } 
              else if (type === 'done') {
                  worker.terminate(); 
                  
                  if (payload && payload.length > 0) {
                      setMiningStatusText('Cruzando Dados...');
                      
                      const newNodesToSave: {id: string, group: number}[] = [];
                      const newLinksToSave: any[] = [];

                      const existingNodeIds = new Set(nodes.map(n => n.id));
                      payload.forEach((link: any) => {
                          if (!existingNodeIds.has(link.source)) {
                              existingNodeIds.add(link.source);
                              newNodesToSave.push({ id: link.source, group: 0 });
                          }
                          if (!existingNodeIds.has(link.target)) {
                              existingNodeIds.add(link.target);
                              newNodesToSave.push({ id: link.target, group: 0 });
                          }
                      });

                      const existingLinkIds = new Set(rawLinks.map(r => `${r.tableSource}.${r.colSource}-${r.tableTarget}.${r.colTarget}`));
                      payload.forEach((link: any) => {
                          const linkId = `${link.tableSource}.${link.colSource}-${link.tableTarget}.${link.colTarget}`;
                          if (!existingLinkIds.has(linkId)) {
                              existingLinkIds.add(linkId);
                              newLinksToSave.push(link);
                          }
                      });

                      if (newNodesToSave.length === 0 && newLinksToSave.length === 0) {
                          clearInterval(miningTimerRef.current!);
                          setIsMining(false);
                          alert("Mineração concluída! Todos os relacionamentos encontrados já existiam no banco.");
                          return;
                      }

                      setNodes(prev => [...prev, ...newNodesToSave]);
                      setRawLinks(prev => [...prev, ...newLinksToSave]);

                      setMiningStatusText('Salvando no Banco...');
                      setMiningProgress(0);
                      
                      const saveToDatabase = async () => {
                          let savedCount = 0;
                          const totalToSave = newNodesToSave.length + newLinksToSave.length;

                          for (const n of newNodesToSave) {
                              try {
                                  await fetchAutenticado('http://172.30.100.193:3000/api/modulos', {
                                      method: 'POST',
                                      body: JSON.stringify({ id_modulo: n.id, id_esquema: activeSchemaId, id_grupo: 0 })
                                  });
                              } catch (e) { console.error("Erro módulo", e); }
                              savedCount++;
                              setMiningProgress(Math.floor((savedCount / totalToSave) * 100));
                          }

                          for (const l of newLinksToSave) {
                              try {
                                  await fetchAutenticado('http://172.30.100.193:3000/api/conexoes', {
                                      method: 'POST',
                                      body: JSON.stringify({
                                          id_esquema: activeSchemaId, source: l.source, target: l.target,
                                          tableSource: l.tableSource, colSource: l.colSource,
                                          tableTarget: l.tableTarget, colTarget: l.colTarget, card: l.card
                                      })
                                  });
                              } catch (e) { console.error("Erro conexão", e); }
                              savedCount++;
                              setMiningProgress(Math.floor((savedCount / totalToSave) * 100));
                          }

                          clearInterval(miningTimerRef.current!);
                          setIsMining(false);
                          alert(`Enriquecimento concluído com sucesso em ${miningTimeElapsed} segundos!\n\nAdicionados e Salvos:\n- ${newNodesToSave.length} novos módulos\n- ${newLinksToSave.length} novas conexões.`);
                      };

                      saveToDatabase();
                      
                  } else {
                      clearInterval(miningTimerRef.current!);
                      setIsMining(false);
                      alert("Nenhuma conexão encontrada neste arquivo.");
                  }
              }
          };

          worker.postMessage(text);
      };
      
      reader.readAsText(file);
      if (minerInputRef.current) minerInputRef.current.value = '';
  };

const executeMainSearch = (targetQuery: string) => {
      // 1. Limpa e padroniza a query (maiúsculas)
      const rawQuery = targetQuery.trim().toUpperCase();
      if (!rawQuery) return;

      // 2. DICIONÁRIO DE SINÔNIMOS (Aliases)
      // Traduz o que o usuário digitou para o nome técnico do módulo no banco.
      const moduleAliases: Record<string, string> = {
                                                    'INV': 'MTL', 
                                                    'OM': 'OE', 
                                                    'RI': 'CLL', 
                                                    'IPROC': 'ICX',  
                                                    'PAC': 'CST'

      };

      // 3. Aplica a tradução. Se não houver sinônimo, usa a string original.
      const query = moduleAliases[rawQuery] || rawQuery;

      // 4. Tenta achar como Módulo (Usando a query TRADUZIDA)
      const targetModule = nodes.find(n => n.id === query);
      if (targetModule && graphRef.current && typeof targetModule.x === 'number' && typeof targetModule.y === 'number') {
          const zoomIdeal = 90 / nodeSize;
          graphRef.current.centerAt(targetModule.x, targetModule.y, 1000);
          graphRef.current.zoom(zoomIdeal, 1000);
          setLockedNode(targetModule); 
          return;
      }

      // 5. Tenta achar como Tabela (Busca Profunda) - Continua usando a string original traduzida
      const tableLink = rawLinks.find(r => r.tableSource === query || r.tableTarget === query);
      if (tableLink) {
          const parentModuleId = tableLink.tableSource === query ? tableLink.source : tableLink.target;
          const parentModule = nodes.find(n => n.id === parentModuleId);

          if (parentModule) {
              setLockedNode(null);
              setReturnToNode(parentModule);
              setTableViewerMode('internal'); 
              setInternalViewNode(parentModule.id);
              setInternalSearchQuery(query);

              setTimeout(() => {
                  window.dispatchEvent(new Event('maximize-janela-interna'));

                  let ticks = 0;
                  const finder = setInterval(() => {
                      ticks++;
                      const alvo = internalNodesRef.current.find(n => n.id === query);
                      
                      if (alvo && typeof alvo.x === 'number') {
                          if (ticks > 8) { 
                              clearInterval(finder);
                              
                              alvo.fx = alvo.x;
                              alvo.fy = alvo.y;

                              if (internalGraphRef.current) {
                                  internalGraphRef.current.centerAt(alvo.x, alvo.y, 500);
                                  internalGraphRef.current.zoom(8, 500);
                              }
                              
                              setInternalLockedNode(query);
                              
                              setTimeout(() => {
                                  if (internalGraphRef.current) {
                                      const z = internalGraphRef.current.zoom();
                                      internalGraphRef.current.zoom(z + 0.005, 0);
                                      setTimeout(() => internalGraphRef.current?.zoom(z, 0), 20);
                                  }
                              }, 200);

                          }
                      } else if (ticks > 25) { 
                          clearInterval(finder);
                          alert(`A tabela ${query} pertence ao módulo ${parentModule.id}, mas só tem conexões externas.`);
                      }
                  }, 100);
              }, 50);
              return;
          }
      }
      
      // 6. Não achou
      alert(`Nenhum Módulo ou Tabela encontrado com o nome "${rawQuery}".`);
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = async (e) => {
        const text = e.target?.result as string;
        if (!text) return;

        const lines = text.split(/\r?\n/);
        const uniqueModules = new Map<string, string>(); // Mapa: Modulo -> Nome do Grupo
        const newLinks: ImportLinkPayload[] = [];
        const groupNames = new Set<string>();

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.replace(/"/g, '').split(/[,;\t]/);
            
            if (parts.length >= 6) {
                const tableSource = parts[0].trim();
                const colSource = parts[1].trim();
                const tableTarget = parts[2].trim();
                const colTarget = parts[3].trim();
                const modSource = parts[4].trim() || 'INDEFINIDO';
                const modTarget = parts[5].trim() || 'INDEFINIDO';
                const card = parts[6] ? parts[6].trim() : 'N:1'; 
                
                // Lê as novas colunas geradas pelo SQL (Se não vierem, assume 'Outros')
                const groupSource = parts[7] ? parts[7].trim() : 'Outros';
                const groupTarget = parts[8] ? parts[8].trim() : 'Outros';

                // Vincula o módulo ao seu respectivo grupo
                uniqueModules.set(modSource, groupSource);
                uniqueModules.set(modTarget, groupTarget);
                groupNames.add(groupSource);
                groupNames.add(groupTarget);

                newLinks.push({
                    source: modSource, target: modTarget,
                    tableSource, colSource, tableTarget, colTarget,
                    card: card
                });
            }
        }

        // Paleta de cores para identificar facilmente as áreas de negócio
        const groupColors: Record<string, string> = {
            'SCM & Manufatura': '#e67e22',
            'Financas': '#27ae60',
            'Localizacoes': '#c0392b',
            'Projetos': '#8e44ad',
            'Recursos Humanos': '#e84393',
            'CRM': '#2980b9',
            'Tecnologia & Fundacao': '#34495e',
            'Manufatura de Processos': '#d35400',
            'Contratos': '#f1c40f',
            'Setor Publico': '#16a085',
            'Inteligencia & Web': '#00cec9',
            'Outros': '#7f8c8d'
        };

        // Transforma o Set de nomes em uma lista de objetos Grupo
        const groupMap = new Map<string, number>();
        const newGroups = Array.from(groupNames).map((name, index) => {
            const id_grupo = Date.now() + index; // Gera um ID numérico único
            groupMap.set(name, id_grupo);
            return {
                id_grupo,
                nome_grupo: name,
                cor_hexadecimal: groupColors[name] || '#cccccc' // Puxa da paleta ou cinza
            };
        });

        // Transforma o Mapa de módulos no formato que o backend espera (agora com id_grupo)
        const newNodes = Array.from(uniqueModules.entries()).map(([id, groupName]) => ({ 
            id, 
            id_grupo: groupMap.get(groupName) || null 
        }));

        const newId = `csv_${Date.now()}`;
        const newName = `Importação DBeaver (${new Date().toLocaleDateString()})`;

        try {
            // Envia modulos, conexoes E grupos para o backend
            const response = await fetchAutenticado('http://172.30.100.193:3000/api/importar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_esquema: newId, nome_esquema: newName, modulos: newNodes, conexoes: newLinks, grupos: newGroups })
            });

            if (!response.ok) {
                const textData = await response.text();
                throw new Error(`Falha do Servidor: ${textData}`);
            }

            setEsquemas((prev: EsquemaDB[]) => [...prev, { id_esquema: newId, nome_esquema: newName }]);
            switchSchema(newId);
            alert("Importação concluída com sucesso! Os grupos foram criados.");
        } catch (error: unknown) {
            console.error("Falha na importação:", error);
            if (error instanceof Error) {
                alert(`Falha ao salvar no banco: ${error.message}`);
            } else {
                alert("Ocorreu um erro crítico e desconhecido.");
            }
        }

        if (csvInputRef.current) csvInputRef.current.value = '';
    };
    reader.readAsText(file);
};

  const analyticsData = useMemo(() => {
      const uniqueTables = new Set<string>();
      let internalCount = 0;
      let externalCount = 0;

      rawLinks.forEach(link => {
          uniqueTables.add(link.tableSource);
          uniqueTables.add(link.tableTarget);
          if (link.source === link.target) internalCount++;
          else externalCount++;
      });

      return {
          modules: nodes.length,
          totalConnections: rawLinks.length,
          internalConnections: internalCount,
          externalConnections: externalCount,
          tables: uniqueTables.size,
          groups: groups.length
      };
  }, [nodes, rawLinks, groups]);

  const [esquemas, setEsquemas] = useState<EsquemaDB[]>([]);

  useEffect(() => {
      const carregarEsquemasDoBanco = async () => {
          try {
              const resposta = await fetchAutenticado('http://172.30.100.193:3000/api/esquemas');
              if (!resposta.ok) throw new Error('Falha ao comunicar com a API local');
              
              const dados: EsquemaDB[] = await resposta.json();
              setEsquemas(dados);
              
              if (dados.length > 0) {
                  const idParaCarregar = dados.find(e => e.id_esquema === activeSchemaId) 
                      ? activeSchemaId 
                      : dados[0].id_esquema;
                  switchSchema(idParaCarregar);
              } else {
                  setIsLoaded(true);
              }
          } catch (erro) {
              console.error("Erro na conexão com o backend local:", erro);
              setIsLoaded(true);
          }
      };

      if (usuarioAtual) {
          carregarEsquemasDoBanco();
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioAtual]);

  const switchSchema = async (id: string) => {
      setIsSwitchingSchema(true); // <--- LIGA O LOADING AQUI
      setShowSchemaDropdown(false); // Fecha o menu imediatamente ao clicar
      
      try {
          const [resModulos, resConexoes, resGrupos, resConfig] = await Promise.all([
              fetchAutenticado(`http://172.30.100.193:3000/api/modulos/${id}`),
              fetchAutenticado(`http://172.30.100.193:3000/api/conexoes/${id}`),
              fetchAutenticado(`http://172.30.100.193:3000/api/grupos/${id}`),
              fetchAutenticado(`http://172.30.100.193:3000/api/configuracoes/${id}`)
          ]);

          if (!resModulos.ok || !resConexoes.ok || !resGrupos.ok) {
              throw new Error('Falha ao buscar detalhes do esquema.');
          }

          const dbModulos: ModuloDB[] = await resModulos.json();
          const dbConexoes: ConexaoDB[] = await resConexoes.json();
          const dbGrupos: GrupoDB[] = await resGrupos.json();
          const dbConfig = resConfig.ok ? await resConfig.json() : null;

          setNodes(dbModulos.map(m => ({ id: m.id_modulo, group: m.id_grupo ? Number(m.id_grupo) : 0 })));
          setRawLinks(dbConexoes.map(c => ({
              source: c.modulo_origem, target: c.modulo_destino,
              tableSource: c.tabela_origem, colSource: c.coluna_origem,
              tableTarget: c.tabela_destino, colTarget: c.coluna_destino, card: c.cardinalidade
          })));
          setGroups(dbGrupos.map(g => ({ id: Number(g.id_grupo), name: g.nome_grupo, color: g.cor_hexadecimal })));

          setActiveSchemaId(id);

          if (dbConfig) {
              // Força o tamanho 25 (ou outro que você escolheu) ignorando a memória do banco, mas preserva a física
              setNodeSize(25); 
              setPhysics({ linkDistance: Number(dbConfig.link_distance), repulsion: Number(dbConfig.repulsion), centralGravity: Number(dbConfig.central_gravity) });
          } else {
              setNodeSize(15);
              setPhysics({ linkDistance: 60, repulsion: 400, centralGravity: 0.00 });
          }
      } catch (error) {
          console.error("Erro ao carregar dados do esquema:", error);
      } finally {
          setInternalViewNode(null);
          setIsLoaded(true);
          setIsSwitchingSchema(false); // <--- DESLIGA O LOADING AQUI
      }
  };

    const handleCreateSchema = async () => {
        if (!newSchemaName.trim()) return;
        const newId = `esq_${Date.now()}`;
        
        try {
            const response = await fetchAutenticado('http://172.30.100.193:3000/api/esquemas', {
                method: 'POST',
                body: JSON.stringify({ id_esquema: newId, nome_esquema: newSchemaName })
            });

            if (!response.ok) throw new Error('Erro ao criar esquema');

            setEsquemas(prev => [...prev, { id_esquema: newId, nome_esquema: newSchemaName }]);
            switchSchema(newId);
            setNewSchemaName('');
            setShowCreateSchema(false);
            
        } catch (error) {
            console.error("Falha na criação:", error);
            alert("Erro ao criar nova área de trabalho no banco de dados.");
        }
    };

  const handleDeleteSchema = async () => {
      try {
          const res = await fetchAutenticado(`http://172.30.100.193:3000/api/esquemas/${activeSchemaId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Erro ao deletar esquema');
          
          const newSchemas = esquemas.filter(s => s.id_esquema !== activeSchemaId);
          setEsquemas(newSchemas);
          if (newSchemas.length > 0) switchSchema(newSchemas[0].id_esquema);
          else {
              setNodes([]); setRawLinks([]); setActiveSchemaId('');
          }
          setShowDeleteSchema(false);
      } catch (error) {
          console.error("Detalhes da falha:", error);
          alert('Falha ao deletar a Área de Trabalho.');
      }
  };

  const exportCurrentSchema = () => {
      const active = esquemas.find(s => s.id_esquema === activeSchemaId);
      if (!active) return;
      const dataStr = JSON.stringify({ name: active.nome_esquema, nodes, rawLinks, groups }, null, 2); 
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EBS-Schema-${active.nome_esquema.replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Esta função era do localStorage antigo. Removida a lógica direta, 
      // mas mantida caso precise de adaptação posterior. O CSV atende a requisição atual.
      alert("Por favor, utilize a importação via CSV para popular o banco de dados.");
      e.target.value = '';
  };

  const [attractGroups, setAttractGroups] = useState(false);
  const [hiddenGroups, setHiddenGroups] = useState<Set<number>>(new Set());
  const [showBeads, setShowBeads] = useState(false);
  
  const graphData = useMemo(() => { 
      // Devolvemos todos os dados crus para a física ficar 100% estável e não causar terremotos
      return { nodes: nodes, links: consolidateLinks(rawLinks) }; 
  }, [nodes, rawLinks]);

  const graphLinks = graphData.links;
  // Se o rastreio estiver rodando, criamos um "foco fantasma" para apagar os outros nós
// Falso foco seguro (com coordenadas) para não quebrar a matemática do Canvas
  // Falso foco seguro para não quebrar a matemática do Canvas
  const dummyFocus: NodeData = { id: '___PATH___', x: 0, y: 0, vx: 0, vy: 0, group: 0 };
  const focusNode = isPathfinding ? dummyFocus : (lockedNode || hoverNode);

  const { highlightNodes, highlightLinks } = useMemo(() => {
      // Se a animação estiver ocorrendo, pegamos as chaves em texto e ativamos os links reais
      if (isPathfinding) {
          const hLinks = new Set<ConsolidatedLink>();
          graphLinks.forEach(link => {
              const sId = typeof link.source === 'object' ? (link.source as NodeData)?.id : link.source;
              const tId = typeof link.target === 'object' ? (link.target as NodeData)?.id : link.target;
              if (sId && tId) {
                  // Checa o identificador nas duas direções
                  const linkId1 = `${sId}->${tId}`;
                  const linkId2 = `${tId}->${sId}`;
                  if (activePathLinks.has(linkId1) || activePathLinks.has(linkId2)) hLinks.add(link);
              }
          });
          return { highlightNodes: activePathNodes, highlightLinks: hLinks };
      }

      const hNodes = new Set<string>();
      const hLinks = new Set<ConsolidatedLink>();
      if (focusNode && focusNode.id !== '___PATH___') {
          hNodes.add(focusNode.id);
          graphLinks.forEach(link => {
              if (!link) return;
              const sId = typeof link.source === 'object' ? (link.source as NodeData)?.id : link.source;
              const tId = typeof link.target === 'object' ? (link.target as NodeData)?.id : link.target;
              if (sId === focusNode.id || tId === focusNode.id) {
                  hLinks.add(link);
                  if (sId) hNodes.add(sId as string);
                  if (tId) hNodes.add(tId as string);
              }
          });
      }
      return { highlightNodes: hNodes, highlightLinks: hLinks };
  }, [focusNode, graphLinks, isPathfinding, activePathNodes, activePathLinks]);


  const internalGraphData = useMemo(() => {
      if (!internalViewNode) return { nodes: [], links: [] };
      
      if (tableViewerMode === 'internal') {
          // LÓGICA ANTIGA (Apenas Internos)
          const internalRawLinks = rawLinks.filter(r => r.source === internalViewNode && r.target === internalViewNode);
          const tables = new Set<string>();
          internalRawLinks.forEach(r => { tables.add(r.tableSource); tables.add(r.tableTarget); });
          const nodes: InternalNode[] = Array.from(tables).map(t => ({ id: t, module: internalViewNode }));
          
          const loopCounters: Record<string, number> = {};
          const links: InternalLink[] = internalRawLinks.map(r => {
                let curve = 0;
                if (r.tableSource === r.tableTarget) {
                    const currentIndex = loopCounters[r.tableSource] || 0;
                    loopCounters[r.tableSource] = currentIndex + 1;
                    curve = 0.4 + (currentIndex * 0.2);
                }
                return { 
                    source: r.tableSource, target: r.tableTarget, 
                    name: `${r.colSource} [${r.card}] ${r.colTarget}`, 
                    curvature: curve, card: r.card 
                };
            });
          return { nodes, links };
      } else {
          // NOVA LÓGICA: MODO EXTERNO
          // Pega todas as linhas onde o módulo entra ou sai, exceto para ele mesmo
          const externalRawLinks = rawLinks.filter(r => (r.source === internalViewNode || r.target === internalViewNode) && r.source !== r.target);
          const tableMap = new Map<string, string>(); 
          
          externalRawLinks.forEach(r => {
              tableMap.set(r.tableSource, r.source);
              tableMap.set(r.tableTarget, r.target);
          });
          
          const nodes: InternalNode[] = Array.from(tableMap.entries()).map(([table, mod]) => ({ id: table, module: mod }));
          const links: InternalLink[] = externalRawLinks.map(r => ({
                source: r.tableSource, target: r.tableTarget, 
                name: `${r.colSource} [${r.card}] ${r.colTarget}`, 
                curvature: 0, card: r.card 
          }));
          return { nodes, links };
      }
  }, [internalViewNode, rawLinks, tableViewerMode]);

  // ESPIÃO DE MEMÓRIA: Guarda a referência dos nós para o setInterval ler sem depender da biblioteca
  const internalNodesRef = useRef<InternalNode[]>([]);
  internalNodesRef.current = internalGraphData.nodes;

  const internalFocusNode = internalLockedNode || internalHoverNode;

  const { internalHighlightNodes, internalHighlightLinks } = useMemo(() => {
      const hNodes = new Set<string>();
      const hLinks = new Set<InternalLink>();
      
      // internalFocusNode agora é uma string (nome da tabela)
      if (internalFocusNode) {
          hNodes.add(internalFocusNode);
          internalGraphData.links.forEach((link) => {
              const sId = typeof link.source === 'object' ? (link.source as InternalNode).id : link.source;
              const tId = typeof link.target === 'object' ? (link.target as InternalNode).id : link.target;
              
              if (sId === internalFocusNode || tId === internalFocusNode) {
                  hLinks.add(link);
                  hNodes.add(sId);
                  hNodes.add(tId);
              }
          });
      }
      return { internalHighlightNodes: hNodes, internalHighlightLinks: hLinks };
  }, [internalFocusNode, internalGraphData.links]);

  const internalHoveredColumns = useMemo(() => {
      if (!internalHoverNode) return [];
      const cols = new Set<string>();
      
      const raw = tableViewerMode === 'internal' 
          ? rawLinks.filter(r => r.source === internalViewNode && r.target === internalViewNode)
          : rawLinks.filter(r => (r.source === internalViewNode || r.target === internalViewNode) && r.source !== r.target);
          
      raw.forEach(r => {
          if (r.tableSource === internalHoverNode) {
              const modTag = tableViewerMode === 'external' ? ` [Módulo: ${r.target}]` : '';
              cols.add(`${r.colSource} (Para: ${r.tableTarget}${modTag})`);
          }
          if (r.tableTarget === internalHoverNode) {
              const modTag = tableViewerMode === 'external' ? ` [Módulo: ${r.source}]` : '';
              cols.add(`${r.colTarget} (De: ${r.tableSource}${modTag})`);
          }
      });
      return Array.from(cols).sort();
  }, [internalHoverNode, internalViewNode, rawLinks, tableViewerMode]);

// DESPERTADOR 1: Grafo Interno (Tabelas)
  // Sempre que a trava ou as cores mudarem, acorda o canvas para pintar.
  useEffect(() => {
      if (internalGraphRef.current && internalViewNode) {
          const z = internalGraphRef.current.zoom();
          internalGraphRef.current.zoom(z + 0.0001, 0);
          setTimeout(() => internalGraphRef.current?.zoom(z, 0), 15);
      }
  }, [internalFocusNode, internalHighlightNodes, internalViewNode]);

  // DESPERTADOR 2: Grafo Externo (Módulos)
  useEffect(() => {
      if (graphRef.current && !internalViewNode) {
          const z = graphRef.current.zoom();
          graphRef.current.zoom(z + 0.0001, 0);
          setTimeout(() => graphRef.current?.zoom(z, 0), 15);
      }
  }, [focusNode, highlightNodes, internalViewNode]);

// LÓGICA DO BOTÃO DA FÍSICA INTERNA
  useEffect(() => {
      if (internalNodesRef.current && internalNodesRef.current.length > 0) {
          if (!internalPhysics) {
              // Desligou a física: Trava todos os nós exatamente onde estão
              internalNodesRef.current.forEach(n => {
                  n.fx = n.x;
                  n.fy = n.y;
              });
          } else {
              // Ligou a física: Solta as travas e acorda o motor D3
              internalNodesRef.current.forEach(n => {
                  n.fx = undefined;
                  n.fy = undefined;
              });
              if (internalGraphRef.current) internalGraphRef.current.d3ReheatSimulation();
          }
      }
  }, [internalPhysics]);

// OBSERVADOR DE TRANSIÇÃO: Mantém o foco na tabela ao trocar entre Interno/Externo
  useEffect(() => {
      // Só executa se houver uma tabela travada e o grafo existir
      if (!internalLockedNode || !internalGraphRef.current) return;

      let ticks = 0;
      const finder = setInterval(() => {
          ticks++;
          
          // Procura a tabela no novo conjunto de dados recém-renderizado
          const alvo = internalNodesRef.current.find(n => n.id === internalLockedNode);
          
          // Espera a física do D3 calcular o X e Y iniciais do novo nó
          if (alvo && typeof alvo.x === 'number') {
              if (ticks > 2) { // Pequeno fôlego de 200ms
                  clearInterval(finder);
                  
                  // 1. Congela a tabela na nova posição
                  alvo.fx = alvo.x;
                  alvo.fy = alvo.y;
                  pinnedSearchNodeRef.current = alvo;

                  // 2. Avisa que a máquina assumiu a câmera
                  isFlyingRef.current = true;

                  // 3. Voa rapidamente para o alvo no novo mapa
                  if (internalGraphRef.current) {
                      internalGraphRef.current.centerAt(alvo.x, alvo.y, 500);
                      internalGraphRef.current.zoom(8, 500);
                  }
                  
                  // 4. Devolve o controle para o mouse do usuário
                  setTimeout(() => {
                      isFlyingRef.current = false;
                  }, 550);
              }
          } else if (ticks > 20) {
              // Se passar de 2 segundos e não achar, desiste. 
              // (Pode ocorrer se a tabela não tiver nenhuma ligação externa, não existindo no modo Externo)
              clearInterval(finder);
          }
      }, 100);

      return () => clearInterval(finder);
      
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableViewerMode]); // O gatilho é EXCLUSIVAMENTE a troca de modo

  // ==========================================
  // FILTROS E ATRAÇÃO DE GRUPOS
  // ==========================================

  const toggleGroupVisibility = (groupId: number) => {
      setHiddenGroups(prev => {
          const next = new Set(prev);
          if (next.has(groupId)) next.delete(groupId);
          else next.add(groupId);
          return next;
      });
  };

  const toggleAllGroupsVisibility = () => {
      if (hiddenGroups.size > 0) {
          setHiddenGroups(new Set()); // Se tem algum oculto, mostra todos
      } else {
          const allIds = new Set(groups.map(g => g.id));
          allIds.add(0); // Adiciona o "Sem Grupo" (0) na lista de ocultos
          setHiddenGroups(allIds);
      }
  };

  // 1. Atualiza as propriedades na surdina (As forças gravitacionais)
  // 1. Atualiza as propriedades na surdina (As forças gravitacionais)
  useEffect(() => {
      if (graphRef.current && isLoaded) {
          graphRef.current.d3Force('charge')?.strength(-physics.repulsion);
          const linkForce = graphRef.current.d3Force('link');
          if (linkForce) {
              linkForce.distance((link: ConsolidatedLink) => {
                  const MIN_BEAD_SPACING = 18; 
                  const detailCount = link.details?.length || 0;
                  const extensionDistance = (detailCount + 1) * MIN_BEAD_SPACING;
                  return Math.max(physics.linkDistance, extensionDistance);
              });
              linkForce.strength(isExpanded ? 0 : 0.05);
          }
          graphRef.current.d3Force('collide', d3.forceCollide().radius(nodeSize + 10).iterations(2));
          graphRef.current.d3Force('radial', d3.forceRadial(0).strength(physics.centralGravity));

          // NOVO: FORÇA DINÂMICA DE ATRAÇÃO MÚTUA (CLUSTERING ORGÂNICO)
          if (attractGroups) {
              // Limpamos as forças antigas (se existirem)
              graphRef.current.d3Force('groupX', null);
              graphRef.current.d3Force('groupY', null);

              // Criamos uma força customizada que une membros do mesmo grupo
              const forceCluster = () => {
                  let forceNodes: any[] = [];
                  function force(alpha: number) {
                      const centroids = new Map<number, { x: number, y: number, count: number }>();
                      
                      // 1. Acha o centro de massa atual de cada grupo
                      forceNodes.forEach(n => {
                          if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
                          if (!centroids.has(n.group)) centroids.set(n.group, { x: 0, y: 0, count: 0 });
                          const c = centroids.get(n.group)!;
                          c.x += n.x; c.y += n.y; c.count += 1;
                      });
                      centroids.forEach(c => { c.x /= c.count; c.y /= c.count; });
                      
                      // 2. Puxa os módulos suavemente para o centro dos seus irmãos
                      const strength = 0.2 * alpha; // A força diminui conforme o grafo esfria
                      forceNodes.forEach(n => {
                          if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
                          const c = centroids.get(n.group);
                          // Só puxa se houver mais de um módulo no grupo
                          if (c && c.count > 1) { 
                              n.vx -= (n.x - c.x) * strength;
                              n.vy -= (n.y - c.y) * strength;
                          }
                      });
                  }
                  // O D3 chama isso automaticamente para injetar os nós
                  force.initialize = function(_nodes: any[]) { forceNodes = _nodes; };
                  return force;
              };

              // Aplicamos a nossa gravidade orgânica customizada
              graphRef.current.d3Force('cluster', forceCluster());
              
          } else {
              // Se desligar o switch, removemos o cluster customizado
              graphRef.current.d3Force('groupX', null);
              graphRef.current.d3Force('groupY', null);
              graphRef.current.d3Force('cluster', null);
          }
      }
  }, [physics, isLoaded, activeSchemaId, internalViewNode, graphLinks, nodeSize, isExpanded, attractGroups]);

  // 2. Reaquece (movimenta) o grafo APENAS se os controles de física ou de atração mudarem
  const prevPhysicsRef = useRef({ physics, attractGroups });
  useEffect(() => {
      if ((prevPhysicsRef.current.physics !== physics || prevPhysicsRef.current.attractGroups !== attractGroups) && isLoaded) {
          graphRef.current?.d3ReheatSimulation();
          prevPhysicsRef.current = { physics, attractGroups };
      }
  }, [physics, attractGroups, isLoaded]);

  const getId = (n: string | NodeData | InternalNode) => (typeof n === 'object' ? n.id : n);

  useEffect(() => {
      if (internalViewNode && internalGraphRef.current) {
          setTimeout(() => { internalGraphRef.current?.zoomToFit(0, 50); }, 50);
          setTimeout(() => { internalGraphRef.current?.zoomToFit(600, 50); }, 600);
      }
  }, [internalViewNode]); 

  useEffect(() => {
      if (isLoaded && activeSchemaId && graphRef.current) {
          setTimeout(() => {
              graphRef.current?.zoomToFit(1000, 150); 
          }, 800);
      }
  }, [isLoaded, activeSchemaId]);

  // REDIMENSIONAMENTO FLUIDO DA JANELA INTERNA
  useEffect(() => {
      if (internalViewNode && internalContainerRef.current) {
          let animationFrameId: number;
          
          const observer = new ResizeObserver(entries => {
              if (entries[0]) {
                  const { width, height } = entries[0].contentRect;
                  // Atualiza a tela de forma fluida cravada na taxa de frames do monitor
                  cancelAnimationFrame(animationFrameId);
                  animationFrameId = requestAnimationFrame(() => {
                      setInternalDim({ w: width, h: height });
                  });
              }
          });
          
          observer.observe(internalContainerRef.current);
          
          return () => {
              observer.disconnect();
              cancelAnimationFrame(animationFrameId);
          };
      }
  }, [internalViewNode]);

  useEffect(() => {
      if (internalViewNode && internalGraphRef.current) {
          setTimeout(() => { internalGraphRef.current?.zoomToFit(400, 30); }, 500);
      }
  }, [internalViewNode]);

const checkInteractions = useCallback(() => {
      if (activeNode || editingLine || editingBead || groupModalId || showThemeModal || showHelpModal || showCreateSchema || showDeleteSchema || deleteGroupConfirmId !== null || deleteNodeConfirmId !== null) {
          document.body.style.cursor = 'default';
          setHoverBead(null);
          setHoverNode(null);
          return;
      }

      if (!graphRef.current) return;
      const { x: screenX, y: screenY } = mouseRef.current;
      const coords = graphRef.current.screen2GraphCoords(screenX, screenY);
      
      // 1. PRIMEIRO: Verificamos se o mouse está em cima de um módulo (Nó)
      let foundNode: NodeData | null = null;
      const nodeHitRadius = nodeSize + 4; 
      
      foundNode = nodes.find(node => {
          if (typeof node.x !== 'number' || typeof node.y !== 'number') return false;
          const dist = Math.sqrt(Math.pow(coords.x - node.x, 2) + Math.pow(coords.y - node.y, 2));
          return dist < nodeHitRadius;
      }) || null;

      if (lockedNode && foundNode) {
          if (!highlightNodes.has(foundNode.id)) foundNode = null;
      }

      // 2. SEGUNDO: Só checamos as conexões (beads) se o mouse NÃO estiver sobre um nó
      let foundBead: HoveredBead | null = null;
      let closestDist = Infinity; 
      
      if (!foundNode) {
          graphLinks.forEach(link => {
             const src = link.source as NodeData;
             const tgt = link.target as NodeData;
             
             // O TypeScript agora sabe que todos os eixos existem
             if (typeof src.x !== 'number' || typeof src.y !== 'number' || typeof tgt.x !== 'number' || typeof tgt.y !== 'number') return;
             
             // OTIMIZAÇÃO: Fast Bounding-Box Check 
             const isMouseNearLink = 
                 (coords.x >= Math.min(src.x, tgt.x) - 20 && coords.x <= Math.max(src.x, tgt.x) + 20) &&
                 (coords.y >= Math.min(src.y, tgt.y) - 20 && coords.y <= Math.max(src.y, tgt.y) + 20);

             if (!isMouseNearLink) return;

             // OTIMIZAÇÃO: Se as bolinhas estão ocultas e a linha não está em foco, ignora os cálculos
             const isLineHighlighted = highlightLinks.has(link);
             if (!showBeads && !isLineHighlighted) return;

             if (src.id !== tgt.id) {
                 const dx = tgt.x - src.x;
                 const dy = tgt.y - src.y;
                 const distance = Math.sqrt(dx * dx + dy * dy);
                 
                 if (distance <= nodeSize * 2) return; 

                 const offsetX = (dx / distance) * nodeSize;
                 const offsetY = (dy / distance) * nodeSize;
                 
                 const startX = src.x + offsetX;
                 const startY = src.y + offsetY;
                 const endX = tgt.x - offsetX;
                 const endY = tgt.y - offsetY;

                 const count = link.details.length;
                 const hitboxRadiusExternal = 3; 
                 
                 for (let i = 0; i < count; i++) {
                     const t = (i + 1) / (count + 1);
                     const bx = startX + (endX - startX) * t;
                     const by = startY + (endY - startY) * t;
                     const dist = Math.sqrt(Math.pow(coords.x - bx, 2) + Math.pow(coords.y - by, 2));
                     
                     if (dist <= hitboxRadiusExternal && dist < closestDist) {
                         closestDist = dist;
                         foundBead = { link, detail: link.details[i], index: i, x: bx, y: by };
                     }
                 }
             }
          });

          if (lockedNode && foundBead) {
              if (!highlightLinks.has((foundBead as HoveredBead).link)) foundBead = null;
          }
      }

      // 3. Atualiza os estados finais
      // 3. Atualiza os estados finais (Limpo, sem acordar a física)
      setHoverNode(prev => (prev?.id === foundNode?.id ? prev : foundNode));
      setHoverBead(prev => {
          if (prev?.index === foundBead?.index && prev?.link === foundBead?.link) return prev;
          return foundBead;
      });

      document.body.style.cursor = (foundBead || foundNode) ? 'pointer' : 'default';
      
  }, [graphLinks, nodes, nodeSize, activeNode, editingLine, editingBead, groupModalId, showThemeModal, showHelpModal, showCreateSchema, showDeleteSchema, deleteGroupConfirmId, deleteNodeConfirmId, lockedNode, highlightNodes, highlightLinks]);


  
  const handleGlobalMouseMove = useCallback((e: React.MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      
      // MÁGICA AQUI: Atualiza a posição da caixa flutuante em tempo real (60fps) sem re-renderizar o React
      if (tooltipDivRef.current) {
          tooltipDivRef.current.style.left = `${e.clientX + 15}px`;
          tooltipDivRef.current.style.top = `${e.clientY + 15}px`;
      }

      // Além do tooltip atualizado dinamicamente acima, o tooltip antigo (das conexões) é atualizado aqui:
      const oldTooltip = document.getElementById('tooltip');
      if (oldTooltip) {
          oldTooltip.style.left = `${e.clientX + 15}px`;
          oldTooltip.style.top = `${e.clientY + 15}px`;
      }

      const target = e.target as HTMLElement;

      // Bloqueia interações "fantasmas"
      if (target.tagName !== 'CANVAS' || (internalContainerRef.current && internalContainerRef.current.contains(target))) {
          setHoverNode(null);
          setHoverBead(null);
          return;
      }

      if (!mouseRef.current.isChecking) {
          mouseRef.current.isChecking = true;
          requestAnimationFrame(() => {
              checkInteractions();
              mouseRef.current.isChecking = false;
          });
      }
  }, [checkInteractions]);


  const handleGlobalClick = useCallback((e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      // NOVO: Previne clique vazado nos itens de fundo
      if (target.tagName !== 'CANVAS' || (internalContainerRef.current && internalContainerRef.current.contains(target))) {
          return; 
      }

      if (hoverBead && usuarioAtual?.funcao !== 'obs') {
          setEditingBead(hoverBead);
          e.stopPropagation(); 
      }
  }, [hoverBead, usuarioAtual]);


  const hoveredNodeTables = useMemo(() => {
      if (!hoverNode) return [];
      const tables = new Set<string>();
      graphLinks.forEach(link => {
          const sId = getId(link.source as NodeData);
          const tId = getId(link.target as NodeData);
          if (sId === hoverNode.id) link.details.forEach(d => tables.add(d.tableSource));
          if (tId === hoverNode.id) link.details.forEach(d => tables.add(d.tableTarget));
      });
      return Array.from(tables).sort();
  }, [hoverNode, graphLinks]);

const runAutoClustering = () => {
      if (usuarioAtual?.funcao !== 'admin') return alert("Acesso negado. Apenas Administradores podem recriar a arquitetura de agrupamentos em massa.");
      if (!confirm("Deseja executar a Inteligência de Agrupamento EBS?\n\nO sistema usará regras de negócio do Oracle EBS para ancorar os grandes módulos e enviará os pequenos grupos isolados para a área 'Sem Grupo' (Outros).")) return;

      // 1. O DNA do Oracle EBS (Sementes de Conhecimento)
      const ebsKnowledgeBase = [
          { id: 1, name: 'Tecnologia & Fundação', color: '#34495e', seeds: ['FND', 'AD', 'WF', 'ALR', 'SYS', 'AU', 'XLA'] },
          { id: 2, name: 'SCM & Logística', color: '#e67e22', seeds: ['MTL', 'INV', 'WMS', 'WIP', 'BOM', 'RCV', 'WSH', 'CST'] },
          { id: 3, name: 'Finanças', color: '#27ae60', seeds: ['GL', 'AP', 'AR', 'FA', 'CE', 'IBY', 'ZX'] },
          { id: 4, name: 'Vendas & CRM', color: '#2980b9', seeds: ['OE', 'ONT', 'HZ', 'QP', 'ASO'] },
          { id: 5, name: 'Compras', color: '#8e44ad', seeds: ['PO', 'REQ'] },
          { id: 6, name: 'RH & Folha', color: '#e84393', seeds: ['PER', 'PAY', 'BEN', 'HR'] },
          { id: 7, name: 'Projetos', color: '#f1c40f', seeds: ['PA', 'PJM'] }
      ];

      // Mapeamento rápido para o algoritmo
      const seedMap = new Map<string, number>();
      ebsKnowledgeBase.forEach(area => {
          area.seeds.forEach(seed => seedMap.set(seed, area.id));
      });

      // 2. Mapeamento de Vizinhança
      const adj = new Map<string, Record<string, number>>();
      nodes.forEach(n => adj.set(n.id, {}));

      rawLinks.forEach(r => {
          if (r.source !== r.target) {
              const s = typeof r.source === 'object' ? (r.source as any).id : r.source;
              const t = typeof r.target === 'object' ? (r.target as any).id : r.target;
              if (adj.has(s) && adj.has(t)) {
                  adj.get(s)![t] = (adj.get(s)![t] || 0) + 1;
                  adj.get(t)![s] = (adj.get(t)![s] || 0) + 1;
              }
          }
      });

      // 3. Inicialização Semi-Supervisionada
      const labels = new Map<string, number>();
      const isLocked = new Set<string>(); 

      let nextCustomId = 100; 
      nodes.forEach(n => {
          const knownAreaId = seedMap.get(n.id);
          if (knownAreaId) {
              labels.set(n.id, knownAreaId);
              isLocked.add(n.id); 
          } else {
              labels.set(n.id, nextCustomId++); 
          }
      });

      // 4. Algoritmo de Propagação (LPA) para os módulos livres 
      const maxIter = 15; 
      for (let iter = 0; iter < maxIter; iter++) {
          let changed = false;
          const shuffled = [...nodes].sort(() => Math.random() - 0.5);

          for (const node of shuffled) {
              if (isLocked.has(node.id)) continue; 

              const neighbors = adj.get(node.id);
              if (!neighbors) continue;

              const labelCounts = new Map<number, number>();
              let maxCount = -1;
              let bestLabel = labels.get(node.id)!;

              for (const [vizinho, peso] of Object.entries(neighbors)) {
                  const vizinhoLabel = labels.get(vizinho)!;
                  const anchorBonus = isLocked.has(vizinho) ? 1.5 : 1.0; 
                  const novoPeso = (labelCounts.get(vizinhoLabel) || 0) + (peso * anchorBonus);
                  
                  labelCounts.set(vizinhoLabel, novoPeso);

                  if (novoPeso > maxCount) {
                      maxCount = novoPeso;
                      bestLabel = vizinhoLabel;
                  }
              }

              if (labels.get(node.id) !== bestLabel) {
                  labels.set(node.id, bestLabel);
                  changed = true;
              }
          }
          if (!changed) break; 
      }

      // 4.5. LIMPEZA DE NANOGRUPOS (A lixeira "Outros")
      // Conta quantos módulos cada grupo conseguiu recrutar
      const groupSizes = new Map<number, number>();
      labels.forEach(lbl => groupSizes.set(lbl, (groupSizes.get(lbl) || 0) + 1));

      labels.forEach((lbl, nodeId) => {
          // Se for uma ilha customizada (ID >= 100) E tiver menos de 3 módulos
          if (lbl >= 100 && (groupSizes.get(lbl) || 0) < 3) {
              labels.set(nodeId, 0); // 0 é o ID nativo da categoria "Sem Grupo" / "Outros"
          }
      });

      // 5. Construção dos Grupos Finais
      const newGroups: Group[] = [];
      const paletteExtras = ['#1abc9c', '#d35400', '#c0392b', '#bdc3c7', '#7f8c8d'];
      let extraIdx = 0;

      const activeLabels = new Set(labels.values());

      activeLabels.forEach(lblId => {
          if (lblId === 0) return; // Ignora o 0, pois a lista de grupos da UI já injeta ele automaticamente no topo

          const knownArea = ebsKnowledgeBase.find(a => a.id === lblId);
          if (knownArea) {
              newGroups.push({ id: knownArea.id, name: knownArea.name, color: knownArea.color });
          } else {
              newGroups.push({ 
                  id: lblId, 
                  name: `Customizado Importante ${extraIdx + 1}`, 
                  color: paletteExtras[extraIdx % paletteExtras.length] 
              });
              extraIdx++;
          }
      });

      // 6. Atualiza o Estado
      setGroups(newGroups);
      setNodes(prev => prev.map(n => ({
          ...n,
          group: labels.get(n.id) || 0
      })));

      setAttractGroups(true); 
  };

const updateGroupInDB = async (id: number, name: string, color: string) => {
      if (usuarioAtual?.funcao === 'obs') return;
      try {
          await fetchAutenticado(`http://172.30.100.193:3000/api/grupos/${activeSchemaId}/${id}`, {
              method: 'PUT',
              body: JSON.stringify({ nome_grupo: name, cor_hexadecimal: color })
          });
      } catch (error) { console.error("Erro ao atualizar grupo no banco", error); }
  };

  const handleGroupColorChange = (id: number, color: string) => setGroups(gs => gs.map(g => g.id === id ? { ...g, color } : g));
  const handleGroupNameChange = (id: number, name: string) => setGroups(gs => gs.map(g => g.id === id ? { ...g, name } : g));
  
  const createNewGroup = async () => { 
      const newId = Date.now(); 
      const newGroup = { id_grupo: newId, id_esquema: activeSchemaId, nome_grupo: 'Novo Grupo', cor_hexadecimal: '#ff00ff' };
      try {
          const res = await fetchAutenticado('http://172.30.100.193:3000/api/grupos', {
              method: 'POST',
              body: JSON.stringify(newGroup)
          });
          if (!res.ok) throw new Error();
          setGroups([...groups, { id: newId, name: 'Novo Grupo', color: '#ff00ff' }]); 
      } catch (e) { alert('Falha ao criar o grupo no banco.'); }
  };
  
  const handleDeleteGroupExecute = async () => {
      if (deleteGroupConfirmId === null) return;
      try {
          const res = await fetchAutenticado(`http://172.30.100.193:3000/api/grupos/${activeSchemaId}/${deleteGroupConfirmId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error();
          setGroups(prev => prev.filter(g => g.id !== deleteGroupConfirmId));
          setNodes(prev => prev.map(n => n.group === deleteGroupConfirmId ? { ...n, group: 0 } : n));
          setDeleteGroupConfirmId(null);
      } catch (e) { alert('Falha ao excluir o grupo.'); }
  };

  const addManualNode = async () => { 
      if(!manualNode.name) return; 
      if(nodes.find(n => n.id === manualNode.name)) return alert("Já existe!"); 
      
        console.log("Tentando salvar:", { 
        id_modulo: manualNode.name.toUpperCase(), 
        id_esquema: activeSchemaId, 
        id_grupo: manualNode.group 
        });

      try {
          const res = await fetchAutenticado('http://172.30.100.193:3000/api/modulos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id_modulo: manualNode.name.toUpperCase(), id_esquema: activeSchemaId, id_grupo: manualNode.group })
          });
          if (!res.ok) throw new Error();
          setNodes([...nodes, { id: manualNode.name.toUpperCase(), group: manualNode.group }]); 
          setManualNode({...manualNode, name: ''}); 
      } catch (error) {
        console.error("Detalhes da falha:", error);
          alert('Erro ao salvar novo módulo no banco.');
      }
  };

const updateModuleGroupInDB = async (nodeId: string, newGroupId: number) => {
      if (usuarioAtual?.funcao === 'obs') return;
      try {
          await fetchAutenticado(`http://172.30.100.193:3000/api/modulos/${activeSchemaId}/${nodeId}`, {
              method: 'PUT',
              body: JSON.stringify({ id_grupo: newGroupId })
          });
      } catch (error) { console.error("Erro ao vincular módulo", error); }
  };

  const toggleNodeGroup = (nodeId: string, groupId: number, isMember: boolean) => {
      const newGroupId = isMember ? groupId : 0; 
      setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, group: newGroupId } : n));
      updateModuleGroupInDB(nodeId, newGroupId);
  };
  
  const changeNodeGroupFromModal = (nodeId: string, newGroupId: number) => {
      setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, group: newGroupId } : n));
      setActiveNode(prev => prev ? { ...prev, group: newGroupId } : null);
      updateModuleGroupInDB(nodeId, newGroupId);
  };

  const addManualLink = async () => { 
      try {
          const res = await fetchAutenticado('http://172.30.100.193:3000/api/conexoes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  id_esquema: activeSchemaId, source: manualLink.src, target: manualLink.tgt, 
                  tableSource: manualLink.ts, colSource: manualLink.colS, 
                  tableTarget: manualLink.tt, colTarget: manualLink.colT, card: manualLink.card 
              })
          });
          if (!res.ok) throw new Error();
          setRawLinks([...rawLinks, { 
              source: manualLink.src, target: manualLink.tgt, 
              tableSource: manualLink.ts, tableTarget: manualLink.tt, 
              colSource: manualLink.colS, colTarget: manualLink.colT, card: manualLink.card 
          }]); 
          setManualLink({ src: '', tgt: '', ts: '', tt: '', colS: '', colT: '', card: '1:N' }); 
      } catch (error) {
        console.error("Detalhes da falha:", error);
          alert('Erro ao criar conexão no banco.');
      }
  };

  const deleteRawLink = async (ts: string, tt: string, colS: string, colT: string) => { 
        try {
            const params = new URLSearchParams({ ts, tt, cols: colS, colt: colT });
            const res = await fetchAutenticado(`http://172.30.100.193:3000/api/conexoes/${activeSchemaId}?${params.toString()}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            setRawLinks(prev => prev.filter(r => !(r.tableSource === ts && r.tableTarget === tt && r.colSource === colS && r.colTarget === colT))); 
            if(editingLine) setEditingLine(null); 
            if(editingBead) setEditingBead(null); 
        } catch (error) {
            console.error("Detalhes da falha:", error);
            alert('Erro ao excluir conexão do banco.');
        }
  };

  const saveBeadEdit = async () => { 
      if (!editingBead) return; 
      const old = editingBead.link.details[editingBead.index]; 
      const novo = editingBead.detail;

      try {
          const res = await fetchAutenticado(`http://172.30.100.193:3000/api/conexoes/${activeSchemaId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  oldTS: old.tableSource, oldTT: old.tableTarget, oldCS: old.colSource, oldCT: old.colTarget,
                  newTS: novo.tableSource, newTT: novo.tableTarget, newCS: novo.colSource, newCT: novo.colTarget, newCard: novo.card
              })
          });
          if (!res.ok) throw new Error();
          setRawLinks(prev => prev.map(r => { 
              if (r.tableSource === old.tableSource && r.tableTarget === old.tableTarget && r.colSource === old.colSource && r.colTarget === old.colTarget) { 
                  return { ...r, ...novo }; 
              } 
              return r; 
          })); 
          setEditingBead(null); 
      } catch (error) {
          console.error("Detalhes da edição da conexão:", error);
          alert('Falha ao atualizar a conexão no banco de dados.');
      }
  };
  
  const sortedNodes = useMemo(() => [...nodes].sort((a,b) => a.id.localeCompare(b.id)), [nodes]);
  const gridRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' };

  useEffect(() => {
      if (!isLoaded || !activeSchemaId || !usuarioAtual) return;
      // Impede salvar se for obs
      if (usuarioAtual.funcao === 'obs') return;

      const timer = setTimeout(async () => {
          try {
              await fetchAutenticado(`http://172.30.100.193:3000/api/configuracoes/${activeSchemaId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      node_size: nodeSize, link_distance: physics.linkDistance,
                      repulsion: physics.repulsion, central_gravity: physics.centralGravity
                  })
              });
          } catch (error) {
              console.error("Erro ao salvar configurações de física:", error);
          }
      }, 1000); 
      return () => clearTimeout(timer);
  }, [physics, nodeSize, activeSchemaId, isLoaded, usuarioAtual]);


  // =====================================
  // TELA DE LOGIN (BARREIRA INICIAL)
  // =====================================
  if (!usuarioAtual) {
      return (
          <div style={{ width: '100vw', height: '100vh', background: 'var(--bg-app)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-main)', fontFamily: 'Inter, sans-serif' }}>
              <form onSubmit={handleLogin} style={{ background: 'var(--bg-panel)', padding: '30px', borderRadius: '8px', border: '1px solid var(--border-color)', width: '300px', boxShadow: 'var(--shadow-lg)' }}>
                  <h2 style={{ textAlign: 'center', color: 'var(--accent)', marginTop: 0, marginBottom: '20px' }}>EBS-Graph</h2>
                  {loginErro && <div style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '10px', textAlign: 'center' }}>{loginErro}</div>}
                  
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>Usuário</label>
                  <input type="text" value={loginInput} onChange={e => setLoginInput(e.target.value)} style={{ width: '100%', marginBottom: '15px', padding: '8px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }} autoFocus required />
                  
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '5px' }}>Senha</label>
                  <input type="password" value={senhaInput} onChange={e => setSenhaInput(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '8px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }} required />
                  
                  <button type="submit" style={{ width: '100%', padding: '10px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Entrar</button>
              </form>
          </div>
      );
  }

  // Se não estiver carregado e o login for bem sucedido, exibe a tela de espera original
  if (!isLoaded) return <div style={{width:'100vw', height:'100vh', background:'#1e1e1e'}} />; 

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--bg-app)', overflow: 'hidden' }} 
         onMouseMove={handleGlobalMouseMove} onClick={handleGlobalClick} ref={wrapperRef}>

      {internalViewNode && (
          <FloatingWindow title={`Estrutura ${tableViewerMode === 'internal' ? 'Interna' : 'Externa'}: ${internalViewNode}`} onClose={handleCloseInternalView} windowId="janela-interna">
              <div 
                  onWheel={e => e.stopPropagation()} 
                  style={{ padding: '8px 15px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center', height: 50 }}
              >
                {/* BARRA DE PESQUISA DO VISUALIZADOR INTERNO COM POPUP */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: 400 }}>
                    <Icon name="search" size={20} style={{ color: 'var(--text-muted)' }} />
                    <input 
                        id="internal-search-input"
                        type="text" 
                        placeholder="Buscar Tabela neste módulo..."
                        value={internalSearchQuery}
                        onChange={e => setInternalSearchQuery(e.target.value.toUpperCase())}
                        onFocus={() => setInternalSearchFocus(true)}
                        onBlur={() => setTimeout(() => setInternalSearchFocus(false), 200)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                const target = internalGraphData.nodes.find(n => n.id === internalSearchQuery);
                                if (target && internalGraphRef.current && typeof (target as InternalNode).x === 'number' && typeof (target as InternalNode).y === 'number') {
                                    internalGraphRef.current.centerAt((target as InternalNode).x, (target as InternalNode).y, 500);
                                    internalGraphRef.current.zoom(8, 500);
                                    e.currentTarget.blur();
                                    setInternalLockedNode((target as InternalNode).id);
                                }
                            }
                        }}
                        className="mono-text"
                        style={{ width: '100%', fontSize: '11px', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)' }} 
                    />

                    {/* POPUP DE SUGESTÕES INTERNO */}
                    {internalSearchFocus && internalSearchQuery && (
                        <div style={{ position: 'absolute', top: '100%', left: '28px', width: 'calc(100% - 28px)', marginTop: '4px', background: 'var(--bg-panel)', border: '1px solid var(--accent)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', zIndex: 3000 }}>
                            {(() => {
                                const searchUpper = internalSearchQuery.toUpperCase();
                                // Pega apenas as tabelas que existem na visão atual (Interna ou Externa do Módulo)
                                const availableTables = internalGraphData.nodes.map(n => n.id);
                                
                                // Filtra e usa o nosso algoritmo de relevância!
                                const filtered = ordenarPorRelevancia(availableTables.filter(id => id.includes(searchUpper)), searchUpper).slice(0, 15);

                                if (filtered.length === 0) return <div style={{ padding: '10px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>Nenhuma tabela nesta visão</div>;

                                return filtered.map(id => (
                                    <div 
                                        key={id} 
                                        onClick={() => {
                                            setInternalSearchQuery(id);
                                            document.getElementById('internal-search-input')?.blur();
                                            
                                            // Executa o voo e a trava instantaneamente ao clicar
                                            const target = internalGraphData.nodes.find(n => n.id === id);
                                            if (target && internalGraphRef.current && typeof (target as InternalNode).x === 'number' && typeof (target as InternalNode).y === 'number') {
                                                internalGraphRef.current.centerAt((target as InternalNode).x, (target as InternalNode).y, 500);
                                                internalGraphRef.current.zoom(8, 500);
                                                setInternalLockedNode(id);
                                            }
                                        }} 
                                        style={{ padding: '8px 12px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--input-bg)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <span className="mono-text" style={{ fontWeight: 600 }}>{id}</span>
                                        <span style={{ fontSize: '9px', color: 'var(--accent-text)', background: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Tabela</span>
                                    </div>
                                ));
                            })()}
                        </div>
                    )}
                </div>
                
                {/* CONTEINER NOVO: Agrupa o Slider e o Botão e empurra para a direita */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
                    
                    {/* SLIDER DE TAMANHO (Só aparece se showInternalArrows for true) */}
                    {showInternalArrows && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>TAMANHO:</span>
                            <input 
                                type="range" 
                                min="1" 
                                max="15" 
                                step="0.5" 
                                value={internalArrowSize} 
                                onChange={e => setInternalArrowSize(Number(e.target.value))}
                                style={{ width: '80px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                                title={`Tamanho atual: ${internalArrowSize}`}
                            />
                        </div>
                    )}

                    <button 
                        onClick={() => setShowInternalArrows(!showInternalArrows)}
                        className="mono-text"
                        style={{ 
                            padding: '6px 12px', 
                            fontSize: '11px', 
                            background: showInternalArrows ? 'var(--accent)' : 'transparent', 
                            color: showInternalArrows ? 'var(--accent-text)' : 'var(--text-main)', 
                            border: '1px solid var(--accent)', 
                            borderRadius: '4px', 
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {showInternalArrows ? 'Ocultar Setas' : 'Mostrar Setas'}
                    </button>

                    {/* NOVO BOTÃO DE ALTERNÂNCIA */}
                    <button 
                        onClick={() => {
                            setTableViewerMode(prev => prev === 'internal' ? 'external' : 'internal');
                            setInternalPhysics(true); // Sincroniza o botão com a explosão inevitável do D3
                        }}
                        className="mono-text"
                        style={{ 
                            padding: '6px 12px', 
                            fontSize: '11px', 
                            background: 'var(--bg-app)', 
                            color: 'var(--text-main)', 
                            border: '1px solid var(--accent)', 
                            borderRadius: '4px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Icon name="arrow-left-right" size={12} /> 
                        Ver {tableViewerMode === 'internal' ? 'Externa' : 'Interna'}
                    </button>

                    <button 
                        onClick={() => setInternalPhysics(!internalPhysics)}
                        className="mono-text"
                        style={{ 
                            padding: '6px 12px', 
                            fontSize: '11px', 
                            background: internalPhysics ? 'var(--accent)' : 'transparent', 
                            color: internalPhysics ? 'var(--accent-text)' : 'var(--text-main)', 
                            border: '1px solid var(--accent)', 
                            borderRadius: '4px', 
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {internalPhysics ? 'Física ON' : 'Física OFF'}
                    </button>
                </div>
            </div>

              <div 
                  ref={internalContainerRef} 
                  onWheel={e => e.stopPropagation()} 
                  style={{ width: '100%', height: 'calc(100% - 46px)' }}
              >
                  <ForceGraph2D
                      width={internalDim.w}         
                      height={internalDim.h}        
                      ref={internalGraphRef}
                      graphData={internalGraphData}
                      nodeRelSize={6}
                      backgroundColor={bgGraphColor}
                      onNodeHover={(node: object | null) => {
                          const n = node as InternalNode | null;
                          if (internalLockedNode) {
                              if (n && !internalHighlightNodes.has(n.id)) { setInternalHoverNode(null); return; }
                          }
                          // Extrai e salva apenas o texto do nome
                          setInternalHoverNode(n ? n.id : null);
                      }}
                      linkColor={(link: object) => {
                          const typedLink = link as InternalLink;
                          const isFaded = internalFocusNode && !internalHighlightLinks.has(typedLink);
                          if (isFaded) return `${theme === 'light' ? '#a0a0a0' : '#555555'}20`;
                          return internalHighlightLinks.has(typedLink) ? accentColor : (theme === 'light' ? '#a0a0a0' : '#555');
                      }}
                      linkWidth={(link: object) => internalHighlightLinks.has(link as InternalLink) ? 2.5 : 1}
                      linkDirectionalArrowLength={(link: object) => {
                            if (!showInternalArrows) return 0;
                            const typedLink = link as InternalLink;
                            return typedLink.card === '1:1' ? 0 : internalArrowSize; 
                        }}
                        linkDirectionalArrowRelPos={1}
                      linkCurvature={(link: object) => (link as InternalLink).curvature || 0}
                      nodeCanvasObject={(node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
                          const n = node as InternalNode;
                          if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
                          
                          // CORREÇÃO: Usando as variáveis normais de estado do React
                          const isFaded = internalFocusNode && !internalHighlightNodes.has(n.id);
                          ctx.globalAlpha = isFaded ? 0.1 : 1;
                          
                          const isHighlighted = internalFocusNode === n.id;
                          const isRelated = internalHighlightNodes.has(n.id);
                          
                          // LÓGICA DE CORES DOS GRUPOS
                          let nodeColor = theme === 'dark' ? '#2a2a2a' : '#ffffff';
                          let textColor = theme === 'dark' ? '#ececec' : '#111827';
                          
                          if (tableViewerMode === 'external' && n.module) {
                              const modObj = nodes.find(m => m.id === n.module);
                              if (modObj) {
                                  const groupObj = groups.find(g => g.id === modObj.group);
                                  nodeColor = groupObj ? groupObj.color : '#555555'; // #555 se for "Sem Grupo"
                                  
                                  // Calcula o brilho da cor para pintar a letra de branco ou preto (Contraste)
                                  let hex = nodeColor.replace('#', '');
                                  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
                                  const r = parseInt(hex.substring(0, 2), 16);
                                  const g = parseInt(hex.substring(2, 4), 16);
                                  const b = parseInt(hex.substring(4, 6), 16);
                                  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                                  textColor = yiq >= 128 ? '#111827' : '#ffffff';
                              }
                          }

                          const label = n.id;
                          const fontSize = 12 / globalScale;
                          ctx.font = `${isRelated && internalFocusNode ? '800' : '600'} ${fontSize}px JetBrains Mono, monospace`;
                          const textWidth = ctx.measureText(label).width;
                          const padX = 6 / globalScale;
                          const padY = 4 / globalScale;
                          const width = textWidth + padX * 2;
                          const height = fontSize + padY * 2;
                          
                          ctx.save();
                          if (isHighlighted) { ctx.shadowColor = accentColor; ctx.shadowBlur = 15; }
                          
                          // Pinta com a cor do Grupo ou a padrão
                          ctx.fillStyle = nodeColor;
                          ctx.beginPath();
                          ctx.roundRect(n.x - width/2, n.y - height/2, width, height, 4/globalScale);
                          ctx.fill();
                          
                          ctx.shadowBlur = 0; 
                          ctx.lineWidth = (isRelated && internalFocusNode ? 2 : 1) / globalScale;
                          ctx.strokeStyle = isRelated && internalFocusNode ? accentColor : (theme === 'dark' ? '#444444' : '#cccccc');
                          ctx.stroke();
                          ctx.restore();
                          ctx.textAlign = 'center';
                          ctx.textBaseline = 'middle';
                          ctx.fillStyle = textColor; // Texto escuro ou claro dependendo do fundo
                          ctx.fillText(label, n.x, n.y);
                          ctx.globalAlpha = 1;
                      }}
                      nodePointerAreaPaint={(node: object, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
                          const n = node as InternalNode;
                          if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
                          if (internalLockedNode && !internalHighlightNodes.has(n.id)) return; 
                          const label = n.id;
                          const fontSize = 12 / globalScale;
                          ctx.font = `600 ${fontSize}px JetBrains Mono, monospace`;
                          const textWidth = ctx.measureText(label).width;
                          const padX = 6 / globalScale;
                          const padY = 4 / globalScale;
                          const width = textWidth + padX * 2;
                          const height = fontSize + padY * 2;
                          ctx.fillStyle = color;
                          ctx.beginPath();
                          ctx.roundRect(n.x - width/2, n.y - height/2, width, height, 4/ globalScale);
                          ctx.fill();
                      }}
                      linkLabel={(link: object) => {
                          const typedLink = link as InternalLink;
                          if (internalLockedNode && !internalHighlightLinks.has(typedLink)) return ''; 
                          return `<div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; background: var(--bg-panel); color: var(--text-main); padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; box-shadow: var(--shadow-lg);">${typedLink.name}</div>`;
                      }}
                      // EVENTOS DO GRAFO INTERNO (Ligando a engrenagem de soltar a trava)
                      onBackgroundClick={() => {
                          setInternalLockedNode(null);
                          releaseSearchPin(); // <--- Lendo a função aqui!
                      }}
                      onNodeClick={(node) => {
                          const n = node as InternalNode;
                          setInternalLockedNode(prev => prev === n.id ? null : n.id);
                          releaseSearchPin(); // <--- E aqui!
                      }}
                      onNodeDrag={() => {
                          releaseSearchPin(); // <--- E aqui (quando você arrasta qualquer coisa)!
                      }}
                      onNodeDragEnd={node => {
                          const n = node as InternalNode;
                          
                          // Lógica de Quadro Branco vs Física Elástica
                          if (internalPhysics) {
                              n.fx = undefined;
                              n.fy = undefined;
                          } else {
                              n.fx = n.x;
                              n.fy = n.y;
                          }
                          if (internalGraphRef.current) internalGraphRef.current.d3ReheatSimulation();
                      }}
                  />
              </div>
          </FloatingWindow>
      )}

      {showSchemaDropdown && ( <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 499}} onClick={() => setShowSchemaDropdown(false)} /> )}

      <div className="schema-selector">
         <span className="schema-label">ESQUEMA:</span>
         <div 
            className="custom-schema-select" 
            onClick={() => !isSwitchingSchema && setShowSchemaDropdown(!showSchemaDropdown)}
            style={{ cursor: isSwitchingSchema ? 'wait' : 'pointer', opacity: isSwitchingSchema ? 0.7 : 1 }}
         >
             {isSwitchingSchema ? (
                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                     <div className="spinner" style={{ width: '12px', height: '12px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                     <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Carregando...</span>
                 </div>
             ) : (
                 <>
                     {esquemas.find(esq => esq.id_esquema === activeSchemaId)?.nome_esquema || 'Selecione uma Área...'}
                     <Icon name="arrow-down" size={14} />
                 </>
             )}
             
             {showSchemaDropdown && !isSwitchingSchema && (
                <div className="schema-dropdown-menu">
                    {esquemas.map(esq => (
                        <div key={esq.id_esquema} className={`schema-option ${esq.id_esquema === activeSchemaId ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); switchSchema(esq.id_esquema); }}>
                            {esq.nome_esquema}
                        </div>
                    ))}
                </div>
             )}
         </div>

         {/* BARRA DE PESQUISA PRINCIPAL COM POPUP */}
         <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', marginRight: '12px' }}>
              <Icon name="search" size={20} style={{ color: 'var(--text-muted)' }} />
              <input 
                  id="main-search-input"
                  type="text" placeholder="Buscar Módulo ou Tabela..." className="mono-text" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value.toUpperCase())}
                  onFocus={() => setMainSearchFocus(true)}
                  onBlur={() => setTimeout(() => setMainSearchFocus(false), 200)}
                  onKeyDown={e => {
                      if (e.key === 'Enter') {
                          e.currentTarget.blur(); // Tira o foco do input
                          executeMainSearch(searchQuery);
                      }
                  }}
                  style={{ width: '210px', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', marginTop: '8px' }} 
              />

              {/* POPUP INTELIGENTE (Módulos primeiro, Tabelas depois) */}
              {/* POPUP INTELIGENTE (Sinônimos, Módulos primeiro, Tabelas depois) */}
              {mainSearchFocus && searchQuery && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, width: '210px', marginTop: '4px', background: 'var(--bg-panel)', border: '1px solid var(--accent)', borderRadius: '8px', maxHeight: '250px', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', zIndex: 3000 }}>
                      {(() => {
                          const moduleAliases: Record<string, string> = { 'INV': 'MTL', 
                                                                          'OM': 'OE', 
                                                                          'RI': 'CLL', 
                                                                          'IPROC': 'ICX',  
                                                                          'PAC': 'CST'
                                                                        };
                          const searchUpper = searchQuery.toUpperCase();

                          // Busca por Sinônimos (Aliases)
                          const filteredAliases = Object.keys(moduleAliases)
                            .filter(alias => alias.includes(searchUpper))
                            .map(alias => ({ id: alias, target: moduleAliases[alias], type: 'Sinônimo' }));

                          // Adicionamos "target: undefined" nestas duas linhas para padronizar os objetos
                          const filteredMods = ordenarPorRelevancia(sortedNodes.filter(n => n.id.includes(searchUpper)).map(n => n.id), searchUpper)
                              .map(id => ({ id, target: undefined, type: 'Módulo' }));
                              
                          const filteredTabs = ordenarPorRelevancia(uniqueTablesList.filter(id => id.includes(searchUpper)), searchUpper)
                              .map(id => ({ id, target: undefined, type: 'Tabela' }));
                          
                          // Concatena tudo (Sinônimos no topo) e limita
                          const suggestions = [...filteredAliases, ...filteredMods, ...filteredTabs].slice(0, 15);

                          if (suggestions.length === 0) return <div style={{ padding: '10px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>Sem resultados</div>;

                          return suggestions.map(s => (
                              <div 
                                  key={`${s.type}-${s.id}`} 
                                  onClick={() => {
                                      setSearchQuery(s.id);
                                      document.getElementById('main-search-input')?.blur();
                                      executeMainSearch(s.id); // A tradução ocorrerá dentro da executeMainSearch
                                  }} 
                                  style={{ padding: '8px 12px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--input-bg)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                  <span className="mono-text" style={{ fontWeight: s.type === 'Módulo' || s.type === 'Sinônimo' ? 700 : 500 }}>
                                    {s.id} {s.type === 'Sinônimo' && <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '4px' }}>(→ {s.target})</span>}
                                  </span>
                                  <span style={{ fontSize: '9px', color: s.type === 'Módulo' || s.type === 'Sinônimo' ? 'var(--accent-text)' : 'var(--text-muted)', background: s.type === 'Módulo' || s.type === 'Sinônimo' ? 'var(--accent)' : 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                      {s.type === 'Sinônimo' ? 'Módulo' : s.type}
                                  </span>
                              </div>
                          ));
                      })()}
                  </div>
              )}
         </div>

         <div style={{display:'flex', gap: 6, borderLeft:'1px solid var(--border-color)', paddingLeft: 10, alignItems: 'center'}}>
            {usuarioAtual?.funcao !== 'obs' && (
                <>
                <input type="file" accept=".json" ref={jsonInputRef} style={{ display: 'none' }} onChange={handleImport} />
                <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleImportCSV} />
              <button onClick={() => setShowCreateSchema(true)} className="btn-mini" title="Novo Esquema">
                  <Icon name="plus" size={14}/>
              </button>
              <button onClick={() => { const current = esquemas.find(s => s.id_esquema === activeSchemaId); setRenameSchemaValue(current?.nome_esquema || ''); setShowRenameSchema(true); }} className="btn-mini" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '28px' }} title="Renomear Esquema">
                  <Icon name="pencil" size={14}/> 
              </button>
              <button onClick={() => setShowDeleteSchema(true)} className="btn-mini danger" disabled={esquemas.length <= 1} title="Deletar Esquema Atual">
                  <Icon name="trash" size={14}/>
              </button>
              <div style={{width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 4px'}}></div>
              <button onClick={() => csvInputRef.current?.click()} className="btn-mini" title="Importar CSV">
                    <Icon name="database" size={14}/>
              </button>
              <button onClick={() => jsonInputRef.current?.click()} className="btn-mini" title="Importar JSON">
                    <Icon name="upload" size={14}/>
              </button>
              </>
            )}
              <button onClick={exportCurrentSchema} className="btn-mini" title="Baixar Esquema">
                <Icon name="download" size={14}/>
            </button>
          </div>
      </div>

      {hoverBead && !editingBead && !activeNode && !editingLine && !groupModalId && !showThemeModal && !showHelpModal && !showCreateSchema && !showDeleteSchema && deleteGroupConfirmId === null && !internalViewNode && (
        <div id="tooltip" style={{ position: 'absolute', left: mouseRef.current.x + 15, top: mouseRef.current.y + 15, background: 'var(--bg-panel)', border: '1px solid var(--accent)', color: 'var(--text-main)', padding: '12px', borderRadius: '8px', pointerEvents: 'none', zIndex: 1000, boxShadow: 'var(--shadow-lg)', fontSize: '12px', fontFamily: 'Inter, sans-serif', backdropFilter: 'blur(8px)', minWidth: '200px' }}>
            <div style={{color: 'var(--accent)', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', marginBottom: '8px', paddingBottom: '6px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {getId(hoverBead.link.source as NodeData)} 
                    <Icon name="arrow-left-right" size={12} /> 
                    {getId(hoverBead.link.target as NodeData)}
                </span>
            </div>
            <div className="mono-text" style={{fontSize: 11, lineHeight: '1.6'}}>
              <div style={{display: 'flex', alignItems: 'baseline'}}><span style={{color:'var(--text-muted)', width: '50px', flexShrink: 0}}>Origem:</span><span style={{fontWeight: 500, color: 'var(--text-main)'}}>{hoverBead.detail.tableSource}</span></div>
              <div style={{display: 'flex', alignItems: 'baseline'}}><span style={{color:'var(--text-muted)', width: '50px', flexShrink: 0}}>Destino:</span><span style={{fontWeight: 500, color: 'var(--text-main)'}}>{hoverBead.detail.tableTarget}</span></div>
              <div style={{borderTop:'1px dashed var(--border-color)', paddingTop:6, marginTop:6, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'}}>
                 <span style={{color:'var(--accent)'}}>{hoverBead.detail.colSource}</span>
                 <span style={{ background:'var(--bg-app)', color:'var(--text-muted)', padding:'1px 5px', borderRadius:'4px', fontSize:'10px', fontWeight: 'bold', border:'1px solid var(--border-color)', display: 'inline-block' }}>{hoverBead.detail.card}</span>
                 <span style={{color:'var(--accent)'}}>{hoverBead.detail.colTarget}</span>
              </div>
            </div>
        </div>
      )}

      {hoverNode && !hoverBead && !activeNode && !editingLine && !groupModalId && !showThemeModal && !showHelpModal && !showCreateSchema && !showDeleteSchema && deleteGroupConfirmId === null && !internalViewNode && (
        <div ref={tooltipDivRef} style={{ position: 'absolute', left: mouseRef.current.x + 15, top: mouseRef.current.y + 15, background: 'var(--bg-panel)', border: '1px solid var(--accent)', color: 'var(--text-main)', padding: '12px', borderRadius: '8px', pointerEvents: 'none', zIndex: 1000, boxShadow: 'var(--shadow-lg)', fontSize: '12px', fontFamily: 'Inter, sans-serif', backdropFilter: 'blur(8px)', minWidth: '180px' }}>
            <div style={{color: 'var(--accent)', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', marginBottom: '8px', paddingBottom: '6px', fontSize: '13px'}}>Módulo: {hoverNode.id}</div>
            <div className="mono-text" style={{fontSize: 11, lineHeight: '1.6'}}>
                <span style={{color:'var(--text-muted)', display:'block', marginBottom:'6px', fontFamily: 'Inter, sans-serif'}}>Tabelas Mapeadas:</span>
                <div ref={tooltipScrollRef} style={{maxHeight: '200px', overflowY: 'auto', pointerEvents: 'auto', paddingRight: '4px'}}>
                    {hoveredNodeTables.length > 0 ? (hoveredNodeTables.map(tableName => (<div key={tableName} style={{ paddingLeft: '6px', borderLeft: '2px solid var(--accent)', marginBottom: '4px', color: 'var(--text-main)' }}>{tableName}</div>))) : (<span style={{color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'Inter, sans-serif'}}>Nenhuma tabela</span>)}
                </div>
            </div>
        </div>
      )}

      {internalHoverNode && internalViewNode && (
        <div ref={tooltipDivRef} style={{ position: 'absolute', left: mouseRef.current.x + 15, top: mouseRef.current.y + 15, background: 'var(--bg-panel)', border: '1px solid var(--accent)', color: 'var(--text-main)', padding: '12px', borderRadius: '8px', pointerEvents: 'none', zIndex: 3000, boxShadow: 'var(--shadow-lg)', fontSize: '12px', fontFamily: 'Inter, sans-serif', backdropFilter: 'blur(8px)', minWidth: '220px' }}>
            <div style={{color: 'var(--accent)', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', marginBottom: '8px', paddingBottom: '6px', fontSize: '13px'}}>Tabela: {internalHoverNode}</div>
            <div className="mono-text" style={{fontSize: 11, lineHeight: '1.6'}}>
                <span style={{color:'var(--text-muted)', display:'block', marginBottom:'6px', fontFamily: 'Inter, sans-serif'}}>Colunas Interagindo:</span>
                <div ref={tooltipScrollRef} style={{maxHeight: '200px', overflowY: 'auto', pointerEvents: 'auto', paddingRight: '4px'}}>
                    {internalHoveredColumns.length > 0 ? (
                        internalHoveredColumns.map(col => (
                            <div key={col} style={{ paddingLeft: '6px', borderLeft: '2px solid var(--accent)', marginBottom: '4px', color: 'var(--text-main)' }}>{col}</div>
                        ))
                    ) : ( <span style={{color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'Inter, sans-serif'}}>Sem conexões ativas</span> )}
                </div>
            </div>
        </div>
      )}

      <div className="floater-container">
          <button className="floater-btn" onClick={() => setShowPathfinder(!showPathfinder)} title="Traçador de Caminhos">
              <Icon name="map" size={22} />
          </button>
          <button className="floater-btn" onClick={() => setShowAnalyticsModal(true)} title="Analytics">
              <Icon name="bar-chart" size={22} />
          </button>
          
          <button className="floater-btn" onClick={() => { setShowHelpModal(true); setHelpTab('basico'); }} title="Ajuda"><Icon name="help" size={22} /></button>
          <button className="floater-btn" onClick={() => setShowThemeModal(true)} title="Configurações"><Icon name="settings" size={22} /></button>

          {usuarioAtual?.funcao === 'admin' && (
            <button className="floater-btn" onClick={() => { setShowUserManagement(true); carregarUsuarios(); }} title="Gerenciar Usuários">
                <Icon name="user" size={22} />
            </button>
            )}
            {/* INPUT OCULTO PARA O MINERADOR */}
          {usuarioAtual?.funcao === 'admin' && (
              <>
                  <input type="file" accept=".csv" ref={minerInputRef} style={{ display: 'none' }} onChange={handleMineDataCSV} />
                  <button className="floater-btn" onClick={() => minerInputRef.current?.click()} title="Mineração de Views (Admin)" style={{ color: 'var(--accent)' }}>
                      <Icon name="database" size={22} />
                  </button>
              </>
          )}
            <button className="floater-btn" onClick={handleLogout} title="Sair do Sistema" style={{ color: 'var(--danger)' }}>
              <Icon name="log-out" size={22} />
          </button>
      </div>

      <ForceGraph2D
        ref={graphRef} graphData={graphData} nodeRelSize={nodeSize} backgroundColor={bgGraphColor} 
        nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as NodeData;
            // GHOSTING: Se o grupo está oculto, nós simplesmente ignoramos a pintura dele
            if (hiddenGroups.has(n.group)) return; 
            
            paintNode(n, ctx, globalScale, groups, nodeSize, focusNode, graphLinks, theme, highlightNodes);
        }}
        linkCanvasObject={(link, ctx, globalScale) => {
            const l = link as ConsolidatedLink;
            const src = l.source as NodeData;
            const tgt = l.target as NodeData;
            
            // GHOSTING: Se a origem ou o destino da linha estão ocultos, não pintamos a linha
            if (hiddenGroups.has(src.group) || hiddenGroups.has(tgt.group)) return;

            // 1. Desenha a linha normal primeiro
            paintLink(l, ctx, focusNode, hoverBead, theme, accentColor, highlightLinks, nodeSize, showBeads);
            
            // 2. Animação do Pathfinder (Laser)
            const sId = src.id;
            const tId = tgt.id;
            const linkId1 = `${sId}->${tId}`;
            const linkId2 = `${tId}->${sId}`;

            if (isPathfindingRef.current && pathAnimState) {
                if (pathAnimState.id1 === linkId1 || pathAnimState.id1 === linkId2) {
                    if (typeof src.x === 'number' && typeof src.y === 'number' && typeof tgt.x === 'number' && typeof tgt.y === 'number') {
                        const isForward = pathAnimState.sourceId === sId;
                        const startX = isForward ? src.x : tgt.x;
                        const startY = isForward ? src.y : tgt.y;
                        const endX = isForward ? tgt.x : src.x;
                        const endY = isForward ? tgt.y : src.y;
                        
                        const p = pathAnimState.progress;
                        const currentX = startX + (endX - startX) * p;
                        const currentY = startY + (endY - startY) * p;
                        
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        ctx.lineTo(currentX, currentY);
                        ctx.strokeStyle = accentColor;
                        ctx.lineWidth = 3 / globalScale;
                        ctx.stroke();
                        
                        ctx.beginPath();
                        ctx.arc(currentX, currentY, 3.5 / globalScale, 0, 2 * Math.PI);
                        ctx.fillStyle = '#ffffff';
                        ctx.fill();
                        ctx.restore();
                    }
                }
            }
        }}
        onZoom={checkInteractions} 
        onNodeClick={(node) => { 
            const n = node as NodeData;
            clearPath();
            if (lockedNode && !highlightNodes.has(n.id)) return;
            setActiveNode(n); setShowInternalList(false); setModalSearch(''); setVisibleLimit(50); 
        }}
        onLinkClick={(link) => { 
            const l = link as ConsolidatedLink;
            if (lockedNode && !highlightLinks.has(l)) return;
            if (usuarioAtual?.funcao === 'obs') return; // Bloqueia clique para edição nas linhas

            if (hoverBead && hoverBead.link === l) setEditingBead(hoverBead); 
            else setEditingLine(l); 
        }}
        nodePointerAreaPaint={(node: object, color: string, ctx: CanvasRenderingContext2D) => {
            const n = node as NodeData;
            // Remove a interatividade (mouse) de nós invisíveis
            if (hiddenGroups.has(n.group)) return; 
            
            if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
            if (lockedNode && !highlightNodes.has(n.id)) return;
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, nodeSize, 0, 2 * Math.PI); ctx.fill();
        }}
        linkPointerAreaPaint={(link: object, color: string, ctx: CanvasRenderingContext2D) => {
            const l = link as ConsolidatedLink;
            const src = l.source as NodeData;
            const tgt = l.target as NodeData;
            
            // Remove a interatividade (mouse) de linhas invisíveis
            if (hiddenGroups.has(src.group) || hiddenGroups.has(tgt.group)) return; 
            
            if (lockedNode && !highlightLinks.has(l)) return;
            if (typeof src.x !== 'number' || typeof src.y !== 'number' || typeof tgt.x !== 'number' || typeof tgt.y !== 'number') return;
            ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(tgt.x, tgt.y); ctx.stroke();
        }}
        
        cooldownTicks={500} d3AlphaDecay={0.04} d3VelocityDecay={0.4} onEngineStop={() => {}}

        onNodeDragEnd={node => {
                          const n = node as NodeData;
                          // Libera as âncoras para que a gravidade e atração de grupos voltem a atuar
                          n.fx = undefined;
                          n.fy = undefined;
                          if (graphRef.current) graphRef.current.d3ReheatSimulation();
                      }}
                  />

      <Panel title="Controles" style={{ top: 20, left: 20, width: 340 }} minimized={panels.settings} onToggle={() => setPanels(p => ({...p, settings: !p.settings}))}>
         <span style={{fontSize:11, color:'var(--accent)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:10}}>Física</span>
         
         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
             <button onClick={handleToggleExpand} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 4px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: isExpanded ? 'var(--accent-text)' : 'var(--accent)', backgroundColor: isExpanded ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s ease'}} title={isExpanded ? "Voltar ao agrupamento padrão" : "Aumentar espaçamento entre módulos"}>
                 <Icon name={isExpanded ? 'zoom-out' : 'zoom-in'} size={14} /> {isExpanded ? 'Contrair' : 'Expandir'}
             </button>
             
             <button onClick={() => setAttractGroups(!attractGroups)} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 4px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: attractGroups ? 'var(--accent-text)' : 'var(--accent)', backgroundColor: attractGroups ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s ease'}} title="Atrair grupos para formar ilhas separadas">
                 <Icon name="users" size={14} /> {attractGroups ? 'Ilhas Ativas' : 'Criar Ilhas'}
             </button>
         </div>
         
         <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
             <button onClick={() => setShowBeads(!showBeads)} style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 4px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: showBeads ? 'var(--accent-text)' : 'var(--text-muted)', backgroundColor: showBeads ? 'var(--accent)' : 'transparent', border: showBeads ? '1px solid var(--accent)' : '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s ease'}} title="Mostrar ou Ocultar as bolinhas de conexão do grafo">
                 <Icon name={showBeads ? 'eye' : 'eye-off'} size={14} /> {showBeads ? 'Conexões ON' : 'Conexões OFF'}
             </button>
         </div>

         <Slider label="Tamanho Módulos" min={10} max={50} step={0.5} value={nodeSize} onChange={setNodeSize} />
         <Slider label="Comprimento Link" min={10} max={2000} value={physics.linkDistance} onChange={v => setPhysics(p => ({...p, linkDistance: v}))} />
         <Slider label="Repulsão" min={0} max={2000} value={physics.repulsion} onChange={v => setPhysics(p => ({...p, repulsion: v}))} />
         <Slider label="Gravidade Central" min={0} max={0.5} step={0.01} value={physics.centralGravity} onChange={v => setPhysics(p => ({...p, centralGravity: v}))} />
         
         {/* CABEÇALHO DA LISTA DE GRUPOS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 20 }}>
              <span style={{fontSize:11, color:'var(--accent)', fontWeight:600, textTransform:'uppercase'}}>Grupos</span>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                  {usuarioAtual?.funcao === 'admin' && (
                      <button onClick={runAutoClustering} style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }} title="Identificar ecossistemas baseados nas ligações do banco">
                          <Icon name="users" size={12} /> Auto-Agrupar
                      </button>
                  )}
                  <button onClick={toggleAllGroupsVisibility} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
                      <Icon name={hiddenGroups.size > 0 ? 'eye' : 'eye-off'} size={12} /> {hiddenGroups.size > 0 ? 'Mostrar' : 'Ocultar'}
                  </button>
              </div>
          </div>

         <div className="group-list-container">
             {/* Injetamos o 'Sem Grupo' no topo da lista artificialmente para que ele também tenha o Olho de visibilidade */}
             {[{ id: 0, name: 'Sem Grupo', color: '#555555', readonly: true }, ...groups.map(g => ({ ...g, readonly: false }))].map(g => (
                 <div key={g.id} className="group-card" style={{ opacity: hiddenGroups.has(g.id) ? 0.5 : 1 }}>
                     
                     {/* NOVO: ÍCONE DE OLHO PARA VISIBILIDADE */}
                     <button onClick={() => toggleGroupVisibility(g.id)} className="btn-mini" style={{ padding: '0 4px', background: 'transparent', border: 'none', color: hiddenGroups.has(g.id) ? 'var(--text-muted)' : 'var(--text-main)', boxShadow: 'none' }} title={hiddenGroups.has(g.id) ? "Mostrar Módulos" : "Ocultar Módulos"}>
                         <Icon name={hiddenGroups.has(g.id) ? 'eye-off' : 'eye'} size={16} />
                     </button>

                     {g.readonly ? (
                         <div style={{ width: '22px', height: '22px', borderRadius: '4px', backgroundColor: g.color, marginLeft: '4px' }} />
                     ) : (
                         <input type="color" className="group-color-input" value={g.color} disabled={usuarioAtual?.funcao === 'obs'} onChange={e => handleGroupColorChange(g.id, e.target.value)} onBlur={() => updateGroupInDB(g.id, g.name, g.color)} />
                     )}
                     
                     {g.readonly ? (
                         <span style={{ flex: 1, fontSize: '12px', paddingLeft: '8px', color: 'var(--text-muted)' }}>{g.name}</span>
                     ) : (
                         <input type="text" className="group-name-input" value={g.name} disabled={usuarioAtual?.funcao === 'obs'} onChange={e => handleGroupNameChange(g.id, e.target.value)} onBlur={() => updateGroupInDB(g.id, g.name, g.color)} spellCheck={false} />
                     )}

                     {!g.readonly && usuarioAtual?.funcao !== 'obs' && (
                         <div className="group-actions">
                            <button onClick={() => setGroupModalId(g.id)} className="btn-mini" title="Gerenciar Membros"><Icon name="user" size={16} /></button>
                            <button onClick={() => setDeleteGroupConfirmId(g.id)} className="btn-mini danger" title="Excluir Grupo"><Icon name="trash" size={14} /></button>
                         </div>
                     )}
                 </div>
             ))}
         </div>
         {usuarioAtual?.funcao !== 'obs' && (
             <button className="btn-dashed" onClick={createNewGroup}><Icon name="plus" size={14} /> Novo Grupo</button>
         )}
      </Panel>

      {usuarioAtual?.funcao !== 'obs' && (
          <Panel title="Editor Manual" style={{ top: 20, right: 20, width: 360 }} minimized={panels.right} onToggle={() => setPanels(p => ({...p, right: !p.right}))}>
              <div style={{marginBottom:20}}>
                <span style={{fontSize:12, color:'var(--text-main)', fontWeight:600, display:'block', marginBottom:8}}>Novo Módulo</span>
                <input type="text" placeholder="Sigla (Ex: WMS)" value={manualNode.name} onChange={e => setManualNode({...manualNode, name: e.target.value.toUpperCase()})} />
                <select value={manualNode.group} onChange={e => setManualNode({...manualNode, group: Number(e.target.value)})}>
                  <option value={0}>Sem Grupo</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <ActionButton onClick={addManualNode}>Criar Módulo</ActionButton>
              </div>
              <div>
                <span style={{fontSize:12, color:'var(--text-main)', fontWeight:600, display:'block', marginBottom:8}}>Nova Conexão</span>
                <div style={{display:'flex', gap:10, marginBottom:10}}>
                    <div style={{flex:1}}><label style={labelStyle}>De</label><select value={manualLink.src} onChange={e => setManualLink({...manualLink, src: e.target.value})}><option value="">...</option>{sortedNodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}</select></div>
                    <div style={{flex:1}}><label style={labelStyle}>Para</label><select value={manualLink.tgt} onChange={e => setManualLink({...manualLink, tgt: e.target.value})}><option value="">...</option>{sortedNodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}</select></div>
                </div>
                <div style={gridRowStyle}><div><label style={labelStyle}>Tabela Origem</label><input className="mono-text" value={manualLink.ts} onChange={e => setManualLink({...manualLink, ts: e.target.value})} /></div><div><label style={labelStyle}>Coluna Origem</label><input className="mono-text" value={manualLink.colS} onChange={e => setManualLink({...manualLink, colS: e.target.value})} /></div></div>
                <div style={gridRowStyle}><div><label style={labelStyle}>Tabela Destino</label><input className="mono-text" value={manualLink.tt} onChange={e => setManualLink({...manualLink, tt: e.target.value})} /></div><div><label style={labelStyle}>Coluna Destino</label><input className="mono-text" value={manualLink.colT} onChange={e => setManualLink({...manualLink, colT: e.target.value})} /></div></div>
                <div style={{marginBottom: 10}}>
                    <label style={labelStyle}>Cardinalidade</label>
                    <select value={manualLink.card} onChange={e => setManualLink({...manualLink, card: e.target.value})}><option value="1:N">1:N</option><option value="N:1">N:1</option><option value="1:1">1:1</option></select>
                </div>
                <ActionButton onClick={addManualLink}>Conectar</ActionButton>
              </div>
          </Panel>
      )}

        {/* 1. PAINEL DE CAMINHOS ENCONTRADOS (AGORA COM ABAS E PAGINAÇÃO) */}
      {foundPathsList && isPathfinding && foundPathsList.length > 0 && (
          <div style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', width: '380px', background: 'var(--bg-panel)', border: '1px solid var(--accent)', borderRadius: '8px', padding: '15px', boxShadow: 'var(--shadow-lg)', zIndex: 1500, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icon name="database" size={14} /> Rotas Encontradas
                  </span>
                  <button onClick={() => setFoundPathsList(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Icon name="x" size={14} /></button>
              </div>

              {/* ABAS DE FILTRO */}
              <div style={{ display: 'flex', gap: '4px', background: 'var(--input-bg)', padding: '4px', borderRadius: '6px', marginBottom: '10px' }}>
                  <button onClick={() => { setPathFilter('all'); setVisiblePathsLimit(25); }} style={{ flex: 1, padding: '4px 0', fontSize: '10px', fontWeight: 600, borderRadius: '4px', cursor: 'pointer', border: 'none', background: pathFilter === 'all' ? 'var(--accent)' : 'transparent', color: pathFilter === 'all' ? 'var(--accent-text)' : 'var(--text-muted)' }}>Todas</button>
                  <button onClick={() => { setPathFilter('internal'); setVisiblePathsLimit(25); }} style={{ flex: 1, padding: '4px 0', fontSize: '10px', fontWeight: 600, borderRadius: '4px', cursor: 'pointer', border: 'none', background: pathFilter === 'internal' ? 'var(--accent)' : 'transparent', color: pathFilter === 'internal' ? 'var(--accent-text)' : 'var(--text-muted)' }}>Internas</button>
                  <button onClick={() => { setPathFilter('external'); setVisiblePathsLimit(25); }} style={{ flex: 1, padding: '4px 0', fontSize: '10px', fontWeight: 600, borderRadius: '4px', cursor: 'pointer', border: 'none', background: pathFilter === 'external' ? 'var(--accent)' : 'transparent', color: pathFilter === 'external' ? 'var(--accent-text)' : 'var(--text-muted)' }}>Externas</button>
              </div>
              
              {/* LISTA DE ROTAS (BOTÕES) */}
              {(() => {
                  const filteredPaths = foundPathsList.filter(p => pathFilter === 'all' ? true : pathFilter === 'internal' ? p.isInternal : !p.isInternal);
                  const displayedPaths = filteredPaths.slice(0, visiblePathsLimit);
                  
                  return (
                      <>
                          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid var(--border-color)' }}>
                              {filteredPaths.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>Nenhuma rota deste tipo encontrada.</div>}
                              {displayedPaths.map((path) => {
                                  // Como filtramos a lista, precisamos achar o índice real dela na lista original para a animação funcionar certinho
                                  const realIndex = foundPathsList.indexOf(path);
                                  return (
                                      <button key={realIndex} onClick={() => startPathAnimation(path.nodes, realIndex)} style={{ flexShrink: 0, padding: '4px 10px', fontSize: '11px', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer', border: selectedPathIndex === realIndex ? '1px solid var(--accent)' : '1px solid var(--border-color)', background: selectedPathIndex === realIndex ? 'var(--accent)' : 'transparent', color: selectedPathIndex === realIndex ? 'var(--accent-text)' : 'var(--text-main)', transition: '0.2s' }}>
                                          {realIndex + 1}
                                      </button>
                                  );
                              })}
                          </div>
                          
                          {/* PASSOS DA ROTA SELECIONADA */}
                          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '5px' }}>
                              {foundPathsList[selectedPathIndex]?.steps.length > 0 ? (
                                  foundPathsList[selectedPathIndex].steps.map((step, idx) => (
                                      <div key={idx} style={{ marginBottom: '12px', background: 'var(--input-bg)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>PASSO {step.stepIdx}</div>
                                          <div className="mono-text" style={{ fontSize: '11px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ color: 'var(--accent)' }}>{step.tableA}</span><span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>[{step.modA}]</span>
                                              </div>
                                              <div style={{ paddingLeft: '8px', borderLeft: '1px dashed var(--border-color)', color: 'var(--text-muted)', margin: '2px 0' }}>
                                                  <Icon name="arrow-down" size={10} style={{ marginRight: '4px' }} /> ON <span style={{ color: 'var(--text-main)' }}>{step.colA}</span> = <span style={{ color: 'var(--text-main)' }}>{step.colB}</span>
                                              </div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                  <span style={{ color: 'var(--accent)' }}>{step.tableB}</span><span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>[{step.modB}]</span>
                                              </div>
                                          </div>
                                      </div>
                                  ))
                              ) : (
                                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>Conexão direta no nível de Módulo (Sem rastreio de JOINs).</div>
                              )}
                          </div>

                          {/* BOTÃO CARREGAR MAIS */}
                          {filteredPaths.length > visiblePathsLimit && (
                              <button onClick={() => setVisiblePathsLimit(prev => prev + 25)} style={{ width: '100%', padding: '8px', marginTop: '10px', background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                                  Carregar mais rotas (+25)
                              </button>
                          )}
                      </>
                  );
              })()}
          </div>
      )}

      {/* 2. A PÍLULA FLUTUANTE (TRAÇADOR) */}
      {showPathfinder && (
          <div style={{
              position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
              background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '50px',
              padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '16px',
              boxShadow: 'var(--shadow-lg)', zIndex: 2000, backdropFilter: 'blur(8px)'
          }}>
              {isCalculatingPath ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontSize: '12px', fontWeight: 'bold' }}>
                      <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                      Calculando rotas...
                  </div>
              ) : (
                  <>
                      <Icon name="map" size={18} style={{ color: 'var(--accent)' }} />

                      <div style={{ marginTop: '4px' }}>
                          <select 
                              value={pathMode} 
                              onChange={(e) => { setPathMode(e.target.value as 'modulos'|'tabelas'); setPathSource(''); setPathTarget(''); clearPath(); }}
                              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-main)', fontSize: '11px', padding: '4px 8px', borderRadius: '12px', outline: 'none', cursor: 'pointer', fontWeight: 600, marginTop: '5px' }}
                          >
                              <option value="modulos">Módulos</option>
                              <option value="tabelas">Tabelas</option>
                          </select>
                      </div>
                      
                      <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }}></div>

                      <div style={{ position: 'relative', marginTop: '10px' }}>
                          <input type="text" placeholder={`Origem...`} value={pathSource} onChange={e => setPathSource(e.target.value.toUpperCase())} onFocus={() => setSourceFocus(true)} onBlur={() => setTimeout(() => setSourceFocus(false), 200)} style={{ width: '130px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)', outline: 'none', fontSize: '12px', textAlign: 'center', fontWeight: 600}} />
                          {sourceFocus && pathSource && ((pathMode === 'modulos' && !nodes.find(n => n.id === pathSource)) || (pathMode === 'tabelas' && !uniqueTablesList.includes(pathSource))) && (
                              <div style={{ position: 'absolute', bottom: '100%', left: 0, width: '100%', marginBottom: '8px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                                  {ordenarPorRelevancia((pathMode === 'modulos' ? sortedNodes.map(n => n.id) : uniqueTablesList).filter(id => id.includes(pathSource)), pathSource).slice(0, 8).map(id => (<div key={id} onClick={() => setPathSource(id)} style={{ padding: '8px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)' }}>{id}</div>))}
                              </div>
                          )}
                      </div>
                      
                      <Icon name="arrow-right" size={14} style={{ color: 'var(--text-muted)'}} />
                      
                      <div style={{ position: 'relative', marginTop: '10px' }}>
                          <input type="text" placeholder={`Destino...`} value={pathTarget} onChange={e => setPathTarget(e.target.value.toUpperCase())} onFocus={() => setTargetFocus(true)} onBlur={() => setTimeout(() => setTargetFocus(false), 200)} style={{ width: '130px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)', outline: 'none', fontSize: '12px', textAlign: 'center', fontWeight: 600}} />
                          {targetFocus && pathTarget && ((pathMode === 'modulos' && !nodes.find(n => n.id === pathTarget)) || (pathMode === 'tabelas' && !uniqueTablesList.includes(pathTarget))) && (
                              <div style={{ position: 'absolute', bottom: '100%', left: 0, width: '100%', marginBottom: '8px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                                  {ordenarPorRelevancia((pathMode === 'modulos' ? sortedNodes.map(n => n.id) : uniqueTablesList).filter(id => id.includes(pathTarget)), pathTarget).slice(0, 8).map(id => (<div key={id} onClick={() => setPathTarget(id)} style={{ padding: '8px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)' }}>{id}</div>))}
                              </div>
                          )}
                      </div>

                      <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }}></div>

                      {/* SELETOR CIRCULAR DE LIMITES (Agora de 0 a 3) */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '80px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button onClick={() => setPathLimit(Math.max(0, pathLimit - 1))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}><Icon name="minus" size={12} /></button>
                              <div style={{ position: 'relative', width: '26px', height: '26px' }} onWheel={(e) => { e.preventDefault(); setPathLimit(Math.max(0, Math.min(3, pathLimit + (e.deltaY > 0 ? -1 : 1)))); }}>
                                  <svg viewBox="0 0 40 40" width="100%" height="100%" style={{ transform: 'rotate(-90deg)' }}>
                                      {/* Desenhando 3 segmentos de 120 graus */}
                                      {Array.from({ length: 3 }).map((_, i) => (
                                        <circle 
                                            key={i} 
                                            cx="20" 
                                            cy="20" 
                                            r="16" 
                                            fill="none"
                                            stroke={i < pathLimit ? 'var(--accent)' : 'var(--border-color)'}
                                            strokeWidth="4"
                                            strokeLinecap="round"
                                            strokeDasharray="22 80" 
                                            transform={`rotate(${i * 120} 20 20)`} 
                                            style={{ transition: 'stroke 0.3s' }} 
                                        />
                                    ))}
                                  </svg>
                                  <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '10px', fontWeight: 800, color: 'var(--text-main)' }}>{pathLimit}</span>
                              </div>
                              <button onClick={() => setPathLimit(Math.min(3, pathLimit + 1))} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}><Icon name="plus" size={12} /></button>
                          </div>
                      </div>

                      <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }}></div>

                      {/* Usando a nova função assíncrona handleCalculateClick */}
                      <button onClick={handleCalculateClick} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '8px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', marginTop: '4px' }}>
                          Buscar
                      </button>

                      {isPathfinding && (
                          <button onClick={clearPath} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', marginTop: '4px' }} title="Limpar Rota">
                              <Icon name="x" size={18} />
                          </button>
                      )}
                      
                      <button onClick={() => setShowPathfinder(false)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', marginLeft: '2px', marginTop: '4px' }} title="Fechar">
                          <Icon name="power" size={16} />
                      </button>
                  </>
              )}
          </div>
      )}

      {showCreateSchema && (
          <Modal title="Criar Área de Trabalho" onClose={() => setShowCreateSchema(false)} 
              footer={<><ActionButton variant="secondary" onClick={() => setShowCreateSchema(false)} style={{width: 'auto', borderRadius: 5, marginTop: 10}}>Cancelar</ActionButton><ActionButton onClick={handleCreateSchema} style={{width: 'auto'}}>Criar</ActionButton></>}>
              <label style={labelStyle}>Nome do Esquema</label>
              <input type="text" value={newSchemaName} onChange={e => setNewSchemaName(e.target.value)} placeholder="Ex: Arquitetura Logística" autoFocus />
          </Modal>
      )}

      {showDeleteSchema && (
          <Modal title="Deletar Área de Trabalho" onClose={() => setShowDeleteSchema(false)} 
              footer={<><ActionButton variant="secondary" onClick={() => setShowDeleteSchema(false)} style={{width: 'auto', borderRadius: 5}}>Cancelar</ActionButton><ActionButton variant="danger" onClick={handleDeleteSchema} style={{width: 'auto', borderRadius: 5, height: 30}}>Sim, Deletar</ActionButton></>}>
              <p style={{fontSize: 13, color: 'var(--text-main)', marginTop: 0}}>
                  Tem certeza que deseja deletar permanentemente a área de trabalho <strong>{esquemas.find(s => s.id_esquema === activeSchemaId)?.nome_esquema}</strong>?
              </p>
              <p style={{fontSize: 12, color: 'var(--danger)', marginBottom: 0}}>Esta ação não pode ser desfeita.</p>
          </Modal>
      )}

      {deleteGroupConfirmId !== null && (
          <Modal title="Excluir Grupo" onClose={() => setDeleteGroupConfirmId(null)} 
              footer={<><ActionButton variant="secondary" onClick={() => setDeleteGroupConfirmId(null)} style={{width: 'auto', borderRadius: 5}}>Cancelar</ActionButton><ActionButton variant="danger" onClick={handleDeleteGroupExecute} style={{width: 'auto', borderRadius: 5}}>Excluir</ActionButton></>}>
              <p style={{fontSize: 13, color: 'var(--text-main)', marginTop: 0}}>Você está prestes a excluir o grupo <strong>{groups.find(g => g.id === deleteGroupConfirmId)?.name}</strong>.</p>
              <p style={{fontSize: 12, color: 'var(--text-muted)', marginBottom: 0}}>Os módulos que pertencem a ele não serão excluídos, mas ficarão sem cor (Sem Grupo).</p>
          </Modal>
      )}

      {deleteNodeConfirmId !== null && (
          <Modal title="Excluir Módulo" onClose={() => setDeleteNodeConfirmId(null)} 
              footer={
                  <div style={{ display: 'flex', gap: '8px' }}>
                      <ActionButton variant="secondary" onClick={() => setDeleteNodeConfirmId(null)} style={{width: 'auto', borderRadius: 'var(--radius)'}}>Cancelar</ActionButton>
                      <ActionButton variant="danger" onClick={handleDeleteNodeExecute} style={{width: 'auto', borderRadius: 'var(--radius)'}}>Excluir</ActionButton>
                  </div>
              }>
              <p style={{fontSize: 13, color: 'var(--text-main)', marginTop: 0}}>Você está prestes a excluir o módulo <strong>{deleteNodeConfirmId}</strong>.</p>
              <p style={{fontSize: 12, color: 'var(--danger)', marginBottom: 0}}>Todas as conexões (internas e externas) ligadas a ele também serão excluídas permanentemente.</p>
          </Modal>
      )}

      {groupModalId && (
        <Modal title={`Membros: ${groups.find(g => g.id === groupModalId)?.name}`} onClose={() => setGroupModalId(null)} footer={<ActionButton onClick={() => setGroupModalId(null)}>Concluir</ActionButton>}>
            <input type="text" placeholder="Buscar módulo..." value={memberSearch} onChange={e => setMemberSearch(e.target.value.toUpperCase())} autoFocus />
            <div style={{ maxHeight: '300px' }}>
                {sortedNodes.filter(n => n.id.includes(memberSearch)).map(n => (
                    <div key={n.id} style={{ display:'flex', alignItems:'center', padding:'8px', borderBottom:'1px solid var(--border-color)' }}>
                        <input type="checkbox" checked={n.group === groupModalId} onChange={e => toggleNodeGroup(n.id, groupModalId, e.target.checked)} />
                        <span style={{ fontSize:13 }}>{n.id}</span>
                    </div>
                ))}
            </div>
        </Modal>
      )}

      {showThemeModal && (
        <Modal title="Configurações & Tema" onClose={() => setShowThemeModal(false)}>
          <span style={{fontSize:12, color:'var(--text-muted)', display:'block', marginBottom:10}}>Aparência</span>
          <div className="theme-grid" style={{ marginBottom: '20px' }}>
            <div className={`theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}><Icon name="sun" size={20} /> Light</div>
            <div className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}><Icon name="moon" size={20} /> Dark</div>
            <div className={`theme-btn ${theme === 'system' ? 'active' : ''}`} onClick={() => setTheme('system')}><Icon name="monitor" size={20} /> System</div>
          </div>
          <span style={{fontSize:12, color:'var(--text-muted)', display:'block', marginBottom:10}}>Cor Principal (Accent)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--input-bg)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} style={{ width: '36px', height: '36px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }} />
              <span className="mono-text" style={{ fontSize: 13, color: 'var(--text-main)' }}>{accentColor.toUpperCase()}</span>
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  {['#7c4dff', '#00e5ff', '#1de9b6', '#ffea00', '#ff5252'].map(c => (
                      <div key={c} onClick={() => setAccentColor(c)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer', border: accentColor === c ? '2px solid var(--text-main)' : '2px solid transparent', transition: 'border 0.2s' }} />
                  ))}
              </div>
          </div>
        </Modal>
      )}

      {showHelpModal && ( 
          <Modal title="Centro de Ajuda: EBS-Graph" onClose={() => setShowHelpModal(false)} maxWidth="680px">
              {/* Forçamos uma largura de 650px aqui para criar o formato paisagem */}
              <div style={{ display: 'flex', flexDirection: 'column', width: '680px', maxWidth: '100%', minHeight: '380px' }}>
                  
                  {/* MENU SUPERIOR DE ABAS (HORIZONTAL) */}
                  <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '15px', overflowX: 'auto' }}>
                      <button onClick={() => setHelpTab('basico')} style={{ flex: 1, textAlign: 'center', padding: '8px 12px', borderRadius: '6px', background: helpTab === 'basico' ? 'var(--accent)' : 'transparent', color: helpTab === 'basico' ? 'var(--accent-text)' : 'var(--text-main)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: '0.2s', whiteSpace: 'nowrap' }}>
                          <Icon name="monitor" size={14} style={{ marginRight: '6px', marginBottom: '-2px' }} /> Navegação
                      </button>
                      <button onClick={() => setHelpTab('pathfinder')} style={{ flex: 1, textAlign: 'center', padding: '8px 12px', borderRadius: '6px', background: helpTab === 'pathfinder' ? 'var(--accent)' : 'transparent', color: helpTab === 'pathfinder' ? 'var(--accent-text)' : 'var(--text-main)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: '0.2s', whiteSpace: 'nowrap' }}>
                          <Icon name="map" size={14} style={{ marginRight: '6px', marginBottom: '-2px' }} /> Pathfinder
                      </button>
                      <button onClick={() => setHelpTab('visual')} style={{ flex: 1, textAlign: 'center', padding: '8px 12px', borderRadius: '6px', background: helpTab === 'visual' ? 'var(--accent)' : 'transparent', color: helpTab === 'visual' ? 'var(--accent-text)' : 'var(--text-main)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: '0.2s', whiteSpace: 'nowrap' }}>
                          <Icon name="eye" size={14} style={{ marginRight: '6px', marginBottom: '-2px' }} /> Visual
                      </button>
                      
                      {/* ABA DE EDITOR: Visível para Editores e Admins */}
                      {(usuarioAtual?.funcao === 'edit' || usuarioAtual?.funcao === 'admin') && (
                          <button onClick={() => setHelpTab('editor')} style={{ flex: 1, textAlign: 'center', padding: '8px 12px', borderRadius: '6px', background: helpTab === 'editor' ? 'var(--accent)' : 'transparent', color: helpTab === 'editor' ? 'var(--accent-text)' : 'var(--text-main)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: '0.2s', whiteSpace: 'nowrap' }}>
                              {/* CORREÇÃO: Usando 'pencil' no lugar de 'edit' */}
                              <Icon name="pencil" size={14} style={{ marginRight: '6px', marginBottom: '-2px' }} /> Edição
                          </button>
                      )}

                      {/* ABA DE ADMIN: Visível apenas para Admins */}
                      {usuarioAtual?.funcao === 'admin' && (
                          <button onClick={() => setHelpTab('admin')} style={{ flex: 1, textAlign: 'center', padding: '8px 12px', borderRadius: '6px', background: helpTab === 'admin' ? 'var(--accent)' : 'transparent', color: helpTab === 'admin' ? 'var(--accent-text)' : 'var(--text-main)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: '0.2s', whiteSpace: 'nowrap' }}>
                              {/* CORREÇÃO: Usando 'settings' no lugar de 'shield' */}
                              <Icon name="settings" size={14} style={{ marginRight: '6px', marginBottom: '-2px' }} /> Admin
                          </button>
                      )}
                  </div>

                  {/* CONTEÚDO DA ABA SELECIONADA */}
                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px', fontSize: '12px', color: 'var(--text-main)', lineHeight: '1.6', fontFamily: 'Inter, sans-serif' }}>
                      
                      {helpTab === 'basico' && (
                          <div className="fade-in">
                              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px', display: 'block', marginBottom: '12px' }}>Navegação e Desempenho</span>
                              <p style={{ marginTop: 0 }}>O motor do EBS-Graph funciona como um universo de partículas. Arraste o fundo para mover a câmera e use o <em>scroll</em> do mouse para dar Zoom.</p>
                              
                              <ul style={{ paddingLeft: '20px', margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <li><strong>Busca Dinâmica e Sinônimos:</strong> A pesquisa aceita siglas de mercado (ex: digitar <code>INV</code> busca <code>MTL</code>, <code>OM</code> busca <code>OE</code>). Resultados exatos sempre são priorizados no topo. Ao clicar, a câmera viaja e calcula o zoom ideal automaticamente.</li>
                                  <li><strong>Trava de Foco (Tecla T):</strong> Passe o mouse sobre qualquer módulo (ou tabela) e pressione <strong>T</strong>. O grafo escurecerá tudo ao redor, iluminando apenas as conexões daquele alvo.</li>
                                  <li><strong>Atalho Universal (ESC):</strong> Pressione <code>ESC</code> a qualquer momento para fechar menus, configurações, a janela de Visão Interna ou para limpar rotas do traçador. O sistema sempre fechará a aba que estiver mais "por cima" de forma inteligente.</li>
                                  <li><strong>Busca Múltipla:</strong> Ao abrir os detalhes de um módulo, você pode filtrar as conexões usando ponto e vírgula <code>;</code>. Ex: <code>PO; 1:1</code> mostrará apenas as rotas de PO com essa cardinalidade.</li>
                                  <li><strong>Conexões ON/OFF:</strong> Para poupar o processamento do seu navegador em mapeamentos gigantes, desligue as bolinhas nas configurações. Elas passarão a aparecer apenas quando você colocar o mouse sobre um módulo.</li>
                              </ul>
                          </div>
                      )}

                      {helpTab === 'pathfinder' && (
                          <div className="fade-in">
                              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px', display: 'block', marginBottom: '12px' }}>Traçador de Caminhos (Pathfinder)</span>
                              <p style={{ marginTop: 0 }}>A inteligência artificial de roteamento descobre como interligar dois pontos distantes no banco de dados, evitando colunas indesejadas (como <code>CREATED_BY</code> ou datas) e priorizando chaves de negócio lógicas.</p>
                              
                              <ul style={{ paddingLeft: '20px', margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <li><strong>Módulos vs Tabelas:</strong> No painel flutuante, escolha buscar entre <strong>Módulos</strong> (para ter uma visão macro da arquitetura) ou <strong>Tabelas</strong> (para gerar uma cadeia exata de JOINs passo a passo).</li>
                                  <li><strong>Limite de Pulos:</strong> O botão giratório (de 0 a 3) define quantas "pontes intermediárias" o algoritmo pode usar. Limite 0 exige que haja uma ligação direta.</li>
                                  <li><strong>Rotas Encontradas:</strong> O algoritmo gera dezenas de rotas viáveis e as classifica pela "melhor pontuação". Clique no número da rota na lista para ver o raio animado percorrendo o caminho diretamente no grafo.</li>
                              </ul>
                          </div>
                      )}

                      {helpTab === 'visual' && (
                          <div className="fade-in">
                              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px', display: 'block', marginBottom: '12px' }}>Ferramentas de Análise Visual</span>
                              <p style={{ marginTop: 0 }}>Ferramentas avançadas para dissecar áreas de negócio e organizar o espaço de trabalho.</p>
                              
                              <ul style={{ paddingLeft: '20px', margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <li><strong>Visão Interna vs Externa:</strong> Clique em um módulo para acionar os visores flutuantes. A <strong>Visão Interna</strong> mostra como as tabelas do próprio módulo se relacionam entre si. A <strong>Visão Externa</strong> mapeia as ligações para fora, pintando dinamicamente cada tabela alvo com a cor da sua respectiva área de negócio (ex: Logística, Finanças).</li>
                                  <li><strong>Congelamento Físico (Física OFF):</strong> Dentro dos visores de tabela, você pode clicar em "Física OFF". Isso desliga a força de repulsão magnética, permitindo que você arraste e posicione livremente as tabelas na tela como se estivesse desenhando em um quadro branco.</li>
                                  <li><strong>Criar Ilhas Gravitacionais:</strong> No painel lateral, ative esta opção para ligar a Atração de Grupos. Módulos da mesma cor serão magneticamente puxados uns contra os outros, formando arquipélagos naturais e separando o seu sistema por contextos.</li>
                                  <li><strong>Visibilidade Oculta (Ghosting):</strong> Clique no ícone de "Olho" ao lado de um grupo nos Controles. Os módulos daquela cor ficarão invisíveis, mas o espaço físico que eles ocupam será mantido, despoluindo a tela instantaneamente sem causar reorganizações agressivas no layout geral.</li>
                              </ul>
                          </div>
                      )}

                        {helpTab === 'editor' && (
                          <div className="fade-in">
                              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px', display: 'block', marginBottom: '12px' }}>Ferramentas de Edição</span>
                              <p style={{ marginTop: 0 }}>Como Editor, você tem permissão para organizar a arquitetura visual do sistema e categorizar os módulos.</p>
                              
                              <ul style={{ paddingLeft: '20px', margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <li><strong>Gestão de Grupos:</strong> No painel lateral esquerdo, você pode criar, renomear e alterar a cor dos grupos (Áreas de Negócio). As cores ajudam a identificar rapidamente a qual ecossistema um módulo pertence.</li>
                                  <li><strong>Reatribuição de Módulos:</strong> Ao selecionar um módulo no grafo, o painel flutuante exibirá um campo para você alterar a qual grupo ele pertence.</li>
                                  <li><strong>Persistência:</strong> As alterações de grupos e cores que você faz refletem na base de dados e atualizam a visualização de todos os outros usuários da ferramenta.</li>
                              </ul>
                          </div>
                      )}

                      {helpTab === 'admin' && (
                          <div className="fade-in">
                              <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px', display: 'block', marginBottom: '12px' }}>Administração Avançada</span>
                              <p style={{ marginTop: 0 }}>Acesso exclusivo a ferramentas de manutenção em massa e inteligência de dados arquiteturais.</p>
                              
                              <ul style={{ paddingLeft: '20px', margin: '0 0 16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <li><strong>Inteligência de Agrupamento (Auto-Agrupar):</strong> Localizado no painel de Grupos, este algoritmo recalcula toda a arquitetura visual do banco. Ele utiliza módulos âncora (como FND, GL, MTL) e distribui os módulos customizados analisando o volume e o peso dos relacionamentos (JOINs).</li>
                                  <li><strong>Limpeza de Ruído:</strong> O Auto-Agrupar foi projetado para dissolver nanogrupos. Ecossistemas órfãos com menos de 3 módulos são absorvidos pela categoria "Sem Grupo", mantendo o mapa visual focado.</li>
                                  <li><strong>Restrições de Sistema:</strong> Apenas perfis Administradores podem executar rotinas destrutivas que redesenham o mapa inteiro, garantindo que os editores apenas refinem o trabalho já consolidado.</li>
                              </ul>
                          </div>
                      )}

                  </div>
              </div>
          </Modal>
      )}

      {showAnalyticsModal && (
          <Modal title="Estatísticas do Esquema" onClose={() => setShowAnalyticsModal(false)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  {[
                      { label: 'Módulos', value: analyticsData.modules, icon: 'monitor' },
                      { label: 'Total de Conexões', value: analyticsData.totalConnections, icon: 'arrow-left-right' },
                      { label: 'Grupos Criados', value: analyticsData.groups, icon: 'user' },
                      { label: 'Conexões Externas', value: analyticsData.externalConnections, icon: 'arrow-up' },
                      { label: 'Tabelas Registradas', value: analyticsData.tables, icon: 'plus' },
                      { label: 'Conexões Internas', value: analyticsData.internalConnections, icon: 'arrow-down' }
                  ].map((stat, i) => (
                      <div key={i} style={{ background: 'var(--input-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                              <Icon name={stat.icon} size={14} style={{ color: 'var(--accent)' }} /> {stat.label}
                          </div>
                          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)' }}>{stat.value}</div>
                      </div>
                  ))}
              </div>
          </Modal>
      )}

      {activeNode && (
          <Modal title={``} onClose={() => setActiveNode(null)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', flex: '1 1 auto', minWidth: '150px' }}>Módulo: {activeNode.id}</span>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      {usuarioAtual?.funcao !== 'obs' && (
                          <ActionButton variant="danger" style={{width: 'auto', margin: 0, padding: '0 10px', height: '32px', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center'}} onClick={() => { setDeleteNodeConfirmId(activeNode.id); setActiveNode(null); }} title="Excluir Módulo">
                              <Icon name="trash" size={15} />
                          </ActionButton>
                      )}
                      <ActionButton variant="secondary" style={{ width: 'auto', margin: 0, padding: '0 12px', height: '32px', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }} onClick={() => { setReturnToNode(activeNode); setTableViewerMode('internal'); setInternalViewNode(activeNode.id); setActiveNode(null); }}>
                          <Icon name="eye" size={16} /> <span style={{ lineHeight: 1 }}>Visão Interna</span>
                      </ActionButton>

                      <ActionButton variant="secondary" style={{ width: 'auto', margin: 0, padding: '0 12px', height: '32px', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }} onClick={() => { setReturnToNode(activeNode); setTableViewerMode('external'); setInternalViewNode(activeNode.id); setActiveNode(null); }}>
                          <Icon name="arrow-left-right" size={16} /> <span style={{ lineHeight: 1 }}>Visão Externa</span>
                      </ActionButton>
                  </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Grupo</label>
                  <select value={activeNode.group} disabled={usuarioAtual?.funcao === 'obs'} onChange={e => changeNodeGroupFromModal(activeNode.id, Number(e.target.value))}>
                      <option value={0}>Sem Grupo</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
              </div>
              
              {(() => {
                  const extRaw = rawLinks.filter(r => (getId(r.source) === activeNode.id || getId(r.target) === activeNode.id) && getId(r.source) !== getId(r.target));
                  const intRaw = rawLinks.filter(r => getId(r.source) === activeNode.id && getId(r.target) === activeNode.id);
                  const currentList = showInternalList ? intRaw : extRaw;
                  const filteredList = currentList.filter(r => {
                    // Se a barra estiver vazia, mostra tudo
                    if (!modalSearch.trim()) return true;

                    // Divide a pesquisa por ";", limpa os espaços em branco e remove termos vazios
                    const searchTerms = modalSearch.toLowerCase().split(';').map(t => t.trim()).filter(t => t.length > 0);

                    // O .every() garante que o card só apareça se TODOS os termos digitados baterem
                    return searchTerms.every(term => {
                        // Captura a cardinalidade (se estiver nula no banco antigo, assume N:1 para a pesquisa)
                        const cardValue = r.card || 'N:1'; 

                        // O termo atual existe em alguma destas propriedades?
                        return (
                            r.tableSource.toLowerCase().includes(term) ||
                            r.tableTarget.toLowerCase().includes(term) ||
                            getId(r.source).toLowerCase().includes(term) ||
                            getId(r.target).toLowerCase().includes(term) ||
                            r.colSource.toLowerCase().includes(term) ||
                            r.colTarget.toLowerCase().includes(term) ||
                            cardValue.toLowerCase().includes(term) // Nova busca por cardinalidade
                        );
                    });
                });
                  const displayedLinks = filteredList.slice(0, visibleLimit);

                  return (
                      <>
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                              <button style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--accent)', background: !showInternalList ? 'var(--accent)' : 'transparent', color: !showInternalList ? 'var(--accent-text)' : 'var(--text-main)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => { setShowInternalList(false); setVisibleLimit(25); setModalSearch(''); }}>EXTERNAS ({extRaw.length})</button>
                              <button style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--accent)', background: showInternalList ? 'var(--accent)' : 'transparent', color: showInternalList ? 'var(--accent-text)' : 'var(--text-main)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => { setShowInternalList(true); setVisibleLimit(25); setModalSearch(''); }}>INTERNAS ({intRaw.length})</button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', background: 'var(--input-bg)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', height: 40 }}>
                              <Icon name="search" size={20} style={{ color: 'var(--text-muted)' }} />
                              <input type="text" placeholder="Ex: HZ_PARTIES; 1:1" value={modalSearch} onChange={e => { setModalSearch(e.target.value); setVisibleLimit(25); }} className="mono-text clean-input" style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '11px', outline: 'none', boxShadow: 'none', marginTop: 8 }} />
                          </div>
                          <div style={{ maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                              {displayedLinks.length === 0 && ( <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>Nenhuma conexão encontrada.</div> )}
                              {displayedLinks.map((d: RawLink, idx: number) => (
                                  <div key={idx} style={{ background:'var(--input-bg)', padding:'12px', borderRadius:'6px', marginBottom:8, border:'1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <div style={{fontSize:13, fontWeight:700, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)'}}>
                                                {getId(d.source)} <Icon name="arrow-left-right" size={12} style={{ color: 'var(--text-muted)' }} /> {getId(d.target)}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {d.tableSource === d.tableTarget && ( <span style={{ fontSize: '9px', background: 'var(--accent)', color: 'var(--accent-text)', padding: '2px 5px', borderRadius: '4px', fontWeight: 'bold' }}>LOOP</span> )}
                                                {usuarioAtual?.funcao !== 'obs' && (
                                                    <>
                                                        {/* NOVO: Botão de Edição específico */}
                                                        <button className="btn-mini" style={{ margin: 0, padding: '4px 6px', height: 'auto', color: 'var(--text-main)' }} title="Editar Conexão" onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setReturnToNode(activeNode); 
                                                            const mockLink = { source: d.source, target: d.target, details: [d], curvature: 0 } as ConsolidatedLink; 
                                                            setEditingBead({ link: mockLink, detail: d, index: 0, x:0, y:0 }); 
                                                            setActiveNode(null); 
                                                        }}>
                                                            <Icon name="pencil" size={12} />
                                                        </button>
                                                        {/* Botão de exclusão antigo mantido */}
                                                        <button className="btn-mini danger" style={{ margin: 0, padding: '4px 6px', height: 'auto' }} title="Excluir Conexão" onClick={(e) => { e.stopPropagation(); deleteRawLink(d.tableSource, d.tableTarget, d.colSource, d.colTarget); }}>
                                                            <Icon name="trash" size={12} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mono-text" style={{fontSize: 11, lineHeight: '1.6', color: 'var(--text-main)'}}>
                                            <div style={{display: 'flex', alignItems: 'baseline'}}><span style={{color:'var(--text-muted)', width: '55px', flexShrink: 0}}>Origem:</span><span style={{fontWeight: 600}}>{d.tableSource}</span></div>
                                            <div style={{display: 'flex', alignItems: 'baseline'}}><span style={{color:'var(--text-muted)', width: '55px', flexShrink: 0}}>Destino:</span><span style={{fontWeight: 600}}>{d.tableTarget}</span></div>
                                        </div>
                                        <div className="mono-text" style={{borderTop:'1px dashed var(--border-color)', paddingTop:8, marginTop:8, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: 11}}>
                                            <span style={{color:'var(--accent)'}}>{d.colSource}</span>
                                            <span style={{ background:'var(--bg-app)', color:'var(--text-muted)', padding:'2px 6px', borderRadius:'4px', fontSize:'10px', fontWeight: 'bold', border:'1px solid var(--border-color)', display: 'inline-block' }}>{d.card || 'N:1'}</span>
                                            <span style={{color:'var(--accent)'}}>{d.colTarget}</span>
                                        </div>
                                    </div>
                              ))}
                              {filteredList.length > visibleLimit && (
                                  <button onClick={() => setVisibleLimit(prev => prev + 25)} style={{ width: '100%', padding: '8px', marginTop: '8px', background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                      Carregar mais ({filteredList.length - visibleLimit} restantes)
                                  </button>
                              )}
                          </div>
                      </>
                  );
              })()}
              
              {usuarioAtual?.funcao !== 'obs' && (
                  <>
                      <hr style={{ border:0, borderTop:'1px solid var(--border-color)', margin:'20px 0' }}/>
                      <span style={{ fontSize:12, color:'var(--accent)', fontWeight:600, display:'block', marginBottom:10 }}>NOVA CONEXÃO DESTE NÓ</span>
                      <div style={{display:'flex', gap:10, alignItems: 'flex-end', marginBottom: 10}}>
                        <div style={{flex:1}}><label style={labelStyle}>Destino</label><select style={{marginBottom:0}} value={newNodeConn.target} onChange={e => setNewNodeConn({...newNodeConn, target: e.target.value})}><option value="">Selecione...</option>{sortedNodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}</select></div>
                        <div style={{width:'80px'}}><label style={labelStyle}>Card.</label><select style={{marginBottom:0, padding:'0 5px'}} value={newNodeConn.card} onChange={e => setNewNodeConn({...newNodeConn, card: e.target.value})}><option value="1:N">1:N</option><option value="N:1">N:1</option><option value="1:1">1:1</option></select></div>
                        <div style={{flexShrink:0, width:'100px'}}><ActionButton style={{marginTop:0}} onClick={() => { if(!newNodeConn.target) return; setRawLinks([...rawLinks, { source: activeNode.id, target: newNodeConn.target, tableSource: newNodeConn.ts, tableTarget: newNodeConn.tt, colSource: newNodeConn.colS, colTarget: newNodeConn.colT, card: newNodeConn.card }]); setNewNodeConn({ target:'', ts:'', tt:'', colS:'', colT:'', card:'1:N' }); }}>Vincular</ActionButton></div>
                      </div>
                      <div style={gridRowStyle}><div><label style={labelStyle}>Tabela Origem</label><input className="mono-text" value={newNodeConn.ts} onChange={e => setNewNodeConn({...newNodeConn, ts: e.target.value})} /></div><div><label style={labelStyle}>Coluna Origem</label><input className="mono-text" value={newNodeConn.colS} onChange={e => setNewNodeConn({...newNodeConn, colS: e.target.value})} /></div></div>
                      <div style={gridRowStyle}><div><label style={labelStyle}>Tabela Destino</label><input className="mono-text" value={newNodeConn.tt} onChange={e => setNewNodeConn({...newNodeConn, tt: e.target.value})} /></div><div><label style={labelStyle}>Coluna Destino</label><input className="mono-text" value={newNodeConn.colT} onChange={e => setNewNodeConn({...newNodeConn, colT: e.target.value})} /></div></div>
                  </>
              )}
          </Modal>
      )}

      {editingLine && (
          <Modal 
              title={ <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}> {getId(editingLine.source as NodeData)} <Icon name="arrow-left-right" size={14} style={{ color: 'var(--text-muted)' }} /> {getId(editingLine.target as NodeData)} </span> } 
              onClose={() => setEditingLine(null)}
          >
              {editingLine.details.map((d, idx) => (
                  <div key={idx} style={{ background:'var(--input-bg)', padding:12, marginBottom:10, borderRadius:6, border:'1px solid var(--border-color)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div><div className="mono-text" style={{fontSize:11, fontWeight:600}}>{d.tableSource}</div><div style={{fontSize:12, textAlign:'center', color:'var(--text-muted)'}}><Icon name="arrow-down" size={14} /></div><div className="mono-text" style={{fontSize:11, fontWeight:600}}>{d.tableTarget}</div></div>
                      {usuarioAtual?.funcao !== 'obs' && (
                          <ActionButton variant="danger" style={{width:'auto', height:'28px', fontSize:11, padding:'0 8px', marginTop:0, borderRadius: 5}} onClick={() => deleteRawLink(d.tableSource, d.tableTarget, d.colSource, d.colTarget)}>Excluir</ActionButton>
                      )}
                  </div>
              ))}
              
              {usuarioAtual?.funcao !== 'obs' && (
                  <>
                      <hr style={{ border:0, borderTop:'1px solid var(--border-color)', margin:'20px 0' }}/>
                      <span style={{ fontSize:12, color:'var(--accent)', fontWeight:600, display:'block', marginBottom:10 }}>Adicionar Detalhe</span>
                      <div style={gridRowStyle}><div><label style={labelStyle}>Tabela Origem</label><input className="mono-text" value={newLineData.ts} onChange={e => setNewLineData({...newLineData, ts: e.target.value})} /></div><div><label style={labelStyle}>Coluna Origem</label><input className="mono-text" value={newLineData.colS} onChange={e => setNewLineData({...newLineData, colS: e.target.value})} /></div></div>
                      <div style={gridRowStyle}><div><label style={labelStyle}>Tabela Destino</label><input className="mono-text" value={newLineData.tt} onChange={e => setNewLineData({...newLineData, tt: e.target.value})} /></div><div><label style={labelStyle}>Coluna Destino</label><input className="mono-text" value={newLineData.colT} onChange={e => setNewLineData({...newLineData, colT: e.target.value})} /></div></div>
                      <div style={{marginBottom: 10}}><label style={labelStyle}>Cardinalidade</label><select value={newLineData.card} onChange={e => setNewLineData({...newLineData, card: e.target.value})}><option value="1:N">1:N</option><option value="N:1">N:1</option><option value="1:1">1:1</option></select></div>
                      <ActionButton onClick={() => { setRawLinks([...rawLinks, { source: getId(editingLine.source as NodeData), target: getId(editingLine.target as NodeData), tableSource: newLineData.ts, tableTarget: newLineData.tt, colSource: newLineData.colS, colTarget: newLineData.colT, card: newLineData.card }]); setEditingLine(null); }}>Salvar Novo</ActionButton>
                  </>
              )}
          </Modal>
      )}

      {editingBead && (
          <Modal title={usuarioAtual?.funcao === 'obs' ? "Detalhe da Conexão" : "Editar Detalhe"} onClose={handleCloseEditingBead} footer={usuarioAtual?.funcao !== 'obs' ? <><ActionButton variant="danger" onClick={() => deleteRawLink(editingBead.detail.tableSource, editingBead.detail.tableTarget, editingBead.detail.colSource, editingBead.detail.colTarget)} style={{width:'70px', marginTop:0, borderRadius: 6}}>Excluir</ActionButton><ActionButton onClick={saveBeadEdit} style={{width:'auto', marginTop:0}}>Salvar Alterações</ActionButton></> : null}>
            <div style={gridRowStyle}><div><label style={labelStyle}>Tabela Origem</label><input className="mono-text" value={editingBead.detail.tableSource} disabled={usuarioAtual?.funcao === 'obs'} onChange={e => setEditingBead({...editingBead, detail: {...editingBead.detail, tableSource: e.target.value}})} /></div><div><label style={labelStyle}>Coluna Origem</label><input className="mono-text" value={editingBead.detail.colSource} disabled={usuarioAtual?.funcao === 'obs'} onChange={e => setEditingBead({...editingBead, detail: {...editingBead.detail, colSource: e.target.value}})} /></div></div>
            <div style={gridRowStyle}><div><label style={labelStyle}>Tabela Destino</label><input className="mono-text" value={editingBead.detail.tableTarget} disabled={usuarioAtual?.funcao === 'obs'} onChange={e => setEditingBead({...editingBead, detail: {...editingBead.detail, tableTarget: e.target.value}})} /></div><div><label style={labelStyle}>Coluna Destino</label><input className="mono-text" value={editingBead.detail.colTarget} disabled={usuarioAtual?.funcao === 'obs'} onChange={e => setEditingBead({...editingBead, detail: {...editingBead.detail, colTarget: e.target.value}})} /></div></div>
            <div><label style={labelStyle}>Cardinalidade</label><select value={editingBead.detail.card} disabled={usuarioAtual?.funcao === 'obs'} onChange={e => setEditingBead({...editingBead, detail: {...editingBead.detail, card: e.target.value}})}><option value="1:N">1:N</option><option value="N:1">N:1</option><option value="1:1">1:1</option></select></div>
          </Modal>
      )}

      {showRenameSchema && (
          <Modal title="Renomear Área de Trabalho" onClose={() => setShowRenameSchema(false)} 
              footer={
                  <div style={{ display: 'flex', gap: '8px' }}>
                      <ActionButton variant="secondary" onClick={() => setShowRenameSchema(false)} style={{ width: 'auto', borderRadius: 'var(--radius)', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '10px' }}>Cancelar</ActionButton>
                      <ActionButton onClick={handleRenameSchemaExecute} style={{ width: 'auto', borderRadius: 'var(--radius)', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Salvar</ActionButton>
                  </div>
              }>
              <label style={labelStyle}>Novo Nome</label>
              <input type="text" value={renameSchemaValue} onChange={e => setRenameSchemaValue(e.target.value)} placeholder="Ex: Arquitetura Comercial V2" autoFocus onKeyDown={e => e.key === 'Enter' && handleRenameSchemaExecute()} />
          </Modal>
      )}

      {showUserManagement && (
        <Modal title="Gerenciamento de Usuários" onClose={() => setShowUserManagement(false)}>
        <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--input-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: '10px' }}>Novo Usuário</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <input type="text" placeholder="Login" value={newUser.login} onChange={e => setNewUser({...newUser, login: e.target.value})} />
                <input type="password" placeholder="Senha" value={newUser.senha} onChange={e => setNewUser({...newUser, senha: e.target.value})} />
            </div>
            <select value={newUser.funcao} onChange={e => setNewUser({...newUser, funcao: e.target.value as 'admin' | 'edit' | 'obs'})} style={{ marginBottom: '10px' }}>
                <option value="obs">Observador (Apenas Leitura)</option>
                <option value="edit">Editor (Altera Grafos)</option>
                <option value="admin">Administrador (Total)</option>
            </select>
            <ActionButton onClick={handleCreateUser}>Cadastrar Usuário</ActionButton>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px' }}>Login</th>
                        <th style={{ padding: '8px' }}>Função</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {listaUsuarios.map(u => (
                        <tr key={u.id_usuario} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px' }} className="mono-text">{u.login}</td>
                            <td style={{ padding: '8px' }}>
                                <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-app)', fontSize: '11px', textTransform: 'uppercase' }}>
                                    {u.funcao}
                                </span>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                {u.login !== usuarioAtual?.login && (
                                    <button className="btn-mini danger" onClick={() => handleDeleteUser(u.id_usuario)}>
                                        <Icon name="trash" size={14} />
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </div>
        </Modal>
)}

{/* HUD DE PROGRESSO DA MINERAÇÃO EM BACKGROUND */}
      {isMining && (
          <div style={{ position: 'fixed', bottom: '20px', left: '20px', background: 'var(--bg-panel)', border: '1px solid var(--accent)', borderRadius: '8px', padding: '15px', width: '280px', boxShadow: 'var(--shadow-lg)', zIndex: 3000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div className="spinner" style={{ width: '12px', height: '12px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      {miningStatusText}
                  </span>
                  <span className="mono-text" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {Math.floor(miningTimeElapsed / 60).toString().padStart(2, '0')}:{(miningTimeElapsed % 60).toString().padStart(2, '0')}
                  </span>
              </div>
              
              <div style={{ width: '100%', height: '6px', background: 'var(--input-bg)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${miningProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                  <span>Processando em Background</span>
                  <span style={{ fontWeight: 'bold' }}>{miningProgress}%</span>
              </div>
          </div>
      )}

    </div>
  );
};

export default App;