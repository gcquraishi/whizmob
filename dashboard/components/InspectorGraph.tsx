'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

interface MobMember {
  passport_id: string;
  name: string;
  type: string;
  purpose: string;
  invocation: string | null;
  source_file: string;
  sub_mob_ids?: string[];
}

interface MobEdge {
  source_id: string;
  target_id: string;
  edge_type: string;
  evidence: string;
}

interface SubMobInfo {
  id: string;
  name: string;
  description: string;
  display_order: number;
  member_ids: string[];
}

interface InspectorGraphProps {
  members: MobMember[];
  edges: MobEdge[];
  children?: SubMobInfo[];
  onNodeClick?: (passportId: string) => void;
  onSubMobClick?: (subMobId: string | null) => void;
  highlightId?: string | null;
  activeSubMob?: string | null;
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
  subMobIds?: string[];
}

const TYPE_COLORS: Record<string, string> = {
  subagent: '#6366f1',
  skill: '#059669',
  mcp: '#d97706',
  project: '#6b7280',
  settings: '#9ca3af',
  extension: '#8b5cf6',
};

// Distinct colors for sub-mobs
const SUB_MOB_COLORS = [
  '#818cf8', // indigo-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f87171', // red-400
  '#a78bfa', // violet-400
  '#38bdf8', // sky-400
  '#fb923c', // orange-400
  '#4ade80', // green-400
];

/** Compute convex hull of 2D points using Graham scan. */
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;

  // Find lowest y (leftmost if tie)
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
  const pivot = sorted[0];

  // Sort by polar angle from pivot
  const rest = sorted.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
    const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
    return angleA - angleB || (a.x - pivot.x) * (a.x - pivot.x) + (a.y - pivot.y) * (a.y - pivot.y) - (b.x - pivot.x) * (b.x - pivot.x) - (b.y - pivot.y) * (b.y - pivot.y);
  });

  const hull = [pivot, rest[0]];
  for (let i = 1; i < rest.length; i++) {
    while (hull.length > 1) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const c = rest[i];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 0) hull.pop();
      else break;
    }
    hull.push(rest[i]);
  }

  return hull;
}

/** Draw a rounded hull path with padding. */
function drawHull(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], padding: number) {
  if (points.length === 0) return;

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, padding, 0, Math.PI * 2);
    return;
  }

  if (points.length === 2) {
    // Draw a capsule shape
    const [a, b] = points;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len * padding;
    const ny = dx / len * padding;
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.arc(a.x, a.y, padding, angle + Math.PI / 2, angle - Math.PI / 2);
    ctx.arc(b.x, b.y, padding, angle - Math.PI / 2, angle + Math.PI / 2);
    ctx.closePath();
    return;
  }

  // Expand hull outward by padding
  const hull = convexHull(points);
  const expanded: { x: number; y: number }[] = [];

  // Compute centroid
  let cx = 0, cy = 0;
  for (const p of hull) { cx += p.x; cy += p.y; }
  cx /= hull.length;
  cy /= hull.length;

  for (const p of hull) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    expanded.push({
      x: p.x + (dx / dist) * padding,
      y: p.y + (dy / dist) * padding,
    });
  }

  // Draw rounded path through expanded points
  ctx.beginPath();
  const first = expanded[0];
  const last = expanded[expanded.length - 1];
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);

  for (let i = 0; i < expanded.length; i++) {
    const curr = expanded[i];
    const next = expanded[(i + 1) % expanded.length];
    ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
  }
  ctx.closePath();
}

export default function InspectorGraph({
  members, edges, children, onNodeClick, onSubMobClick, highlightId, activeSubMob,
}: InspectorGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({
    nodeId: null, offsetX: 0, offsetY: 0,
  });

  const hasHierarchy = children && children.length > 0;
  const subMobColorMap = new Map<string, string>();
  if (children) {
    children.forEach((c, i) => {
      subMobColorMap.set(c.id, SUB_MOB_COLORS[i % SUB_MOB_COLORS.length]);
    });
  }

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
        subMobIds: m.sub_mob_ids,
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

    // Sub-mob clustering force: nodes in same sub-mob attract each other more
    const subMobGroups = new Map<string, string[]>();
    if (hasHierarchy && children) {
      for (const child of children) {
        subMobGroups.set(child.id, child.member_ids);
      }
    }

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

      // Sub-mob cohesion: extra attraction toward sub-mob siblings
      if (hasHierarchy && node.subMobIds) {
        for (const subId of node.subMobIds) {
          const siblings = subMobGroups.get(subId);
          if (!siblings) continue;
          for (const sibId of siblings) {
            if (sibId === node.id) continue;
            const sib = nodes.find(n => n.id === sibId);
            if (!sib) continue;
            const dx = sib.x - node.x;
            const dy = sib.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist - 60) * 0.003;
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }
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

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Draw sub-mob hulls (behind everything else)
    if (hasHierarchy && children) {
      for (const child of children) {
        const childNodes = child.member_ids
          .map(id => nodeMap.get(id))
          .filter((n): n is SimNode => !!n);

        if (childNodes.length === 0) continue;

        const color = subMobColorMap.get(child.id) || '#6b7280';
        const isActive = activeSubMob === child.id;
        const alpha = activeSubMob ? (isActive ? 0.15 : 0.05) : 0.08;

        ctx.save();
        drawHull(ctx, childNodes, 30);
        ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();

        if (isActive) {
          ctx.strokeStyle = color + '60';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Label the cluster
        let labelX = 0, labelY = 0;
        for (const n of childNodes) { labelX += n.x; labelY += n.y; }
        labelX /= childNodes.length;
        labelY /= childNodes.length;

        // Position label above the cluster
        const minY = Math.min(...childNodes.map(n => n.y));
        labelY = minY - 35;

        ctx.fillStyle = color + (activeSubMob ? (isActive ? 'cc' : '40') : '80');
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(child.name, labelX, labelY);
        ctx.restore();
      }
    }

    // Edges
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
      const isFiltered = activeSubMob && (!node.subMobIds || !node.subMobIds.includes(activeSubMob));
      const r = isHighlighted || isHovered ? 12 : node.radius;
      const baseColor = TYPE_COLORS[node.type] || '#6b7280';

      // Dim nodes not in active sub-mob
      const nodeAlpha = isFiltered ? '40' : '';
      const color = baseColor + nodeAlpha;

      // Glow for highlighted
      if (isHighlighted) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = baseColor + '30';
        ctx.fill();
      }

      // Shared component indicator: multi-colored ring
      if (hasHierarchy && node.subMobIds && node.subMobIds.length > 1) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Label
      const labelAlpha = isFiltered ? '60' : '';
      ctx.fillStyle = '#374151' + labelAlpha;
      ctx.font = `${isHighlighted || isHovered ? '12' : '10'}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x, node.y + r + 14);
    }

    ctx.restore();
    animRef.current = requestAnimationFrame(simulate);
  }, [edges, hoveredNode, highlightId, hasHierarchy, children, activeSubMob, subMobColorMap]);

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

  const findSubMob = useCallback((e: React.MouseEvent<HTMLCanvasElement>): string | null => {
    if (!hasHierarchy || !children) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));

    // Check if click is inside any sub-mob hull region
    for (const child of children) {
      const childNodes = child.member_ids
        .map(id => nodeMap.get(id))
        .filter((n): n is SimNode => !!n);

      if (childNodes.length < 2) continue;

      // Simple: check if point is within padding distance of the centroid
      let cx = 0, cy = 0;
      for (const n of childNodes) { cx += n.x; cy += n.y; }
      cx /= childNodes.length;
      cy /= childNodes.length;

      // Check if point is close to any node in this sub-mob
      for (const n of childNodes) {
        const dx = x - n.x;
        const dy = y - n.y;
        if (Math.sqrt(dx * dx + dy * dy) < 30) return child.id;
      }
    }
    return null;
  }, [hasHierarchy, children]);

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
      return;
    }
    // If no node clicked, check if a sub-mob region was clicked
    if (hasHierarchy && onSubMobClick) {
      const subMobId = findSubMob(e);
      // Toggle: if clicking same sub-mob, deselect
      onSubMobClick(subMobId === activeSubMob ? null : subMobId);
    }
  }, [findNode, findSubMob, onNodeClick, onSubMobClick, hasHierarchy, activeSubMob]);

  return (
    <div className="relative w-full h-full">
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
      {/* Sub-mob legend */}
      {hasHierarchy && children && (
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 text-[11px] text-gray-500">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {children.map((child) => {
              const color = subMobColorMap.get(child.id) || '#6b7280';
              const isActive = activeSubMob === child.id;
              return (
                <button
                  key={child.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSubMobClick?.(isActive ? null : child.id);
                  }}
                  className={`flex items-center gap-1.5 transition-opacity ${
                    activeSubMob && !isActive ? 'opacity-40' : ''
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm inline-block"
                    style={{ backgroundColor: color }}
                  />
                  {child.name}
                </button>
              );
            })}
            {activeSubMob && (
              <button
                onClick={(e) => { e.stopPropagation(); onSubMobClick?.(null); }}
                className="text-gray-400 hover:text-gray-600 ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
