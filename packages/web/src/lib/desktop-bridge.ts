import { invoke } from "@tauri-apps/api/core";

export function isTauri(): boolean {
	return typeof window !== "undefined" && (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] !== undefined;
}

/**
 * 同步桌面壳的登录/在线状态。
 * 桌面 Rust 端维护 AppState { server_online, authenticated }，
 * 菜单点击时检测这些状态决定是否允许采集。
 * 前端需在登录成功、登出、网络变化时调用此函数保持同步。
 */
export async function syncDesktopStatus(online: boolean, authenticated: boolean): Promise<void> {
	if (!isTauri()) return;
	try {
		await invoke("set_desktop_status", { online, authenticated });
	} catch {
		// 静默失败
	}
}

/** 调用系统级剪贴板采集 */
export async function tauriCaptureClipboard(): Promise<string | null> {
	if (!isTauri()) return null;
	try {
		const text = await invoke<string>("capture_clipboard");
		return text || null;
	} catch {
		return null;
	}
}

/** 调用系统级浏览器网址采集 */
export async function tauriCaptureBrowserUrl(): Promise<{ url: string; title: string; selectedText: string } | null> {
	if (!isTauri()) return null;
	try {
		const result = await invoke<[string, string, string]>("capture_browser_url");
		return { url: result[0], title: result[1], selectedText: result[2] };
	} catch {
		return null;
	}
}

/** 调用系统级选区采集 */
export async function tauriCaptureSelection(): Promise<string | null> {
	if (!isTauri()) return null;
	try {
		const text = await invoke<string>("capture_selection");
		return text || null;
	} catch {
		return null;
	}
}

/** 调用系统级区域截图，返回 PNG 二进制数据 */
export async function tauriCaptureScreenshotRegion(): Promise<Uint8Array | null> {
	if (!isTauri()) return null;
	try {
		const data = await invoke<Uint8Array>("capture_screenshot_region");
		return data;
	} catch {
		return null;
	}
}

/** 调用系统级窗口截图，返回 PNG 二进制数据 */
export async function tauriCaptureScreenshotWindow(): Promise<Uint8Array | null> {
	if (!isTauri()) return null;
	try {
		const data = await invoke<Uint8Array>("capture_screenshot_window");
		return data;
	} catch {
		return null;
	}
}

/** 调用系统级全屏截图，返回 PNG 二进制数据 */
export async function tauriCaptureScreenshotFullscreen(): Promise<Uint8Array | null> {
	if (!isTauri()) return null;
	try {
		const data = await invoke<Uint8Array>("capture_screenshot_fullscreen");
		return data;
	} catch {
		return null;
	}
}
