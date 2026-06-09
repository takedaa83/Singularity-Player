import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ytdlpPool } from './processPool';
import { isValidVideoId, YT_DLP_PATH } from './youtubeService';

const TRACKS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'tracks');

export interface DownloadJob {
  id: string;
  videoId: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  progress: number;
  speed: string;
  eta: string;
  error?: string;
  filePath?: string;
}

class DownloadManager extends EventEmitter {
  private jobs = new Map<string, DownloadJob>();
  private activeProcesses = new Map<string, ChildProcess>();

  getJob(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }

  async startDownload(videoId: string): Promise<string> {
    if (!isValidVideoId(videoId)) {
      throw new Error('Invalid Video ID');
    }

    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const job: DownloadJob = {
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

  private async runJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    let poolHandle;
    try {
      poolHandle = await ytdlpPool.acquire();
    } catch (err: any) {
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
      const outputPath = path.join(TRACKS_DIR, safeFilename);

      const child = spawn(YT_DLP_PATH, [
        '--no-warnings',
        '--no-playlist',
        '-f', '251/140/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
        '-o', outputPath,
        ytUrl
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      poolHandle.registerProcess(child);
      this.activeProcesses.set(jobId, child);

      child.stdout.on('data', (data: Buffer) => {
        const line = data.toString();
        this.parseProgress(jobId, line);
      });

      child.stderr.on('data', (data: Buffer) => {
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

      const exitCode = await new Promise<number | null>((resolve) => {
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
      } else {
        job.status = 'failed';
        job.error = `Download failed with exit code ${exitCode}`;
      }
    } catch (err: any) {
      job.status = 'failed';
      job.error = err?.message || 'Unknown download error';
    } finally {
      poolHandle.release();
      this.activeProcesses.delete(jobId);
      this.emit('update', job);
    }
  }

  cancelDownload(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const proc = this.activeProcesses.get(jobId);
    if (proc) {
      try {
        proc.kill('SIGTERM');
        const killTimeout = setTimeout(() => {
          if (proc.exitCode === null && proc.signalCode === null) {
            console.warn(`[DownloadManager] Process for job ${jobId} did not exit after SIGTERM. Escalate to SIGKILL.`);
            try {
              proc.kill('SIGKILL');
            } catch {
              // Ignore if already dead
            }
          }
        }, 2000);
        killTimeout.unref?.();
      } catch {
        // Process may already be dead
      }
    }

    job.status = 'failed';
    job.error = 'Cancelled by user';
    this.emit('update', job);
  }

  private parseProgress(jobId: string, output: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

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

export const downloadManager = new DownloadManager();
