import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import type {
	TerminalCreateRequest,
	TerminalRestartRequest,
	TerminalSnapshot,
} from "../types/index.js";

export interface SystemDeps {
	port: number;
	defaultWorkspaceDir: string;
	workspaceChatConfig: {
		chatProjectId: string;
		chatProjectPath: string;
		chatProjectLabel: string;
	};
	terminalManager: {
		listTerminals: () => TerminalSnapshot[];
		createTerminal: (
			payload: TerminalCreateRequest,
		) => Promise<TerminalSnapshot>;
		updateTerminal: (id: string, title: string) => TerminalSnapshot;
		restartTerminal: (
			id: string,
			payload: TerminalRestartRequest,
		) => Promise<TerminalSnapshot>;
		deleteTerminal: (id: string) => void;
	};
	terminalCreateSchema: { parse: (data: unknown) => TerminalCreateRequest };
	terminalUpdateSchema: { parse: (data: unknown) => { title: string } };
	terminalRestartSchema: { parse: (data: unknown) => TerminalRestartRequest };
}

export function createSystemRouter(deps: SystemDeps) {
	const {
		port,
		defaultWorkspaceDir,
		workspaceChatConfig,
		terminalManager,
		terminalCreateSchema,
		terminalUpdateSchema,
		terminalRestartSchema,
	} = deps;
	const router = express.Router();

	router.get("/health", (_req: Request, res: Response) => {
		res.json({ ok: true });
	});

	router.get("/api/system/info", (_req: Request, res: Response) => {
		res.json({
			appName: "Pi Web",
			workspaceDir: defaultWorkspaceDir,
			chatProjectId: workspaceChatConfig.chatProjectId,
			chatProjectPath: workspaceChatConfig.chatProjectPath,
			chatProjectLabel: workspaceChatConfig.chatProjectLabel,
			apiBase: `http://127.0.0.1:${port}`,
			sdkVersion: "0.65.2",
		});
	});

	router.get("/api/terminals", (_req: Request, res: Response) => {
		res.json({ terminals: terminalManager.listTerminals() });
	});

	router.post(
		"/api/terminals",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = terminalCreateSchema.parse(req.body ?? {});
				const terminal = await terminalManager.createTerminal(payload);
				res.status(201).json(terminal);
			} catch (error) {
				next(error);
			}
		},
	);

	router.patch(
		"/api/terminals/:id",
		(req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = terminalUpdateSchema.parse(req.body ?? {});
				const terminal = terminalManager.updateTerminal(
					String(req.params.id),
					payload.title,
				);
				res.json(terminal);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/api/terminals/:id/restart",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = terminalRestartSchema.parse(req.body ?? {});
				const terminal = await terminalManager.restartTerminal(
					String(req.params.id),
					payload,
				);
				res.json(terminal);
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/api/terminals/:id",
		(req: Request, res: Response, next: NextFunction) => {
			try {
				const terminalId = String(req.params.id);
				terminalManager.deleteTerminal(terminalId);
				res.json({ ok: true, terminalId });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
