import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const DATA_DIR_NAME = '.pi';

export const getDataDir = (): string => {
  const homeDir = os.homedir();
  return path.join(homeDir, DATA_DIR_NAME);
};

export const getStorageDir = async (): Promise<string> => {
  const dataDir = getDataDir();
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  return dataDir;
};

export const getRidgeDbPath = async (): Promise<string> => {
  if (process.env.RIDGE_DB_PATH) {
    await fs.mkdir(path.dirname(process.env.RIDGE_DB_PATH), { recursive: true, mode: 0o700 });
    return process.env.RIDGE_DB_PATH;
  }
  const storageDir = await getStorageDir();
  return path.join(storageDir, 'ridge.db');
};

export const toPosixPath = (value: string): string => value.replace(/\\/g, '/');

export interface HttpError extends Error {
  statusCode?: number;
}

/**
 * Validates that a path does not contain backslash characters.
 * Backslashes are rejected because toPosixPath() converts them to forward
 * slashes, which would collide with real subdirectory semantics on POSIX
 * systems where backslash is a legal filename character.
 */
export function validateSafePath(value: string): void {
	if (value.includes('\\')) {
		const error = new Error(
			`Path contains backslash which is not allowed: ${value}`,
		) as HttpError;
		error.statusCode = 400;
		throw error;
	}
}
