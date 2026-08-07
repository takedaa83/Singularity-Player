import React from 'react';
import { X, Network, Sparkles, Disc } from 'lucide-react';
import { usePlayerStore } from '../../stores/playerStore';
import { generateSimilarityGraph, SimilarityGraphData } from '../../services/similarityGraphService';

interface SimilarityGraphModalProps {
  onClose: () => void;
}

export const SimilarityGraphModal: React.FC<SimilarityGraphModalProps> = ({ onClose }) => {
  const queue = usePlayerStore((s) => s.queue);
  const graphData: SimilarityGraphData = generateSimilarityGraph(queue);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl flex flex-col gap-6 glass-card">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition-colors"
          aria-label="Close Similarity Graph"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-cyan-400">
            <Network className="w-5 h-5" /> Music Knowledge Similarity Graph
          </h2>
          <p className="text-xs text-neutral-400">Interactive topological network mapping cosine similarity vectors between tracks.</p>
        </div>

        {/* SVG Graph Canvas */}
        <div className="relative w-full h-[360px] bg-black/50 rounded-xl border border-neutral-800/80 overflow-hidden flex items-center justify-center">
          <svg viewBox="0 0 500 400" className="w-full h-full">
            {/* Draw Edges */}
            {graphData.edges.map((edge, idx) => {
              const sourceNode = graphData.nodes.find((n) => n.id === edge.source);
              const targetNode = graphData.nodes.find((n) => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const midX = (sourceNode.x + targetNode.x) / 2;
              const midY = (sourceNode.y + targetNode.y) / 2;

              return (
                <g key={idx}>
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke="rgba(6, 182, 212, 0.4)"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                  />
                  <text x={midX} y={midY} fill="#06b6d4" fontSize="9" fontFamily="monospace" textAnchor="middle">
                    {edge.similarity}%
                  </text>
                </g>
              );
            })}

            {/* Draw Nodes */}
            {graphData.nodes.map((node) => (
              <g key={node.id} className="cursor-pointer group">
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="16"
                  fill="#171717"
                  stroke="#06b6d4"
                  strokeWidth="2.5"
                  className="transition-transform duration-300 group-hover:scale-125"
                />
                <circle cx={node.x} cy={node.y} r="6" fill="#f59e0b" />
                <text x={node.x} y={node.y + 28} fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle">
                  {node.label.slice(0, 12)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};
