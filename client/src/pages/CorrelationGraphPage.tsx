import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import type { CorrelationGraphData, GraphNode, GraphEdge, CaseStatus } from '../lib/types';
import { PageHeader, StatusPill, Spinner, ErrorBanner } from '../components/ui';

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

function lighten(hex: string, amount: number): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function drawRoundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

const EDGE_LABEL_FONT = 'bold 11px ui-sans-serif, system-ui, sans-serif';
const EDGE_LABEL_HEIGHT = 16;
const EDGE_LABEL_MARGIN = 4;

const STATUS_COLORS: Record<CaseStatus, string> = {
  open: '#0284c7', // Sky 600
  under_investigation: '#d97706', // Amber 600
  in_court: '#7c3aed', // Violet 600
  closed: '#059669', // Emerald 600
  archived: '#64748b', // Slate 500
};

export function CorrelationGraphPage() {
  const [searchParams] = useSearchParams();
  const initialCaseId = searchParams.get('caseId');

  const [minScore, setMinScore] = useState<number>(15);
  const [excludeClosed, setExcludeClosed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialCaseId);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const graphAsync = useAsync(
    () =>
      api.get<CorrelationGraphData>(
        `/api/cases/correlation-graph?minScore=${minScore}&excludeClosed=${excludeClosed}`,
      ),
    [minScore, excludeClosed],
  );

  // Nodes simulation state
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<GraphEdge[]>([]);
  const isDraggingRef = useRef<{ node: SimNode | null; offsetX: number; offsetY: number }>({
    node: null,
    offsetX: 0,
    offsetY: 0,
  });
  const panRef = useRef<{ x: number; y: number; isPanning: boolean; startX: number; startY: number }>({
    x: 0,
    y: 0,
    isPanning: false,
    startX: 0,
    startY: 0,
  });
  const zoomRef = useRef<number>(1);
  const dprRef = useRef<number>(1);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const alphaRef = useRef<number>(1);

  // Re-heat the force simulation after an interaction or data change.
  function wakeSimulation() {
    alphaRef.current = 1;
  }

  // Initialize simulation nodes when data arrives
  useEffect(() => {
    if (!graphAsync.data) return;

    const { nodes, edges } = graphAsync.data;
    const width = 800;
    const height = 600;

    // Preserve existing node positions if present
    const prevMap = new Map(simNodesRef.current.map((n) => [n.id, n]));

    const newSimNodes: SimNode[] = nodes.map((node, i) => {
      const existing = prevMap.get(node.id);
      if (existing) {
        return { ...node, x: existing.x, y: existing.y, vx: 0, vy: 0, radius: 24 };
      }
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const radiusDist = 150 + Math.sqrt(nodes.length) * 36 + Math.random() * 60;
      return {
        ...node,
        x: width / 2 + Math.cos(angle) * radiusDist,
        y: height / 2 + Math.sin(angle) * radiusDist,
        vx: 0,
        vy: 0,
        radius: 24,
      };
    });

    simNodesRef.current = newSimNodes;
    simEdgesRef.current = edges;
    wakeSimulation();

    if (initialCaseId && !selectedNodeId) {
      setSelectedNodeId(initialCaseId);
    }
  }, [graphAsync.data, initialCaseId, selectedNodeId]);

  // Main Canvas Render & Physics Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    if (dprRef.current === 1) dprRef.current = window.devicePixelRatio || 1;
    // Track previous binary deps so we only wake the sim on real changes.
    let prevSelectedNodeId = selectedNodeId;
    let prevSearchQuery = searchQuery;

    function step() {
      if (!running || !canvas || !ctx) return;

      const nodes = simNodesRef.current;
      const edges = simEdgesRef.current;
      // Work in CSS pixel space and let the DPR transform handle sharpness.
      const dpr = dprRef.current || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (selectedNodeId !== prevSelectedNodeId || searchQuery !== prevSearchQuery) {
        prevSelectedNodeId = selectedNodeId;
        prevSearchQuery = searchQuery;
        alphaRef.current = Math.max(alphaRef.current, 0.35);
      }

      // 1. Force simulation step (runs hot while alpha is high, then settles)
      const nodeIndexMap = new Map(nodes.map((n) => [n.id, n]));
      if (alphaRef.current > 0.01) {
        const alpha = alphaRef.current;
        // Repulsion between all node pairs
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const na = nodes[i];
            const nb = nodes[j];
            const dx = nb.x - na.x;
            const dy = nb.y - na.y;
            const distSq = dx * dx + dy * dy || 1;
            const dist = Math.sqrt(distSq);
            if (dist < 340) {
              const force = (1800 + (na.radius + nb.radius) * 60) / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              na.vx -= fx;
              na.vy -= fy;
              nb.vx += fx;
              nb.vy += fy;
            }
          }
        }

        // Link attraction along edges
        for (const edge of edges) {
          const source = nodeIndexMap.get(edge.source);
          const target = nodeIndexMap.get(edge.target);
          if (source && target) {
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = 140 - (edge.similarity / 100) * 40; // higher similarity = closer
            const force = (dist - targetDist) * 0.04;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            source.vx += fx;
            source.vy += fy;
            target.vx -= fx;
            target.vy -= fy;
          }
        }

        // Center gravity pull
        for (const node of nodes) {
          const dx = width / 2 - node.x;
          const dy = height / 2 - node.y;
          node.vx += dx * 0.005;
          node.vy += dy * 0.005;

          node.vx *= 0.82;
          node.vy *= 0.82;

          if (isDraggingRef.current.node !== node) {
            node.x += node.vx * alpha;
            node.y += node.vy * alpha;
          }
        }

        // Node collision resolution: iterative overlap separation (position based)
        for (let iter = 0; iter < 3; iter++) {
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const na = nodes[i];
              const nb = nodes[j];
              // Extra padding for labels drawn beneath each node
              const minDist = na.radius + nb.radius + 8;
              let dx = nb.x - na.x;
              let dy = nb.y - na.y;
              let dist = Math.sqrt(dx * dx + dy * dy);
              if (dist === 0) {
                dx = Math.random() - 0.5;
                dy = Math.random() - 0.5;
                dist = Math.sqrt(dx * dx + dy * dy) || 1;
              }
              if (dist < minDist) {
                const push = (minDist - dist) / dist / 2;
                if (isDraggingRef.current.node !== na) {
                  na.x -= dx * push;
                  na.y -= dy * push;
                }
                if (isDraggingRef.current.node !== nb) {
                  nb.x += dx * push;
                  nb.y += dy * push;
                }
              }
            }
          }
        }

        // Keep nodes within view bounds (with padding for labels)
        const pad = 70;
        for (const node of nodes) {
          if (isDraggingRef.current.node === node) continue;
          if (node.x < pad) node.x = pad;
          if (node.x > width - pad) node.x = width - pad;
          if (node.y < pad) node.y = pad;
          if (node.y > height - pad) node.y = height - pad;
        }

        // alpha decay -> simulation settles and stops micro-jitter
        alphaRef.current = alpha * 0.99;
      }

      // 2. Render Canvas
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      // Apply pan & zoom
      ctx.translate(panRef.current.x, panRef.current.y);
      ctx.scale(zoomRef.current, zoomRef.current);

      const hoveredId = hoveredNodeIdRef.current;

      // Focus-edge labels are drawn AFTER nodes (second pass) so circles and
      // titles never overlap the percentage pills.
      const edgeFocusLabels: {
        x1: number; y1: number; x2: number; y2: number;
        label: string; labelW: number; labelH: number; pillColor: string;
      }[] = [];

      // Draw Edges
      for (const edge of edges) {
        const source = nodeIndexMap.get(edge.source);
        const target = nodeIndexMap.get(edge.target);
        if (!source || !target) continue;

        const isHighlighted =
          selectedNodeId === edge.source || selectedNodeId === edge.target;
        const isHovered = hoveredId === edge.source || hoveredId === edge.target;
        const isFocus = isHighlighted || isHovered;

        // Dim unrelated edges when something is selected or hovered
        if (selectedNodeId || hoveredId) {
          ctx.globalAlpha = isFocus ? 1 : 0.18;
        } else {
          ctx.globalAlpha = 1;
        }

        // Draw edge line from node edge (not center) so lines don't
        // disappear behind circles
        const sdx = source.x - target.x;
        const sdy = source.y - target.y;
        const sdist = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
        const sx = source.x - (sdx / sdist) * (source.radius + 2);
        const sy = source.y - (sdy / sdist) * (source.radius + 2);
        const tx = target.x + (sdx / sdist) * (target.radius + 2);
        const ty = target.y + (sdy / sdist) * (target.radius + 2);

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);

        if (isFocus) {
          // Add glow underlay for emphasized edges
          ctx.save();
          ctx.strokeStyle = isHighlighted ? 'rgba(245, 158, 11, 0.28)' : 'rgba(56, 189, 248, 0.28)';
          ctx.lineWidth = Math.max(6, (edge.similarity / 100) * 12);
          ctx.stroke();
          ctx.restore();
          ctx.strokeStyle = isHighlighted ? '#f59e0b' : '#38bdf8';
          ctx.lineWidth = Math.max(2, (edge.similarity / 100) * 6);
        } else {
          ctx.strokeStyle =
            edge.similarity >= 60 ? 'rgba(16, 185, 129, 0.55)' : 'rgba(148, 163, 184, 0.6)';
          ctx.lineWidth = Math.max(1, (edge.similarity / 100) * 4);
        }
        ctx.stroke();

        // Collect focus-edge labels for a second pass; skip the label when
        // the clear span between the two node rims is too small to fit it.
        if (isFocus) {
          const label = `${edge.similarity}%`;
          ctx.font = EDGE_LABEL_FONT;
          const labelW = ctx.measureText(label).width + 10;
          const labelH = EDGE_LABEL_HEIGHT;
          const spanLen = Math.sqrt((sx - tx) ** 2 + (sy - ty) ** 2);
          if (spanLen >= labelW + EDGE_LABEL_MARGIN * 2) {
            // Pill inherits the edge's own stroke color (amber when the edge
            // is selected, sky when only hovered).
            const pillColor = isHighlighted ? '#f59e0b' : '#38bdf8';
            edgeFocusLabels.push({ x1: sx, y1: sy, x2: tx, y2: ty, label, labelW, labelH, pillColor });
          }
        }
        ctx.globalAlpha = 1;
      }

      // Determine focus set (selected/hovered + neighbours) for node highlighting.
      const focusIds = new Set<string>();
      if (selectedNodeId) focusIds.add(selectedNodeId);
      if (hoveredId) focusIds.add(hoveredId);
      if (focusIds.size > 0) {
        for (const edge of edges) {
          if (focusIds.has(edge.source)) focusIds.add(edge.target);
          if (focusIds.has(edge.target)) focusIds.add(edge.source);
        }
      }

      // Draw Nodes
      for (const node of nodes) {
        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredId === node.id;
        const isMatchesQuery =
          searchQuery.trim().length > 0 &&
          (node.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.leadOfficerName.toLowerCase().includes(searchQuery.toLowerCase()));
        const isFocused = focusIds.size === 0 || focusIds.has(node.id);

        if (!isFocused && (selectedNodeId || hoveredId)) {
          ctx.globalAlpha = 0.14;
        }

        // Outer glow / selection ring
        if (isSelected || isHovered || isMatchesQuery) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 7, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, node.radius + 14);
          const ringColor = isSelected ? 'rgba(245, 158, 11, 0.45)' : 'rgba(56, 189, 248, 0.4)';
          grad.addColorStop(0, ringColor);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#f59e0b' : '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Main node body with subtle radial shading for volume
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        const bodyGrad = ctx.createRadialGradient(
          node.x - node.radius * 0.3,
          node.y - node.radius * 0.35,
          node.radius * 0.1,
          node.x,
          node.y,
          node.radius,
        );
        bodyGrad.addColorStop(0, lighten(STATUS_COLORS[node.status] ?? '#475569', 0.28));
        bodyGrad.addColorStop(1, STATUS_COLORS[node.status] ?? '#475569');
        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Node ID label inside (top-aligned monospace)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id.replace('CASE-', '#'), node.x, node.y - 4);

        // Sublabel (evidence count badge)
        ctx.font = '8.5px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillText(`${node.evidenceCount} ev`, node.x, node.y + 7);

        // Case title below node (keep proportionate dimming so focus reads correctly)
        ctx.globalAlpha = isFocused || !(selectedNodeId || hoveredId) ? 1 : 0.45;
        ctx.fillStyle = isSelected || isHovered ? '#e2e8f0' : 'rgba(226, 232, 240, 0.75)';
        ctx.font = (isSelected || isHovered ? 'bold ' : '') + '10.5px ui-sans-serif, system-ui, sans-serif';
        const truncatedTitle =
          node.label.length > 24 ? node.label.slice(0, 22).trimEnd() + '…' : node.label;
        ctx.fillText(truncatedTitle, node.x, node.y + node.radius + 13);
        ctx.globalAlpha = 1;
      }

      // Second pass: edge percentage pills drawn AFTER the node layer so node
      // circles and case titles can never cover them. Positioned at the
      // midpoint of the rim-to-rim span; the span-length gate applied when
      // collecting labels already guarantees (half pill width + margin) fits
      // inside each half, so the pill can never overlap a node circle.
      for (const lb of edgeFocusLabels) {
        const ex = lb.x2 - lb.x1;
        const ey = lb.y2 - lb.y1;
        const spanLen = Math.sqrt(ex * ex + ey * ey) || 1;
        const ux = ex / spanLen;
        const uy = ey / spanLen;
        const halfW = lb.labelW / 2;
        const cx = lb.x1 + ux * spanLen * 0.5;
        const cy = lb.y1 + uy * spanLen * 0.5;

        ctx.font = EDGE_LABEL_FONT;
        // Pill background matches the graph vector (edge) color it sits on.
        ctx.fillStyle = lb.pillColor;
        drawRoundedRectPath(ctx, cx - halfW, cy - lb.labelH / 2, lb.labelW, lb.labelH, lb.labelH / 2);
        ctx.fill();
        // Dark text for contrast on the bright edge colors.
        ctx.fillStyle = '#0b1220';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lb.label, cx, cy);
      }

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(step);
    }

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [selectedNodeId, searchQuery]);

  // Handle Resize
  useEffect(() => {
    function handleResize() {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.parentElement?.getBoundingClientRect();
      if (rect) {
        const dpr = window.devicePixelRatio || 1;
        dprRef.current = dpr;
        canvasRef.current.width = Math.round(rect.width * dpr);
        canvasRef.current.height = Math.round(Math.max(560, window.innerHeight - 340) * dpr);
        canvasRef.current.style.height = `${Math.max(560, window.innerHeight - 340)}px`;
        wakeSimulation();
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse / Touch Event Handlers
  function getCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>): {
    x: number;
    y: number;
    rawX: number;
    rawY: number;
  } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, rawX: 0, rawY: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Transform by pan and zoom
    const simX = (mouseX - panRef.current.x) / zoomRef.current;
    const simY = (mouseY - panRef.current.y) / zoomRef.current;
    return { x: simX, y: simY, rawX: mouseX, rawY: mouseY };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y, rawX, rawY } = getCanvasCoords(e);
    const nodes = simNodesRef.current;

    // Check if clicked a node
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = x - n.x;
      const dy = y - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 4) {
        isDraggingRef.current = { node: n, offsetX: dx, offsetY: dy };
        setSelectedNodeId(n.id);
        wakeSimulation();
        return;
      }
    }

    // Start background pan
    panRef.current.isPanning = true;
    panRef.current.startX = rawX - panRef.current.x;
    panRef.current.startY = rawY - panRef.current.y;
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isDraggingRef.current.node) {
      const { x, y } = getCanvasCoords(e);
      isDraggingRef.current.node.x = x - isDraggingRef.current.offsetX;
      isDraggingRef.current.node.y = y - isDraggingRef.current.offsetY;
      isDraggingRef.current.node.vx = 0;
      isDraggingRef.current.node.vy = 0;
    } else if (panRef.current.isPanning) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      panRef.current.x = rawX - panRef.current.startX;
      panRef.current.y = rawY - panRef.current.startY;
    } else {
      // Idle move: update hover highlight (nearest node within hit radius)
      const { x, y } = getCanvasCoords(e);
      let hovered: string | null = null;
      for (let i = simNodesRef.current.length - 1; i >= 0; i--) {
        const n = simNodesRef.current[i];
        const dx = x - n.x;
        const dy = y - n.y;
        if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 6) {
          hovered = n.id;
          break;
        }
      }
      hoveredNodeIdRef.current = hovered;
    }
  }

  function handleMouseUp() {
    if (isDraggingRef.current.node) {
      wakeSimulation();
    }
    isDraggingRef.current.node = null;
    panRef.current.isPanning = false;
    hoveredNodeIdRef.current = null;
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const prevZoom = zoomRef.current;
    const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(2.5, Math.max(0.4, prevZoom * zoomDelta));
    if (newZoom === prevZoom) return;

    // Zoom toward the cursor position so the point under it stays fixed
    panRef.current.x = mouseX - ((mouseX - panRef.current.x) / prevZoom) * newZoom;
    panRef.current.y = mouseY - ((mouseY - panRef.current.y) / prevZoom) * newZoom;
    zoomRef.current = newZoom;
  }

  function resetLayout() {
    zoomRef.current = 1;
    panRef.current.x = 0;
    panRef.current.y = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    simNodesRef.current.forEach((node, i) => {
      const angle = (i / Math.max(1, simNodesRef.current.length)) * Math.PI * 2;
      node.x = width / 2 + Math.cos(angle) * 170;
      node.y = height / 2 + Math.sin(angle) * 170;
      node.vx = 0;
      node.vy = 0;
    });
    wakeSimulation();
  }

  // Selected Node Details
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return simNodesRef.current.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId]);

  const connectedEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return simEdgesRef.current.filter(
      (e) => e.source === selectedNodeId || e.target === selectedNodeId,
    );
  }, [selectedNodeId]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cross-Case Linkage &amp; Intelligence Graph"
        subtitle="Visual force-directed correlation topology connecting cases across digital fingerprints, geospatial distance, M.O. evidence types, and temporal proximity."
        actions={
          <button type="button" onClick={resetLayout} className="fs-btn-secondary fs-btn text-xs">
            Reset View &amp; Center
          </button>
        }
      />

      {/* Control Filters Bar */}
      <div className="fs-card grid gap-4 md:grid-cols-4 items-center">
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Similarity Threshold: <span className="text-amber-700 font-bold">{minScore}%</span>
          </label>
          <input
            type="range"
            min="5"
            max="80"
            step="5"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-full cursor-pointer accent-amber-600"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Search Nodes:</label>
          <input
            type="text"
            placeholder="Search Case ID, title, officer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="fs-input text-xs"
          />
        </div>

        <div className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            id="excludeClosedCheck"
            checked={excludeClosed}
            onChange={(e) => setExcludeClosed(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-forensic-600 focus:ring-forensic-500"
          />
          <label htmlFor="excludeClosedCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
            Exclude Closed / Archived
          </label>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 justify-end">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-600"></span> Open
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-600"></span> Investigation
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Closed
        </div>
      </div>

      <ErrorBanner error={graphAsync.error} />

      {graphAsync.loading && <Spinner label="Loading intelligence correlation graph…" />}

      {/* Main Graph Viewport & Inspector Panel */}
      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <div className="fs-card lg:col-span-2 p-0 overflow-hidden relative border border-slate-300 bg-slate-950 shadow-inner rounded-xl">
          <div className="absolute top-3 left-3 z-10 rounded-md bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 backdrop-blur">
            Scroll to zoom • Drag to pan • Click &amp; drag node to inspect
          </div>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className="block w-full cursor-grab active:cursor-grabbing"
          />
        </div>

        {/* Selected Case Inspector */}
        <div className="fs-card">
          {selectedNode ? (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-500">{selectedNode.id}</span>
                  <StatusPill status={selectedNode.status} />
                </div>
                <h3 className="mt-1 text-base font-semibold text-slate-900">{selectedNode.label}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Lead Officer: <strong className="text-slate-700">{selectedNode.leadOfficerName}</strong>
                </p>
                <p className="text-xs text-slate-500">
                  Location: <span className="font-mono">{selectedNode.locationPoint}</span>
                </p>
                <p className="text-xs text-slate-500">Evidence Count: {selectedNode.evidenceCount} item(s)</p>

                <div className="mt-3">
                  <Link to={`/cases/${selectedNode.id}`} className="fs-btn-primary block text-center text-xs py-1.5">
                    Open Full Case Detail →
                  </Link>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Connected Correlations ({connectedEdges.length})
                </h4>
                {connectedEdges.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    No connected links at current threshold ({minScore}%). Try lowering the similarity threshold.
                  </p>
                ) : (
                  <div className="mt-2 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {connectedEdges.map((edge) => {
                      const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                      const otherNode = simNodesRef.current.find((n) => n.id === otherId);

                      return (
                        <div key={`${edge.source}-${edge.target}`} className="py-2.5 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">
                              {otherNode?.label ?? otherId}
                            </p>
                            <p className="font-mono text-[10px] text-slate-400">{otherId}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {edge.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                              {edge.similarity}%
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedNodeId(otherId)}
                              className="mt-1 block text-[11px] font-medium text-forensic-600 hover:underline"
                            >
                              Focus Node
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">
              <span className="text-3xl block mb-2">🔍</span>
              <p className="text-xs font-medium">Click on any case node in the graph to inspect correlations and link details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
