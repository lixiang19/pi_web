import path from "node:path";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { z } from "zod";

import { createIsoGitService } from "../iso-git-service.js";
import {
	commitWorkspaceVersionPoint,
	getWorkspaceVersionContext,
} from "../workspace-version.js";

export interface WorkspaceVersionDeps {
	defaultWorkspaceDir: string;
}

const rootQuerySchema = z.object({ root: z.string().optional() });

const resolveVersionRoot = (
	rawRoot: string | undefined,
	defaultWorkspaceDir: string,
): string => path.resolve(rawRoot || defaultWorkspaceDir);

export function createWorkspaceVersionRouter(deps: WorkspaceVersionDeps) {
	const router = express.Router();
	const isoGitService = createIsoGitService();

	router.get(
		"/status",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = rootQuerySchema.parse(req.query ?? {});
				const root = resolveVersionRoot(query.root, deps.defaultWorkspaceDir);
				res.json(await isoGitService.getStatus(getWorkspaceVersionContext(root)));
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/diff",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = z
					.object({
						root: z.string().optional(),
						filePath: z.string(),
					})
					.parse(req.query ?? {});
				const root = resolveVersionRoot(query.root, deps.defaultWorkspaceDir);
				const diff = await isoGitService.getFileDiff(
					getWorkspaceVersionContext(root),
					query.filePath,
				);
				res.json({
					path: query.filePath,
					diff,
					staged: false,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/commit",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const body = z
					.object({
						root: z.string().optional(),
						message: z.string().min(1),
						files: z.array(z.string()).min(1),
					})
					.parse(req.body ?? {});
				const root = resolveVersionRoot(body.root, deps.defaultWorkspaceDir);
				const result = await commitWorkspaceVersionPoint({
					workspaceDir: root,
					files: body.files,
					message: body.message,
				});
				res.json({ ok: true, hash: result.hash, files: result.files });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
