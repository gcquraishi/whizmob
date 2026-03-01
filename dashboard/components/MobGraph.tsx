'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

interface GraphNode {
  id: string;
  type: 'mob' | 'component';
  label: string;
  component_type?: string;
  passport_type?: string;
  // Simulation state
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'contains' | 'shared';
}

interface MobGraphProps {
  nodes: Array<{
    id: string;
    type: 'mob' | 'component';
    label: string;
    component_type?: string;
    passport_type?: string;
  }>;
  edges: GraphEdge[];
}

const MOB_RADIUS = 28;
const COMPONENT_RADIUS = 10;

const COMPONENT_COLORS: Record<string, string> = {
  subagent: '#3b82f6',  // blue
  skill: '#f59e0b',     // amber
  mcp: '#8b5cf6',       // purple
  project: '#10b981',   // green
  settings: '#6b7280',  // gray
  hook: '#f59e0b',      // amber
  memory_schema: '#10b981', // green
  claude_md: '#8b5cf6', // purple
  config: '#6b7280',    // gray
};

function getComponentColor(node: GraphNode): string {
  if (node.type === 'mob') return '#4f46e5'; // indigo
  return COMPONENT_COLORS[node.passport_type || node.component_type || ''] || '#9ca3af';
}

export default function MobGraph({ nodes: rawNodes, edges }: MobGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const dragRef = useRef<{ node: GraphNode; offsetX: number; offsetY: number } | null>(null);
  const wasDraggingRef = useRef(false);
  const hoveredRef = useRef<GraphNode | null>(null);
  const router = useRouter();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);

  // Initialize simulation nodes
  useEffect(() => {
    const w = containerRef.current?.clientWidth || 800;
    const h = containerRef.current?.clientHeight || 600;
    const cx = w / 2;
    const cy = h / 2;

    nodesRef.current = rawNodes.map((n, i) => {
      const angle = (i / rawNodes.length) * Math.PI * 2;
      const spread = n.type === 'mob' ? 120 : 200;
      return {
        ...n,
        x: cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 80,
        y: cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 80,
        vx: 0,
        vy: 0,
        radius: n.type === 'mob' ? MOB_RADIUS : COMPONENT_RADIUS,
      };
    });
  }, [rawNodes]);

  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Build node lookup
    const nodeMap = new Map<string, GraphNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    // --- Force simulation step ---
    const DAMPING = 0.85;
    const REPULSION = 3000;
    const SPRING_LENGTH = 100;
    const SPRING_K = 0.015;
    const CENTER_GRAVITY = 0.005;
    const cx = w / (2 * dpr);
    const cy = h / (2 * dpr);

    // Repulsion (all pairs)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) { dist = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Spring forces (edges)
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetLen = edge.type === 'shared' ? SPRING_LENGTH * 2 : SPRING_LENGTH;
      const displacement = dist - targetLen;
      const force = SPRING_K * displacement;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Center gravity
    for (const n of nodes) {
      n.vx += (cx - n.x) * CENTER_GRAVITY;
      n.vy += (cy - n.y) * CENTER_GRAVITY;
    }

    // Integrate
    for (const n of nodes) {
      if (dragRef.current?.node === n) continue; // don't move dragged node
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      // Keep in bounds
      n.x = Math.max(n.radius + 10, Math.min(w / dpr - n.radius - 10, n.x));
      n.y = Math.max(n.radius + 10, Math.min(h / dpr - n.radius - 10, n.y));
    }

    // --- Draw ---
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w / dpr, h / dpr);

    // Draw edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      if (edge.type === 'shared') {
        ctx.strokeStyle = '#e0e7ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
      } else {
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw nodes
    for (const n of nodes) {
      const color = getComponentColor(n);
      const isHovered = hoveredRef.current === n;

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);

      if (n.type === 'mob') {
        // Mob: filled circle with label
        ctx.fillStyle = color;
        ctx.fill();
        if (isHovered) {
          ctx.strokeStyle = '#312e81';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        // Label inside
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(10, n.radius * 0.6)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const displayLabel = n.label.length > 12 ? n.label.substring(0, 10) + '..' : n.label;
        ctx.fillText(displayLabel, n.x, n.y);
      } else {
        // Component: smaller filled circle
        ctx.fillStyle = isHovered ? color : `${color}cc`;
        ctx.fill();
        if (isHovered) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Draw labels for hovered component
    if (hoveredRef.current && hoveredRef.current.type === 'component') {
      const n = hoveredRef.current;
      ctx.fillStyle = '#1f2937';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(n.label, n.x, n.y - n.radius - 4);
    }

    ctx.restore();

    animRef.current = requestAnimationFrame(simulate);
  }, [edges]);

  // Canvas resize + animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    window.addEventListener('resize', resize);
    animRef.current = requestAnimationFrame(simulate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [simulate]);

  // Hit test helper
  const hitTest = useCallback((clientX: number, clientY: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Check in reverse order (top-most first)
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const dx = x - n.x;
      const dy = y - n.y;
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) {
        return n;
      }
    }
    return null;
  }, []);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const node = hitTest(e.clientX, e.clientY);
    if (node) {
      const rect = canvasRef.current!.getBoundingClientRect();
      dragRef.current = {
        node,
        offsetX: e.clientX - rect.left - node.x,
        offsetY: e.clientY - rect.top - node.y,
      };
    }
  }, [hitTest]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (dragRef.current) {
      wasDraggingRef.current = true;
      dragRef.current.node.x = e.clientX - rect.left - dragRef.current.offsetX;
      dragRef.current.node.y = e.clientY - rect.top - dragRef.current.offsetY;
      dragRef.current.node.vx = 0;
      dragRef.current.node.vy = 0;
      canvas.style.cursor = 'grabbing';
      return;
    }

    const node = hitTest(e.clientX, e.clientY);
    hoveredRef.current = node;
    canvas.style.cursor = node ? 'pointer' : 'default';

    if (node) {
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, node });
    } else {
      setTooltip(null);
    }
  }, [hitTest]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hoveredRef.current ? 'pointer' : 'default';
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (wasDraggingRef.current) { wasDraggingRef.current = false; return; }
    const node = hitTest(e.clientX, e.clientY);
    if (!node) return;

    if (node.type === 'mob') {
      router.push(`/mobs/${encodeURIComponent(node.id)}`);
    } else if (node.id && !node.id.startsWith('file:')) {
      router.push(`/agents/${encodeURIComponent(node.id)}`);
    }
  }, [hitTest, router]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[500px]">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { dragRef.current = null; hoveredRef.current = null; setTooltip(null); }}
        onClick={handleClick}
        className="block w-full h-full"
      />
      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg max-w-48 truncate"
          style={{
            left: tooltip.x,
            top: tooltip.y - 32,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="font-medium">{tooltip.node.label}</span>
          {tooltip.node.type === 'component' && (
            <span className="text-gray-400 ml-1">
              {tooltip.node.passport_type || tooltip.node.component_type}
            </span>
          )}
        </div>
      )}
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 text-[11px] text-gray-500">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block" />
            Mob
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            Agent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            Skill / Hook
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
            MCP / Config
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Memory
          </span>
        </div>
      </div>
    </div>
  );
}
