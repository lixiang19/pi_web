import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createFileManager } from '../file-manager.js';

const createTempManager = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ridge-file-manager-'));
  const manager = createFileManager({
    defaultWorkspaceDir: root,
    ensureManagedProjectScope: async () => undefined,
  });

  return {
    manager,
    root,
  };
};

const createUploadFile = (
  name: string,
  content: string,
): Express.Multer.File => ({
  buffer: Buffer.from(content),
  originalname: name,
  fieldname: 'files',
  encoding: '7bit',
  mimetype: 'text/plain',
  size: Buffer.byteLength(content),
  stream: null as never,
  destination: '',
  filename: name,
  path: '',
});

test('createEntry creates files and rejects duplicate targets', async () => {
  const { manager, root } = await createTempManager();
  const entry = await manager.createEntry({
    root,
    directory: root,
    name: 'README.md',
    kind: 'file',
  });

  assert.equal(entry.name, 'README.md');
  assert.equal(entry.size, 0);
  assert.equal(entry.extension, '.md');

  await assert.rejects(
    () =>
      manager.createEntry({
        root,
        directory: root,
        name: 'README.md',
        kind: 'file',
      }),
    (error: unknown) => (error as { statusCode?: number }).statusCode === 409,
  );
});

test('moveEntry rejects moving a directory into itself', async () => {
  const { manager, root } = await createTempManager();
  await fs.mkdir(path.join(root, 'src', 'nested'), { recursive: true });

  await assert.rejects(
    () =>
      manager.moveEntry({
        root,
        path: path.join(root, 'src'),
        targetDirectory: path.join(root, 'src', 'nested'),
      }),
    /itself/,
  );
});

test('uploadFiles rejects duplicate names before writing files', async () => {
  const { manager, root } = await createTempManager();

  await assert.rejects(
    () =>
      manager.uploadFiles({
        root,
        directory: root,
        files: [
          createUploadFile('a.txt', 'one'),
          createUploadFile('a.txt', 'two'),
        ],
      }),
    (error: unknown) => (error as { statusCode?: number }).statusCode === 409,
  );

  await assert.rejects(
    () => fs.stat(path.join(root, 'a.txt')),
    /ENOENT/,
  );
});

test('trashEntry validates root boundary before trashing', async () => {
  const { manager, root } = await createTempManager();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'ridge-file-outside-'));
  const outsideFile = path.join(outside, 'secret.txt');
  await fs.writeFile(outsideFile, 'secret', 'utf8');

  await assert.rejects(
    () => manager.trashEntry(root, outsideFile),
    /outside the allowed workspace root/,
  );

  assert.equal(await fs.readFile(outsideFile, 'utf8'), 'secret');
});
