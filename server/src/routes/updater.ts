import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);
const router = Router();

const REPO_OWNER = 'takedaa83';
const REPO_NAME = 'Singularity-Player';
const CURRENT_VERSION = '2.0.0';

interface UpdateCache {
  timestamp: number;
  data: any;
}

let cachedStatus: UpdateCache | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Checks if the server is running inside a git workspace directory
 */
function getWorkspaceRoot(): string {
  // In dev / monorepo, workspace root is two levels up from server/src or one level up from server
  const candidate1 = path.resolve(__dirname, '..', '..');
  const candidate2 = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(candidate1, '.git'))) return candidate1;
  if (fs.existsSync(path.join(candidate2, '.git'))) return candidate2;
  return process.cwd();
}

/**
 * Get current local git commit hash if available
 */
async function getLocalGitCommit(workspaceDir: string): Promise<string | null> {
  try {
    if (!fs.existsSync(path.join(workspaceDir, '.git'))) {
      return null;
    }
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: workspaceDir });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * GET /api/updater/status
 * Returns current version, local commit, remote latest commit, release notes, and update availability.
 */
router.get('/status', async (req: Request, res: Response) => {
  const forceRefresh = req.query.fresh === 'true';

  if (!forceRefresh && cachedStatus && (Date.now() - cachedStatus.timestamp < CACHE_TTL_MS)) {
    return res.json(cachedStatus.data);
  }

  const workspaceDir = getWorkspaceRoot();
  const isGitRepo = fs.existsSync(path.join(workspaceDir, '.git'));
  const currentCommit = await getLocalGitCommit(workspaceDir);

  let remoteCommit: string | null = null;
  let remoteCommitMessage = '';
  let remoteCommitAuthor = '';
  let remoteCommitDate = '';
  let latestReleaseTag = CURRENT_VERSION;
  let releaseNotes = '';
  let releaseDownloadUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;
  let commitsBehind = 0;

  try {
    // 1. Fetch latest commit from GitHub master branch
    const commitRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/master`, {
      headers: {
        'User-Agent': 'Singularity-Player-Updater',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (commitRes.ok) {
      const commitData: any = await commitRes.json();
      remoteCommit = commitData.sha;
      remoteCommitMessage = commitData.commit?.message || '';
      remoteCommitAuthor = commitData.commit?.author?.name || '';
      remoteCommitDate = commitData.commit?.author?.date || '';
    }

    // 2. Fetch latest release info
    const releaseRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`, {
      headers: {
        'User-Agent': 'Singularity-Player-Updater',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (releaseRes.ok) {
      const releaseData: any = await releaseRes.json();
      latestReleaseTag = releaseData.tag_name ? releaseData.tag_name.replace(/^v/, '') : CURRENT_VERSION;
      releaseNotes = releaseData.body || '';
      if (releaseData.html_url) {
        releaseDownloadUrl = releaseData.html_url;
      }
    }

    // Compare commits if in git repo
    let updateAvailable = false;
    if (currentCommit && remoteCommit) {
      updateAvailable = currentCommit.substring(0, 7) !== remoteCommit.substring(0, 7);
      if (updateAvailable) {
        commitsBehind = 1;
      }
    } else {
      // Compare semver tag
      updateAvailable = latestReleaseTag !== CURRENT_VERSION;
    }

    const payload = {
      currentVersion: CURRENT_VERSION,
      latestVersion: latestReleaseTag,
      currentCommit: currentCommit ? currentCommit.substring(0, 7) : null,
      latestCommit: remoteCommit ? remoteCommit.substring(0, 7) : null,
      latestCommitMessage: remoteCommitMessage.split('\n')[0],
      latestCommitAuthor: remoteCommitAuthor,
      latestCommitDate: remoteCommitDate,
      commitsBehind,
      updateAvailable,
      isGitRepo,
      releaseNotes,
      releaseDownloadUrl,
      repoUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}`,
      checkedAt: new Date().toISOString()
    };

    cachedStatus = {
      timestamp: Date.now(),
      data: payload
    };

    return res.json(payload);
  } catch (err: any) {
    console.error('[Updater] Failed to check status:', err.message);
    return res.status(500).json({
      error: 'Failed to check update status',
      message: err.message,
      currentVersion: CURRENT_VERSION,
      isGitRepo
    });
  }
});

/**
 * POST /api/updater/apply
 * Applies the update on self-hosted instances (git pull + build)
 */
router.post('/apply', async (req: Request, res: Response) => {
  const workspaceDir = getWorkspaceRoot();
  const isGitRepo = fs.existsSync(path.join(workspaceDir, '.git'));

  if (!isGitRepo) {
    return res.status(400).json({
      error: 'Cannot auto-update non-git standalone binary directly via git pull. Please download the latest setup release.',
      isGitRepo: false
    });
  }

  try {
    console.log('[Updater] Starting automated update process in:', workspaceDir);

    // Step 1: Fetch and reset to origin/master
    console.log('[Updater] Step 1/3: Fetching latest code from origin/master...');
    await execAsync('git fetch origin master', { cwd: workspaceDir });
    await execAsync('git reset --hard origin/master', { cwd: workspaceDir });

    // Step 2: Build project (runs esbuild server bundle + vite client build)
    console.log('[Updater] Step 2/3: Compiling optimized server and client bundle...');
    await execAsync('npm run build', { cwd: workspaceDir });

    // Clear update cache
    cachedStatus = null;

    console.log('[Updater] Step 3/3: Update completed successfully!');
    return res.json({
      success: true,
      message: 'Singularity Player updated successfully to the latest version. Reloading interface.',
      reloadedAt: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[Updater] Update application failed:', err);
    return res.status(500).json({
      error: 'Update execution failed',
      details: err.message || String(err)
    });
  }
});

export default router;
