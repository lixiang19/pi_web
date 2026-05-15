import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { GraphMaintenanceRunner } from "../graph-agent.js";

const correctionSchema = z.object({
	correction: z.string().min(1).max(20_000),
});

export function createWorkspaceGraphRouter(options: {
	getGraphRunner: () => GraphMaintenanceRunner | undefined;
}) {
	const router = express.Router();

	router.post(
		"/api/workspace/graph/corrections",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const runner = options.getGraphRunner();
				if (!runner) {
					const error = new Error("图谱维护服务尚未初始化") as Error & { statusCode?: number };
					error.statusCode = 503;
					throw error;
				}
				const payload = correctionSchema.parse(req.body ?? {});
				const result = await runner.applyNaturalLanguageCorrection(payload.correction);
				res.json(result);
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
