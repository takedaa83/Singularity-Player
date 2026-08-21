import { getApiBaseUrl } from '../utils/api';

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string;
  currentCommit: string | null;
  latestCommit: string | null;
  latestCommitMessage: string;
  latestCommitAuthor: string;
  latestCommitDate: string;
  commitsBehind: number;
  updateAvailable: boolean;
  isGitRepo: boolean;
  releaseNotes: string;
  releaseDownloadUrl: string;
  repoUrl: string;
  checkedAt: string;
}

type UpdateListener = (status: UpdateStatus | null) => void;

class UpdaterService {
  private status: UpdateStatus | null = null;
  private isChecking = false;
  private isApplying = false;
  private listeners = new Set<UpdateListener>();
  private checkPromise: Promise<UpdateStatus | null> | null = null;

  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const l of this.listeners) {
      l(this.status);
    }
  }

  public getStatus(): UpdateStatus | null {
    return this.status;
  }

  public getIsChecking(): boolean {
    return this.isChecking;
  }

  public getIsApplying(): boolean {
    return this.isApplying;
  }

  /**
   * Checks for updates against the backend / GitHub
   */
  public async checkForUpdates(force = false): Promise<UpdateStatus | null> {
    if (this.isChecking && this.checkPromise) {
      return this.checkPromise;
    }

    this.isChecking = true;
    this.checkPromise = (async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/updater/status${force ? '?fresh=true' : ''}`);
        if (!res.ok) {
          throw new Error(`Updater status endpoint returned ${res.status}`);
        }
        const data: UpdateStatus = await res.json();
        this.status = data;
        this.notify();
        return data;
      } catch (err) {
        console.warn('[UpdaterService] Failed to check update status:', err);
        return null;
      } finally {
        this.isChecking = false;
        this.checkPromise = null;
      }
    })();

    return this.checkPromise;
  }

  /**
   * Applies the update on self-hosted instances (git pull + build)
   */
  public async applyUpdate(): Promise<{ success: boolean; message: string }> {
    if (this.isApplying) {
      throw new Error('Update is already in progress.');
    }

    this.isApplying = true;
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/updater/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || 'Update failed');
      }

      return {
        success: true,
        message: data.message || 'Update completed successfully. Reloading...',
      };
    } finally {
      this.isApplying = false;
    }
  }
}

export const updaterService = new UpdaterService();
