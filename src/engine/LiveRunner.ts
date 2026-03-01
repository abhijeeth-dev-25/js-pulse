import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { instrumentCodeForLive } from './tracer';

/**
 * LiveRunner
 * Orchestrates: instrument source → write temp file → spawn in VS Code terminal
 */
export class LiveRunner {
    private tempFilePath: string | null = null;
    private terminal: vscode.Terminal | null = null;

    constructor(private port: number) { }

    /**
     * Instruments the source code and spawns it in an integrated terminal.
     */
    public start(sourceCode: string, workspaceFolder?: string) {
        // 1. Instrument the code with the TCP streaming preamble
        const instrumented = instrumentCodeForLive(sourceCode, this.port);

        // 2. Write to temp file
        const dir = workspaceFolder || os.tmpdir();
        this.tempFilePath = path.join(dir, '.dsa-live.js');
        fs.writeFileSync(this.tempFilePath, instrumented, 'utf-8');

        // 3. Spawn in VS Code Integrated Terminal
        this.terminal = vscode.window.createTerminal({
            name: 'DSA Live',
            cwd: dir
        });
        this.terminal.show(true); // true = preserve focus on editor

        // Give the terminal a moment to initialize, then run
        this.terminal.sendText(`node "${this.tempFilePath}"`);
    }

    /**
     * Stops the terminal and cleans up the temp file.
     */
    public stop() {
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = null;
        }

        if (this.tempFilePath && fs.existsSync(this.tempFilePath)) {
            try {
                fs.unlinkSync(this.tempFilePath);
            } catch (e) {
                // best effort cleanup
            }
            this.tempFilePath = null;
        }
    }
}
