import fs from 'node:fs/promises';
import path from 'node:path';

import trash from 'trash';

import type { FileTreeEntry } from './types/index.js';
import { toPosixPath } from './utils/paths.js';
import { normalizeString } from './utils/strings.js';

export interface HttpError extends Error {
  statusCode?: number;
}

type EnsureManagedProjectScope = (candidatePath: string) => Promise<unknown>;

export interface FileManagerOptions {
  defaultWorkspaceDir: string;
  ensureManagedProjectScope: EnsureManagedProjectScope;
}

export interface ManagedFileLocation {
  rootPath: string;
  targetPath: string;
}

export interface FileEntryCreateInput {
  root: unknown;
  directory: unknown;
  name: unknown;
  kind: 'file' | 'directory';
}

export interface FileEntryMoveInput {
  root: unknown;
  path: unknown;
  targetDirectory?: unknown;
  name?: unknown;
}

export interface FileUploadInput {
  root: unknown;
  directory: unknown;
  files: Express.Multer.File[];
}

const ignoredDirectoryNames = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'target',
  '.next',
  '.turbo',
  'coverage',
  '.pi-web',
]);

export const normalizeFsPath = (value: unknown): string =>
  path.resolve(normalizeString(value));

export const normalizeOptionalFsPath = (value: unknown): string => {
  const normalized = normalizeString(value);
  return normalized ? path.resolve(normalized) : '';
};

export const resolveExistingRealPath = async (
  candidatePath: string,
): Promise<string> => {
  try {
    return normalizeFsPath(await fs.realpath(candidatePath));
  } catch {
    return normalizeFsPath(candidatePath);
  }
};

export const ensureWithinRoot = (
  candidatePath: string,
  rootPath: string,
): string => {
  const relative = path.relative(rootPath, candidatePath);
  if (relative === '') {
    return candidatePath;
  }

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error(
      'Requested path is outside the allowed workspace root',
    ) as HttpError;
    error.statusCode = 400;
    throw error;
  }

  return candidatePath;
};

export const isPathInsideRoot = (
  candidatePath: string,
  rootPath: string,
): boolean => {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const ensureResolvedPathWithinRoot = async (
  candidatePath: string,
  rootPath: string,
): Promise<void> => {
  const [resolvedRootPath, resolvedCandidatePath] = await Promise.all([
    fs.realpath(rootPath),
    fs.realpath(candidatePath),
  ]);

  ensureWithinRoot(resolvedCandidatePath, resolvedRootPath);
};

const toHttpError = (message: string, statusCode: number): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
};

const assertEntryName = (value: unknown): string => {
  const name = normalizeString(value);
  if (!name || name === '.' || name === '..') {
    throw toHttpError('File name is required', 400);
  }

  if (name.includes('/') || name.includes('\\')) {
    throw toHttpError('File name must not include path separators', 400);
  }

  return name;
};

const assertTargetAbsent = async (targetPath: string): Promise<void> => {
  try {
    await fs.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  throw toHttpError('Target path already exists', 409);
};

const getFileExtension = (entryPath: string, isDirectory: boolean): string => {
  if (isDirectory) {
    return '';
  }

  return path.extname(entryPath).toLowerCase();
};

const serializeEntry = (
  rootPath: string,
  entryPath: string,
  stats: Awaited<ReturnType<typeof fs.stat>>,
): FileTreeEntry => {
  const isDirectory = stats.isDirectory();
  return {
    name: path.basename(entryPath),
    path: toPosixPath(entryPath),
    kind: isDirectory ? 'directory' : 'file',
    relativePath: toPosixPath(path.relative(rootPath, entryPath)) || '.',
    size: isDirectory ? null : Number(stats.size),
    modifiedAt: Number(stats.mtimeMs),
    extension: getFileExtension(entryPath, isDirectory),
  };
};

export const createFileManager = (options: FileManagerOptions) => {
  const resolveManagedRoot = async (value: unknown): Promise<string> => {
    const rootPath = normalizeOptionalFsPath(value);
    if (!rootPath) {
      throw toHttpError('File root is required', 400);
    }

    const [resolvedRootPath, resolvedDefaultWorkspaceDir] = await Promise.all([
      resolveExistingRealPath(rootPath),
      resolveExistingRealPath(options.defaultWorkspaceDir),
    ]);

    if (!isPathInsideRoot(resolvedRootPath, resolvedDefaultWorkspaceDir)) {
      await options.ensureManagedProjectScope(resolvedRootPath);
    }

    return rootPath;
  };

  const resolveManagedFileLocation = async (
    locationOptions: { root?: unknown; path?: unknown; fallbackToRoot?: boolean },
  ): Promise<ManagedFileLocation> => {
    const rootPath = await resolveManagedRoot(locationOptions.root);
    const requestedPath = normalizeOptionalFsPath(locationOptions.path);

    if (!requestedPath && !locationOptions.fallbackToRoot) {
      throw toHttpError('File path is required', 400);
    }

    const targetPath = requestedPath || rootPath;
    ensureWithinRoot(targetPath, rootPath);
    await ensureResolvedPathWithinRoot(targetPath, rootPath);

    return {
      rootPath,
      targetPath,
    };
  };

  const resolveDirectory = async (
    root: unknown,
    directory: unknown,
  ): Promise<ManagedFileLocation> => {
    const location = await resolveManagedFileLocation({
      root,
      path: directory,
      fallbackToRoot: true,
    });
    const stats = await fs.stat(location.targetPath);

    if (!stats.isDirectory()) {
      throw toHttpError('Requested path is not a directory', 400);
    }

    return location;
  };

  const listDirectoryEntries = async (
    directoryPath: string,
    rootPath: string,
  ): Promise<FileTreeEntry[]> => {
    const dirents = await fs.readdir(directoryPath, { withFileTypes: true });
    const entries = await Promise.all(
      dirents
        .filter(
          (entry) => entry.name !== '.' && !ignoredDirectoryNames.has(entry.name),
        )
        .map(async (entry) => {
          const entryPath = path.join(directoryPath, entry.name);
          await ensureResolvedPathWithinRoot(entryPath, rootPath);
          const stats = await fs.stat(entryPath);
          return serializeEntry(rootPath, entryPath, stats);
        }),
    );

    return entries.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  };

  const createEntry = async (input: FileEntryCreateInput): Promise<FileTreeEntry> => {
    const directory = await resolveDirectory(input.root, input.directory);
    const name = assertEntryName(input.name);
    const targetPath = path.join(directory.targetPath, name);

    ensureWithinRoot(targetPath, directory.rootPath);
    await assertTargetAbsent(targetPath);

    if (input.kind === 'directory') {
      await fs.mkdir(targetPath, { mode: 0o700 });
    } else {
      await fs.writeFile(targetPath, '', { flag: 'wx', mode: 0o600 });
    }

    const stats = await fs.stat(targetPath);
    return serializeEntry(directory.rootPath, targetPath, stats);
  };

  const moveEntry = async (input: FileEntryMoveInput): Promise<FileTreeEntry> => {
    const source = await resolveManagedFileLocation({
      root: input.root,
      path: input.path,
    });
    const sourceStats = await fs.stat(source.targetPath);
    const targetDirectory = await resolveDirectory(
      input.root,
      input.targetDirectory || path.dirname(source.targetPath),
    );
    const targetName = input.name === undefined
      ? path.basename(source.targetPath)
      : assertEntryName(input.name);
    const targetPath = path.join(targetDirectory.targetPath, targetName);

    ensureWithinRoot(targetPath, source.rootPath);

    if (source.targetPath === targetPath) {
      throw toHttpError('Target path must be different from source path', 400);
    }

    if (
      sourceStats.isDirectory()
      && isPathInsideRoot(targetPath, source.targetPath)
    ) {
      throw toHttpError('Directory cannot be moved into itself', 400);
    }

    await assertTargetAbsent(targetPath);
    await fs.rename(source.targetPath, targetPath);

    const nextStats = await fs.stat(targetPath);
    return serializeEntry(source.rootPath, targetPath, nextStats);
  };

  const trashEntry = async (
    root: unknown,
    entryPath: unknown,
  ): Promise<{ root: string; path: string; trashedAt: number }> => {
    const location = await resolveManagedFileLocation({
      root,
      path: entryPath,
    });

    await trash([location.targetPath], { glob: false });

    return {
      root: toPosixPath(location.rootPath),
      path: toPosixPath(location.targetPath),
      trashedAt: Date.now(),
    };
  };

  const uploadFiles = async (input: FileUploadInput): Promise<FileTreeEntry[]> => {
    const directory = await resolveDirectory(input.root, input.directory);
    if (input.files.length === 0) {
      throw toHttpError('At least one file is required', 400);
    }

    const names = new Set<string>();
    const targets = input.files.map((file) => {
      const name = assertEntryName(file.originalname);
      if (names.has(name)) {
        throw toHttpError('Duplicate file name in upload payload', 409);
      }
      names.add(name);

      const targetPath = path.join(directory.targetPath, name);
      ensureWithinRoot(targetPath, directory.rootPath);
      return {
        file,
        targetPath,
      };
    });

    for (const target of targets) {
      await assertTargetAbsent(target.targetPath);
    }

    for (const target of targets) {
      await fs.writeFile(target.targetPath, target.file.buffer, {
        flag: 'wx',
        mode: 0o600,
      });
    }

    return Promise.all(
      targets.map(async (target) => {
        const stats = await fs.stat(target.targetPath);
        return serializeEntry(directory.rootPath, target.targetPath, stats);
      }),
    );
  };

  return {
    createEntry,
    listDirectoryEntries,
    moveEntry,
    resolveManagedFileLocation,
    trashEntry,
    uploadFiles,
  };
};
