import { useState, useEffect } from 'react';
import { ReactFlow, Controls, Background, MarkerType, Position } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import './index.css';

// Dagre Layout Setup
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 250;
const nodeHeight = 120;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 50 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = { ...node };

    newNode.targetPosition = isHorizontal ? Position.Left : Position.Top;
    newNode.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches the React Flow node anchor point (top left).
    newNode.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return newNode;
  });

  return { nodes: newNodes as Node[], edges };
};

// Shared types (Would normally be imported from standard models)
interface ExecutionEvent {
  type: string;
  timestamp: number;
  variableName?: string;
  heapId?: number;
  value?: any;
  property?: string | number;
  lineNumber?: number;
}

interface VisualizationFrame {
  nodes: Node[];
  edges: Edge[];
  activeLine?: number;
}

// Basic Normalizer implemented on Frontend for structural building
function buildRawFrame(timeline: ExecutionEvent[], targetTimestamp: number): VisualizationFrame {
  const nodes = new Map<number, any>();
  const edges: Edge[] = [];
  const activeLine = timeline[targetTimestamp]?.lineNumber;

  const variableNodes = new Map<string, any>();

  for (let i = 0; i <= targetTimestamp; i++) {
    const event = timeline[i];

    if (event.type === 'heap_create' && event.heapId) {
      const isArray = Array.isArray(event.value);
      const bgColor = isArray ? '#f0fdf4' : '#eff6ff'; // green arrays, blue objects
      const borderColor = isArray ? '#22c55e' : '#3b82f6';

      nodes.set(event.heapId, {
        id: event.heapId.toString(),
        position: { x: 0, y: 0 },
        data: { label: JSON.stringify(event.value, null, 2) },
        style: { border: `2px solid ${borderColor}`, borderRadius: '8px', padding: '10px', backgroundColor: bgColor, minWidth: '100px', color: '#000', fontSize: '13px', fontWeight: 500 },
        sourcePosition: 'right',
        targetPosition: 'left'
      });
    }

    if (event.type === 'heap_update' && event.heapId && event.property !== undefined) {
      const parentNode = nodes.get(event.heapId);
      if (parentNode) {
        const edgeId = `e-${event.heapId}-${event.property}`;
        const existingEdgeIdx = edges.findIndex(e => e.id === edgeId);

        if (typeof event.value === 'number') {
          // It's a pointer to another node! Update target if edge exists, else create
          if (existingEdgeIdx !== -1) {
            edges[existingEdgeIdx].target = event.value.toString();
          } else {
            edges.push({
              id: edgeId,
              source: event.heapId.toString(),
              target: event.value.toString(),
              label: event.property.toString(),
              animated: true,
              style: { stroke: '#334155', strokeWidth: 2 },
              labelStyle: { fill: '#000', fontWeight: 700, fontSize: '13px' },
              labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
              labelBgPadding: [6, 4] as [number, number],
              labelBgBorderRadius: 4,
              markerEnd: { type: MarkerType.ArrowClosed, color: '#334155' }
            });
          }
          // Update text to show [Ref]
          try {
            const currentData = JSON.parse(parentNode.data.label);
            currentData[event.property] = '[Ref]';
            parentNode.data.label = JSON.stringify(currentData, null, 2);
          } catch (_) { /* label parse failed, leave as-is */ }

        } else {
          // It's a scalar value update
          if (existingEdgeIdx !== -1) {
            edges.splice(existingEdgeIdx, 1);
          }
          try {
            const currentData = JSON.parse(parentNode.data.label);
            currentData[event.property] = event.value;
            parentNode.data.label = JSON.stringify(currentData, null, 2);
          } catch (_) { /* label parse failed, leave as-is */ }
        }
      }
    }

    if (event.type === 'assignment' && event.variableName) {
      if (event.heapId !== undefined) {
        const varId = `var-${event.variableName}`;

        // Remove old edges from this variable
        const remainingEdges = edges.filter(e => e.source !== varId);
        edges.length = 0;
        edges.push(...remainingEdges);

        variableNodes.set(event.variableName, {
          id: varId,
          position: { x: variableNodes.size * 250 + 50, y: 30 },
          data: { label: event.variableName },
          style: { border: '2px solid #ef4444', borderRadius: '4px', padding: '5px', backgroundColor: '#fef2f2', fontWeight: 'bold', color: '#000', fontSize: '13px' },
          sourcePosition: 'bottom'
        });

        edges.push({
          id: `e-${varId}-${event.heapId}`,
          source: varId,
          target: event.heapId.toString(),
          label: 'ref',
          animated: false,
          style: { stroke: '#ef4444', strokeWidth: 2 },
          labelStyle: { fill: '#000', fontWeight: 700, fontSize: '12px' },
          labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
          labelBgPadding: [6, 4] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' }
        });
      }
    }
  }
  // ── Remove orphan heap nodes (not reachable from any variable) ──
  const reachable = new Set<string>();
  // Start from all variable nodes
  for (const [, vNode] of variableNodes) {
    reachable.add(vNode.id);
  }
  // Walk edges to find all reachable heap nodes
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (reachable.has(edge.source) && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        changed = true;
      }
    }
  }
  // Filter: keep only reachable heap nodes + all variable nodes
  const filteredNodes: any[] = [];
  for (const [, vNode] of variableNodes) {
    filteredNodes.push(vNode);
  }
  for (const [heapId, hNode] of nodes) {
    if (reachable.has(heapId.toString())) {
      filteredNodes.push(hNode);
    }
  }
  // Remove edges pointing to/from orphan nodes
  const filteredEdges = edges.filter(e => reachable.has(e.source) && reachable.has(e.target));

  return { nodes: filteredNodes, edges: filteredEdges, activeLine };
}

export default function App() {
  const [timeline, setTimeline] = useState<ExecutionEvent[]>([]);
  const [frame, setFrame] = useState<VisualizationFrame>({ nodes: [], edges: [] });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentTick, setCurrentTick] = useState(-1); // -1 = follow latest
  const [isPinned, setIsPinned] = useState(false); // true when user manually stepped

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'timeline') {
        setTimeline(message.payload);
        setErrorMsg(message.error || null);
        setCurrentTick(-1);
        setIsPinned(false);
      } else if (message.type === 'live_event') {
        setTimeline(prev => [...prev, message.payload]);
      } else if (message.type === 'clear') {
        setTimeline([]);
        setErrorMsg(null);
        setCurrentTick(-1);
        setIsPinned(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Determine the actual tick to render
  const effectiveTick = timeline.length === 0 ? -1
    : isPinned ? Math.min(currentTick, timeline.length - 1)
      : timeline.length - 1;

  useEffect(() => {
    if (timeline.length > 0 && effectiveTick >= 0) {
      const rawFrame = buildRawFrame(timeline, effectiveTick);
      const layouted = getLayoutedElements(rawFrame.nodes, rawFrame.edges, 'LR');
      setFrame({ nodes: layouted.nodes, edges: layouted.edges, activeLine: rawFrame.activeLine });
    } else {
      setFrame({ nodes: [], edges: [] });
    }
  }, [timeline, effectiveTick]);

  // Keyboard shortcuts: ← →
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (timeline.length === 0) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [timeline, effectiveTick, isPinned]);

  const goBack = () => {
    if (timeline.length === 0) return;
    const tick = isPinned ? effectiveTick : timeline.length - 1;
    if (tick > 0) {
      setCurrentTick(tick - 1);
      setIsPinned(true);
    }
  };

  const goForward = () => {
    if (!isPinned || timeline.length === 0) return;
    if (currentTick < timeline.length - 1) {
      const next = currentTick + 1;
      if (next >= timeline.length - 1) {
        // Reached the end — snap back to live
        setIsPinned(false);
        setCurrentTick(-1);
      } else {
        setCurrentTick(next);
      }
    }
  };

  const goToLatest = () => {
    setIsPinned(false);
    setCurrentTick(-1);
  };

  const isLive = timeline.length > 0;
  const isAtLatest = !isPinned;

  const btnBase: React.CSSProperties = {
    padding: '6px 14px',
    border: '1px solid #475569',
    borderRadius: '6px',
    background: 'linear-gradient(180deg, #334155, #1e293b)',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s ease',
    userSelect: 'none',
  };

  const btnDisabled: React.CSSProperties = {
    ...btnBase,
    opacity: 0.35,
    cursor: 'default',
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>

      {/* Error Banner */}
      {errorMsg && (
        <div style={{ padding: '10px 20px', backgroundColor: '#fee2e2', color: '#b91c1c', borderBottom: '1px solid #fca5a5', fontWeight: 'bold', fontSize: '13px' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Live Status Bar */}
      <div style={{
        padding: '10px 20px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: 'white',
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        borderBottom: '2px solid #334155',
        fontSize: '13px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: isAtLatest && isLive ? '#22c55e' : isPinned ? '#f59e0b' : '#64748b',
            boxShadow: isAtLatest && isLive ? '0 0 8px #22c55e' : 'none',
            animation: isAtLatest && isLive ? 'pulse 1.5s ease-in-out infinite' : 'none'
          }} />
          <span style={{ fontWeight: 700, color: isAtLatest && isLive ? '#4ade80' : isPinned ? '#fbbf24' : '#94a3b8' }}>
            {isAtLatest && isLive ? 'LIVE' : isPinned ? 'PAUSED' : 'IDLE'}
          </span>
        </div>

        <div style={{ color: '#94a3b8', borderLeft: '1px solid #334155', paddingLeft: '16px' }}>
          Step: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{effectiveTick >= 0 ? effectiveTick + 1 : 0}</span>
          <span style={{ color: '#64748b' }}> / {timeline.length}</span>
        </div>

        {frame.activeLine && (
          <div style={{ color: '#94a3b8', borderLeft: '1px solid #334155', paddingLeft: '16px' }}>
            Line: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{frame.activeLine}</span>
          </div>
        )}

        <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '11px' }}>
          DSA Visualizer
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, backgroundColor: '#f8fafc', position: 'relative' }}>
        {timeline.length === 0 ? (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            color: '#94a3b8'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '3px solid #e2e8f0',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{ fontSize: '15px', fontWeight: 500 }}>Waiting for execution events...</div>
            <div style={{ fontSize: '12px', color: '#cbd5e1' }}>Interact with the terminal to see your data structures come alive</div>
          </div>
        ) : (
          <ReactFlow nodes={frame.nodes} edges={frame.edges} fitView>
            <Background />
            <Controls />
          </ReactFlow>
        )}
      </div>

      {/* Navigation Control Bar */}
      {timeline.length > 0 && (
        <div style={{
          padding: '8px 20px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderTop: '2px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}>
          {/* Prev Button */}
          <button
            onClick={goBack}
            disabled={effectiveTick <= 0}
            style={effectiveTick <= 0 ? btnDisabled : btnBase}
            title="Previous step (← arrow key)"
          >
            ◀ Prev
          </button>

          {/* Step indicator */}
          <div style={{
            padding: '6px 16px',
            borderRadius: '6px',
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            color: '#94a3b8',
            fontSize: '12px',
            fontWeight: 500,
            minWidth: '90px',
            textAlign: 'center',
          }}>
            <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{effectiveTick + 1}</span>
            <span> / {timeline.length}</span>
          </div>

          {/* Next Button */}
          <button
            onClick={goForward}
            disabled={!isPinned || currentTick >= timeline.length - 1}
            style={(!isPinned || currentTick >= timeline.length - 1) ? btnDisabled : btnBase}
            title="Next step (→ arrow key)"
          >
            Next ▶
          </button>

          {/* Spacer */}
          <div style={{ width: '1px', height: '24px', backgroundColor: '#334155', margin: '0 4px' }} />

          {/* Latest Button */}
          <button
            onClick={goToLatest}
            disabled={isAtLatest}
            style={isAtLatest ? btnDisabled : { ...btnBase, backgroundColor: '#1d4ed8', border: '1px solid #3b82f6', color: '#fff' }}
            title="Jump to latest"
          >
            ⏭ Latest
          </button>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        button:hover:not(:disabled) {
          filter: brightness(1.2);
        }
        button:active:not(:disabled) {
          transform: scale(0.96);
        }
      `}</style>
    </div>
  );
}

