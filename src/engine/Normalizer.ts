import { ExecutionEvent, GraphNode, GraphEdge, VisualizationFrame } from '../models/types';

/**
 * Normalizer
 * Takes the raw flat Event Timeline from the Sandbox and reconstructs them into 
 * standard Nodes and Edges for ReactFlow at a specific point in time (timestamp target).
 */
export function buildGraphAtTimestamp(timeline: ExecutionEvent[], targetTimestamp: number): VisualizationFrame {
    const nodes = new Map<number, GraphNode>();
    const edges: GraphEdge[] = [];
    const activeLine = timeline[targetTimestamp]?.lineNumber;

    // Replay events up to target timestamp
    for (let i = 0; i <= targetTimestamp; i++) {
        const event = timeline[i];

        if (event.type === 'heap_create' && event.heapId) {
            nodes.set(event.heapId, {
                id: event.heapId.toString(),
                type: Array.isArray(event.value) ? 'array' : 'object',
                label: `Ob_${event.heapId}`,
                data: event.value || {}
            });
        }

        if (event.type === 'heap_update' && event.heapId && event.property) {
            const parentNode = nodes.get(event.heapId);
            if (parentNode) {
                // If the property value points to another heapId, it's an EDGE
                if (typeof event.value === 'number') {
                    // It's a pointer to another object (the value is target heapId)
                    // We remove the old edge if one exists for this property
                    const edgeId = `${event.heapId}-${event.property}`;
                    const existingEdgeIndex = edges.findIndex(e => e.id === edgeId);
                    if (existingEdgeIndex !== -1) {
                        edges.splice(existingEdgeIndex, 1);
                    }

                    edges.push({
                        id: edgeId,
                        source: event.heapId.toString(),
                        target: event.value.toString(),
                        label: event.property.toString()
                    });

                    // Don't store pointers in node data to prevent circular rendering
                    delete parentNode.data[event.property];
                } else {
                    // It's a primitive update on the object
                    parentNode.data[event.property] = event.value;
                }
            }
        }

        if (event.type === 'assignment' && event.variableName) {
            // In a real debugger, we'd have a separate "CallStack" UI component for variables.
            // For now, we represent primitive variables as explicit nodes, or edges pointing to the heap.

            if (event.heapId !== undefined) {
                // Variable pointing to object 
                const edgeId = `var-${event.variableName}`;
                const existingEdgeIndex = edges.findIndex(e => e.id === edgeId);
                if (existingEdgeIndex !== -1) edges.splice(existingEdgeIndex, 1);

                // Create a fake node representing the variable itself
                nodes.set(-1000 - i, {
                    id: `var-${event.variableName}`,
                    type: 'primitive',
                    label: event.variableName,
                    data: {}
                });

                edges.push({
                    id: edgeId,
                    source: `var-${event.variableName}`,
                    target: event.heapId.toString(),
                    label: 'ref'
                });
            }
        }
    }

    return {
        nodes: Array.from(nodes.values()),
        edges,
        activeLine
    };
}
