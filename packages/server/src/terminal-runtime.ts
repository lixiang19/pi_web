import process from 'node:process';

import * as nodePty from 'node-pty';
import { WebSocket, type RawData } from 'ws';

import { toPosixPath } from './utils/paths.js';
import type {
  HttpError,
  TerminalCreateRequest,
  TerminalRestartRequest,
  TerminalSnapshot,
} from './types/index.js';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const MAX_BACKLOG_CHARS = 250_000;
const RESIZE_PREFIX = '\x1b[RESIZE:';

interface TerminalRuntimeRecord {
  snapshot: TerminalSnapshot;
  ptyProcess: nodePty.IPty | null;
  connections: Set<WebSocket>;
  backlog: string;
}

interface CreateTerminalManagerOptions {
  defaultCwd: string;
  resolveCwd: (cwd?: string) => Promise<string>;
}

const resolveShell = (): string => {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }

  return process.env.SHELL || '/bin/bash';
};

const ensureTerminalRecord = (
  record: TerminalRuntimeRecord | undefined,
  terminalId: string,
): TerminalRuntimeRecord => {
  if (record) {
    return record;
  }

  const error = new Error(`Terminal 不存在: ${terminalId}`) as HttpError;
  error.statusCode = 404;
  throw error;
};

const createTerminalSnapshot = (
  id: string,
  cwd: string,
  shell: string,
  cols: number,
  rows: number,
  title?: string,
): TerminalSnapshot => {
  const now = Date.now();
  return {
    id,
    title: title?.trim() || '终端',
    cwd: toPosixPath(cwd),
    shell,
    status: 'starting',
    cols,
    rows,
    createdAt: now,
    updatedAt: now,
    exitCode: null,
    errorMessage: null,
  };
};

const normalizeSocketInput = (data: RawData): string => {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf-8');
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf-8');
  }

  return data.toString('utf-8');
};

const appendBacklog = (record: TerminalRuntimeRecord, chunk: string): void => {
  record.backlog += chunk;
  if (record.backlog.length > MAX_BACKLOG_CHARS) {
    record.backlog = record.backlog.slice(-MAX_BACKLOG_CHARS);
  }
};

const sendToSocket = (socket: WebSocket, chunk: string): void => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(chunk);
};

const syncRunningStatus = (record: TerminalRuntimeRecord): void => {
  if (record.snapshot.status === 'exited' || record.snapshot.status === 'error') {
    return;
  }

  record.snapshot.status = record.connections.size > 0 ? 'running' : 'disconnected';
  record.snapshot.updatedAt = Date.now();
};

const resizePty = (
  record: TerminalRuntimeRecord,
  cols: number,
  rows: number,
): void => {
  if (!record.ptyProcess) {
    return;
  }

  record.snapshot.cols = cols;
  record.snapshot.rows = rows;
  record.snapshot.updatedAt = Date.now();
  record.ptyProcess.resize(cols, rows);
};

const createSpawnOptions = (
  record: TerminalRuntimeRecord,
  cwd: string,
  cols: number,
  rows: number,
): nodePty.IPtyForkOptions => ({
  name: 'xterm-256color',
  cwd,
  cols,
  rows,
  env: {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'ridge',
  },
});

export function createTerminalManager(options: CreateTerminalManagerOptions) {
  const terminals = new Map<string, TerminalRuntimeRecord>();

  const spawnTerminal = async (
    record: TerminalRuntimeRecord,
    payload?: Pick<TerminalCreateRequest, 'cwd' | 'cols' | 'rows'>,
  ): Promise<void> => {
    const cwd = await options.resolveCwd(payload?.cwd || options.defaultCwd);
    const cols = Math.max(40, payload?.cols || record.snapshot.cols || DEFAULT_COLS);
    const rows = Math.max(12, payload?.rows || record.snapshot.rows || DEFAULT_ROWS);
    const shell = resolveShell();

    record.snapshot.cwd = toPosixPath(cwd);
    record.snapshot.cols = cols;
    record.snapshot.rows = rows;
    record.snapshot.shell = shell;
    record.snapshot.status = record.connections.size > 0 ? 'running' : 'disconnected';
    record.snapshot.updatedAt = Date.now();
    record.snapshot.exitCode = null;
    record.snapshot.errorMessage = null;
    record.backlog = '';

    const ptyProcess = nodePty.spawn(
      shell,
      [],
      createSpawnOptions(record, cwd, cols, rows),
    );
    record.ptyProcess = ptyProcess;

    ptyProcess.onData((chunk) => {
      if (record.ptyProcess !== ptyProcess) {
        return;
      }

      appendBacklog(record, chunk);
      record.snapshot.updatedAt = Date.now();
      for (const socket of record.connections) {
        sendToSocket(socket, chunk);
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      if (record.ptyProcess !== ptyProcess) {
        return;
      }

      record.ptyProcess = null;
      record.snapshot.status = 'exited';
      record.snapshot.exitCode = exitCode ?? null;
      record.snapshot.errorMessage =
        signal && signal > 0 ? `Terminal exited with signal ${signal}` : null;
      record.snapshot.updatedAt = Date.now();

      const notice = `\r\n\x1b[90m[terminal exited${
        typeof exitCode === 'number' ? `: ${exitCode}` : ''
      }]\x1b[0m\r\n`;
      appendBacklog(record, notice);
      for (const socket of record.connections) {
        sendToSocket(socket, notice);
      }
    });
  };

  const createTerminal = async (
    payload: TerminalCreateRequest = {},
  ): Promise<TerminalSnapshot> => {
    const id = crypto.randomUUID();
    const shell = resolveShell();
    const snapshot = createTerminalSnapshot(
      id,
      options.defaultCwd,
      shell,
      payload.cols || DEFAULT_COLS,
      payload.rows || DEFAULT_ROWS,
      payload.title,
    );
    const record: TerminalRuntimeRecord = {
      snapshot,
      ptyProcess: null,
      connections: new Set(),
      backlog: '',
    };
    terminals.set(id, record);

    try {
      await spawnTerminal(record, payload);
      return { ...record.snapshot };
    } catch (error) {
      terminals.delete(id);
      throw error;
    }
  };

  const listTerminals = (): TerminalSnapshot[] =>
    [...terminals.values()]
      .map((record) => ({ ...record.snapshot }))
      .sort((left, right) => left.createdAt - right.createdAt);

  const hasTerminal = (terminalId: string): boolean => terminals.has(terminalId);

  const getTerminal = (terminalId: string): TerminalSnapshot | null => {
    const record = terminals.get(terminalId);
    return record ? { ...record.snapshot } : null;
  };

  const updateTerminal = (terminalId: string, title: string): TerminalSnapshot => {
    const record = ensureTerminalRecord(terminals.get(terminalId), terminalId);
    record.snapshot.title = title.trim() || '终端';
    record.snapshot.updatedAt = Date.now();
    return { ...record.snapshot };
  };

  const restartTerminal = async (
    terminalId: string,
    payload: TerminalRestartRequest,
  ): Promise<TerminalSnapshot> => {
    const record = ensureTerminalRecord(terminals.get(terminalId), terminalId);
    const previousProcess = record.ptyProcess;
    record.ptyProcess = null;
    previousProcess?.kill();
    await spawnTerminal(record, payload);
    return { ...record.snapshot };
  };

  const deleteTerminal = (terminalId: string): void => {
    const record = ensureTerminalRecord(terminals.get(terminalId), terminalId);
    terminals.delete(terminalId);
    record.ptyProcess?.kill();
    record.ptyProcess = null;
    for (const socket of record.connections) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'terminal removed');
      }
    }
    record.connections.clear();
  };

  const attachSocket = (terminalId: string, socket: WebSocket): void => {
    const record = ensureTerminalRecord(terminals.get(terminalId), terminalId);
    record.connections.add(socket);
    syncRunningStatus(record);

    if (record.backlog) {
      sendToSocket(socket, record.backlog);
    }

    socket.on('message', (data: RawData) => {
      const input = normalizeSocketInput(data);
      if (input.startsWith(RESIZE_PREFIX)) {
        const match = input.match(/^\x1b\[RESIZE:(\d+);(\d+)\]$/);
        if (match) {
          resizePty(record, Number(match[1]), Number(match[2]));
        }
        return;
      }

      if (!record.ptyProcess) {
        return;
      }

      record.ptyProcess.write(input);
      record.snapshot.updatedAt = Date.now();
    });

    socket.on('close', () => {
      record.connections.delete(socket);
      syncRunningStatus(record);
    });

    socket.on('error', () => {
      record.connections.delete(socket);
      syncRunningStatus(record);
    });
  };

  return {
    attachSocket,
    createTerminal,
    deleteTerminal,
    getTerminal,
    hasTerminal,
    listTerminals,
    restartTerminal,
    updateTerminal,
  };
}