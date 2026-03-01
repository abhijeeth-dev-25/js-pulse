import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

/**
 * Names to skip — library imports, internals, and Node.js infrastructure.
 */
const SKIP_VARS = new Set([
    'readline', 'rl', 'fs', 'path', 'os', 'net', 'http', 'https',
    'process', 'console', 'Promise', 'require', 'module', 'exports',
    'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
]);

/**
 * Returns true if the initializer is a require() call, e.g. `var x = require('foo')`
 */
function isRequireCall(init: any): boolean {
    return t.isCallExpression(init) && t.isIdentifier(init.callee) && init.callee.name === 'require';
}

/**
 * Shared AST traversal logic that injects `__record` calls.
 * Skips library imports and internal variables.
 */
function injectRecordCalls(ast: any) {
    traverse(ast, {
        VariableDeclarator(path: any) {
            const id = path.node.id;
            if (t.isIdentifier(id) && path.node.init) {
                // Skip: require() calls, __ prefixed, known library vars
                if (isRequireCall(path.node.init)) return;
                if (id.name.startsWith('__')) return;
                if (SKIP_VARS.has(id.name)) return;

                // Only track top-level variable declarations (not function-local temps)
                // This filters out curr, node, parts, i, etc. inside functions
                const funcParent = path.getFunctionParent();
                if (funcParent) return; // inside a function — skip

                const statementPath = path.getStatementParent();
                if (statementPath) {
                    const line = path.node.loc?.start.line || 0;

                    const recordCall = t.expressionStatement(
                        t.callExpression(t.identifier('__record'), [
                            t.stringLiteral('assign'),
                            t.stringLiteral(id.name),
                            t.identifier(id.name),
                            t.numericLiteral(line)
                        ])
                    );

                    statementPath.insertAfter(recordCall);
                }
            }
        },

        AssignmentExpression(path: any) {
            const left = path.node.left;
            const statementPath = path.getStatementParent();
            const line = path.node.loc?.start.line || 0;

            if (!statementPath) return;

            if (t.isIdentifier(left)) {
                // Skip known library vars and internals
                if (left.name.startsWith('__')) return;
                if (SKIP_VARS.has(left.name)) return;

                // Only track assignments to variables declared at the top scope
                // This filters out function-local vars like curr, node, val1 etc.
                const binding = path.scope.getBinding(left.name);
                if (binding) {
                    const bindingScope = binding.scope;
                    // Check if the binding is at program level (not inside a function)
                    if (bindingScope.path.isFunctionExpression?.() ||
                        bindingScope.path.isFunctionDeclaration?.() ||
                        bindingScope.path.isArrowFunctionExpression?.()) {
                        return; // declared inside a function — skip
                    }
                }

                const recordCall = t.expressionStatement(
                    t.callExpression(t.identifier('__record'), [
                        t.stringLiteral('assign'),
                        t.stringLiteral(left.name),
                        t.identifier(left.name),
                        t.numericLiteral(line)
                    ])
                );
                statementPath.insertAfter(recordCall);
            } else if (t.isMemberExpression(left)) {
                let objName = 'unknown';
                let propName = 'unknown';
                if (t.isIdentifier(left.object)) objName = left.object.name;
                if (t.isIdentifier(left.property)) propName = left.property.name;

                // Skip mutations on library objects
                if (objName.startsWith('__') || SKIP_VARS.has(objName)) return;

                const recordCall = t.expressionStatement(
                    t.callExpression(t.identifier('__record'), [
                        t.stringLiteral('heap_update'),
                        t.stringLiteral(objName),
                        left.object,
                        t.stringLiteral(propName),
                        left,
                        t.numericLiteral(line)
                    ])
                );
                statementPath.insertAfter(recordCall);
            }
        }
    });
}

/**
 * Instruments the user code for VM Sandbox execution (Phase 1).
 * The \`__record\` function is provided by the Sandbox context.
 */
export function instrumentCode(sourceCode: string): string {
    const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins: ['typescript']
    });

    injectRecordCalls(ast);

    const output = generate(ast, {}, sourceCode);
    return output.code;
}

/**
 * Instruments the user code for Live Terminal execution (Phase 2).
 * Wraps user code so it only runs AFTER the TCP connection is established.
 */
export function instrumentCodeForLive(sourceCode: string, port: number): string {
    const ast = parse(sourceCode, {
        sourceType: 'unambiguous',
        plugins: ['optionalChaining', 'nullishCoalescingOperator']
    });

    injectRecordCalls(ast);

    const output = generate(ast, {}, sourceCode);

    // Escape the user code for embedding inside a function string
    // We'll wrap it in an IIFE inside the connect callback
    const escapedUserCode = output.code
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');

    // Use a real newline for the TCP delimiter
    const NL = '\\n';

    const fullScript = `// === DSA Visualizer Live Preamble ===
var __net = require('net');
var __objectIds = new WeakMap();
var __nextObjectId = 1;
var __timestamp = 0;
var __socket = null;

function __sendEvent(event) {
    if (__socket) {
        try { __socket.write(JSON.stringify(event) + "${NL}"); } catch(e) {}
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
                childRefs.push({ key: i, val: obj[i] });
                valueCopy.push('[Ref]');
            } else {
                valueCopy.push(obj[i]);
            }
        }
    } else {
        for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                var val = obj[key];
                if (typeof val === 'object' && val !== null) {
                    childRefs.push({ key: key, val: val });
                    valueCopy[key] = '[Ref]';
                } else if (typeof val !== 'function') {
                    valueCopy[key] = val;
                }
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
        if (typeof value === 'object' && value !== null) {
            var hid = __trackObject(value);
            __sendEvent({ type: 'assignment', timestamp: __timestamp++, variableName: name, heapId: hid, lineNumber: line });
        } else {
            __sendEvent({ type: 'assignment', timestamp: __timestamp++, variableName: name, value: value, lineNumber: line });
        }
    } else if (type === 'heap_update') {
        var objName = args[0], obj = args[1], propName = args[2], val2 = args[3], line2 = args[4];
        var hid2 = __trackObject(obj);
        var thid;
        if (typeof val2 === 'object' && val2 !== null) thid = __trackObject(val2);
        __sendEvent({ type: 'heap_update', timestamp: __timestamp++, variableName: objName, heapId: hid2, property: propName, value: thid !== undefined ? thid : val2, lineNumber: line2 });
    }
}

// Connect FIRST, then run user code only after connection is ready
__socket = __net.createConnection({ port: ${port}, host: '127.0.0.1' }, function() {
    // === User Code (runs only after TCP is connected) ===
    ${output.code}
    // === End User Code ===
});
__socket.on('error', function(err) {
    console.error('DSA Visualizer: Could not connect to extension.', err.message);
    process.exit(1);
});
// Close socket when process exits (works for both interactive and non-interactive)
process.on('exit', function() {
    try { if (__socket) __socket.end(); } catch(e) {}
});
// === End Preamble ===
`;

    return fullScript;
}
