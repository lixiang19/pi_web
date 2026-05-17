import {
	AuthStorage,
	getAgentDir,
	ModelRegistry,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";

import path from "node:path";

export const getPiDefaultAgentDir = (): string => getAgentDir();

export const getPiDefaultAuthPath = (): string =>
	path.join(getPiDefaultAgentDir(), "auth.json");

export const getPiDefaultModelsPath = (): string =>
	path.join(getPiDefaultAgentDir(), "models.json");

export const createPiDefaultAuthStorage = (): AuthStorage =>
	AuthStorage.create(getPiDefaultAuthPath());

export const createPiDefaultModelRegistry = (
	authStorage: AuthStorage,
): ModelRegistry => ModelRegistry.create(authStorage, getPiDefaultModelsPath());

export const createPiDefaultSettingsManager = (
	cwd: string,
): SettingsManager => SettingsManager.create(cwd, getPiDefaultAgentDir());
