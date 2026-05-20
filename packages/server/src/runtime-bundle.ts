import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DeviceRecord } from './devices.js';
import { getPiDefaultAgentDir } from './pi-default-config.js';

// ===== Config Schemas (Problem 14: real contracts) =====
export const mcpServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const mcpSchema = z.object({
  servers: z.array(mcpServerSchema).optional(),
});

export const permissionsRuleSchema = z.object({
  pattern: z.string().min(1),
  action: z.enum(['allow', 'deny', 'ask']),
});
const permissionActionSchema = z.enum(['allow', 'deny', 'ask']);
const permissionKeySchema = z.enum([
  'read',
  'grep',
  'find',
  'ls',
  'bash',
  'ask',
  'task',
  'subagent',
  'edit',
  'external_directory',
]);
const permissionValueSchema = z.union([
  permissionActionSchema,
  z.record(z.string(), permissionActionSchema),
]);
const agentPermissionSchema = z.record(permissionKeySchema, permissionValueSchema);

export const permissionsSchema = z.object({
  default: agentPermissionSchema.optional(),
  defaults: agentPermissionSchema.optional(),
  locked: agentPermissionSchema.optional(),
}).strict();

export const toolsSchema = z.object({
  tools: z.record(z.string(), z.object({
    command: z.string().min(1),
    description: z.string().optional(),
  })).optional(),
});

export const modelsSchema = z.record(z.string(), z.unknown());

// Config filename -> schema mapping
const CONFIG_SCHEMAS: Record<string, z.ZodSchema<unknown>> = {
  'mcp.json': mcpSchema,
  'permissions.json': permissionsSchema,
  'tools.json': toolsSchema,
  'models.json': modelsSchema,
};

// ===== Bundle Types =====
export interface BundleManifest {
  bundleId: string;
  deviceId: string;
  version: number;
  generatedAt: number;
  contentHash: string;
  agents: BundleResource[];
  skills: BundleResource[];
  mcp: Record<string, unknown>;
  tools: Record<string, unknown>;
  permissions: Record<string, unknown>;
  modelConfig: Record<string, unknown>;
  startupContext: {
    memory?: string;
    wikiIndex?: string;
  };
}

export interface BundleResource {
  name: string;
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
  mtime: number;
  mode?: number;
  executable?: boolean;
  symlink?: string;
}

export interface RuntimeBundle {
  manifest: BundleManifest;
  files: Map<string, BundleResource>;
}

/**
 * Detect if buffer is binary by checking for null bytes or invalid UTF-8 sequences
 */
function isBinaryBuffer(buffer: Buffer): boolean {
  // Check for null bytes in first 8KB
  const sampleSize = Math.min(buffer.length, 8192);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0x00) return true;
  }
  return false;
}

function safeParseJson(content: string, filename: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    throw Object.assign(
      new Error(`Invalid JSON in ${filename}: ${(error as Error).message}`),
      { statusCode: 400 }
    );
  }
}

/**
 * Generate a content hash for the bundle based on all file contents.
 * Uses SHA-256 of sorted file paths and contents.
 */
function generateContentHash(files: Map<string, BundleResource>): string {
  const hash = createHash('sha256');
  const sortedPaths = Array.from(files.keys()).sort();
  for (const filePath of sortedPaths) {
    const resource = files.get(filePath)!;
    hash.update(filePath);
    hash.update(resource.content);
    hash.update(resource.encoding);
  }
  return hash.digest('hex');
}

/**
 * Generate a runtime bundle for a specific device.
 */
export async function generateRuntimeBundle(
  device: DeviceRecord,
  workspaceDir: string,
  projectPath?: string,
): Promise<RuntimeBundle> {
  const bundleId = `bundle-${device.deviceId}-${Date.now()}`;
  const files = new Map<string, BundleResource>();

  const serverAgentDir = getPiDefaultAgentDir();

  // 1. Server-level agents (recursive)
  const serverAgentsDir = path.join(serverAgentDir, 'agents');
  const globalAgents = await loadResourcesRecursive(serverAgentsDir, files, 'agents');

  // 2. Project agents overlay (if projectPath provided)
  let agents = globalAgents;
  if (projectPath) {
    const projectAgentsDir = path.join(projectPath, '.pi', 'agents');
    const projectAgents = await loadResourcesRecursive(projectAgentsDir, files, 'agents');
    agents = [
      ...globalAgents.filter(a => !projectAgents.some(pa => pa.path === a.path)),
      ...projectAgents,
    ];
  }

  // 3. Server-level skills (recursive)
  const serverSkillsDir = path.join(serverAgentDir, 'skills');
  const globalSkills = await loadResourcesRecursive(serverSkillsDir, files, 'skills');

  // 4. Project skills overlay
  let allSkills = globalSkills;
  if (projectPath) {
    const projectSkillsDir = path.join(projectPath, '.pi', 'skills');
    const projectSkills = await loadResourcesRecursive(projectSkillsDir, files, 'skills');
    allSkills = [
      ...globalSkills.filter(s => !projectSkills.some(ps => ps.path === s.path)),
      ...projectSkills,
    ];
  }

  // 5. Filter by device capability
  const skills = filterSkillsByDevice(allSkills, device);

  // 6. Config files (JSON) — with schema validation
  const mcp = await loadAgentJsonConfig(serverAgentDir, 'mcp.json', files);
  const tools = await loadAgentJsonConfig(serverAgentDir, 'tools.json', files);
  const permissions = await loadAgentJsonConfig(serverAgentDir, 'permissions.json', files);
  const modelConfig = await loadAgentJsonConfig(serverAgentDir, 'models.json', files);
  await addRawConfigFile(serverAgentDir, 'auth.json', files);
  await addRawConfigFile(serverAgentDir, 'settings.json', files);

  // 7. Startup context
  const startupContext: BundleManifest['startupContext'] = {};
  const memoryPath = path.join(workspaceDir, '记忆', 'MEMORY.md');
  const wikiPath = path.join(workspaceDir, 'Wiki', 'index.md');

  try {
    const memContent = await fs.readFile(memoryPath, 'utf-8');
    startupContext.memory = memContent;
  } catch (error) {
    const err = error as { code?: string };
    if (err.code !== 'ENOENT') throw error;
  }

  try {
    const wikiContent = await fs.readFile(wikiPath, 'utf-8');
    startupContext.wikiIndex = wikiContent;
  } catch (error) {
    const err = error as { code?: string };
    if (err.code !== 'ENOENT') throw error;
  }

  const contentHash = generateContentHash(files);

  const manifest: BundleManifest = {
    bundleId,
    deviceId: device.deviceId,
    version: 1,
    generatedAt: Date.now(),
    contentHash,
    agents,
    skills,
    mcp,
    tools,
    permissions,
    modelConfig,
    startupContext,
  };

  return { manifest, files };
}

/**
 * Recursively load all files under a directory into the bundle.
 * Handles symlinks, executable permissions, binary detection, and mtimes.
 */
async function loadResourcesRecursive(
  dir: string,
  files: Map<string, BundleResource>,
  prefix: string,
): Promise<BundleResource[]> {
  const resources: BundleResource[] = [];

  const entries = await safeReaddir(dir);
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    const bundlePath = `${prefix}/${entry.name}`;

    if (entry.isSymbolicLink()) {
      // Record symlink target, do not follow
      const linkTarget = await fs.readlink(entryPath);
      const resource: BundleResource = {
        name: entry.name,
        path: bundlePath,
        content: '',
        encoding: 'utf-8',
        mtime: Date.now(),
        symlink: linkTarget,
      };
      files.set(bundlePath, resource);
      resources.push(resource);
    } else if (entry.isDirectory()) {
      const subResources = await loadResourcesRecursive(
        entryPath,
        files,
        bundlePath,
      );
      resources.push(...subResources);
    } else if (entry.isFile()) {
      const stats = await fs.stat(entryPath);
      const mode = stats.mode;
      const mtime = stats.mtimeMs;
      const isExecutable = Boolean(mode & 0o111);

      // Read file and detect binary by content
      const buffer = await fs.readFile(entryPath);
      const isBinary = isBinaryBuffer(buffer);

      if (isBinary) {
        const content = buffer.toString('base64');
        const resource: BundleResource = {
          name: entry.name,
          path: bundlePath,
          content,
          encoding: 'base64',
          mtime,
          mode,
          executable: isExecutable,
        };
        files.set(bundlePath, resource);
        resources.push(resource);
      } else {
        const content = buffer.toString('utf-8');
        const resource: BundleResource = {
          name: entry.name,
          path: bundlePath,
          content,
          encoding: 'utf-8',
          mtime,
          mode,
          executable: isExecutable,
        };
        files.set(bundlePath, resource);
        resources.push(resource);
      }
    }
  }

  return resources;
}

async function safeReaddir(dir: string): Promise<Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean; isSymbolicLink: () => boolean }>> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === 'ENOENT') {
      return [];
    }
    console.error(`[runtime-bundle] Failed to read directory ${dir}:`, error);
    throw error;
  }
}

/**
 * Load and validate JSON config file against its schema.
 * Missing file returns {}.
 * Invalid JSON throws 400.
 * Schema mismatch throws 400 with details.
 */
export async function loadJsonConfig(
  workspaceDir: string,
  filename: string,
): Promise<Record<string, unknown>> {
  const filePath = path.join(workspaceDir, '.pi', filename);
  return loadJsonConfigFile(filePath, filename);
}

async function loadAgentJsonConfig(
  agentDir: string,
  filename: string,
  files: Map<string, BundleResource>,
): Promise<Record<string, unknown>> {
  const filePath = path.join(agentDir, filename);
  const config = await loadJsonConfigFile(filePath, filename);
  await addRawConfigFile(agentDir, filename, files);
  return config;
}

async function loadJsonConfigFile(
  filePath: string,
  filename: string,
): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = safeParseJson(content, filename);

    // Validate against schema if one exists
    const schema = CONFIG_SCHEMAS[filename];
    if (schema) {
      const result = schema.safeParse(parsed);
      if (!result.success) {
        const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
        throw Object.assign(
          new Error(`Invalid config in ${filename}: ${errors}`),
          { statusCode: 400 }
        );
      }
      return result.data as Record<string, unknown>;
    }

    return parsed;
  } catch (error) {
    const err = error as { code?: string; statusCode?: number; message?: string };
    if (err.code === 'ENOENT') {
      return {}; // Missing config is OK
    }
    // Re-throw validation errors with original status code
    if (err.statusCode === 400) {
      throw error;
    }
    throw Object.assign(
      new Error(`Config error in ${filename}: ${err.message || 'unknown error'}`),
      { statusCode: 400 }
    );
  }
}

async function addRawConfigFile(
  agentDir: string,
  filename: string,
  files: Map<string, BundleResource>,
): Promise<void> {
  const filePath = path.join(agentDir, filename);
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return;
    }
    const content = await fs.readFile(filePath, 'utf-8');
    files.set(filename, {
      name: filename,
      path: filename,
      content,
      encoding: 'utf-8',
      mtime: stats.mtimeMs,
      mode: stats.mode,
      executable: Boolean(stats.mode & 0o111),
    });
  } catch (error) {
    const err = error as { code?: string };
    if (err.code !== 'ENOENT') {
      throw error;
    }
  }
}

function filterSkillsByDevice(
  skills: BundleResource[],
  device: DeviceRecord,
): BundleResource[] {
  return skills.filter((skill) => {
    const tagMatches = skill.path.match(/\[(\w+)\]/g);
    if (!tagMatches || tagMatches.length === 0) {
      return true;
    }

    for (const match of tagMatches) {
      const tag = match.slice(1, -1).toLowerCase();
      const capabilityKey = `skill_${tag}`;
      if (device.capabilities[capabilityKey] !== true) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Materialize a runtime bundle to a local directory.
 * Restores: symlinks, executable bits, directory structure.
 * Clears target directory first to avoid stale files.
 */
export async function materializeBundle(
  bundle: RuntimeBundle,
  targetDir: string,
): Promise<void> {
  // Boundary: materialize path must not escape targetDir
  const normalizedTargetDir = path.normalize(targetDir);
  
  // Clear target directory
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  // Write manifest
  const manifestPath = path.join(targetDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(bundle.manifest, null, 2), 'utf-8');

  // Materialize all files
  for (const [relativePath, resource] of bundle.files.entries()) {
    const filePath = path.join(targetDir, relativePath);
    const normalizedFilePath = path.normalize(filePath);
    // Strict boundary: materialized file must stay inside targetDir + path.sep
    if (!normalizedFilePath.startsWith(normalizedTargetDir + path.sep)) {
      throw Object.assign(
        new Error(`Bundle path escapes target directory: ${relativePath}`),
        { statusCode: 400, code: 'PATH_ESCAPE' }
      );
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    if (resource.symlink) {
      // Security: reject absolute symlinks and symlinks that escape targetDir
      const linkTarget = resource.symlink;
      if (path.isAbsolute(linkTarget)) {
        throw Object.assign(
          new Error(`Absolute symlinks are not allowed: ${relativePath} -> ${linkTarget}`),
          { statusCode: 400, code: 'ABSOLUTE_SYMLINK' }
        );
      }
      const resolvedLink = path.normalize(path.join(path.dirname(filePath), linkTarget));
      if (!resolvedLink.startsWith(normalizedTargetDir + path.sep)) {
        throw Object.assign(
          new Error(`Symlink escapes target directory: ${relativePath} -> ${linkTarget}`),
          { statusCode: 400, code: 'ESCAPE_SYMLINK' }
        );
      }
      await fs.symlink(linkTarget, filePath);
    } else if (resource.encoding === 'base64') {
      await fs.writeFile(filePath, Buffer.from(resource.content, 'base64'));
    } else {
      await fs.writeFile(filePath, resource.content, 'utf-8');
    }

    // Restore permissions — filter dangerous bits (setuid, setgid, sticky)
    if (resource.mode !== undefined) {
      const safeMode = resource.mode & 0o777; // strip setuid/setgid/sticky
      await fs.chmod(filePath, safeMode);
    } else if (resource.executable) {
      await fs.chmod(filePath, 0o755);
    }
  }
}
