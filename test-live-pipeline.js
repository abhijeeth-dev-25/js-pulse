/**
 * test-live-pipeline.js
 * 
 * Standalone test that simulates the full Live TCP pipeline:
 *   1. Starts a TCP server (like LiveServer would)
 *   2. Runs user code with the TCP preamble prepended
 *   3. Prints every streamed event as it arrives
 * 
 * Usage:  node test-live-pipeline.js
 */

const net = require('net');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Step 1: Start TCP Server ──
let eventCount = 0;
let buffer = '';

const server = net.createServer((socket) => {
    console.log('\n🔌 Child process connected!\n');

    socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const event = JSON.parse(trimmed);
                eventCount++;
                if (event.type === 'heap_create') {
                    console.log(`  📦 [${eventCount}] HEAP_CREATE  id=${event.heapId}  value=${JSON.stringify(event.value)}`);
                } else if (event.type === 'heap_update') {
                    console.log(`  🔗 [${eventCount}] HEAP_UPDATE  id=${event.heapId}  .${event.property} = ${event.value}`);
                } else if (event.type === 'assignment') {
                    const val = event.heapId !== undefined ? `→ Heap#${event.heapId}` : event.value;
                    console.log(`  📝 [${eventCount}] ASSIGNMENT   ${event.variableName} = ${val}  (line ${event.lineNumber})`);
                } else {
                    console.log(`  ❓ [${eventCount}] ${event.type}  ${JSON.stringify(event)}`);
                }
            } catch (e) { }
        }
    });

    socket.on('end', () => {
        console.log(`\n✅ Stream finished. Total events: ${eventCount}`);
        server.close();
    });
});

server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    console.log('===========================================');
    console.log('  DSA Visualizer — Live Pipeline Test');
    console.log('===========================================');
    console.log(`TCP Server on 127.0.0.1:${port}\n`);

    // ── Step 2: Read user code from examples ──
    const userCode = fs.readFileSync(path.join(__dirname, 'examples', 'graph-map.js'), 'utf-8');

    // ── Step 3: Build the instrumented script (preamble + user code with __record calls) ──
    // Manually instrument since we can't easily call the TS tracer from plain JS
    const preamble = `
var __net = require('net');
var __objectIds = new WeakMap();
var __nextObjectId = 1;
var __timestamp = 0;
var __eventBuffer = [];
var __socket = null;
var __socketReady = false;

function __sendEvent(event) {
    __eventBuffer.push(event);
    if (__socketReady && __socket) { __drainBuffer(); }
}
function __drainBuffer() {
    while (__eventBuffer.length > 0) {
        var ev = __eventBuffer.shift();
        try { __socket.write(JSON.stringify(ev) + '\\n'); } catch(e) {}
    }
}
function __trackObject(obj) {
    if (__objectIds.has(obj)) return __objectIds.get(obj);
    var id = __nextObjectId++;
    __objectIds.set(obj, id);
    var valueCopy = Array.isArray(obj) ? [] : {};
    var childRefs = [];
    if (Array.isArray(obj)) {
        for (var i = 0; i < Math.min(obj.length, 50); i++) {
            if (typeof obj[i] === 'object' && obj[i] !== null) {
                childRefs.push({ key: i, val: obj[i] }); valueCopy.push('[Ref]');
            } else { valueCopy.push(obj[i]); }
        }
    } else {
        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                var val = obj[key];
                if (typeof val === 'object' && val !== null) { childRefs.push({ key: key, val: val }); valueCopy[key] = '[Ref]'; }
                else if (typeof val !== 'function') { valueCopy[key] = val; }
            }
        }
    }
    __sendEvent({ type: 'heap_create', timestamp: __timestamp++, heapId: id, value: valueCopy });
    for (var r = 0; r < childRefs.length; r++) {
        var targetId = __trackObject(childRefs[r].val);
        __sendEvent({ type: 'heap_update', timestamp: __timestamp++, heapId: id, property: childRefs[r].key, value: targetId, lineNumber: 0 });
    }
    return id;
}
function __record(type) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (type === 'assign') {
        var name = args[0], value = args[1], line = args[2];
        if (typeof value === 'object' && value !== null) { var hid = __trackObject(value); __sendEvent({ type: 'assignment', timestamp: __timestamp++, variableName: name, heapId: hid, lineNumber: line }); }
        else { __sendEvent({ type: 'assignment', timestamp: __timestamp++, variableName: name, value: value, lineNumber: line }); }
    } else if (type === 'heap_update') {
        var objName = args[0], obj = args[1], propName = args[2], val2 = args[3], line2 = args[4];
        var hid2 = __trackObject(obj); var thid;
        if (typeof val2 === 'object' && val2 !== null) thid = __trackObject(val2);
        __sendEvent({ type: 'heap_update', timestamp: __timestamp++, variableName: objName, heapId: hid2, property: propName, value: thid !== undefined ? thid : val2, lineNumber: line2 });
    }
}
__socket = __net.createConnection({ port: ${port}, host: '127.0.0.1' }, function() {
    __socketReady = true;
    __drainBuffer();
});
__socket.setKeepAlive(true);
__socket.on('error', function() {});
process.on('beforeExit', function() { if (__socket && __eventBuffer.length > 0) __drainBuffer(); });
process.on('exit', function() { try { if (__socket) __socket.end(); } catch(e) {} });
`;

    // Simple manual instrumentation of graph-map.js
    const instrumentedCode = `
function createNode(val) {
    var result = { val: val, edges: [] };
    __record('assign', 'result', result, 4);
    return result;
}
function addEdge(fromNode, toNode) {
    fromNode.edges.push(toNode);
    __record('heap_update', 'fromNode', fromNode, 'edges', fromNode.edges, 8);
}

var graphMap = {
    A: createNode('Root'),
    B: createNode('Left Child'),
    C: createNode('Right Child'),
    D: createNode('Deep Node'),
    E: createNode('Deep Node')
};
__record('assign', 'graphMap', graphMap, 12);

addEdge(graphMap.A, graphMap.B);
addEdge(graphMap.A, graphMap.C);
addEdge(graphMap.B, graphMap.D);
addEdge(graphMap.C, graphMap.D);
addEdge(graphMap.E, graphMap.E);

var current = graphMap.A;
__record('assign', 'current', current, 28);
var nextHop = current.edges[0];
__record('assign', 'nextHop', nextHop, 29);
nextHop.val = 'Visited Left';
__record('heap_update', 'nextHop', nextHop, 'val', nextHop.val, 30);
`;

    const fullScript = preamble + instrumentedCode;
    const tempFile = path.join(__dirname, '.test-live.js');
    fs.writeFileSync(tempFile, fullScript, 'utf-8');

    console.log('Running instrumented script...\n');

    const child = spawn('node', [tempFile], { stdio: 'inherit' });

    child.on('exit', (code) => {
        try { fs.unlinkSync(tempFile); } catch (e) { }
        console.log(`\nChild exited with code ${code}`);
        setTimeout(() => process.exit(0), 1000);
    });
});
