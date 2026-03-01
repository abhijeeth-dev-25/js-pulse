import * as vm from 'vm';
import { ExecutionEvent, EventType } from '../models/types';

const MAX_EXECUTION_TICKS = 1000;
const EXECUTION_TIMEOUT_MS = 2000;
const MAX_OBJECTS_TRACKED = 200;
const MAX_ARRAY_LENGTH = 50;

export class SandboxEngine {
    private timeline: ExecutionEvent[] = [];
    private objectIds = new WeakMap<object, number>();
    private nextObjectId = 1;

    public execute(instrumentedCode: string) {
        this.timeline = [];
        this.objectIds = new WeakMap();
        this.nextObjectId = 1;
        let ticks = 0;

        const context = {
            // The tracking global
            __record: (type: string, ...args: any[]) => {
                ticks++;
                if (ticks > MAX_EXECUTION_TICKS) {
                    throw new Error('Infinite loop detected: Exceeded maximum trace ticks');
                }
                this.handleTraceEvent(type as EventType, args);
            },
            console: {
                log: (...args: any[]) => console.log('Sandbox log:', ...args)
            }
        };

        vm.createContext(context);

        let executionError = undefined;

        try {
            const script = new vm.Script(instrumentedCode);
            script.runInContext(context, {
                timeout: EXECUTION_TIMEOUT_MS
            });
        } catch (err: any) {
            console.error('Sandbox execution error:', err);
            // Surface the specific runtime error (e.g. TypeError) directly to the webview
            executionError = err instanceof Error ? err.name + ': ' + err.message : String(err);
            // We still return the timeline up to the exact crash point so the user sees what failed
        }

        return { timeline: this.timeline, error: executionError };
    }

    private handleTraceEvent(type: EventType, args: any[]) {
        // 1. Assign:       type='assign', name, value, line
        // 2. Heap Update:  type='heap_update', objName, obj, propName, value, line
        const timestamp = this.timeline.length;

        if (type === 'assign' as any) {
            const [name, value, line] = args;

            if (typeof value === 'object' && value !== null) {
                const heapId = this.trackObject(value);
                this.timeline.push({ type: 'assignment', timestamp, variableName: name, heapId, lineNumber: line });
            } else {
                this.timeline.push({ type: 'assignment', timestamp, variableName: name, value, lineNumber: line });
            }
        } else if (type === 'heap_update' as any) {
            const [objName, obj, propName, value, line] = args;
            const heapId = this.trackObject(obj);

            let targetHeapId;
            if (typeof value === 'object' && value !== null) {
                targetHeapId = this.trackObject(value);
            }

            this.timeline.push({
                type: 'heap_update',
                timestamp,
                variableName: objName,
                heapId,
                property: propName,
                value: targetHeapId === undefined ? value : targetHeapId,
                lineNumber: line
            });
        }
    }

    /**
     * Tracks an object in the WeakMap, emitting a heap_create event if 
     * we've never seen it before.
     */
    private trackObject(obj: any): number {
        if (this.objectIds.has(obj)) {
            return this.objectIds.get(obj)!;
        }

        if (this.nextObjectId > MAX_OBJECTS_TRACKED) {
            throw new Error(`Memory Limit: Cannot visualize graphs larger than ${MAX_OBJECTS_TRACKED} objects.`);
        }

        const id = this.nextObjectId++;
        this.objectIds.set(obj, id);

        // We do a shallow primitive copy to prevent retaining references to modified futures
        // Any child object references found become immediate heap_update edge events.
        let valueCopy: any = Array.isArray(obj) ? [] : {};
        const childReferences: { key: string | number; val: any }[] = [];

        if (Array.isArray(obj)) {
            const limit = Math.min(obj.length, MAX_ARRAY_LENGTH);
            for (let i = 0; i < limit; i++) {
                const val = obj[i];
                if (typeof val === 'object' && val !== null) {
                    childReferences.push({ key: i, val });
                    valueCopy.push(`[Ref]`); // clear visual placeholder
                } else {
                    valueCopy.push(val);
                }
            }
            if (obj.length > MAX_ARRAY_LENGTH) {
                valueCopy.push(`...(${obj.length - MAX_ARRAY_LENGTH} more items)`);
            }
        } else {
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const val = obj[key];
                    if (typeof val === 'object' && val !== null) {
                        childReferences.push({ key, val });
                        valueCopy[key] = '[Ref]';
                    } else if (typeof val !== 'function') {
                        valueCopy[key] = val;
                    }
                }
            }
        }

        this.timeline.push({
            type: 'heap_create',
            timestamp: this.timeline.length,
            heapId: id,
            value: valueCopy
        });

        // Generate the structural edges for nested items
        for (const ref of childReferences) {
            const targetId = this.trackObject(ref.val);
            this.timeline.push({
                type: 'heap_update',
                timestamp: this.timeline.length,
                heapId: id,
                property: ref.key,
                value: targetId,
                lineNumber: 0
            });
        }

        return id;
    }
}
