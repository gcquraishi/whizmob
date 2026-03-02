'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

interface MobMember {
  passport_id: string;
  name: string;
  type: string;
  purpose: string;
  invocation: string | null;
  source_file: string;
}

interface MobEdge {
  source_id: string;
  target_id: string;
  edge_type: string;
  evidence: string;
}

interface InspectorGraphProps {
  members: MobMember[];
  edges: MobEdge[];
  onNodeClick?: (passportId: string) => void;
  highlightId?: string | null;
}

interface SimNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const TYPE_COLORS: Record<string, string> = {
  subagent: '#6366f1',
  skill: '#059669',
  mcp: '#d97706',
  project: '#6b7280',
  settings: '#9ca3af',
  extension: '#8b5cf6',
};

export default function InspectorGraph({ members, edges, onNodeClick, highlightId }: InspectorGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({
    nodeId: null, offsetX: 0, offsetY: 0,
  });

  // Initialize nodes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    nodesRef.current = members.map((m, i) => {
      const angle = (i / members.length) * Math.PI * 2;
      const r = Math.min(w, h) * 0.3;
      return {
        id: m.passport_id,
        label: m.name,
        type: m.type,
        x: w / 2 + Math.cos(angle) * r,
        y: h / 2 + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        radius: 8,
      };
    });
  }, [members]);

  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Build edge lookup
    const edgeSet = new Set<string>();
    for (const e of edges) {
      edgeSet.add(`${e.source_id}|${e.target_id}`);
      edgeSet.add(`${e.target_id}|${e.source_id}`);
    }

    // Forces
    const centerX = w / (2 * dpr);
    const centerY = h / (2 * dpr);

    for (const node of nodes) {
      if (dragRef.current.nodeId === node.id) continue;

      let fx = 0, fy = 0;

      // Center gravity
      fx += (centerX - node.x) * 0.005;
      fy += (centerY - node.y) * 0.005;

      // Repulsion between all nodes
      for (const other of nodes) {
        if (other.id === node.id) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 3000 / (dist * dist);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      // Attraction along edges
      for (const other of nodes) {
        if (other.id === node.id) continue;
        if (edgeSet.has(`${node.id}|${other.id}`)) {
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const force = (dist - 120) * 0.01;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
      }

      node.vx = (node.vx + fx) * 0.85;
      node.vy = (node.vy + fy) * 0.85;
      node.x += node.vx;
      node.y += node.vy;

      // Boundary constraints
      node.x = Math.max(20, Math.min(w / dpr - 20, node.x));
      node.y = Math.max(20, Math.min(h / dpr - 20, node.y));
    }

    // Draw
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const e of edges) {
      const source = nodeMap.get(e.source_id);
      const target = nodeMap.get(e.target_id);
      if (!source || !target) continue;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = e.edge_type === 'invokes' ? 'rgba(99,102,241,0.3)' : 'rgba(156,163,175,0.2)';
      ctx.lineWidth = e.edge_type === 'invokes' ? 1.5 : 1;
      ctx.stroke();
    }

    // Nodes
    for (const node of nodes) {
      const isHighlighted = node.id === highlightId;
      const isHovered = node.id === hoveredNode;
      const r = isHighlighted || isHovered ? 12 : node.radius;
      const color = TYPE_COLORS[node.type] || '#6b7280';

      // Glow for highlighted
      if (isHighlighted) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = color + '30';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Label
      ctx.fillStyle = '#374151';
      ctx.font = `${isHighlighted || isHovered ? '12' : '10'}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x, node.y + r + 14);
    }

    ctx.restore();
    animRef.current = requestAnimationFrame(simulate);
  }, [edges, hoveredNode, highlightId]);

  // Start simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [simulate]);

  // Mouse handlers
  const findNode = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (const node of nodesRef.current) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < node.radius + 4) return node;
    }
    return null;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current.nodeId) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const node = nodesRef.current.find(n => n.id === dragRef.current.nodeId);
      if (node) {
        node.x = e.clientX - rect.left;
        node.y = e.clientY - rect.top;
        node.vx = 0;
        node.vy = 0;
      }
      return;
    }
    const node = findNode(e);
    setHoveredNode(node?.id || null);
  }, [findNode]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = findNode(e);
    if (node) {
      dragRef.current = { nodeId: node.id, offsetX: 0, offsetY: 0 };
    }
  }, [findNode]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = findNode(e);
    if (node && onNodeClick) {
      onNodeClick(node.id);
    }
  }, [findNode, onNodeClick]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full bg-white rounded-lg border border-gray-200"
      style={{ cursor: hoveredNode ? 'pointer' : 'default' }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    />
  );
}
