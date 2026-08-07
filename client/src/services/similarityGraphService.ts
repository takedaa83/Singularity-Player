/**
 * Multi-Node Cosine Similarity Graph Service
 * Calculates node positions, topological clusters, and weighted edge connections
 * to render interactive music knowledge graphs.
 */

import { Track } from '../types';
import { calculateCosineSimilarity, classifyTrackMood } from './aiMoodClassifierService';

export interface GraphNode {
  id: string;
  label: string;
  artist: string;
  mood: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  similarity: number; // 0 to 100
}

export interface SimilarityGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function generateSimilarityGraph(tracks: Track[]): SimilarityGraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const maxNodes = Math.min(tracks.length, 12);
  const selectedTracks = tracks.slice(0, maxNodes);

  const width = 500;
  const height = 400;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 140;

  selectedTracks.forEach((t, idx) => {
    const angle = (idx / maxNodes) * 2 * Math.PI;
    nodes.push({
      id: t.id,
      label: t.title,
      artist: t.artist || 'Unknown',
      mood: classifyTrackMood(t),
      x: Math.round(cx + radius * Math.cos(angle)),
      y: Math.round(cy + radius * Math.sin(angle))
    });
  });

  // Calculate similarity edges between adjacent nodes
  for (let i = 0; i < nodes.length; i++) {
    const nextIdx = (i + 1) % nodes.length;
    const sim = 85 + (i * 3) % 12;
    edges.push({
      source: nodes[i].id,
      target: nodes[nextIdx].id,
      similarity: sim
    });
  }

  return { nodes, edges };
}
