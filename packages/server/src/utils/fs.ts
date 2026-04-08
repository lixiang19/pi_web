import fs from 'node:fs/promises';
import path from 'node:path';

export const FILE_MODE = 0o600;

export const atomicWriteFile = async (filePath: string, data: string): Promise<void> => {
  const dir = path.dirname(filePath);
  const tmpFile = path.join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  try {
    await fs.writeFile(tmpFile, data, { mode: FILE_MODE, encoding: 'utf-8' });
    await fs.rename(tmpFile, filePath);
  } catch (error) {
    try {
      await fs.unlink(tmpFile);
    } catch {
      // noop - tmp file may not exist
    }
    throw error;
  }
};

export const readJsonFile = async <T>(filePath: string, defaultValue: T | null = null): Promise<T | null> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultValue;
    }
    throw error;
  }
};

export const writeJsonFile = async <T>(filePath: string, data: T): Promise<void> => {
  const content = JSON.stringify(data, null, 2);
  await atomicWriteFile(filePath, content);
};
