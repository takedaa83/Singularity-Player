"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadManager = void 0;
const events_1 = require("events");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const processPool_1 = require("./processPool");
const youtubeService_1 = require("./youtubeService");
const TRACKS_DIR = path_1.default.resolve(__dirname, '..', '..', 'uploads', 'tracks');
class DownloadManager extends events_1.EventEmitter {
    jobs = new Map();
    activeProcesses = new Map();
    getJob(id) {
        return this.jobs.get(id);
    }
    async startDownload(videoId) {
        if (!(0, youtubeService_1.isValidVideoId)(videoId)) {
            throw new Error('Invalid Video ID');
        }
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const job = {
            id: jobId,
            videoId,
            status: 'queued',
            progress: 0,
            speed: '0 KB/s',
            eta: '0s',
        };
        this.jobs.set(jobId, job);
        this.emit('update', job);
        // Run download in background
        this.runJob(jobId).catch((err) => {
            console.error(`Job ${jobId} failed:`, err);
        });
        return jobId;
    }
    async runJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job)
            return;
        let poolHandle;
        try {
            poolHandle = await processPool_1.ytdlpPool.acquire();
        }
        catch (err) {
            job.status = 'failed';
            job.error = 'Failed to acquire slot in queue';
            this.emit('update', job);
            return;
        }
        try {
            job.status = 'active';
            this.emit('update', job);
            const ytUrl = `https://www.youtube.com/watch?v=${job.videoId}`;
            const safeFilename = `${job.videoId}.m4a`;
            const outputPath = path_1.default.join(TRACKS_DIR, safeFilename);
            const child = (0, child_process_1.spawn)(youtubeService_1.YT_DLP_PATH, [
                '--no-warnings',
                '--no-playlist',
                '-f', '251/140/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
                '-o', outputPath,
                ytUrl
            ], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            child.on('error', (err) => {
                console.warn(`[DownloadManager] yt-dlp spawn error for job ${jobId}: ${err.message}`);
            });
            poolHandle.registerProcess(child);
            this.activeProcesses.set(jobId, child);
            child.stdout.on('data', (data) => {
                const line = data.toString();
                this.parseProgress(jobId, line);
            });
            child.stderr.on('data', (data) => {
                const line = data.toString();
                this.parseProgress(jobId, line);
            });
            // Set a maximum timeout of 20 minutes for download jobs
            const timeoutMs = 20 * 60 * 1000;
            const downloadTimeout = setTimeout(() => {
                if (child.exitCode === null) {
                    console.warn(`[DownloadManager] Job ${jobId} timed out after 20 minutes. Killing process.`);
                    child.kill('SIGKILL');
                }
            }, timeoutMs);
            const exitCode = await new Promise((resolve) => {
                child.on('exit', (code) => {
                    clearTimeout(downloadTimeout);
                    resolve(code);
                });
                child.on('error', () => {
                    clearTimeout(downloadTimeout);
                    resolve(-1);
                });
            });
            if (exitCode === 0) {
                job.status = 'completed';
                job.progress = 100;
                job.speed = '0 KB/s';
                job.eta = '0s';
                job.filePath = safeFilename;
            }
            else {
                job.status = 'failed';
                job.error = `Download failed with exit code ${exitCode}`;
            }
        }
        catch (err) {
            job.status = 'failed';
            job.error = err?.message || 'Unknown download error';
        }
        finally {
            poolHandle.release();
            this.activeProcesses.delete(jobId);
            // Clean up orphaned or incomplete partial files if the job failed or was cancelled
            if (job.status === 'failed') {
                try {
                    if (fs_1.default.existsSync(TRACKS_DIR)) {
                        const files = fs_1.default.readdirSync(TRACKS_DIR);
                        for (const file of files) {
                            if (file.startsWith(job.videoId)) {
                                const filePath = path_1.default.join(TRACKS_DIR, file);
                                try {
                                    fs_1.default.unlinkSync(filePath);
                                    console.log(`[DownloadManager] Cleaned up aborted/partial file: ${file}`);
                                }
                                catch (e) {
                                    // Ignore permission or file-not-found locks
                                }
                            }
                        }
                    }
                }
                catch (cleanupErr) {
                    console.error(`[DownloadManager] Failed to clean up temp files for ${job.videoId}:`, cleanupErr);
                }
            }
            this.emit('update', job);
        }
    }
    cancelDownload(jobId) {
        const job = this.jobs.get(jobId);
        if (!job)
            return;
        const proc = this.activeProcesses.get(jobId);
        if (proc) {
            try {
                proc.kill('SIGTERM');
                const killTimeout = setTimeout(() => {
                    if (proc.exitCode === null && proc.signalCode === null) {
                        console.warn(`[DownloadManager] Process for job ${jobId} did not exit after SIGTERM. Escalate to SIGKILL.`);
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
        job.status = 'failed';
        job.error = 'Cancelled by user';
        this.emit('update', job);
    }
    parseProgress(jobId, output) {
        const job = this.jobs.get(jobId);
        if (!job)
            return;
        // Pattern: [download]  10.5% of ~3.50MiB at  1.23MiB/s ETA 00:03
        const progressRegex = /\[download\]\s+([0-9.]+)\%\s+of\s+~?([0-9.]+\w+)\s+at\s+([0-9.]+\w+\/s)\s+ETA\s+([0-9:]+)/i;
        const match = output.match(progressRegex);
        if (match) {
            const progress = parseFloat(match[1]);
            const speed = match[3];
            const eta = match[4];
            job.progress = progress;
            job.speed = speed;
            job.eta = eta;
            this.emit('update', job);
        }
    }
}
exports.downloadManager = new DownloadManager();
