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
      const radiusDist = 180 + Math.random() * 80;
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

    function step() {
      if (!running || !canvas || !ctx) return;

      const nodes = simNodesRef.current;
      const edges = simEdgesRef.current;
      const width = canvas.width;
      const height = canvas.height;

      // 1. Force simulation step
      // Repulsion between all node pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const na = nodes[i];
          const nb = nodes[j];
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);
          if (dist < 320) {
            const force = 1800 / distSq;
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
      const nodeIndexMap = new Map(nodes.map((n) => [n.id, n]));
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

        // Apply damping velocity
        node.vx *= 0.82;
        node.vy *= 0.82;

        if (isDraggingRef.current.node !== node) {
          node.x += node.vx;
          node.y += node.vy;
        }
      }

      // 2. Render Canvas
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      // Apply pan & zoom
      ctx.translate(panRef.current.x, panRef.current.y);
      ctx.scale(zoomRef.current, zoomRef.current);

      // Draw Edges
      for (const edge of edges) {
        const source = nodeIndexMap.get(edge.source);
        const target = nodeIndexMap.get(edge.target);
        if (!source || !target) continue;

        const isHighlighted =
          selectedNodeId === edge.source || selectedNodeId === edge.target;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        if (isHighlighted) {
          ctx.strokeStyle = '#f59e0b'; // Amber 500
          ctx.lineWidth = Math.max(2, (edge.similarity / 100) * 6);
        } else {
          ctx.strokeStyle = edge.similarity >= 60 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(148, 163, 184, 0.4)';
          ctx.lineWidth = Math.max(1, (edge.similarity / 100) * 4);
        }
        ctx.stroke();

        // Edge label (similarity percentage)
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        ctx.fillStyle = isHighlighted ? '#78350f' : '#64748b';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${edge.similarity}%`, midX, midY - 6);
      }

      // Draw Nodes
      for (const node of nodes) {
        const isSelected = selectedNodeId === node.id;
        const isMatchesQuery =
          searchQuery.trim().length > 0 &&
          (node.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.leadOfficerName.toLowerCase().includes(searchQuery.toLowerCase()));

        // Outer glow / selection ring
        if (isSelected || isMatchesQuery) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.35)';
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#d97706' : '#0284c7';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Main node body
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = STATUS_COLORS[node.status] ?? '#475569';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Node ID label inside
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id.replace('CASE-', '#'), node.x, node.y - 3);

        // Sublabel (evidence count badge)
        ctx.font = '8px sans-serif';
        ctx.fillText(`${node.evidenceCount} ev`, node.x, node.y + 7);

        // Case title below node
        ctx.fillStyle = isSelected ? '#0f172a' : '#475569';
        ctx.font = isSelected ? 'bold 11px sans-serif' : '10px sans-serif';
        const truncatedTitle =
          node.label.length > 22 ? node.label.slice(0, 20) + '…' : node.label;
        ctx.fillText(truncatedTitle, node.x, node.y + node.radius + 14);
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
        canvasRef.current.width = rect.width;
        canvasRef.current.height = Math.max(560, window.innerHeight - 340);
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
    }
  }

  function handleMouseUp() {
    isDraggingRef.current.node = null;
    panRef.current.isPanning = false;
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
    zoomRef.current = Math.min(2.5, Math.max(0.4, zoomRef.current * zoomDelta));
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
      node.x = width / 2 + Math.cos(angle) * 190;
      node.y = height / 2 + Math.sin(angle) * 190;
      node.vx = 0;
      node.vy = 0;
    });
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
