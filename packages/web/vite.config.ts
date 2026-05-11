/// <reference types="vitest/config" />
import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const serverPort = process.env.PORT || "3000";
const frontendPort = Number.parseInt(process.env.FRONTEND_PORT || "5175", 10);

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		include: ["src/**/*.{test,spec}.ts"],
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		css: false,
	},
	server: {
		host: true,
		port: frontendPort,
		proxy: {
			"/api": {
				target: `http://127.0.0.1:${serverPort}`,
				ws: true,
			},
		},
	},
});
