# JS Pulse 🔗

A VS Code extension that **visualizes data structures in real-time** as your JavaScript code runs. See linked lists, trees, graphs, and other data structures come alive right inside VS Code.

![Live Visualization](https://img.shields.io/badge/Live-Visualization-green) ![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue)

## ✨ Features

- **Live Visualization** — Run your JS code and see data structures rendered as interactive flowcharts
- **Auto-Refresh on Save** — Edit code, hit Cmd+S, and the view updates automatically
- **Interactive CRUD** — Use readline-based scripts to build data structures interactively from the terminal
- **Smart Filtering** — Only your data structures are shown; Node.js internals are hidden
- **Orphan Cleanup** — Deleted nodes vanish from the view automatically
- **Timeline Navigation** — Step through execution events with Prev/Next controls

## 🚀 Quick Start

1. Open any `.js` file in VS Code
2. Click **▶ Run DSA** in the status bar (or press `Cmd+Shift+R`)
3. Your code runs in the terminal — the visualization opens in a side panel
4. Edit and save — the view auto-refreshes

## 📦 Supported Data Structures

- **Linked Lists** — Singly/Doubly linked lists with node chains
- **Trees** — Binary trees, BSTs, n-ary trees
- **Graphs** — Directed graphs with adjacency representations
- **Objects & Maps** — Any object-based data structure with references

## 🎮 Example: Interactive Linked List

```javascript
var readline = require('readline');
var rl = readline.createInterface({ input: process.stdin, output: process.stdout });

var head = null;

function createNode(val) {
    return { val: val, next: null };
}

function insertAtEnd(val) {
    var node = createNode(val);
    if (head === null) {
        head = node;
    } else {
        var curr = head;
        while (curr.next !== null) curr = curr.next;
        curr.next = node;
    }
}

insertAtEnd('Alice');
insertAtEnd('Bob');
insertAtEnd('Charlie');
// Run with ▶ Run DSA to see the visualization!
```

## ⚙️ Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Run & Visualize DSA** | `Cmd+Shift+R` | Run the active JS file with live visualization |
| **Visualize DSA (Static)** | — | One-shot visualization using VM sandbox |

## 🏗️ Architecture

```
Extension Backend (TypeScript)
├── tracer.ts        — Babel AST instrumentation
├── LiveServer.ts    — TCP server for event streaming
├── LiveRunner.ts    — Terminal spawning & lifecycle
└── extension.ts     — VS Code integration

Webview Frontend (React + React Flow)
└── App.tsx          — Graph rendering & timeline controls
```

**How it works:**
1. Your JS code is parsed by Babel and instrumented with `__record()` calls
2. The instrumented code runs in a VS Code terminal
3. Events stream over TCP to the extension backend
4. The webview renders an interactive graph using React Flow

## 📄 License

MIT
