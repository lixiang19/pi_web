/// <reference types="vitest/config" />
import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

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
		port: 5173,
		proxy: {
			"/api": {
				target: "http://127.0.0.1:3000",
				ws: true,
			},
		},
	},
});
