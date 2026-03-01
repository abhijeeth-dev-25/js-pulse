// Example: Visualizing a Directed Graph (Object Map)

function createNode(val) {
    return { val: val, edges: [] };
}

function addEdge(fromNode, toNode) {
    fromNode.edges.push(toNode);
}

// 1. Create Graph Nodes Map
let graphMap = {
    A: createNode('Root'),
    B: createNode('Left Child'),
    C: createNode('Right Child'),
    D: createNode('Deep Node')
};

// 2. Link them together iteratively to form a Directed Graph
addEdge(graphMap.A, graphMap.B);
addEdge(graphMap.A, graphMap.C);
addEdge(graphMap.B, graphMap.D);
addEdge(graphMap.C, graphMap.D); // D is reachable from both B and C (Diamond graph!)

// Traverse or mutate part of the graph
let current = graphMap.A;
let nextHop = current.edges[0];
nextHop.val = 'Visited Left';
