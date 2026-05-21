export interface PublicFleetingNote {
	id: unknown;
	content: unknown;
	status: unknown;
	analysisStatus: unknown;
	recommendationType: unknown;
	recommendationText: unknown;
	draft: unknown;
	requiresInput: boolean;
	lastError: unknown;
	retryCount: unknown;
	piSessionId: unknown;
	piSessionFile: unknown;
	createdAt: unknown;
	updatedAt: unknown;
}

export interface FleetingNoteUpdatedEvent {
	type: "fleeting.note.updated";
	note: PublicFleetingNote;
	emittedAt: number;
}

export type FleetingEvent = FleetingNoteUpdatedEvent;
export type FleetingEventListener = (event: FleetingEvent) => void;

export class FleetingEventHub {
	private listeners = new Set<FleetingEventListener>();

	subscribe(listener: FleetingEventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	publish(event: FleetingEvent): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}
}

export const toPublicFleetingNote = (row: Record<string, unknown>): PublicFleetingNote => ({
	id: row.note_id,
	content: row.content,
	status: row.status,
	analysisStatus: row.analysis_status,
	recommendationType: row.recommendation_type,
	recommendationText: row.recommendation_text,
	draft: row.draft,
	requiresInput: row.requires_input === 1,
	lastError: row.last_error,
	retryCount: row.retry_count,
	piSessionId: row.pi_session_id,
	piSessionFile: row.pi_session_file,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export const publishFleetingNoteUpdated = (
	eventHub: FleetingEventHub | undefined,
	row: Record<string, unknown> | undefined,
): void => {
	if (!eventHub || !row) return;
	eventHub.publish({
		type: "fleeting.note.updated",
		note: toPublicFleetingNote(row),
		emittedAt: Date.now(),
	});
};
