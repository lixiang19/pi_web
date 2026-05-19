export type {
	AgentSummary,
	AskInteractiveRequest,
	AskOption,
	AskQuestion,
	AskQuestionAnswer,
	AskToolCallArguments,
	AskToolResultDetails,
	AssistantMessageEvent,
	AutomationRule,
	AutomationRuleInput,
	AutomationRun,
	AutomationRunNowResponse,
	AutomationSchedule,
	AutomationScope,
	AutomationsResponse,
	CommandCatalogItem,
	CreateWorktreeRequest,
	DeleteWorktreeRequest,
	DeviceItem,
	DirectoryBrowseResponse,
	FileEntryCreateRequest,
	FileEntryMoveRequest,
	FileEntryMutationResponse,
	FileEntryTrashResponse,
	FilePreviewKind,
	FilePreviewPayload,
	FilePreviewWindowPayload,
	FileSaveRequest,
	FileSaveResponse,
	FileTreeEntry,
	FileTreeResponse,
	FileUploadResponse,
	GitBranchesResponse,
	GitDiffResponse,
	GitFileStatusItem,
	GitRemoteInfo,
	GitRepositoryStatusResponse,
	GitStatusResponse,
	PermissionDecisionAction,
	PermissionInteractiveRequest,
	PiAssistantMessage,
	PiImageContent,
	PiMessage,
	PiTextContent,
	PiThinkingContent,
	PiToolCall,
	PiToolResultMessage,
	ProjectItem,
	ProjectsResponse,
	PromptCatalogItem,
	ProviderGroup,
	ProviderModel,
	ProvidersResponse,
	ResourceCatalogResponse,
	ResourceSourceInfo,
	SendMessagePayload,
	SessionAttachment,
	SessionAttachmentsResponse,
	SessionContextSummary,
	SessionHistoryMeta,
	SessionHydratePayload,
	SessionMessagesPayload,
	SessionMutationResponse,
	SessionRuntimePayload,
	SessionSnapshot,
	SessionSummary,
	SkillCatalogItem,
	SpacePreviewHtmlResponse,
	SpaceWorkItem,
	SpaceWorksResponse,
	StreamErrorEvent,
	StreamEvent,
	StreamEventType,
	StreamMessageEvent,
	StreamSnapshotEvent,
	StreamStatusEvent,
	SystemInfo,
	TerminalCreateRequest,
	TerminalListResponse,
	TerminalMutationResponse,
	TerminalRestartRequest,
	TerminalSnapshot,
	TerminalStatus,
	TerminalUpdateRequest,
	ThinkingLevel,
	ValidateWorktreeRequest,
	ValidateWorktreeResponse,
	WorktreeApiInfo,
	WorktreesResponse,
	WorkspaceKnowledgeDiagnosticsResponse,
	WorkspaceSearchResponse,
	WorkspaceSearchResult,
	WorkspaceSearchResultType,
} from "@pi/protocol";

import type { PiMessage, ThinkingLevel } from "@pi/protocol";

export interface ChatComposerState {
	sessionId: string | null;
	draftText: string;
	isSending: boolean;
	canAbort: boolean;
	selectedModel: string;
	selectedThinkingLevel: ThinkingLevel;
	selectedAgent: string;
	hasDraft: boolean;
	isFocused: boolean;
	isDisabled: boolean;
	pendingPrompt: string;
}

export interface UiConversationMessage {
	message: PiMessage;
	pending?: boolean;
	localId?: string;
}

export interface UiSessionSnapshot
	extends Omit<import("@pi/protocol").SessionSnapshot, "messages"> {
	messages: UiConversationMessage[];
}

// ===== Notes =====

export interface NoteListItem {
	name: string;
	path: string;
	relativePath: string;
	updatedAt: number;
	size: number;
}

export interface NoteListResponse {
	root: string;
	entries: NoteListItem[];
}

export interface NoteContentResponse {
	path: string;
	relativePath: string;
	content: string;
	updatedAt: number;
	size: number;
}

export interface NoteSaveResponse {
	path: string;
	relativePath: string;
	size: number;
	updatedAt: number;
}

export interface NoteCreateResponse {
	name: string;
	path: string;
	relativePath: string;
	size: number;
	updatedAt: number;
}

export interface NoteRenameResponse {
	oldPath: string;
	name: string;
	path: string;
	relativePath: string;
	size: number;
	updatedAt: number;
}

export interface NoteCreateFolderResponse {
	name: string;
	path: string;
	relativePath: string;
}

export interface NoteTab {
	relativePath: string;
	name: string;
	content: string;
	savedContent: string;
	saveStatus: "saved" | "unsaved" | "saving" | "error";
	isLoading: boolean;
}

// ===== AI Dashboard =====

export type AIDashboardStatIcon = "session" | "file" | "task" | "moment";

export interface AIDashboardStat {
	label: string;
	value: string;
	icon: AIDashboardStatIcon;
}

export interface AIDashboardHighlight {
	text: string;
	kind: "trend" | "insight";
}

export interface YesterdayReview {
	summary: string;
	stats: AIDashboardStat[];
	highlights: AIDashboardHighlight[];
}

export type TodayRecommendationPriority = "high" | "medium" | "low";

export type TodayRecommendationAction =
	| "continue-session"
	| "open-file"
	| "open-inbox"
	| "open-tasks"
	| "open-sessions";

export interface TodayRecommendation {
	id: string;
	title: string;
	reason: string;
	priority: TodayRecommendationPriority;
	action: TodayRecommendationAction;
	icon: AIDashboardStatIcon;
	/** action target: sessionId, filePath, etc. */
	actionTarget?: string;
}
