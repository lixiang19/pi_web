use std::process::Command;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri::State;

struct AppState {
    server_online: Mutex<bool>,
    authenticated: Mutex<bool>,
}

#[tauri::command]
fn set_desktop_status(
    online: bool,
    authenticated: bool,
    state: State<AppState>,
) {
    if let Ok(mut guard) = state.server_online.lock() {
        *guard = online;
    }
    if let Ok(mut guard) = state.authenticated.lock() {
        *guard = authenticated;
    }
}

/// 读取系统浏览器当前标签 URL + 标题 + 选中文本
/// 通过 System Events 检测前台应用，只查询当前前台浏览器，
/// 支持 Safari、Chrome、Edge、Firefox。
/// 返回 (url, title, selectedText)。
/// AppleScript 将每个字段 base64 编码后用 tab 分隔，实现完全无损传输。
#[tauri::command]
fn capture_browser_url() -> Result<(String, String, String), String> {
    let script = r#"
use AppleScript version "2.4"
use scripting additions

-- base64 编码辅助函数
on encodeBase64(s)
    return do shell script "printf '%s' " & quoted form of s & " | base64"
end encodeBase64

-- 1. 检测前台应用
set frontApp to ""
try
    tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
    end tell
end try

if frontApp is "" then
    return ""
end if

set browserName to frontApp
set pageUrl to ""
set pageTitle to ""
set selectedText to ""

-- 2. 只查询当前前台浏览器
if browserName is "Safari" then
    tell application "Safari"
        if it is running then
            try
                set currentTab to current tab of front window
                set pageUrl to URL of currentTab
                set pageTitle to name of currentTab
                set selectedText to (do JavaScript "window.getSelection().toString()" in currentTab)
            on error
                -- 窗口不存在
            end try
        end if
    end tell
else if browserName is "Google Chrome" then
    tell application "Google Chrome"
        if it is running then
            try
                set currentTab to active tab of front window
                set pageUrl to URL of currentTab
                set pageTitle to title of currentTab
                set selectedText to (execute currentTab javascript "window.getSelection().toString()")
            on error
                -- 窗口不存在
            end try
        end if
    end tell
else if browserName is "Microsoft Edge" then
    tell application "Microsoft Edge"
        if it is running then
            try
                set currentTab to active tab of front window
                set pageUrl to URL of currentTab
                set pageTitle to title of currentTab
                set selectedText to (execute currentTab javascript "window.getSelection().toString()")
            on error
                -- 窗口不存在
            end try
        end if
    end tell
else if browserName is "Firefox" then
    tell application "Firefox"
        if it is running then
            try
                set pageUrl to URL of front document
                set pageTitle to name of front document
            on error
                -- Firefox AppleScript 支持有限
            end try
        end if
    end tell
end if

-- 3. 每个字段 base64 编码后用 tab 分隔，实现完全无损
set outStr to encodeBase64(browserName) & tab & encodeBase64(pageUrl) & tab & encodeBase64(pageTitle) & tab & encodeBase64(selectedText)
return outStr
"#;

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("无法执行 AppleScript: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("AppleScript 执行失败: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_browser_url_output(&stdout)
}

/// 读取系统剪贴板（通过 pbpaste 确保是系统级剪贴板）
#[tauri::command]
fn capture_clipboard() -> Result<String, String> {
    let output = Command::new("pbpaste")
        .output()
        .map_err(|e| format!("无法读取剪贴板: {}", e))?;

    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        if text.trim().is_empty() {
            Err("剪贴板为空".to_string())
        } else {
            Ok(text.to_string())
        }
    } else {
        Err("无法读取剪贴板".to_string())
    }
}

/// 生成一个随机的标记文本，用于确认剪贴板是否真实变化
fn generate_sentinel() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("__ridge_sentinel_{}__", now)
}

/// 读取当前选区文本
/// 1. 保存旧剪贴板（仅文本）
/// 2. 写入唯一标记到剪贴板（确认 pbcopy 通路正常）
/// 3. 发送 Cmd+C 复制当前选区
/// 4. 读取新剪贴板
/// 5. 如果新剪贴板仍然是标记 → 前台应用没有可复制的选区
/// 6. 恢复旧剪贴板并验证恢复成功
#[tauri::command]
fn capture_selection() -> Result<String, String> {
    // 1. 保存旧剪贴板
    let old_clipboard = Command::new("pbpaste")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).to_string())
            } else {
                None
            }
        });

    // 2. 写入唯一标记，确认通路正常
    let sentinel = generate_sentinel();
    let _ = Command::new("sh")
        .arg("-c")
        .arg(format!("printf '%s' '{}' | pbcopy", shell_escape(&sentinel)))
        .output();

    // 3. 发送 Cmd+C
    let copy_script = r#"
tell application "System Events"
    keystroke "c" using command down
end tell
"#;
    let _ = Command::new("osascript")
        .arg("-e")
        .arg(copy_script)
        .output();

    // 4. 等待剪贴板变更（前台应用响应需要时间）
    std::thread::sleep(std::time::Duration::from_millis(400));

    // 5. 读取新剪贴板
    let output = Command::new("pbpaste")
        .output()
        .map_err(|e| format!("无法读取选区: {}", e))?;

    let selected = if output.status.success() {
        String::from_utf8_lossy(&output.stdout).to_string()
    } else {
        String::new()
    };

    // 6. 恢复旧剪贴板
    let mut restore_ok = true;
    if let Some(ref old) = old_clipboard {
        let escaped = shell_escape(old);
        let _restore_result = Command::new("sh")
            .arg("-c")
            .arg(format!("printf '%s' '{}' | pbcopy", escaped))
            .output();
        // 验证恢复：等待后再次读取
        std::thread::sleep(std::time::Duration::from_millis(100));
        let verify = Command::new("pbpaste").output();
        if let Ok(v) = verify {
            if v.status.success() {
                let current = String::from_utf8_lossy(&v.stdout).to_string();
                if current != *old {
                    restore_ok = false;
                }
            }
        }
    }

    // 7. 判断
    if selected.trim().is_empty() {
        return Err("未检测到选区文本".to_string());
    }
    if selected.trim() == sentinel {
        return Err("前台应用没有可复制的选区".to_string());
    }
    if !restore_ok {
        return Err("选区采集成功，但剪贴板恢复可能不完全".to_string());
    }
    Ok(selected)
}

/// 将字符串中的特殊字符转义，用于 printf 参数
fn shell_escape(s: &str) -> String {
    s.replace("'", "'\"'\"'")
}

/// 将浏览器 AppleScript 的 base64+tab 编码输出解析为 (url, title, selectedText)
fn parse_browser_url_output(stdout: &str) -> Result<(String, String, String), String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err("未检测到前台浏览器".to_string());
    }
    let parts: Vec<&str> = trimmed.split('\t').collect();
    if parts.len() < 2 {
        return Err(format!("浏览器输出解析异常: {}", trimmed));
    }

    let browser = decode_base64(parts[0]).unwrap_or_default();
    let url = decode_base64(parts[1]).unwrap_or_default();
    let title = parts.get(2).and_then(|p| decode_base64(p)).unwrap_or_default();
    let selected = parts.get(3).and_then(|p| decode_base64(p)).unwrap_or_default();

    if url.is_empty() {
        return Err(format!("无法从 {} 获取网址", browser));
    }
    Ok((url, title, selected))
}

/// 解码 base64 字符串，返回 UTF-8 文本
fn decode_base64(s: &str) -> Option<String> {
    use base64::Engine;
    let s = s.trim();
    if s.is_empty() {
        return Some(String::new());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(s).ok()?;
    String::from_utf8(bytes).ok()
}

/// 读取文件内容为 Vec<u8>
fn read_file_bytes(path: &str) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| format!("无法读取文件: {}", e))
}

/// 交互式区域截图（screencapture -i）
/// 返回 PNG 二进制数据
#[tauri::command]
fn capture_screenshot_region() -> Result<Vec<u8>, String> {
    let temp_path = format!("/tmp/ridge-screenshot-{}.png", std::process::id());

    let output = Command::new("screencapture")
        .arg("-i")
        .arg("-s")
        .arg("-x")
        .arg("-o")
        .arg(&temp_path)
        .output()
        .map_err(|e| format!("无法启动截图: {}", e))?;

    if !output.status.success() || !std::path::Path::new(&temp_path).exists() {
        return Err("截图被取消或失败".to_string());
    }

    let bytes = read_file_bytes(&temp_path)?;
    let _ = std::fs::remove_file(&temp_path);
    Ok(bytes)
}

/// 窗口截图
#[tauri::command]
fn capture_screenshot_window() -> Result<Vec<u8>, String> {
    let temp_path = format!("/tmp/ridge-screenshot-window-{}.png", std::process::id());

    let output = Command::new("screencapture")
        .arg("-i")
        .arg("-w")
        .arg("-x")
        .arg("-o")
        .arg(&temp_path)
        .output()
        .map_err(|e| format!("无法启动截图: {}", e))?;

    if !output.status.success() || !std::path::Path::new(&temp_path).exists() {
        return Err("截图被取消或失败".to_string());
    }

    let bytes = read_file_bytes(&temp_path)?;
    let _ = std::fs::remove_file(&temp_path);
    Ok(bytes)
}

/// 全屏截图
#[tauri::command]
fn capture_screenshot_fullscreen() -> Result<Vec<u8>, String> {
    let temp_path = format!("/tmp/ridge-screenshot-fullscreen-{}.png", std::process::id());

    let output = Command::new("screencapture")
        .arg("-x")
        .arg("-o")
        .arg(&temp_path)
        .output()
        .map_err(|e| format!("无法启动截图: {}", e))?;

    if !output.status.success() || !std::path::Path::new(&temp_path).exists() {
        return Err("截图失败".to_string());
    }

    let bytes = read_file_bytes(&temp_path)?;
    let _ = std::fs::remove_file(&temp_path);
    Ok(bytes)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            server_online: Mutex::new(true),
            authenticated: Mutex::new(false),
        })
        .setup(|app| {
            let handle = app.handle();

            // 创建采集子菜单
            let capture_text = MenuItem::with_id(handle, "capture_text", "文字", true, None::<&str>)?;
            let capture_clipboard = MenuItem::with_id(handle, "capture_clipboard", "剪贴板", true, None::<&str>)?;
            let capture_screenshot_region = MenuItem::with_id(handle, "capture_screenshot_region", "区域截图", true, None::<&str>)?;
            let capture_screenshot_window = MenuItem::with_id(handle, "capture_screenshot_window", "窗口截图", true, None::<&str>)?;
            let capture_screenshot_fullscreen = MenuItem::with_id(handle, "capture_screenshot_fullscreen", "全屏截图", true, None::<&str>)?;
            let capture_file = MenuItem::with_id(handle, "capture_file", "文件", true, None::<&str>)?;
            let capture_selection = MenuItem::with_id(handle, "capture_selection", "当前选区", true, None::<&str>)?;
            let capture_browser_url = MenuItem::with_id(handle, "capture_browser_url", "浏览器网址", true, None::<&str>)?;
            let capture_audio = MenuItem::with_id(handle, "capture_audio", "录音", true, None::<&str>)?;

            let capture_menu = Submenu::with_items(
                handle,
                "闪念采集",
                true,
                &[
                    &capture_text,
                    &capture_clipboard,
                    &capture_screenshot_region,
                    &capture_screenshot_window,
                    &capture_screenshot_fullscreen,
                    &capture_file,
                    &capture_selection,
                    &capture_browser_url,
                    &capture_audio,
                ],
            )?;

            // 创建应用菜单（macOS menubar）
            let app_menu = Menu::with_items(
                handle,
                &[
                    &PredefinedMenuItem::about(handle, None, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &capture_menu,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;
            app.set_menu(app_menu)?;

            // 创建系统托盘
            let tray_menu = Menu::with_items(
                handle,
                &[
                    &capture_text,
                    &capture_clipboard,
                    &capture_screenshot_region,
                    &capture_screenshot_window,
                    &capture_screenshot_fullscreen,
                    &capture_file,
                    &capture_selection,
                    &capture_browser_url,
                    &capture_audio,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;

            let app_handle = handle.clone();
            TrayIconBuilder::with_id("main-tray")
                .menu(&tray_menu)
                .show_menu_on_left_click(true)
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click { button_state, button, .. } = event {
                        if button == MouseButton::Left && button_state == MouseButtonState::Up {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // 菜单事件处理
            handle.on_menu_event(move |app, event| {
                let state: State<AppState> = app.state();
                let online = state.server_online.lock().map(|g| *g).unwrap_or(true);
                let authenticated = state.authenticated.lock().map(|g| *g).unwrap_or(false);

                let id = event.id.as_ref();
                let window = match app.get_webview_window("main") {
                    Some(w) => w,
                    None => return,
                };

                // 未登录或离线时向前端发送错误提示
                if !authenticated {
                    let _ = window.eval(r#"window.dispatchEvent(new CustomEvent('ridge:desktop-error', { detail: { message: '桌面端未登录服务器' } }))"#);
                    let _ = window.show();
                    let _ = window.set_focus();
                    return;
                }
                if !online {
                    let _ = window.eval(r#"window.dispatchEvent(new CustomEvent('ridge:desktop-error', { detail: { message: '服务器离线，采集不可用' } }))"#);
                    let _ = window.show();
                    let _ = window.set_focus();
                    return;
                }

                let js_payload = match id {
                    "capture_text" => r#"window.dispatchEvent(new CustomEvent('ridge:capture-desktop', { detail: { type: 'text' } }))"#,
                    "capture_clipboard" => r#"window.dispatchEvent(new CustomEvent('ridge:capture-desktop', { detail: { type: 'clipboard' } }))"#,
                    "capture_screenshot_region" => r#"window.dispatchEvent(new CustomEvent('ridge:capture-desktop', { detail: { type: 'screenshot_region' } }))"#,
                    "capture_screenshot_window" => r#"window.dispatchEvent(new CustomEvent('ridge:capture-desktop', { detail: { type: 'screenshot_window' } }))"#,
                    "capture_screenshot_fullscreen" => r#"window.dispatchEvent(new CustomEvent('ridge:capture-desktop', { detail: { type: 'screenshot_fullscreen' } }))"#,
                    "capture_file" => r#"window.dispatchEvent(new CustomEvent('ridge:capture-desktop', { detail: { type: 'file' } }))"#,
                    "capture_selection" => r#"window.dispatchEvent(new CustomEvent('ridge:capture-desktop', { detail: { type: 'selection' } }))"#,
                    "capture_browser_url" => r#"window.dispatchEvent(new CustomEvent('ridge:capture-desktop', { detail: { type: 'browser_url' } }))"#,
                    "capture_audio" => r#"window.dispatchEvent(new CustomEvent('ridge:capture-desktop', { detail: { type: 'audio' } }))"#,
                    _ => return,
                };

                let _ = window.eval(js_payload);
                let _ = window.show();
                let _ = window.set_focus();
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_desktop_status,
            capture_browser_url,
            capture_clipboard,
            capture_selection,
            capture_screenshot_region,
            capture_screenshot_window,
            capture_screenshot_fullscreen,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b64(s: &str) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(s)
    }

    #[test]
    fn parse_browser_url_output_normal() {
        let out = format!("{}\t{}\t{}\t{}", b64("Safari"), b64("https://example.com"), b64("Example Page"), b64("selected text"));
        let result = parse_browser_url_output(&out).unwrap();
        assert_eq!(result.0, "https://example.com");
        assert_eq!(result.1, "Example Page");
        assert_eq!(result.2, "selected text");
    }

    #[test]
    fn parse_browser_url_output_with_commas() {
        let out = format!("{}\t{}\t{}\t{}", b64("Google Chrome"), b64("https://openai.com"), b64("OpenAI, ChatGPT, AI Tools"), b64("Hello, world!"));
        let result = parse_browser_url_output(&out).unwrap();
        assert_eq!(result.0, "https://openai.com");
        assert_eq!(result.1, "OpenAI, ChatGPT, AI Tools");
        assert_eq!(result.2, "Hello, world!");
    }

    #[test]
    fn parse_browser_url_output_with_tabs_in_title() {
        // base64 编码后，tab 不会再破坏分隔
        let out = format!("{}\t{}\t{}\t{}", b64("Safari"), b64("https://site.com"), b64("Title with\ttab\tmore text"), b64("any\tselected"));
        let result = parse_browser_url_output(&out).unwrap();
        assert_eq!(result.0, "https://site.com");
        assert_eq!(result.1, "Title with\ttab\tmore text");
        assert_eq!(result.2, "any\tselected");
    }

    #[test]
    fn parse_browser_url_output_empty_fails() {
        let result = parse_browser_url_output("");
        assert!(result.is_err());
    }

    #[test]
    fn parse_browser_url_output_missing_url_fails() {
        let out = format!("{}\t{}\t{}\t{}", b64("Safari"), b64(""), b64("No URL"), b64(""));
        let result = parse_browser_url_output(&out);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Safari"));
    }

    #[test]
    fn parse_browser_url_output_no_extra_fields() {
        let out = format!("{}\t{}", b64("Safari"), b64("https://example.com"));
        let result = parse_browser_url_output(&out).unwrap();
        assert_eq!(result.0, "https://example.com");
        assert_eq!(result.1, "");
        assert_eq!(result.2, "");
    }

    #[test]
    fn shell_escape_normal() {
        assert_eq!(shell_escape("hello"), "hello");
    }

    #[test]
    fn shell_escape_single_quote() {
        assert_eq!(shell_escape("it's"), "it'\"'\"'s");
    }

    #[test]
    fn shell_escape_multiple_quotes() {
        assert_eq!(shell_escape("don't 'do' it"), "don'\"'\"'t '\"'\"'do'\"'\"' it");
    }

    #[test]
    fn generate_sentinel_is_unique() {
        let s1 = generate_sentinel();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let s2 = generate_sentinel();
        assert_ne!(s1, s2);
        assert!(s1.starts_with("__ridge_sentinel_"));
    }

    #[test]
    fn screencapture_binary_exists_and_runnable() {
        // 验证 screencapture 命令可用且能生成 PNG
        let temp_path = format!("/tmp/ridge-test-screenshot-{}.png", std::process::id());
        let output = Command::new("screencapture")
            .arg("-x")
            .arg("-o")
            .arg(&temp_path)
            .output();
        assert!(output.is_ok(), "screencapture 命令无法执行");
        let out = output.unwrap();
        assert!(out.status.success(), "screencapture 执行失败: {}", String::from_utf8_lossy(&out.stderr));
        assert!(std::path::Path::new(&temp_path).exists(), "screencapture 没有生成文件");
        let bytes = std::fs::read(&temp_path).expect("无法读取截图文件");
        assert!(
            bytes.len() > 100,
            "生成的 PNG 文件太小（{} bytes），不是有效截图",
            bytes.len()
        );
        // 验证 PNG 魔数
        assert_eq!(&bytes[0..4], &[0x89, 0x50, 0x4e, 0x47], "文件不是有效的 PNG");
        let _ = std::fs::remove_file(&temp_path);
    }
}
