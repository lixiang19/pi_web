import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const GRAPH_ENTITY_TYPES = [
	"Project",
	"File",
	"Task",
	"Person",
	"Org",
	"Concept",
	"Tech",
	"Source",
	"Decision",
] as const;

export type GraphEntityType = (typeof GRAPH_ENTITY_TYPES)[number];

export interface GraphEntityRef {
	type: GraphEntityType;
	id: string;
}

export interface GraphEntityInput extends GraphEntityRef {
	name: string;
	summary?: string;
	sourcePath: string;
	evidence?: string;
	confidence?: number;
}

export interface GraphRelationInput {
	from: GraphEntityRef;
	to: GraphEntityRef;
	predicate: string;
	sourcePath: string;
	evidence: string;
	confidence?: number;
}

export interface GraphExtraction {
	sourcePath: string;
	entities: GraphEntityInput[];
	relations: GraphRelationInput[];
}

export interface GraphCorrection extends Omit<GraphExtraction, "sourcePath"> {
	correctionText: string;
}

export interface GraphStore {
	upsertExtraction(extraction: GraphExtraction): Promise<void>;
	applyCorrection(correction: GraphCorrection): Promise<void>;
}

export interface GraphDbClient {
	query(statement: string): Promise<unknown[]>;
	execute(statement: string, params: Record<string, unknown>): Promise<unknown[]>;
	close?(): Promise<void> | void;
}

export type GraphDbClientFactory = (dbPath: string) => Promise<GraphDbClient>;

const MAX_EVIDENCE_LENGTH = 80;

const isGraphEntityType = (value: string): value is GraphEntityType =>
	(GRAPH_ENTITY_TYPES as readonly string[]).includes(value);

export function assertGraphEntityType(value: string): GraphEntityType {
	if (!isGraphEntityType(value)) {
		throw new Error(`Unsupported graph entity type: ${value}`);
	}
	return value;
}

export function resolveGraphDbPath(workspaceDir: string): string {
	return path.join(path.resolve(workspaceDir), ".ridge", "graph.kuzu");
}

const normalizeEvidence = (value: string | undefined): string => {
	const text = (value ?? "").replace(/\s+/g, " ").trim();
	if (text.length <= MAX_EVIDENCE_LENGTH) return text;
	return text.slice(0, MAX_EVIDENCE_LENGTH).trimEnd();
};

const normalizeConfidence = (value: number | undefined): number => {
	if (!Number.isFinite(value)) return 0.5;
	return Math.max(0, Math.min(1, Number(value)));
};

const schemaNodeStatement = (type: GraphEntityType): string => `
CREATE NODE TABLE IF NOT EXISTS ${type} (
  id STRING PRIMARY KEY,
  type STRING,
  name STRING,
  summary STRING,
  source_path STRING,
  evidence STRING,
  confidence DOUBLE,
  updated_at INT64
);`.trim();

const relationPairs = (): string =>
	GRAPH_ENTITY_TYPES.flatMap((from) =>
		GRAPH_ENTITY_TYPES.map((to) => `FROM ${from} TO ${to}`),
	).join(", ");

export function buildGraphSchemaStatements(): string[] {
	return [
		...GRAPH_ENTITY_TYPES.map(schemaNodeStatement),
		`
CREATE REL TABLE IF NOT EXISTS EvidenceRelation (
  ${relationPairs()},
  relation_id STRING,
  predicate STRING,
  evidence STRING,
  source_path STRING,
  confidence DOUBLE,
  updated_at INT64
);`.trim(),
	];
}

export async function writeGraphSchemaFile(workspaceDir: string): Promise<void> {
	const graphDir = resolveGraphDbPath(workspaceDir);
	await fs.mkdir(graphDir, { recursive: true });
	await fs.writeFile(
		path.join(graphDir, "schema.cypher"),
		`${buildGraphSchemaStatements().join("\n\n")}\n`,
		"utf-8",
	);
}

type KuzuQueryResult = {
	getAll(): Promise<unknown[]>;
	close?(): void;
};

type KuzuPreparedStatement = unknown;

type KuzuConnection = {
	query(statement: string): Promise<KuzuQueryResult | KuzuQueryResult[]>;
	prepare(statement: string): Promise<KuzuPreparedStatement>;
	execute(
		statement: KuzuPreparedStatement,
		params: Record<string, unknown>,
	): Promise<KuzuQueryResult | KuzuQueryResult[]>;
	close?(): Promise<void> | void;
};

type KuzuModule = {
	Database: new (databasePath: string) => unknown;
	Connection: new (database: unknown, numThreads?: number) => KuzuConnection;
};

async function rowsFromResult(result: KuzuQueryResult | KuzuQueryResult[]): Promise<unknown[]> {
	const results = Array.isArray(result) ? result : [result];
	const rows: unknown[] = [];
	for (const item of results) {
		rows.push(...await item.getAll());
		item.close?.();
	}
	return rows;
}

export const createDefaultKuzuClient: GraphDbClientFactory = async (dbPath) => {
	await fs.mkdir(dbPath, { recursive: true });
	const kuzu = await import("kuzu") as KuzuModule;
	const db = new kuzu.Database(path.join(dbPath, "database.kuzu"));
	const connection = new kuzu.Connection(db);
	return {
		async query(statement: string) {
			return rowsFromResult(await connection.query(statement));
		},
		async execute(statement: string, params: Record<string, unknown>) {
			const prepared = await connection.prepare(statement);
			return rowsFromResult(await connection.execute(prepared, params));
		},
		close: () => connection.close?.(),
	};
};

const entityStatement = (type: GraphEntityType): string => `
MERGE (n:${type} {id: $id})
ON MATCH SET
  n.type = $type,
  n.name = $name,
  n.summary = $summary,
  n.source_path = $sourcePath,
  n.evidence = $evidence,
  n.confidence = $confidence,
  n.updated_at = $updatedAt
ON CREATE SET
  n.type = $type,
  n.name = $name,
  n.summary = $summary,
  n.source_path = $sourcePath,
  n.evidence = $evidence,
  n.confidence = $confidence,
  n.updated_at = $updatedAt`.trim();

const relationStatement = (fromType: GraphEntityType, toType: GraphEntityType): string => `
MATCH (from:${fromType} {id: $fromId}), (to:${toType} {id: $toId})
MERGE (from)-[r:EvidenceRelation {relation_id: $relationId}]->(to)
ON MATCH SET
  r.predicate = $predicate,
  r.evidence = $evidence,
  r.source_path = $sourcePath,
  r.confidence = $confidence,
  r.updated_at = $updatedAt
ON CREATE SET
  r.predicate = $predicate,
  r.evidence = $evidence,
  r.source_path = $sourcePath,
  r.confidence = $confidence,
  r.updated_at = $updatedAt`.trim();

const relationId = (relation: GraphRelationInput): string =>
	crypto
		.createHash("sha256")
		.update([
			relation.from.type,
			relation.from.id,
			relation.predicate,
			relation.to.type,
			relation.to.id,
			relation.sourcePath,
			normalizeEvidence(relation.evidence),
		].join("\0"))
		.digest("hex");

export function createKuzuGraphStore(options: {
	workspaceDir: string;
	clientFactory?: GraphDbClientFactory;
	now?: () => number;
}): GraphStore {
	const clientFactory = options.clientFactory ?? createDefaultKuzuClient;
	const now = options.now ?? (() => Date.now());
	const dbPath = resolveGraphDbPath(options.workspaceDir);

	const withClient = async <T>(fn: (client: GraphDbClient) => Promise<T>): Promise<T> => {
		const client = await clientFactory(dbPath);
		try {
			for (const statement of buildGraphSchemaStatements()) {
				await client.query(statement);
			}
			return await fn(client);
		} finally {
			await client.close?.();
		}
	};

	const upsertEntities = async (
		client: GraphDbClient,
		entities: GraphEntityInput[],
		updatedAt: number,
	) => {
		for (const entity of entities) {
			const type = assertGraphEntityType(entity.type);
			await client.execute(entityStatement(type), {
				id: entity.id,
				type,
				name: entity.name,
				summary: entity.summary ?? "",
				sourcePath: entity.sourcePath,
				evidence: normalizeEvidence(entity.evidence),
				confidence: normalizeConfidence(entity.confidence),
				updatedAt,
			});
		}
	};

	const upsertRelations = async (
		client: GraphDbClient,
		relations: GraphRelationInput[],
		updatedAt: number,
	) => {
		for (const relation of relations) {
			const fromType = assertGraphEntityType(relation.from.type);
			const toType = assertGraphEntityType(relation.to.type);
			await client.execute(relationStatement(fromType, toType), {
				relationId: relationId(relation),
				fromId: relation.from.id,
				toId: relation.to.id,
				predicate: relation.predicate,
				evidence: normalizeEvidence(relation.evidence),
				sourcePath: relation.sourcePath,
				confidence: normalizeConfidence(relation.confidence),
				updatedAt,
			});
		}
	};

	return {
		upsertExtraction: async (extraction) =>
			withClient(async (client) => {
				const updatedAt = now();
				await upsertEntities(client, extraction.entities, updatedAt);
				await upsertRelations(client, extraction.relations, updatedAt);
			}),
		applyCorrection: async (correction) =>
			withClient(async (client) => {
				const updatedAt = now();
				await upsertEntities(client, correction.entities, updatedAt);
				await upsertRelations(client, correction.relations, updatedAt);
			}),
	};
}
