import * as net from 'net';
import { ExecutionEvent } from '../models/types';

/**
 * LiveServer
 * A lightweight TCP server that receives newline-delimited JSON events 
 * from an instrumented user script running in a real terminal.
 */
export class LiveServer {
    private server: net.Server | null = null;
    private activeSocket: net.Socket | null = null;
    private port = 0;
    private buffer = '';

    constructor(private onEvent: (event: ExecutionEvent) => void) { }

    /**
     * Starts the TCP server on a random available port.
     * Returns the port number once bound.
     */
    public start(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket) => {
                this.activeSocket = socket;

                socket.on('data', (data) => {
                    this.buffer += data.toString();
                    this.processBuffer();
                });

                socket.on('end', () => {
                    // Process any remaining buffered data
                    this.processBuffer();
                    this.activeSocket = null;
                });

                socket.on('error', (err) => {
                    console.error('LiveServer socket error:', err.message);
                    this.activeSocket = null;
                });
            });

            this.server.on('error', (err) => {
                reject(err);
            });

            // Listen on port 0 = OS assigns a random free port
            this.server.listen(0, '127.0.0.1', () => {
                const address = this.server!.address() as net.AddressInfo;
                this.port = address.port;
                console.log(`LiveServer listening on 127.0.0.1:${this.port}`);
                resolve(this.port);
            });
        });
    }

    /**
     * Processes the internal buffer, extracting complete newline-delimited JSON messages.
     */
    private processBuffer() {
        const lines = this.buffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                const event: ExecutionEvent = JSON.parse(trimmed);
                this.onEvent(event);
            } catch (err) {
                console.error('LiveServer: Failed to parse event:', trimmed);
            }
        }
    }

    /**
     * Returns the port the server is listening on.
     */
    public getPort(): number {
        return this.port;
    }

    /**
     * Stops the TCP server and cleans up connections.
     */
    public stop() {
        if (this.activeSocket) {
            this.activeSocket.destroy();
            this.activeSocket = null;
        }
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        this.buffer = '';
        this.port = 0;
    }
}
