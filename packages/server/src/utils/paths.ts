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

export const getRidgeSettingsPath = async (): Promise<string> => {
  const storageDir = await getStorageDir();
  return path.join(storageDir, 'ridge-settings.json');
};

export const getRidgeDbPath = async (): Promise<string> => {
  const storageDir = await getStorageDir();
  return path.join(storageDir, 'ridge.db');
};

export const toPosixPath = (value: string): string => value.split(path.sep).join('/');
