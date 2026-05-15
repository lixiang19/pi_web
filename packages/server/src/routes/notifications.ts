import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { createBackgroundJobQueue } from "../background-jobs.js";
import type { RidgeDatabase } from "../db/index.js";
import type { AutomationStore } from "../automations.js";
import type { AutomationRule } from "@pi/protocol";
import {
	createMilestoneInDb,
	createTaskInDb,
	updateMilestoneInDb,
	updateTaskInDb,
} from "../task-system.js";

type BackgroundJobQueue = ReturnType<typeof createBackgroundJobQueue>;

type NotificationStatus = "unread" | "pending" | "handled" | "dismissed" | "failed";
type NotificationType = "suggestion" | "confirmation" | "failure" | "warning" | "info";
type NotificationSeverity = "info" | "warning" | "error";
type NotificationFilter = "unhandled" | "all" | "failed" | "suggestions" | "handled";

interface NotificationRow {
	event_id: string;
	event_type: string;
	severity: NotificationSeverity;
	title: string;
	body: string;
	payload_json: string;
	status: NotificationStatus;
	created_at: number;
	read_at: number | null;
	source?: string | null;
	related_type?: string | null;
	related_id?: string | null;
	actions_json?: string | null;
	updated_at?: number | null;
	handled_at?: number | null;
}

interface NotificationAction {
	id: string;
	label: string;
	kind:
		| "view"
		| "dismiss"
		| "retry"
		| "accept_suggestion"
		| "reject_suggestion"
		| "open_related"
		| "mark_handled";
}

interface NotificationEvent {
	id: string;
	eventType: string;
	type: NotificationType;
	source: string;
	severity: NotificationSeverity;
	status: NotificationStatus;
	title: string;
	body: string;
	payload: Record<string, unknown>;
	related: { type: string; id: string } | null;
	actions: NotificationAction[];
	createdAt: number;
	updatedAt: number;
	handledAt: number | null;
}

export interface NotificationsRouterDeps {
	defaultWorkspaceDir: string;
	getRidgeDb: () => Promise<RidgeDatabase>;
	getJobQueue?: () => BackgroundJobQueue | undefined | Promise<BackgroundJobQueue | undefined>;
	isConversionEnabled?: () => boolean;
	getAutomationStore?: () => AutomationStore;
	dispatchAutomationRule?: (rule: AutomationRule) => Promise<{ sessionId?: string }>;
}

const filterSchema = z
	.enum(["unhandled", "all", "failed", "suggestions", "handled"])
	.default("unhandled");

const actionSchema = z.object({
	actionId: z.string().trim().min(1),
});

const taskPatchSchema = z.object({
	title: z.string().trim().min(1).optional(),
	status: z.enum(["pending", "in_progress", "blocked", "reviewing", "completed"]).optional(),
	priority: z.enum(["normal", "important", "urgent"]).optional(),
	acceptanceCriteria: z.string().trim().min(1).optional(),
	dueDate: z.number().int().nonnegative().nullable().optional(),
	milestoneId: z.string().trim().min(1).optional(),
	projectId: z.string().trim().min(1).nullable().optional(),
	blockedReason: z.string().trim().nullable().optional(),
	sortOrder: z.number().int().optional(),
	actor: z.enum(["user", "agent"]).default("user"),
});

const milestonePatchSchema = z.object({
	title: z.string().trim().min(1).optional(),
	goal: z.string().trim().min(1).optional(),
	acceptanceCriteria: z.string().trim().min(1).optional(),
	status: z.enum(["pending", "in_progress", "blocked", "reviewing", "completed"]).optional(),
	dueDate: z.number().int().nonnegative().nullable().optional(),
	color: z.string().trim().min(1).optional(),
	projectId: z.string().trim().min(1).nullable().optional(),
	actor: z.enum(["user", "agent"]).default("user"),
});

const suggestionSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("task.update"),
		taskId: z.string().trim().min(1),
		patch: taskPatchSchema,
	}),
	z.object({
		kind: z.literal("milestone.update"),
		milestoneId: z.string().trim().min(1),
		patch: milestonePatchSchema,
	}),
	z.object({
		kind: z.literal("task.create"),
		task: z.object({
			title: z.string().trim().min(1),
			priority: z.enum(["normal", "important", "urgent"]).default("normal"),
			acceptanceCriteria: z.string().trim().min(1),
			dueDate: z.number().int().nonnegative().nullable().optional(),
			milestoneId: z.string().trim().min(1).nullable().optional(),
			projectId: z.string().trim().min(1).nullable().optional(),
		}),
	}),
	z.object({
		kind: z.literal("milestone.create"),
		milestone: z.object({
			title: z.string().trim().min(1),
			goal: z.string().trim().min(1),
			acceptanceCriteria: z.string().trim().min(1),
			dueDate: z.number().int().nonnegative().nullable().optional(),
			color: z.string().trim().min(1).optional(),
			projectId: z.string().trim().min(1).nullable().optional(),
		}),
	}),
]);

const createHttpError = (message: string, statusCode: number) => {
	const error = new Error(message) as Error & { statusCode?: number };
	error.statusCode = statusCode;
	return error;
};

const parseJsonObject = (value: string): Record<string, unknown> => {
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: {};
	} catch {
		return {};
	}
};

const parseStoredActions = (value: string | null | undefined): NotificationAction[] => {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((item) => {
				if (!item || typeof item !== "object") return null;
				const id = typeof item.id === "string" ? item.id : "";
				const label = typeof item.label === "string" ? item.label : id;
				if (!id || !label) return null;
				return { id, label, kind: actionKindFromId(id) };
			})
			.filter((item): item is NotificationAction => Boolean(item));
	} catch {
		return [];
	}
};

const actionKindFromId = (id: string): NotificationAction["kind"] => {
	if (id === "retry") return "retry";
	if (id === "accept_suggestion") return "accept_suggestion";
	if (id === "reject_suggestion") return "reject_suggestion";
	if (id === "open_related") return "open_related";
	if (id === "mark_handled") return "mark_handled";
	if (id === "dismiss") return "dismiss";
	return "view";
};

const isDoneStatus = (status: NotificationStatus): boolean =>
	status === "handled" || status === "dismissed";

const isDefaultVisible = (notification: NotificationEvent): boolean =>
	!isDoneStatus(notification.status) && notification.type !== "info";

const openableRelatedTypes = new Set([
	"file",
	"session",
	"task",
	"milestone",
	"project",
	"automation",
]);

const canOpenRelated = (related: NotificationEvent["related"]): boolean =>
	Boolean(related && openableRelatedTypes.has(related.type));

const deriveSource = (row: NotificationRow): string => {
	if (row.source) return row.source;
	const [source] = row.event_type.split(".");
	return source || "system";
};

const deriveType = (row: NotificationRow, payload: Record<string, unknown>): NotificationType => {
	if (payload.suggestion || row.event_type.includes("suggestion")) return "suggestion";
	if (row.severity === "error" || row.event_type.endsWith(".failed") || row.event_type.includes("_failed")) return "failure";
	if (row.severity === "warning" || row.event_type.includes("skipped")) return "warning";
	if (row.status === "pending") return "confirmation";
	return "info";
};

const deriveRelated = (
	row: NotificationRow,
	payload: Record<string, unknown>,
): NotificationEvent["related"] => {
	if (row.related_type && row.related_id) {
		return { type: row.related_type, id: row.related_id };
	}
	if (row.event_type.startsWith("file_processing.") || row.event_type === "rag.index_failed") {
		const filePath = typeof payload.filePath === "string" ? payload.filePath : undefined;
		return filePath ? { type: "file", id: filePath } : null;
	}
	if (row.event_type === "background_job.failed") {
		const jobId = typeof payload.jobId === "string" ? payload.jobId : undefined;
		return jobId ? { type: "background_job", id: jobId } : null;
	}
	if (row.event_type === "task_review.suggestion") {
		const suggestion = payload.suggestion;
		if (!suggestion || typeof suggestion !== "object" || Array.isArray(suggestion)) return null;
		const taskId = "taskId" in suggestion && typeof suggestion.taskId === "string"
			? suggestion.taskId
			: undefined;
		if (taskId) return { type: "task", id: taskId };
		const milestoneId = "milestoneId" in suggestion && typeof suggestion.milestoneId === "string"
			? suggestion.milestoneId
			: undefined;
		if (milestoneId) return { type: "milestone", id: milestoneId };
	}
	return null;
};

const addAction = (actions: NotificationAction[], action: NotificationAction) => {
	if (!actions.some((item) => item.id === action.id)) {
		actions.push(action);
	}
};

const deriveActions = (
	row: NotificationRow,
	type: NotificationType,
	related: NotificationEvent["related"],
): NotificationAction[] => {
	const actions = parseStoredActions(row.actions_json).filter(
		(action) => action.kind !== "open_related" || canOpenRelated(related),
	);
	const done = isDoneStatus(row.status);
	// The notification center owns safe lifecycle actions; producers only provide
	// domain-specific actions such as retry, suggestion acceptance, or navigation.
	if (canOpenRelated(related) && !done) {
		addAction(actions, { id: "open_related", label: "打开对象", kind: "open_related" });
	}
	if (type === "suggestion" && !done) {
		addAction(actions, { id: "accept_suggestion", label: "接受建议", kind: "accept_suggestion" });
		addAction(actions, { id: "reject_suggestion", label: "拒绝建议", kind: "reject_suggestion" });
	}
	if ((type === "failure" || row.event_type === "automation.skipped") && !done) {
		addAction(actions, { id: "retry", label: "重试", kind: "retry" });
	}
	if (!done) {
		addAction(actions, { id: "mark_handled", label: "标记已处理", kind: "mark_handled" });
		addAction(actions, { id: "dismiss", label: "忽略", kind: "dismiss" });
	}
	return actions;
};

const mapNotification = (row: NotificationRow): NotificationEvent => {
	const payload = parseJsonObject(row.payload_json);
	const related = deriveRelated(row, payload);
	const type = deriveType(row, payload);
	return {
		id: row.event_id,
		eventType: row.event_type,
		type,
		source: deriveSource(row),
		severity: row.severity,
		status: row.status,
		title: row.title,
		body: row.body,
		payload,
		related,
		actions: deriveActions(row, type, related),
		createdAt: row.created_at,
		updatedAt: row.updated_at ?? row.created_at,
		handledAt: row.handled_at ?? null,
	};
};

const loadRows = (db: RidgeDatabase): NotificationRow[] =>
	db
		.prepare(
			`SELECT event_id, event_type, severity, title, body, payload_json,
			        status, created_at, read_at, source, related_type, related_id,
			        actions_json, updated_at, handled_at
			   FROM notification_events
			  ORDER BY created_at DESC, event_id DESC`,
		)
		.all() as NotificationRow[];

const filterNotifications = (
	notifications: NotificationEvent[],
	filter: NotificationFilter,
): NotificationEvent[] => {
	if (filter === "all") return notifications;
	if (filter === "unhandled") return notifications.filter(isDefaultVisible);
	if (filter === "handled") return notifications.filter((item) => isDoneStatus(item.status));
	if (filter === "failed") return notifications.filter((item) => item.type === "failure");
	if (filter === "suggestions") return notifications.filter((item) => item.type === "suggestion");
	return notifications;
};

const buildCounts = (notifications: NotificationEvent[]) => ({
	unhandled: notifications.filter(isDefaultVisible).length,
	all: notifications.length,
	failed: notifications.filter((item) => item.type === "failure").length,
	suggestions: notifications.filter((item) => item.type === "suggestion").length,
	handled: notifications.filter((item) => isDoneStatus(item.status)).length,
});

const hasAvailableAction = (notification: NotificationEvent, actionId: string): boolean =>
	notification.actions.some((action) => action.id === actionId);

const markNotification = (
	db: RidgeDatabase,
	eventId: string,
	status: NotificationStatus,
): NotificationEvent => {
	const timestamp = Date.now();
	db.prepare(
		`UPDATE notification_events
		    SET status = ?, updated_at = ?, handled_at = ?
		  WHERE event_id = ?`,
	).run(status, timestamp, status === "handled" || status === "dismissed" ? timestamp : null, eventId);
	const row = db
		.prepare(
			`SELECT event_id, event_type, severity, title, body, payload_json,
			        status, created_at, read_at, source, related_type, related_id,
			        actions_json, updated_at, handled_at
			   FROM notification_events
			  WHERE event_id = ?`,
		)
		.get(eventId) as NotificationRow | undefined;
	if (!row) throw createHttpError("Notification not found", 404);
	return mapNotification(row);
};

const applySuggestion = (
	db: RidgeDatabase,
	workspaceDir: string,
	payload: Record<string, unknown>,
): void => {
	const result = suggestionSchema.safeParse(payload.suggestion);
	if (!result.success) {
		throw createHttpError("Invalid notification suggestion payload", 400);
	}
	const parsed = result.data;
	if (parsed.kind === "task.update") {
		updateTaskInDb(db, workspaceDir, parsed.taskId, parsed.patch);
		return;
	}
	if (parsed.kind === "milestone.update") {
		updateMilestoneInDb(db, workspaceDir, parsed.milestoneId, parsed.patch);
		return;
	}
	if (parsed.kind === "task.create") {
		createTaskInDb(db, workspaceDir, parsed.task);
		return;
	}
	createMilestoneInDb(db, workspaceDir, parsed.milestone);
};

const applySuggestionAndMarkHandled = (
	db: RidgeDatabase,
	workspaceDir: string,
	notification: NotificationEvent,
): NotificationEvent =>
	db.transaction(() => {
		const timestamp = Date.now();
		const claimed = db.prepare(
			`UPDATE notification_events
			    SET status = 'handled',
			        updated_at = ?,
			        handled_at = ?
			  WHERE event_id = ?
			    AND status NOT IN ('handled', 'dismissed')`,
		).run(timestamp, timestamp, notification.id);
		if (claimed.changes === 0) {
			const row = db
				.prepare(
					`SELECT event_id, event_type, severity, title, body, payload_json,
					        status, created_at, read_at, source, related_type, related_id,
					        actions_json, updated_at, handled_at
					   FROM notification_events
					  WHERE event_id = ?`,
				)
				.get(notification.id) as NotificationRow | undefined;
			if (!row) throw createHttpError("Notification not found", 404);
			return mapNotification(row);
		}
		applySuggestion(db, workspaceDir, notification.payload);
		const row = db
			.prepare(
				`SELECT event_id, event_type, severity, title, body, payload_json,
				        status, created_at, read_at, source, related_type, related_id,
				        actions_json, updated_at, handled_at
				   FROM notification_events
				  WHERE event_id = ?`,
			)
			.get(notification.id) as NotificationRow | undefined;
		if (!row) throw createHttpError("Notification not found", 404);
		return mapNotification(row);
	})();

const retryNotification = async (
	deps: NotificationsRouterDeps,
	db: RidgeDatabase,
	notification: NotificationEvent,
): Promise<void> => {
	const filePath = notification.related?.type === "file"
		? notification.related.id
		: typeof notification.payload.filePath === "string"
			? notification.payload.filePath
			: undefined;
	const jobId = notification.related?.type === "background_job"
		? notification.related.id
		: typeof notification.payload.jobId === "string"
			? notification.payload.jobId
			: undefined;
	const queue = deps.getJobQueue ? await deps.getJobQueue() : undefined;

	if (notification.eventType === "rag.index_failed") {
		if (!filePath) throw createHttpError("Missing filePath for RAG retry", 400);
		if (!queue) throw createHttpError("Background job queue is not available", 503);
		db.transaction(() => {
			const result = db.prepare(
				`UPDATE search_index_status
				    SET status = 'pending', error = NULL, updated_at = ?
				  WHERE target_path = ? AND status = 'index_failed'`,
			).run(Date.now(), filePath);
			if (result.changes === 0) {
				throw createHttpError("RAG failure record not found", 404);
			}
			queue.cancel({ type: "rag.index", relatedType: "file", relatedId: filePath });
			queue.enqueue({
				type: "rag.index",
				relatedType: "file",
				relatedId: filePath,
				payload: { targetPath: filePath, workspaceDir: deps.defaultWorkspaceDir, event: "manual" },
				maxAttempts: 3,
				notifyOnFailure: true,
			});
		})();
		return;
	}

	if (notification.eventType.startsWith("file_processing.")) {
		if (!filePath) throw createHttpError("Missing filePath for file retry", 400);
		if (deps.isConversionEnabled && !deps.isConversionEnabled()) {
			throw createHttpError("Python conversion service not configured", 503);
		}
		if (!queue) throw createHttpError("Background job queue is not available", 503);
		db.transaction(() => {
			const result = db.prepare(
				`UPDATE file_processing_status
				    SET status = 'pending', error = NULL, updated_at = ?
				  WHERE file_path = ? AND status IN ('convert_failed', 'index_failed')`,
			).run(Date.now(), filePath);
			if (result.changes === 0) {
				throw createHttpError("File failure record not found", 404);
			}
			queue.cancel({ type: "file.convert", relatedType: "file", relatedId: filePath });
			queue.enqueue({
				type: "file.convert",
				relatedType: "file",
				relatedId: filePath,
				payload: { workspaceDir: deps.defaultWorkspaceDir },
				maxAttempts: 3,
				notifyOnFailure: true,
			});
		})();
		return;
	}

	if (notification.eventType === "background_job.failed") {
		if (!jobId) throw createHttpError("Missing jobId for background job retry", 400);
		const result = db.prepare(
			`UPDATE background_jobs
			    SET status = 'pending',
			        retry_count = 0,
			        last_error = NULL,
			        run_after = ?,
			        next_retry_at = NULL,
			        locked_at = NULL,
			        locked_by = NULL,
			        updated_at = ?
				  WHERE job_id = ? AND status = 'failed'`,
		).run(Date.now(), Date.now(), jobId);
		if (result.changes === 0) {
			throw createHttpError("Failed background job record not found", 404);
		}
		return;
	}

	if (notification.eventType === "automation.failed" || notification.eventType === "automation.skipped") {
		const automationId = notification.related?.type === "automation"
			? notification.related.id
			: typeof notification.payload.automationId === "string"
				? notification.payload.automationId
				: undefined;
		if (!automationId) throw createHttpError("Missing automationId for automation retry", 400);
		if (!deps.getAutomationStore || !deps.dispatchAutomationRule) {
			throw createHttpError("Automation retry is not available", 503);
		}
		const store = deps.getAutomationStore();
		const rule = store.getRule(automationId);
		if (!rule) throw createHttpError("Automation rule not found", 404);
		try {
			const result = await deps.dispatchAutomationRule(rule);
			store.createRun({
				automationId: rule.id,
				status: "success",
				sessionId: result.sessionId,
			});
		} catch (error) {
			const status =
				error instanceof Error && error.name === "AutomationSkippedError"
					? "skipped"
					: "failed";
			const run = store.createRun({
				automationId: rule.id,
				status,
				reason: error instanceof Error ? error.message : String(error),
			});
			store.createRunNotification(rule, run);
			throw error;
		}
		return;
	}

	throw createHttpError(`Unsupported retry action for ${notification.eventType}`, 400);
};

export function createNotificationsRouter(deps: NotificationsRouterDeps) {
	const router = express.Router();

	router.get("/", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const filter = filterSchema.parse(req.query.filter);
			const db = await deps.getRidgeDb();
			const notifications = loadRows(db).map(mapNotification);
			res.json({
				notifications: filterNotifications(notifications, filter),
				counts: buildCounts(notifications),
			});
		} catch (error) {
			next(error);
		}
	});

	router.post("/:eventId/actions", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { actionId } = actionSchema.parse(req.body ?? {});
			const db = await deps.getRidgeDb();
			const row = db
				.prepare(
					`SELECT event_id, event_type, severity, title, body, payload_json,
					        status, created_at, read_at, source, related_type, related_id,
					        actions_json, updated_at, handled_at
					   FROM notification_events
					  WHERE event_id = ?`,
				)
				.get(req.params.eventId) as NotificationRow | undefined;
			if (!row) throw createHttpError("Notification not found", 404);
			const notification = mapNotification(row);
			if (isDoneStatus(notification.status)) {
				res.json({ notification });
				return;
			}
			if (!hasAvailableAction(notification, actionId)) {
				throw createHttpError(`Unsupported notification action: ${actionId}`, 400);
			}

			if (actionId === "dismiss" || actionId === "reject_suggestion") {
				res.json({ notification: markNotification(db, notification.id, "dismissed") });
				return;
			}
			if (actionId === "mark_handled") {
				res.json({ notification: markNotification(db, notification.id, "handled") });
				return;
			}
			if (actionId === "accept_suggestion") {
				res.json({ notification: applySuggestionAndMarkHandled(db, deps.defaultWorkspaceDir, notification) });
				return;
			}
			if (actionId === "retry") {
				await retryNotification(deps, db, notification);
				res.json({ notification: markNotification(db, notification.id, "handled") });
				return;
			}
			if (actionId === "open_related") {
				res.json({ notification });
				return;
			}

			throw createHttpError(`Unsupported notification action: ${actionId}`, 400);
		} catch (error) {
			next(error);
		}
	});

	return router;
}
