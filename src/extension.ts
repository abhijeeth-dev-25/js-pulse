import * as vscode from 'vscode';
import { instrumentCode } from './engine/tracer';
import { SandboxEngine } from './engine/Sandbox';
import { VisualizerPanel } from './panels/VisualizerPanel';
import { LiveServer } from './engine/LiveServer';
import { LiveRunner } from './engine/LiveRunner';

let activeLiveServer: LiveServer | null = null;
let activeLiveRunner: LiveRunner | null = null;
let liveSessionFileUri: string | null = null;
let isRestarting = false;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {

    // ── Status Bar Button ──
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'dsa-visualizer.run';
    statusBarItem.tooltip = 'Run this file and visualize data structures (Ctrl+Shift+R)';
    updateStatusBar();
    statusBarItem.show();

    // Update button text when editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar())
    );

    // ── Main Command: Run & Visualize ──
    const runCommand = vscode.commands.registerCommand('dsa-visualizer.run', async () => {
        const document = getActiveJsDocument();
        if (!document) {
            vscode.window.showErrorMessage('Open a JavaScript file first!');
            return;
        }
        await startLiveSession(document, context);
    });

    // ── Legacy static sandbox command (kept for backwards compat) ──
    const staticCommand = vscode.commands.registerCommand('dsa-visualizer.start', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            editor = vscode.window.visibleTextEditors.find(e => e.document.uri.scheme === 'file');
        }
        if (!editor) {
            vscode.window.showErrorMessage('No active file to visualize!');
            return;
        }
        const sourceCode = editor.document.getText();
        try {
            const instrumented = instrumentCode(sourceCode);
            const engine = new SandboxEngine();
            const { timeline, error } = engine.execute(instrumented);
            if (error) {
                vscode.window.showWarningMessage(`Visualizer reached limit: ${error}`);
            }
            if (timeline.length === 0) {
                vscode.window.showInformationMessage('No execution events found.');
            } else {
                VisualizerPanel.createOrShow(context.extensionUri);
                setTimeout(() => {
                    if (VisualizerPanel.currentPanel) {
                        VisualizerPanel.currentPanel.sendTimeline(timeline, error);
                    }
                }, 1000);
            }
        } catch (err: any) {
            vscode.window.showErrorMessage(`Tracer failed: ${err.message}`);
        }
    });

    // Also keep the old live command pointing to the same thing
    const liveCommand = vscode.commands.registerCommand('dsa-visualizer.startLive', async () => {
        await vscode.commands.executeCommand('dsa-visualizer.run');
    });

    // ── Auto-Refresh on Save ──
    const saveWatcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
        if (liveSessionFileUri && document.uri.toString() === liveSessionFileUri) {
            updateStatusBar('$(sync~spin) Refreshing...');
            await startLiveSession(document, context);
        }
    });

    // ── Terminal Close Cleanup ──
    const terminalCloseListener = vscode.window.onDidCloseTerminal((closedTerminal) => {
        if (closedTerminal.name === 'DSA Live' && !isRestarting) {
            setTimeout(() => {
                cleanupLiveSession();
                liveSessionFileUri = null;
                updateStatusBar();
            }, 500);
        }
    });

    context.subscriptions.push(
        runCommand, staticCommand, liveCommand,
        saveWatcher, terminalCloseListener, statusBarItem
    );
}

// ────────────────────────────────────────────────────────
// Core Logic
// ────────────────────────────────────────────────────────

async function startLiveSession(document: vscode.TextDocument, context: vscode.ExtensionContext) {
    const sourceCode = document.getText();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    isRestarting = true;
    cleanupLiveSession();

    try {
        // 1. Open webview only if it doesn't exist yet; otherwise update silently
        if (!VisualizerPanel.currentPanel) {
            VisualizerPanel.createOrShow(context.extensionUri);
        }
        if (VisualizerPanel.currentPanel) {
            VisualizerPanel.currentPanel.sendClear();
        }

        // 2. Start TCP server
        activeLiveServer = new LiveServer((event) => {
            if (VisualizerPanel.currentPanel) {
                VisualizerPanel.currentPanel.sendLiveEvent(event);
            }
        });
        const port = await activeLiveServer.start();

        // 3. Wait for old terminal to fully close
        await delay(400);

        // 4. Instrument and run
        activeLiveRunner = new LiveRunner(port);
        activeLiveRunner.start(sourceCode, workspaceFolder);

        // 5. Track file for auto-refresh on save
        liveSessionFileUri = document.uri.toString();
        updateStatusBar('$(eye) Live');

    } catch (err: any) {
        vscode.window.showErrorMessage(`Visualizer failed: ${err.message}`);
        cleanupLiveSession();
        liveSessionFileUri = null;
        updateStatusBar();
    } finally {
        setTimeout(() => { isRestarting = false; }, 1000);
    }
}

function cleanupLiveSession() {
    if (activeLiveRunner) {
        activeLiveRunner.stop();
        activeLiveRunner = null;
    }
    if (activeLiveServer) {
        activeLiveServer.stop();
        activeLiveServer = null;
    }
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function isUserJsFile(fileName: string): boolean {
    return fileName.endsWith('.js') && !fileName.includes('.dsa-live');
}

function getActiveJsDocument(): vscode.TextDocument | undefined {
    // 1. Check active editor first
    const active = vscode.window.activeTextEditor;
    if (active && active.document.uri.scheme === 'file' && isUserJsFile(active.document.fileName)) {
        return active.document;
    }

    // 2. Check visible text editors (tabs you can see)
    const visibleJs = vscode.window.visibleTextEditors.find(
        e => e.document.uri.scheme === 'file' && isUserJsFile(e.document.fileName)
    );
    if (visibleJs) return visibleJs.document;

    // 3. Fallback: check ALL open text documents
    const allJs = vscode.workspace.textDocuments.find(
        d => d.uri.scheme === 'file' && isUserJsFile(d.fileName)
    );
    if (allJs) return allJs;

    return undefined;
}

function updateStatusBar(override?: string) {
    if (override) {
        statusBarItem.text = override;
        return;
    }

    const doc = vscode.window.activeTextEditor?.document;
    const isJs = doc?.languageId === 'javascript' || doc?.fileName.endsWith('.js');

    if (liveSessionFileUri) {
        statusBarItem.text = '$(eye) Live';
    } else if (isJs) {
        statusBarItem.text = '$(play) Run DSA';
    } else {
        statusBarItem.text = '$(play) Run DSA';
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function deactivate() {
    liveSessionFileUri = null;
    isRestarting = false;
    cleanupLiveSession();
}
