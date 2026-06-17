import React, { useMemo, useState, useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Maximize2, Minimize2, Settings, Zap, Link, Move, RotateCcw, X } from 'lucide-react';
import { type MemoryFact } from '../types';

interface DnaGraphProps {
  facts: MemoryFact[];
  focusMode: boolean;
  onNodeClick: (fact: MemoryFact) => void;
}

const DnaGraph: React.FC<DnaGraphProps> = ({ facts, focusMode, onNodeClick }) => {
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  
  // Physics Settings (Standardized to the Study Pattern)
  const [linkDistance, setLinkDistance] = useState(() => Number(localStorage.getItem('dna-graph-linkDistance')) || 1000);
  const [repulsion, setRepulsion] = useState(() => Number(localStorage.getItem('dna-graph-repulsion')) || 1000);
  const [gravity, setGravity] = useState(() => Number(localStorage.getItem('dna-graph-gravity')) || 0.03);
  const [nodeSize, setNodeSize] = useState(() => Number(localStorage.getItem('dna-graph-nodeSize')) || 30);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Persistence
  useEffect(() => {
    localStorage.setItem('dna-graph-linkDistance', linkDistance.toString());
    localStorage.setItem('dna-graph-repulsion', repulsion.toString());
    localStorage.setItem('dna-graph-gravity', gravity.toString());
    localStorage.setItem('dna-graph-nodeSize', nodeSize.toString());
  }, [linkDistance, repulsion, gravity, nodeSize]);

  // Dimension tracking
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!rootRef.current) return;
    try {
      if (!document.fullscreenElement) await rootRef.current.requestFullscreen();
      else await document.exitFullscreen();
    } catch (err) { console.error(err); }
  };

  const resetToDefaults = () => {
    setLinkDistance(1000);
    setRepulsion(1000);
    setGravity(0.03);
    setNodeSize(30);
  };

  const graphData = useMemo(() => {
    const nodes = facts.map(f => ({ id: f.id, name: f.text, category: f.category, val: 5 }));
    const links: { source: string; target: string }[] = [];
    facts.forEach(f => {
      f.connections?.forEach(connId => {
        if (facts.find(target => target.id === connId)) {
          links.push({ source: f.id, target: connId });
        }
      });
    });
    return { nodes, links };
  }, [facts]);

  // Force Configuration (Study-compliant bridge)
  useEffect(() => {
    if (fgRef.current) {
      const bridge = fgRef.current;
      
      if (typeof bridge.d3Force === 'function') {
        bridge.d3Force('charge')?.strength(-repulsion);
        
        const linkForce = bridge.d3Force('link');
        if (linkForce) {
          linkForce.distance(linkDistance);
          linkForce.strength(0.05);
        }

        // Custom Force Refinement (Alpha-scaled)
        bridge.d3Force('refinement', (alpha: number) => {
          const centerX = dimensions.width / 2;
          const centerY = dimensions.height / 2;
          const nodes = graphData.nodes;
          
          nodes.forEach((a: any, i: number) => {
            const dxC = centerX - a.x;
            const dyC = centerY - a.y;
            // Radial energy pull
            a.vx += dxC * (gravity * 0.1) * alpha;
            a.vy += dyC * (gravity * 0.1) * alpha;

            // Soft-body Collision
            for (let j = i + 1; j < nodes.length; j++) {
              const b: any = nodes[j];
              const dx = a.x - b.x;
              const dy = a.y - b.y;
              const distSq = dx * dx + dy * dy;
              const minGap = nodeSize * 0.7;
              const minGapSq = minGap * minGap;
              if (distSq < minGapSq) {
                const dist = Math.sqrt(distSq) || 0.1;
                const push = (minGap - dist) / dist * 0.3 * alpha;
                a.vx += dx * push; a.vy += dy * push;
                b.vx -= dx * push; b.vy -= dy * push;
              }
            }
          });
        });
      }
    }
  }, [linkDistance, repulsion, gravity, nodeSize, dimensions, graphData.nodes]);

  // Reheat Loop (The fix that resolved the freeze)
  const prevPhysicsRef = useRef({ linkDistance, repulsion, gravity, nodeSize });
  useEffect(() => {
    const p = prevPhysicsRef.current;
    const changed = p.linkDistance !== linkDistance || p.repulsion !== repulsion || p.gravity !== gravity || p.nodeSize !== nodeSize;
    
    if (changed && fgRef.current) {
      if (typeof fgRef.current.d3ReheatSimulation === 'function') {
        fgRef.current.d3ReheatSimulation();
      }
      prevPhysicsRef.current = { linkDistance, repulsion, gravity, nodeSize };
    }
  }, [linkDistance, repulsion, gravity, nodeSize]);

  const categoryColors = useMemo(() => {
    const categories = Array.from(new Set(facts.map(f => f.category)));
    const colors: Record<string, string> = {};
    const step = 60 / Math.max(categories.length, 1);
    categories.forEach((cat, i) => colors[cat] = `hsl(0, 0%, ${30 + i * step}%)`);
    return colors;
  }, [facts]);

  const isRelated = (nodeId: string) => {
    if (!hoverNode) return false;
    if (nodeId === hoverNode) return true;
    const fact = facts.find(f => f.id === hoverNode);
    return fact?.connections?.includes(nodeId) || facts.find(f => f.id === nodeId)?.connections?.includes(hoverNode);
  };

  return (
    <div 
      ref={rootRef}
      className={`bg-[var(--bg-main)] rounded-2xl overflow-hidden border border-[var(--border-light)] relative flex w-full h-full transition-all duration-300 ${isFullscreen ? 'rounded-none' : ''}`}
    >
      <div ref={containerRef} className="flex-1 min-w-0 relative bg-[var(--bg-main)]/50 overflow-hidden">
        <div className="absolute inset-0">
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeLabel={(node: any) => `[${node.category}] ${node.name}`}
            nodeColor={(node: any) => (focusMode && hoverNode && !isRelated(node.id)) ? 'rgba(150, 150, 150, 0.1)' : (categoryColors[node.category] || '#71717a')}
            linkColor={(link: any) => (focusMode && hoverNode && (link.source.id === hoverNode || link.target.id === hoverNode)) ? 'rgba(200, 200, 200, 0.8)' : 'rgba(150, 150, 150, 0.2)'}
            linkWidth={(link: any) => (focusMode && hoverNode && (link.source.id === hoverNode || link.target.id === hoverNode)) ? 2 : 1}
            nodeRelSize={nodeSize / 5} 
            onNodeClick={(node: any) => {
              const fact = facts.find(f => f.id === node.id);
              if (fact) onNodeClick(fact);
            }}
            onNodeHover={(node: any) => setHoverNode(node ? node.id : null)}
            backgroundColor="rgba(0,0,0,0)"
            cooldownTicks={3000}
          />
        </div>
        
        {/* Legend */}
        <div 
          className={`absolute left-6 p-4 bg-[var(--bg-sidebar)]/80 backdrop-blur-md rounded-2xl border border-[var(--border-light)] text-[11px] space-y-3 pointer-events-auto z-50 select-none shadow-2xl transition-all duration-300 ${showControls ? 'bottom-[304px] sm:bottom-6' : 'bottom-6'}`}
          onWheel={e => e.stopPropagation()}
        >
          <div className="font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1 pb-2 border-b border-[var(--border-light)]">Legenda</div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar pr-2 space-y-2">
            {Object.entries(categoryColors).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: color }}></div>
                <span className="text-[var(--text-primary)]">{cat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Actions */}
        <div className="absolute top-6 left-6 flex gap-3 z-50">
          <button onClick={toggleFullscreen} className="p-3 bg-[var(--bg-sidebar)]/80 backdrop-blur-md rounded-xl border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all hover:scale-110 active:scale-95 shadow-xl">
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button onClick={() => setShowControls(!showControls)} className={`p-3 bg-[var(--bg-sidebar)]/80 backdrop-blur-md rounded-xl border border-[var(--border-light)] transition-all shadow-xl hover:scale-110 active:scale-95 ${showControls ? 'text-[var(--text-bold)] border-zinc-500/50 bg-zinc-500/10' : 'text-[var(--text-secondary)]'}`}>
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Control Panel (Persistence & Range Compliant) */}
      {showControls && (
        <div className="absolute sm:relative left-0 sm:left-auto right-0 bottom-0 sm:top-0 h-[280px] sm:h-auto w-full sm:w-80 flex-shrink-0 bg-[var(--bg-sidebar)]/95 backdrop-blur-3xl border-t sm:border-t-0 sm:border-l border-[var(--border-light)] p-4 sm:p-6 flex flex-col gap-4 sm:gap-6 z-[60] overflow-y-auto custom-scrollbar shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-bold)]">Física do Grafo</h4>
            <div className="flex gap-2 items-center">
               <button onClick={resetToDefaults} className="p-1.5 hover:bg-[var(--bg-chat-hover)] rounded-md text-[var(--text-secondary)] hover:text-zinc-300 transition-colors" title="Reset"><RotateCcw size={14} /></button>
               <div className="px-2 py-1 bg-[var(--bg-chat-hover)] rounded-md"><Zap className="w-3.5 h-3.5 text-[var(--text-secondary)]" /></div>
               <button onClick={() => setShowControls(false)} className="sm:hidden p-1.5 hover:bg-white/10 rounded-md text-[var(--text-secondary)] hover:text-white transition-colors" title="Fechar"><X size={16} /></button>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-8">
            {/* Range 10-50 per Study */}
            <div className="space-y-1.5 sm:space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)] text-[10px] uppercase font-black tracking-tighter">Tamanho Módulos</span>
                <span className="text-[var(--text-bold)] font-mono text-xs bg-[var(--bg-chat-hover)] px-2 py-0.5 rounded-md">{nodeSize}</span>
              </div>
              <input type="range" min="10" max="50" step="0.5" value={nodeSize} onChange={e => setNodeSize(Number(e.target.value))} className="w-full h-1.5 bg-[var(--border-light)] rounded-full appearance-none cursor-pointer accent-zinc-500" />
            </div>

            {/* Range 10-2000 per Study */}
            <div className="space-y-1.5 sm:space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)] text-[10px] uppercase font-black tracking-tighter flex items-center gap-2"><Link size={12} /> Comprimento Link</span>
                <span className="text-[var(--text-bold)] font-mono text-xs bg-[var(--bg-chat-hover)] px-2 py-0.5 rounded-md">{linkDistance}</span>
              </div>
              <input type="range" min="10" max="2000" step="10" value={linkDistance} onChange={e => setLinkDistance(Number(e.target.value))} className="w-full h-1.5 bg-[var(--border-light)] rounded-full appearance-none cursor-pointer accent-zinc-500" />
            </div>

            {/* Range 0-2000 per Study */}
            <div className="space-y-1.5 sm:space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)] text-[10px] uppercase font-black tracking-tighter flex items-center gap-2"><Zap size={12} /> Repulsão</span>
                <span className="text-[var(--text-bold)] font-mono text-xs bg-[var(--bg-chat-hover)] px-2 py-0.5 rounded-md">{repulsion}</span>
              </div>
              <input type="range" min="0" max="2000" step="10" value={repulsion} onChange={e => setRepulsion(Number(e.target.value))} className="w-full h-1.5 bg-[var(--border-light)] rounded-full appearance-none cursor-pointer accent-zinc-500" />
            </div>

            {/* Range 0-0.5 per Study */}
            <div className="space-y-1.5 sm:space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-secondary)] text-[10px] uppercase font-black tracking-tighter flex items-center gap-2"><Move size={12} /> Gravidade Central</span>
                <span className="text-[var(--text-bold)] font-mono text-xs bg-[var(--bg-chat-hover)] px-2 py-0.5 rounded-md">{gravity.toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="1" step="0.01" value={gravity} onChange={e => setGravity(Number(e.target.value))} className="w-full h-1.5 bg-[var(--border-light)] rounded-full appearance-none cursor-pointer accent-zinc-500" />
            </div>
          </div>

          <div className="mt-auto p-4 bg-[var(--bg-chat-hover)] rounded-2xl border border-[var(--border-light)] space-y-2 max-sm:hidden">
            <h5 className="text-[10px] font-bold text-[var(--text-bold)] uppercase tracking-widest">Estabilidade Confirmada</h5>
            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed italic">
              O grafo utiliza a ponte de física estável da plataforma, garantindo equilíbrio entre gravidade e repulsão.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DnaGraph;
