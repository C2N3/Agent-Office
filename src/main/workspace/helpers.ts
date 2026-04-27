import fs from 'fs';
import path from 'path';
import os from 'os';
import { sanitizeProjectPath } from '../../utils';

export const GLOBAL_WORKTREE_DIR = path.join(os.homedir(), '.agent-office', 'worktrees');
const DEPENDENCY_SYMLINK_CANDIDATES = ['node_modules'];

type BranchSuggestionOptions = {
  name?: string;
  provider?: string | null;
};

type WorkspaceInspectionOptions = BranchSuggestionOptions & {
  branchName?: string;
};

export function buildSuggestedBranchName({ name, provider }: BranchSuggestionOptions = {}) {
  const normalizedProvider = String(provider || 'general').trim().toLowerCase() || 'general';
  const slug = slugifyBranchName(name || 'agent').replace(/\//g, '-');
  return slugifyBranchName(`workspace/${normalizedProvider}/${slug}`);
}

export function slugifyBranchName(input) {
  const normalized = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^-+|-+$/g, '')
    .replace(/\/-+|-+\//g, '/')
    .replace(/^\/+|\/+$/g, '');

  const fallback = normalized || 'agent-workspace';
  return fallback.slice(0, 80).replace(/^-+|-+$/g, '') || 'agent-workspace';
}

export function normalizePathList(value) {
  const rawList = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n|,/);

  return rawList
    .map((entry) => sanitizeProjectPath(entry))
    .filter(Boolean);
}

export function mergePathLists(...lists) {
  const merged = [];
  const seen = new Set();
  for (const entry of lists.flat()) {
    const normalized = sanitizeProjectPath(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged;
}

export function detectDependencySymlinkPaths(repoRoot) {
  return DEPENDENCY_SYMLINK_CANDIDATES.filter((entry) => {
    const sourcePath = path.join(repoRoot, entry);
    try {
      return fs.existsSync(sourcePath) && fs.lstatSync(sourcePath).isDirectory();
    } catch {
      return false;
    }
  });
}

export function formatCommandError(error) {
  const stderr = error?.stderr?.toString?.().trim?.();
  const stdout = error?.stdout?.toString?.().trim?.();
  return stderr || stdout || error.message || 'Command failed';
}

function ensureSafeRelativePath(rootPath, entryPath) {
  const resolved = path.resolve(rootPath, entryPath);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path must stay inside the repository: ${entryPath}`);
  }
  return resolved;
}

function ensureMissingDestination(destinationPath, sourceLabel) {
  if (fs.existsSync(destinationPath)) {
    throw new Error(`Destination already exists for ${sourceLabel}: ${destinationPath}`);
  }
}

export function inspectWorkspacePath(workspaceManager, inputPath, options: WorkspaceInspectionOptions = {}) {
  const normalizedPath = sanitizeProjectPath(inputPath);
  if (!normalizedPath) {
    throw new Error('Workspace path is required');
  }

  const resolvedPath = path.resolve(normalizedPath);
  const suggestedBranchName = slugifyBranchName(
    String(options.branchName || '').trim() || buildSuggestedBranchName({
      name: options.name,
      provider: options.provider,
    })
  );

  try {
    const repository = workspaceManager.inspectRepository(resolvedPath);
    const baseBranch = String(repository.currentBranch || 'HEAD').trim() || 'HEAD';
    const defaultParent = path.join(GLOBAL_WORKTREE_DIR, repository.repositoryName);

    return {
      requestedPath: inputPath,
      normalizedPath: resolvedPath,
      isGitRepository: true,
      repositoryPath: repository.repositoryPath,
      repositoryName: repository.repositoryName,
      currentBranch: repository.currentBranch,
      branches: repository.branches,
      worktreeDefaults: {
        branchName: suggestedBranchName,
        baseBranch,
        startPoint: baseBranch,
        workspaceParent: defaultParent,
        symlinkPaths: detectDependencySymlinkPaths(repository.repositoryPath),
      },
    };
  } catch (error) {
    return {
      requestedPath: inputPath,
      normalizedPath: resolvedPath,
      isGitRepository: false,
      repositoryPath: null,
      repositoryName: path.basename(resolvedPath),
      currentBranch: null,
      branches: [],
      worktreeDefaults: {
        branchName: suggestedBranchName,
        baseBranch: null,
        startPoint: null,
        workspaceParent: null,
        symlinkPaths: [],
      },
      error: error.message,
    };
  }
}

export function copyIntoWorkspace(repoRoot, workspacePath, relativePath) {
  const sourcePath = ensureSafeRelativePath(repoRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Copy source does not exist: ${relativePath}`);
  }

  const destinationPath = path.join(workspacePath, relativePath);
  ensureMissingDestination(destinationPath, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true, errorOnExist: true });
}

export function symlinkIntoWorkspace(repoRoot, workspacePath, relativePath) {
  const sourcePath = ensureSafeRelativePath(repoRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Symlink source does not exist: ${relativePath}`);
  }

  const destinationPath = path.join(workspacePath, relativePath);
  ensureMissingDestination(destinationPath, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

  const stats = fs.lstatSync(sourcePath);
  const linkType = process.platform === 'win32'
    ? (stats.isDirectory() ? 'junction' : 'file')
    : (stats.isDirectory() ? 'dir' : 'file');

  fs.symlinkSync(sourcePath, destinationPath, linkType);
}
