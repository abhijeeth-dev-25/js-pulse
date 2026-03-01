// Shared types between Extension Backend and WebView React App

/**
 * Types of operations that can occur during code execution
 */
export type EventType =
    | 'assignment'    // Variables pointing to primitives or heap IDs
    | 'heap_create'   // Creating new object / array
    | 'heap_update'   // Updating object property / array index
    | 'function_enter'// Pushing to call stack
    | 'function_exit';// Popping from call stack

/**
 * Represents a single atomic change in the execution state over time
 */
export interface ExecutionEvent {
    type: EventType;
    timestamp: number;
    variableName?: string; // e.g. 'nodeA'
    heapId?: number;       // The stable WeakMap ID for the object
    value?: any;           // Primitive value or serialized partial object
    property?: string | number; // For heap_update (e.g. 'next', '0', 'left')
    lineNumber?: number;
}

/**
 * Used by the normalizer to build the final visualization
 */
export interface GraphNode {
    id: string; // React flow needs string IDs
    type: 'object' | 'array' | 'primitive';
    label: string;
    data: Record<string, any>;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    label?: string; // e.g. "next", "left", "right"
}

export interface VisualizationFrame {
    nodes: GraphNode[];
    edges: GraphEdge[];
    activeLine?: number;
}
