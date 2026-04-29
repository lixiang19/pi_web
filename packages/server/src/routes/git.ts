import path from "node:path";
import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";
import { z } from "zod";

import { resolveGitContext } from "../git-resolver.js";
import type { HttpError } from "../types/index.js";

type GitService = {
	isGitRepository: (cwd: string) => Promise<boolean>;
	getStatus: (cwd: string) => Promise<unknown>;
	getBranches: (cwd: string) => Promise<unknown>;
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

type IsoGitService = {
	getStatus: (ctx: unknown) => Promise<unknown>;
	getBranches: (ctx: unknown) => Promise<unknown>;
	commit: (
		ctx: unknown,
		message: string,
		files: string[],
	) => Promise<{ hash: string }>;
};

export interface GitDeps {
	defaultWorkspaceDir: string;
	gitService: GitService;
	isoGitService: IsoGitService;
}

const gitCwdQuerySchema = z.object({ cwd: z.string().optional() });

const resolveGitCwd = (
	rawCwd: string | undefined,
	defaultWorkspaceDir: string,
): string => {
	return path.resolve(rawCwd || defaultWorkspaceDir);
};

const requireCliEngine = (
	ctx: { engine: string; label: string },
	capability: string,
) => {
	if (ctx.engine !== "cli") {
		const error = new Error(`内置 Git 不支持${capability}`) as HttpError;
		error.statusCode = 400;
		throw error;
	}
};

export function createGitRouter(deps: GitDeps) {
	const { defaultWorkspaceDir, gitService, isoGitService } = deps;
	const router = Router();

	router.get(
		"/is-repo",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = gitCwdQuerySchema.parse(req.query ?? {});
				const cwd = resolveGitCwd(query.cwd, defaultWorkspaceDir);
				const ctx = await resolveGitContext(cwd);
				res.json({
					engine: ctx.engine,
					canCommit: ctx.canCommit,
					canPushPull: ctx.canPushPull,
					canWorktree: ctx.canWorktree,
					label: ctx.label,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/status",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = gitCwdQuerySchema.parse(req.query ?? {});
				const cwd = resolveGitCwd(query.cwd, defaultWorkspaceDir);
				const ctx = await resolveGitContext(cwd);
				if (ctx.engine === "cli") {
					res.json(await gitService.getStatus(cwd));
				} else {
					res.json(await isoGitService.getStatus(ctx));
				}
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/branches",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = gitCwdQuerySchema.parse(req.query ?? {});
				const cwd = resolveGitCwd(query.cwd, defaultWorkspaceDir);
				const ctx = await resolveGitContext(cwd);
				if (ctx.engine === "cli") {
					res.json(await gitService.getBranches(cwd));
				} else {
					res.json(await isoGitService.getBranches(ctx));
				}
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/remotes",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = gitCwdQuerySchema.parse(req.query ?? {});
				const cwd = resolveGitCwd(query.cwd, defaultWorkspaceDir);
				const ctx = await resolveGitContext(cwd);
				requireCliEngine(ctx, "远程操作");
				const remotes = await gitService.getRemotes(cwd);
				res.json(remotes);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/fetch",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { cwd, remote, branch } = z
					.object({
						cwd: z.string(),
						remote: z.string().optional(),
						branch: z.string().optional(),
					})
					.parse(req.body ?? {});
				const ctx = await resolveGitContext(
					resolveGitCwd(cwd, defaultWorkspaceDir),
				);
				requireCliEngine(ctx, "fetch");
				await gitService.fetch(resolveGitCwd(cwd, defaultWorkspaceDir), {
					remote,
					branch,
				});
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/pull",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { cwd, remote } = z
					.object({
						cwd: z.string(),
						remote: z.string().optional(),
					})
					.parse(req.body ?? {});
				const ctx = await resolveGitContext(
					resolveGitCwd(cwd, defaultWorkspaceDir),
				);
				requireCliEngine(ctx, "pull");
				await gitService.pull(resolveGitCwd(cwd, defaultWorkspaceDir), {
					remote,
				});
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/push",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { cwd, remote, branch, force } = z
					.object({
						cwd: z.string(),
						remote: z.string().optional(),
						branch: z.string().optional(),
						force: z.boolean().optional(),
					})
					.parse(req.body ?? {});
				const ctx = await resolveGitContext(
					resolveGitCwd(cwd, defaultWorkspaceDir),
				);
				requireCliEngine(ctx, "push");
				await gitService.push(resolveGitCwd(cwd, defaultWorkspaceDir), {
					remote,
					branch,
					force,
				});
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/commit",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { cwd, message, files } = z
					.object({
						cwd: z.string(),
						message: z.string(),
						files: z.array(z.string()),
					})
					.parse(req.body ?? {});
				const ctx = await resolveGitContext(
					resolveGitCwd(cwd, defaultWorkspaceDir),
				);
				if (ctx.engine === "cli") {
					const result = await gitService.commit(
						resolveGitCwd(cwd, defaultWorkspaceDir),
						message,
						files,
					);
					res.json({ ok: true, hash: result.hash });
				} else {
					const result = await isoGitService.commit(ctx, message, files);
					res.json({ ok: true, hash: result.hash });
				}
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/create-branch",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { cwd, branchName, fromRef } = z
					.object({
						cwd: z.string(),
						branchName: z.string(),
						fromRef: z.string().optional(),
					})
					.parse(req.body ?? {});
				const ctx = await resolveGitContext(
					resolveGitCwd(cwd, defaultWorkspaceDir),
				);
				requireCliEngine(ctx, "create-branch");
				await gitService.createBranch(
					resolveGitCwd(cwd, defaultWorkspaceDir),
					branchName,
					fromRef,
				);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/checkout",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { cwd, branchName } = z
					.object({
						cwd: z.string(),
						branchName: z.string(),
					})
					.parse(req.body ?? {});
				const ctx = await resolveGitContext(
					resolveGitCwd(cwd, defaultWorkspaceDir),
				);
				requireCliEngine(ctx, "checkout");
				await gitService.checkoutBranch(
					resolveGitCwd(cwd, defaultWorkspaceDir),
					branchName,
				);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/rename-branch",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { cwd, oldName, newName } = z
					.object({
						cwd: z.string(),
						oldName: z.string(),
						newName: z.string(),
					})
					.parse(req.body ?? {});
				const ctx = await resolveGitContext(
					resolveGitCwd(cwd, defaultWorkspaceDir),
				);
				requireCliEngine(ctx, "rename-branch");
				await gitService.renameBranch(
					resolveGitCwd(cwd, defaultWorkspaceDir),
					oldName,
					newName,
				);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/merge",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { cwd, branchName } = z
					.object({
						cwd: z.string(),
						branchName: z.string(),
					})
					.parse(req.body ?? {});
				const ctx = await resolveGitContext(
					resolveGitCwd(cwd, defaultWorkspaceDir),
				);
				requireCliEngine(ctx, "merge");
				await gitService.merge(
					resolveGitCwd(cwd, defaultWorkspaceDir),
					branchName,
				);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/rebase",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { cwd, branchName } = z
					.object({
						cwd: z.string(),
						branchName: z.string(),
					})
					.parse(req.body ?? {});
				const ctx = await resolveGitContext(
					resolveGitCwd(cwd, defaultWorkspaceDir),
				);
				requireCliEngine(ctx, "rebase");
				await gitService.rebase(
					resolveGitCwd(cwd, defaultWorkspaceDir),
					branchName,
				);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
