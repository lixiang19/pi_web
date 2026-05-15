import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
	GRAPH_ENTITY_TYPES,
	buildGraphSchemaStatements,
	createDefaultKuzuClient,
	createKuzuGraphStore,
	resolveGraphDbPath,
} from "../graph-store.js";

class FakeGraphClient {
	queries: string[] = [];
	executions: Array<{ statement: string; params: Record<string, unknown> }> = [];

	async query(statement: string) {
		this.queries.push(statement);
		return [];
	}

	async execute(statement: string, params: Record<string, unknown>) {
		this.executions.push({ statement, params });
		return [];
	}

	async close() {
		// no-op test double
	}
}

const cleanupDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		cleanupDirs.splice(0).map((targetPath) =>
			fs.rm(targetPath, { recursive: true, force: true }),
		),
	);
});

describe("Kuzu graph store", () => {
	it("resolves the workspace graph database under .ridge/graph.kuzu", () => {
		expect(resolveGraphDbPath("/tmp/ridge-workspace")).toBe(
			path.join("/tmp/ridge-workspace", ".ridge", "graph.kuzu"),
		);
	});

	it("defines one Kuzu node table per graph entity type and one evidence relation table", () => {
		const statements = buildGraphSchemaStatements();
		for (const type of GRAPH_ENTITY_TYPES) {
			expect(statements).toContainEqual(
				expect.stringContaining(`CREATE NODE TABLE IF NOT EXISTS ${type}`),
			);
			expect(statements).toContainEqual(expect.stringContaining("PRIMARY KEY"));
		}

		const relStatement = statements.find((statement) =>
			statement.startsWith("CREATE REL TABLE IF NOT EXISTS EvidenceRelation"),
		);
		expect(relStatement).toBeDefined();
		expect(relStatement).toContain("evidence STRING");
		expect(relStatement).toContain("source_path STRING");
		expect(relStatement).toContain("confidence DOUBLE");
		expect(relStatement).toContain("updated_at INT64");
		expect(relStatement).toContain("FROM Project TO File");
		expect(relStatement).toContain("FROM Decision TO Tech");
	});

	it("stores extracted entities and relationships with evidence capped to 80 chars", async () => {
		const client = new FakeGraphClient();
		const store = createKuzuGraphStore({
			workspaceDir: "/tmp/ridge-workspace",
			clientFactory: async () => client,
			now: () => 1234,
		});
		const longEvidence =
			"Alpha references README with enough detail that this evidence should be clipped before it reaches Kuzu storage.";

		await store.upsertExtraction({
			sourcePath: "项目/alpha/README.md",
			entities: [
				{
					type: "Project",
					id: "project-alpha",
					name: "Alpha",
					summary: "Internal project",
					sourcePath: "项目/alpha/README.md",
					evidence: "Alpha project evidence",
					confidence: 0.9,
				},
				{
					type: "File",
					id: "file-readme",
					name: "README.md",
					summary: "Project README",
					sourcePath: "项目/alpha/README.md",
					evidence: "README evidence",
					confidence: 0.8,
				},
			],
			relations: [
				{
					from: { type: "Project", id: "project-alpha" },
					to: { type: "File", id: "file-readme" },
					predicate: "HAS_DOCUMENT",
					evidence: longEvidence,
					sourcePath: "项目/alpha/README.md",
					confidence: 0.85,
				},
			],
		});

		expect(client.queries.length).toBeGreaterThan(GRAPH_ENTITY_TYPES.length);
		expect(client.executions).toHaveLength(3);
		expect(client.executions[0]?.statement).toContain("MERGE (n:Project");
		expect(client.executions[0]?.params).toMatchObject({
			id: "project-alpha",
			type: "Project",
			name: "Alpha",
			sourcePath: "项目/alpha/README.md",
			confidence: 0.9,
			updatedAt: 1234,
		});
		expect(client.executions[2]?.statement).toContain("EvidenceRelation");
		expect(client.executions[2]?.params.evidence).toBe(
			longEvidence.slice(0, 80).trimEnd(),
		);
	});

	it("writes and reads a real embedded Kuzu database", async () => {
		const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-kuzu-real-"));
		cleanupDirs.push(workspaceDir);
		const store = createKuzuGraphStore({
			workspaceDir,
			now: () => 2468,
		});

		await store.upsertExtraction({
			sourcePath: "项目/alpha/README.md",
			entities: [
				{
					type: "Project",
					id: "project-real",
					name: "Real Project",
					summary: "Written through native Kuzu",
					sourcePath: "项目/alpha/README.md",
					evidence: "Real Project evidence",
					confidence: 0.95,
				},
			],
			relations: [],
		});

		const client = await createDefaultKuzuClient(resolveGraphDbPath(workspaceDir));
		try {
			const rows = await client.query(
				`MATCH (project:Project {id: "project-real"}) RETURN project.name AS name`,
			);
			expect(rows).toHaveLength(1);
		} finally {
			await client.close?.();
		}
	});

	it("applies natural-language correction output as a graph mutation", async () => {
		const client = new FakeGraphClient();
		const store = createKuzuGraphStore({
			workspaceDir: "/tmp/ridge-workspace",
			clientFactory: async () => client,
			now: () => 5678,
		});

		await store.applyCorrection({
			correctionText: "Alpha is a product, not a person",
			entities: [
				{
					type: "Concept",
					id: "concept-alpha",
					name: "Alpha",
					summary: "Corrected concept",
					sourcePath: "用户纠错",
					evidence: "Alpha is a product, not a person",
					confidence: 1,
				},
			],
			relations: [],
		});

		expect(client.executions).toHaveLength(1);
		expect(client.executions[0]?.statement).toContain("MERGE (n:Concept");
		expect(client.executions[0]?.params).toMatchObject({
			id: "concept-alpha",
			sourcePath: "用户纠错",
			updatedAt: 5678,
		});
	});
});
