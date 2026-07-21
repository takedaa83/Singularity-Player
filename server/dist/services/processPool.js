"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ytdlpPool = void 0;
/**
 * Process pool for yt-dlp to prevent unbounded child process spawning.
 * Limits concurrent processes and queues excess requests.
 */
class ProcessPool {
    maxConcurrent;
    activeCount = 0;
    queue = [];
    activeProcesses = new Set();
    constructor(maxConcurrent = 5) {
        this.maxConcurrent = maxConcurrent;
    }
    async acquire() {
        if (this.activeCount < this.maxConcurrent) {
            this.activeCount++;
            let registeredProc = null;
            const release = () => {
                this.activeCount--;
                if (registeredProc)
                    this.activeProcesses.delete(registeredProc);
                this.processQueue();
            };
            const registerProcess = (proc) => {
                registeredProc = proc;
                this.activeProcesses.add(proc);
                proc.on('exit', () => {
                    if (registeredProc === proc) {
                        this.activeProcesses.delete(proc);
                    }
                });
            };
            return { release, registerProcess };
        }
        // Queue the request
        return new Promise((resolve) => {
            this.queue.push({
                resolve: (handle) => resolve(handle),
            });
        });
    }
    processQueue() {
        if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
            const next = this.queue.shift();
            this.activeCount++;
            let registeredProc = null;
            const release = () => {
                this.activeCount--;
                if (registeredProc)
                    this.activeProcesses.delete(registeredProc);
                this.processQueue();
            };
            const registerProcess = (proc) => {
                registeredProc = proc;
                this.activeProcesses.add(proc);
                proc.on('exit', () => {
                    if (registeredProc === proc) {
                        this.activeProcesses.delete(proc);
                    }
                });
            };
            next.resolve({ release, registerProcess });
        }
    }
    getActiveCount() {
        return this.activeCount;
    }
    getQueuedCount() {
        return this.queue.length;
    }
    shutdownAll() {
        console.log(`[ProcessPool] Shutting down ${this.activeProcesses.size} active processes and ${this.queue.length} queued`);
        for (const proc of this.activeProcesses) {
            try {
                proc.kill('SIGTERM');
                const killTimeout = setTimeout(() => {
                    if (proc.exitCode === null && proc.signalCode === null) {
                        try {
                            proc.kill('SIGKILL');
                        }
                        catch {
                            // Ignore if already dead
                        }
                    }
                }, 2000);
                killTimeout.unref?.();
            }
            catch {
                // Process may already be dead
            }
        }
        this.activeProcesses.clear();
        this.queue = [];
        this.activeCount = 0;
    }
}
const DEFAULT_MAX_CONCURRENT = process.env.NODE_ENV === 'production' ? 2 : 5;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_PROCESSES || String(DEFAULT_MAX_CONCURRENT), 10);
console.log(`[ProcessPool] Initialized with maxConcurrent = ${MAX_CONCURRENT}`);
exports.ytdlpPool = new ProcessPool(MAX_CONCURRENT);
