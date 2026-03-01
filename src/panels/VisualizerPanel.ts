import * as vscode from 'vscode';

export class VisualizerPanel {
    public static currentPanel: VisualizerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (VisualizerPanel.currentPanel) {
            VisualizerPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'dsaVisualizer',
            'DSA Flowchart',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview-ui/dist')]
            }
        );

        VisualizerPanel.currentPanel = new VisualizerPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        VisualizerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    public sendTimeline(timeline: any, error?: string) {
        this._panel.webview.postMessage({ type: 'timeline', payload: timeline, error });
    }

    public sendLiveEvent(event: any) {
        this._panel.webview.postMessage({ type: 'live_event', payload: event });
    }

    public sendClear() {
        this._panel.webview.postMessage({ type: 'clear' });
    }

    private _update() {
        // In production we point this to the compiled Vite output
        const webview = this._panel.webview;
        this._panel.title = 'DSA Flowchart';

        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets', 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets', 'index.css'));

        this._panel.webview.html = `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DSA Visualizer</title>
        <link rel="stylesheet" type="text/css" href="${styleUri}">
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
      </body>
      </html>`;
    }
}
