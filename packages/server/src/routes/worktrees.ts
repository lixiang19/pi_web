import path from "node:path";
import {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import Router from "express/lib/router/index.js";
import { z } from "zod";

import { getProjects } from "../storage/index.js";
import type { HttpError } from "../types/index.js";

type GitService = {
	isGitRepository: (cwd: string) => Promise<boolean>;
	getRemotes: (cwd: string) => Promise<unknown[]>;
	fetch: (
		cwd: string,
		opts: { remote?: string; branch?: string },
	) => Promise<void>;
	pull: (cwd: string, opts: { remote?: string }) => Promise<void>;
	push: (
		cwd: string,
		opts: { remote?: string; branch?: string; force?: boolean },
	) => Promise<void>;
	commit: (
		cwd: string,
		message: string,
		files: string[],
	) => Promise<{ hash: string }>;
	createBranch: (
		cwd: string,
		branchName: string,
		fromRef?: string,
	) => Promise<void>;
	checkoutBranch: (cwd: string, branchName: string) => Promise<void>;
	renameBranch: (
		cwd: string,
		oldName: string,
		newName: string,
	) => Promise<void>;
	merge: (cwd: string, branchName: string) => Promise<void>;
	rebase: (cwd: string, branchName: string) => Promise<void>;
};

type WorktreeService = {
	list: (projectRoot: string) => Promise<unknown[]>;
	validate: (projectRoot: string, payload: unknown) => Promise<unknown>;
	create: (projectRoot: string, payload: unknown) => Promise<unknown>;
	remove: (projectRoot: string, payload: unknown) => Promise<unknown>;
};

export interface WorktreeDeps {
	defaultWorkspaceDir: string;
	gitService: GitService;
	worktreeService: WorktreeService;
	projectContextResolver: { invalidateContext: () => void };
	invalidateManagedProjectScopes: () => void;
}

const worktreeValidateSchema = z.object({
	mode: z.enum(["new", "existing"]),
	branchName: z.string().optional(),
	existingBranch: z.string().optional(),
	worktreeName: z.string().optional(),
});

const worktreeCreateSchema = z.object({
	mode: z.enum(["new", "existing"]),
	branchName: z.string().optional(),
	existingBranch: z.string().optional(),
	worktreeName: z.string().optional(),
	startRef: z.string().optional(),
});

const worktreeDeleteSchema = z.object({
	worktreePath: z.string(),
	deleteLocalBranch: z.boolean().optional(),
	deleteRemoteBranch: z.boolean().optional(),
});

const resolveProjectRoot = async (projectId: string): Promise<string> => {
	const projects = await getProjects();
	const project = projects.projects.find((p) => p.id === projectId);
	if (!project) {
		const error = new Error(`Project not found: ${projectId}`) as HttpError;
		error.statusCode = 404;
		throw error;
	}
	return path.resolve(project.path);
};

export function createWorktreeRouter(deps: WorktreeDeps) {
	const {
		gitService,
		worktreeService,
		projectContextResolver,
		invalidateManagedProjectScopes,
	} = deps;
	const router = Router();

	router.get(
		"/:id/worktrees",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const projectRoot = await resolveProjectRoot(String(req.params.id));
				const isGit = await gitService.isGitRepository(projectRoot);
				if (!isGit) {
					res.json({ worktrees: [] });
					return;
				}
				const worktrees = await worktreeService.list(projectRoot);
				res.json({ worktrees });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/:id/worktrees/validate",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const projectRoot = await resolveProjectRoot(String(req.params.id));
				const payload = worktreeValidateSchema.parse(req.body ?? {});
				const result = await worktreeService.validate(projectRoot, payload);
				res.json(result);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/:id/worktrees",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const projectRoot = await resolveProjectRoot(String(req.params.id));
				const payload = worktreeCreateSchema.parse(req.body ?? {});
				const metadata = await worktreeService.create(projectRoot, payload);
				projectContextResolver.invalidateContext();
				invalidateManagedProjectScopes();
				res.status(201).json(metadata);
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/:id/worktrees",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const projectRoot = await resolveProjectRoot(String(req.params.id));
				const payload = worktreeDeleteSchema.parse(req.body ?? {});
				const result = await worktreeService.remove(projectRoot, payload);
				projectContextResolver.invalidateContext();
				invalidateManagedProjectScopes();
				res.json({ ok: true, ...(result as Record<string, unknown>) });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
