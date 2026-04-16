import React, { useMemo, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { type MemoryFact } from '../types';

interface DnaGraphProps {
  facts: MemoryFact[];
  focusMode: boolean;
  onNodeClick: (fact: MemoryFact) => void;
}

const DnaGraph: React.FC<DnaGraphProps> = ({ facts, focusMode, onNodeClick }) => {
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  const graphData = useMemo(() => {
    const nodes = facts.map(f => ({
      id: f.id,
      name: f.text,
      category: f.category,
      val: 5
    }));

    const links: { source: string; target: string }[] = [];
    facts.forEach(f => {
      if (f.connections) {
        f.connections.forEach(connId => {
          // Apenas adicionar se o alvo existir
          if (facts.find(target => target.id === connId)) {
            links.push({ source: f.id, target: connId });
          }
        });
      }
    });

    return { nodes, links };
  }, [facts]);

  // Gerar cores distintas para as categorias
  const categoryColors = useMemo(() => {
    const categories = Array.from(new Set(facts.map(f => f.category)));
    const colors: Record<string, string> = {};
    const hueStep = 360 / Math.max(categories.length, 1);
    
    categories.forEach((cat, i) => {
      colors[cat] = `hsl(${i * hueStep}, 70%, 60%)`;
    });
    return colors;
  }, [facts]);

  const isRelated = (nodeId: string) => {
    if (!hoverNode) return false;
    if (nodeId === hoverNode) return true;
    const fact = facts.find(f => f.id === hoverNode);
    if (!fact) return false;
    return fact.connections?.includes(nodeId) || facts.find(f => f.id === nodeId)?.connections?.includes(hoverNode);
  };

  return (
    <div className="w-full h-full bg-black/20 rounded-2xl overflow-hidden border border-white/5 relative">
      <ForceGraph2D
        graphData={graphData}
        nodeLabel={(node: any) => `[${node.category}] ${node.name}`}
        nodeColor={(node: any) => {
          if (focusMode && hoverNode && !isRelated(node.id)) return 'rgba(255, 255, 255, 0.05)';
          return categoryColors[node.category] || '#4f46e5';
        }}
        linkColor={(link: any) => {
          if (focusMode && hoverNode) {
            const isMatch = link.source.id === hoverNode || link.target.id === hoverNode;
            return isMatch ? 'rgba(96, 165, 250, 0.8)' : 'rgba(255, 255, 255, 0.02)';
          }
          return 'rgba(255, 255, 255, 0.1)';
        }}
        linkWidth={(link: any) => {
          if (focusMode && hoverNode) {
            return (link.source.id === hoverNode || link.target.id === hoverNode) ? 2 : 1;
          }
          return 1;
        }}
        nodeRelSize={6}
        onNodeClick={(node: any) => {
          const fact = facts.find(f => f.id === node.id);
          if (fact) onNodeClick(fact);
        }}
        onNodeHover={(node: any) => setHoverNode(node ? node.id : null)}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />
      
      <div className="absolute bottom-4 left-4 p-3 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-[10px] space-y-2 pointer-events-none">
        <div className="font-bold text-white/40 uppercase tracking-widest mb-1">Legenda</div>
        {Object.entries(categoryColors).map(([cat, color]) => (
          <div key={cat} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
            <span className="text-white/70">{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DnaGraph;
