import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { getRidgeDb } from "../db/index.js";
import {
  cloneGithubRepo,
  createInternalProject,
  deleteProjectRegistration,
  registerExternalProject,
  updateProject,
} from "../project-service.js";
import { getProjects } from "../storage/index.js";

const createInternalSchema = z.object({
  name: z.string().trim().min(1),
});

const registerExternalSchema = z.object({
  path: z.string().min(1),
  deviceId: z.string().optional(),
});

const githubSchema = z.object({
  url: z.string().url(),
  deviceId: z.string().optional(),
});

const updateSchema = z.object({
  archived: z.boolean().optional(),
});

/** Helper: check if a project is archived and throw 403 if so */
async function assertNotArchived(projectId: string): Promise<void> {
  const db = await getRidgeDb();
  const row = db.prepare(
    `SELECT archived_at FROM projects WHERE project_id = ?`
  ).get(projectId) as { archived_at: number | null } | undefined;

  if (row?.archived_at) {
    const error = new Error("项目已归档，无法修改") as { statusCode: number } & Error;
    error.statusCode = 403;
    throw error;
  }
}

export function createProjectRouter(defaultWorkspaceDir: string) {
  const router = express.Router();

  // GET /api/workspace/projects
  router.get(
    "/",
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const state = await getProjects();
        res.json({ projects: state.projects });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/workspace/projects/internal
  router.post(
    "/internal",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = createInternalSchema.parse(req.body ?? {});
        const project = await createInternalProject({
          name: payload.name,
          workspacePath: defaultWorkspaceDir,
        });
        res.status(201).json(project);
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/workspace/projects/external
  router.post(
    "/external",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = registerExternalSchema.parse(req.body ?? {});
        const project = await registerExternalProject({
          path: payload.path,
          externalOrigin: 'folder',
          deviceId: payload.deviceId,
          workspacePath: defaultWorkspaceDir,
        });
        res.status(201).json(project);
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/workspace/projects/github
  router.post(
    "/github",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = githubSchema.parse(req.body ?? {});
        const project = await cloneGithubRepo(
          payload.url,
          defaultWorkspaceDir,
          payload.deviceId,
        );
        res.status(201).json(project);
      } catch (error) {
        next(error);
      }
    },
  );

  // PATCH /api/workspace/projects/:id
  router.patch(
    "/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const projectId = String(req.params.id);
        // Archiving is the one mutating operation allowed on archived projects
        const payload = updateSchema.parse(req.body ?? {});
        // Only block non-archive mutations on archived projects
        if (payload.archived === undefined) {
          await assertNotArchived(projectId);
        }
        const project = await updateProject(projectId, payload);
        if (!project) {
          const error = new Error("Project not found") as { statusCode: number } & Error;
          error.statusCode = 404;
          throw error;
        }
        res.json(project);
      } catch (error) {
        next(error);
      }
    },
  );

  // DELETE /api/workspace/projects/:id
  router.delete(
    "/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const projectId = String(req.params.id);
        await assertNotArchived(projectId);
        await deleteProjectRegistration(projectId);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
