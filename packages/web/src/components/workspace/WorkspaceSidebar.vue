<script setup lang="ts">
import {
	BookOpen,
	Plus,
	ChevronDown,
	ChevronRight,
	Archive,
	Monitor,
} from "lucide-vue-next";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionProjectView } from "@/lib/session-sidebar";

export type FixedEntry = {
	id: string;
	label: string;
	icon: typeof BookOpen;
	type: "singleton" | "terminal";
};

type SessionSummary = {
	id: string;
	title: string;
	updatedAt: number;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps<{
	fixedEntries: readonly FixedEntry[];
	sidebarProjects: SessionProjectView[];
	sortedWorkspaceSessions: SessionSummary[];
	inboxCount: number;
	notificationCount: number;
	expandedProjectIds: Set<string>;
	showAllProjectSessionIds: Set<string>;
}>();

const emit = defineEmits<{
	(e: "fixed-entry-click", entry: FixedEntry): void;
	(e: "open-project-registration"): void;
	(e: "open-device-settings"): void;
	(e: "toggle-project-expand", projectId: string): void;
	(e: "open-project-home", project: SessionProjectView): void;
	(e: "open-project-session", sessionId: string): void;
	(e: "toggle-show-all-sessions", projectId: string): void;
	(e: "open-session", sessionId: string): void;
	(e: "open-archived"): void;
}>();

function isProjectOffline(project: SessionProjectView): boolean {
	return !project.isOnline;
}

function isProjectArchived(project: SessionProjectView): boolean {
	return !!project.archivedAt;
}

function getRecentProjectSessions(project: SessionProjectView, limit: number) {
	return project.sessions
		.filter((s) => !s.archived)
		.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
		.slice(0, limit);
}
</script>

<template>
	<aside class="flex w-[260px] shrink-0 flex-col border-r border-default bg-background">
		<!-- 固定视图入口 -->
		<div class="shrink-0 space-y-0.5 px-2 pt-3 pb-2">
			<button
				v-for="entry in fixedEntries"
				:key="entry.id"
				data-test="workspace-fixed-entry"
				type="button"
				class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-body text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
				@click="emit('fixed-entry-click', entry)"
			>
				<component :is="entry.icon" class="size-4" />
				<span class="flex-1">{{ entry.label }}</span>
				<Badge v-if="entry.id === 'moments' && inboxCount > 0" variant="secondary" class="h-4 min-w-4 px-1 text-micro">
					{{ inboxCount }}
				</Badge>
				<Badge v-else-if="entry.id === 'notifications' && notificationCount > 0" variant="secondary" class="h-4 min-w-4 px-1 text-micro">
					{{ notificationCount }}
				</Badge>
			</button>
		</div>

		<Separator class="mx-3" />

		<!-- 工作空间会话 -->
		<div class="max-h-[34vh] shrink-0 overflow-y-auto px-2 py-2">
			<div class="px-2.5 pb-1 text-caption font-medium text-muted-foreground">工作空间会话</div>
			<div v-if="sortedWorkspaceSessions.length === 0" class="px-2.5 py-3 text-body-sm text-muted-foreground">
				暂无会话
			</div>
			<button
				v-for="session in sortedWorkspaceSessions"
				:key="session.id"
				type="button"
				class="flex w-full min-w-0 items-center rounded-md px-2.5 py-1.5 text-left text-body-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
				@click="emit('open-session', session.id)"
			>
				<span class="truncate">{{ session.title || '未命名会话' }}</span>
			</button>
		</div>

		<Separator class="mx-3" />

		<!-- 项目列表 -->
		<div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
			<div class="flex items-center justify-between px-2.5 pb-1">
				<div class="text-caption font-medium text-muted-foreground">项目</div>
				<div class="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger as-child>
							<button
								type="button"
								data-test="sidebar-add-project"
								class="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
								@click="emit('open-project-registration')"
							>
								<Plus class="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">添加项目</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger as-child>
							<button
								type="button"
								data-test="sidebar-open-devices"
								class="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
								@click="emit('open-device-settings')"
							>
								<Monitor class="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">设备</TooltipContent>
					</Tooltip>
				</div>
			</div>
			<div v-if="sidebarProjects.length === 0" class="px-2.5 py-3 text-body-sm text-muted-foreground">
				暂无项目
			</div>
			<div
				v-for="project in sidebarProjects"
				:key="project.id"
				class="mb-1"
				:data-test="'project-item-' + project.id"
			>
				<div class="flex w-full items-center gap-1 rounded-md px-2.5 py-1.5 text-body-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground">
					<button
						type="button"
						class="flex flex-1 items-center gap-1 text-left min-w-0"
						@click="emit('toggle-project-expand', project.id)"
					>
						<component
							:is="expandedProjectIds.has(project.id) ? ChevronDown : ChevronRight"
							class="size-3.5 shrink-0"
						/>
						<span class="truncate" data-test="project-label">{{ project.label }}</span>
						<span class="truncate text-micro text-muted-foreground/70" data-test="project-path">{{ project.pathLabel || project.projectRoot }}</span>
						<span
							v-if="project.deviceName"
							class="ml-1 rounded px-1 py-0.5 text-micro bg-muted text-muted-foreground"
							data-test="project-device"
						>
							{{ project.deviceName }}
						</span>
						<span
							class="ml-1 rounded px-1 py-0.5 text-micro bg-muted text-muted-foreground"
							data-test="project-type"
						>
							{{
								project.projectType === 'workspace'
									? '工作空间'
									: project.projectType === 'external'
										? '外部仓库'
										: '项目'
							}}
						</span>
						<span
							v-if="project.externalOrigin"
							class="ml-1 rounded px-1 py-0.5 text-micro bg-muted text-muted-foreground"
							data-test="project-source"
						>
							{{ project.externalOrigin === 'github' ? 'GitHub' : '本地文件夹' }}
						</span>
						<span
							v-if="project.isGit"
							class="ml-1 rounded px-1 py-0.5 text-micro bg-muted text-muted-foreground"
							data-test="project-git"
						>
							Git
						</span>
						<span
							v-if="!project.isOnline"
							class="ml-1 rounded px-1 py-0.5 text-micro bg-muted text-muted-foreground"
							data-test="project-offline"
						>
							离线
						</span>
						<span
							v-else-if="project.archivedAt"
							class="ml-1 rounded px-1 py-0.5 text-micro bg-muted text-muted-foreground"
							data-test="project-archived"
						>
							归档
						</span>
					</button>
					<button
						v-if="project.isOnline && !project.archivedAt"
						type="button"
						class="shrink-0 rounded p-0.5 hover:bg-accent/60"
						data-test="project-new-session"
						@click="emit('open-project-home', project)"
					>
						<Plus class="size-3.5" />
					</button>
				</div>
				<!-- 项目会话 -->
				<div v-if="expandedProjectIds.has(project.id) && !isProjectOffline(project) && !isProjectArchived(project)" class="ml-4 space-y-0.5">
					<button
						v-for="session in (showAllProjectSessionIds.has(project.id) ? project.sessions.filter(s => !s.archived).sort((a,b) => b.updatedAt - a.updatedAt) : getRecentProjectSessions(project, 3))"
						:key="session.id"
						type="button"
						class="flex w-full min-w-0 items-center rounded-md px-2.5 py-1 text-left text-body-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
						@click="emit('open-project-session', session.id)"
					>
						<span class="truncate">{{ session.title || '未命名会话' }}</span>
					</button>
					<button
						v-if="project.sessions.filter(s => !s.archived).length > 3"
						type="button"
						class="flex w-full items-center rounded-md px-2.5 py-1 text-left text-caption text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
						data-test="project-toggle-more"
						@click="emit('toggle-show-all-sessions', project.id)"
					>
						<span class="truncate">{{ showAllProjectSessionIds.has(project.id) ? '收起' : '展开更多' }}</span>
					</button>
				</div>
			</div>
		</div>

		<Separator class="mx-3" />

		<!-- 归档入口 -->
		<div class="shrink-0 px-2 py-2">
			<button
				type="button"
				data-test="workspace-archived-entry"
				class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-body text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
				@click="emit('open-archived')"
			>
				<Archive class="size-4" />
				<span class="flex-1">归档</span>
			</button>
		</div>
	</aside>
</template>
