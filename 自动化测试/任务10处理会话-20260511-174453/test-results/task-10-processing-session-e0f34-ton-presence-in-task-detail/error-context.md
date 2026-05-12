# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: task-10-processing-session.spec.ts >> task-10 processing session button presence in task detail
- Location: e2e/task-10-processing-session.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: '开始处理' })
Expected: visible
Timeout: 2000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 2000ms
  - waiting for getByRole('button', { name: '开始处理' })

```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - generic:
        - complementary:
          - generic:
            - button:
              - img
              - generic: 闪念
            - button:
              - img
              - generic: 搜索
            - button:
              - img
              - generic: 通知
            - button:
              - img
              - generic: 任务
            - button:
              - img
              - generic: 文件
            - button:
              - img
              - generic: 终端
            - button:
              - img
              - generic: 自动化
            - button:
              - img
              - generic: Skill
            - button:
              - img
              - generic: 设置
          - generic:
            - generic: 项目
            - generic:
              - generic:
                - button:
                  - img
                  - generic: AuroraPlatformWeb
                  - generic: /Users/lixiang/Documents/myCode/AuroraPlatformWeb
                  - generic: 外部
                  - generic: 服务器文件夹
                  - generic: 离线
            - generic:
              - generic:
                - button:
                  - img
                  - generic: openchamber
                  - generic: /Users/lixiang/Documents/myCode/openchamber
                  - generic: 外部
                  - generic: 服务器文件夹
                  - generic: 离线
          - generic:
            - generic:
              - button:
                - img
                - text: 新建
              - button:
                - img
                - text: 文件夹
              - button:
                - img
                - text: Canvas
              - button:
                - img
                - text: Base
          - generic:
            - generic:
              - generic:
                - tablist:
                  - tab [selected]:
                    - img
                  - tab:
                    - img
                  - tab:
                    - img
                  - tab:
                    - img
                - generic:
                  - button:
                    - img
          - generic:
            - button:
              - img
              - generic: 归档
        - main:
          - generic:
            - generic [ref=e2]:
              - generic [ref=e3]:
                - generic [ref=e4] [cursor=pointer]:
                  - generic [ref=e5]: 主页
                  - button [ref=e6]:
                    - img [ref=e7]
                - generic [ref=e10] [cursor=pointer]:
                  - generic [ref=e12]: 任务
                  - button [ref=e13]:
                    - img [ref=e14]
              - button [ref=e17]:
                - img [ref=e18]
            - generic:
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - generic:
                        - heading [level=2]: 任务
                        - paragraph: 待处理 1 · 进行中 0 · 阻塞 0 · 审核中 0 · 完成 0
                      - generic:
                        - generic: 项目筛选
                        - combobox:
                          - generic: 全部项目
                          - img
                        - textbox:
                          - /placeholder: 任务标题
                        - textbox:
                          - /placeholder: 完成标准（必填）
                        - combobox:
                          - generic: 普通
                          - img
                        - combobox:
                          - generic: 里程碑
                          - img
                        - combobox:
                          - generic: 继承里程碑
                          - img
                        - textbox
                        - button [disabled]:
                          - img
                          - text: 新建任务
                    - generic:
                      - generic:
                        - tablist:
                          - tab [selected]: 看板
                          - tab: 列表
                          - tab: 日历
                          - tab: 里程碑
                      - tabpanel:
                        - generic:
                          - generic: 里程碑筛选
                          - combobox:
                            - generic: 全部里程碑
                            - img
                        - generic:
                          - generic:
                            - generic:
                              - heading [level=3]: 待处理
                              - generic: "1"
                            - generic:
                              - button:
                                - generic:
                                  - paragraph: 验收测试任务-10-1778492933884
                                  - generic: 普通
                                - paragraph: 验证任务10处理会话功能
                                - paragraph: 无项目
                                - paragraph: 无截止日期
                          - generic:
                            - generic:
                              - heading [level=3]: 进行中
                              - generic: "0"
                          - generic:
                            - generic:
                              - heading [level=3]: 阻塞
                              - generic: "0"
                          - generic:
                            - generic:
                              - heading [level=3]: 审核中
                              - generic: "0"
                          - generic:
                            - generic:
                              - heading [level=3]: 完成
                              - generic: "0"
    - generic:
      - button:
        - img
    - region "Notifications alt+T":
      - list:
        - listitem:
          - button "Close toast":
            - img
          - generic:
            - img
          - generic:
            - generic: 任务已创建
  - dialog "验收测试任务-10-1778492933884" [ref=e20]:
    - generic [ref=e21]:
      - heading "验收测试任务-10-1778492933884" [level=2] [ref=e23]
      - generic [ref=e24]:
        - textbox "标题" [active] [ref=e25]: 验收测试任务-10-1778492933884
        - textbox "完成标准" [ref=e26]: 验证任务10处理会话功能
        - combobox [ref=e27]:
          - generic: 待处理
          - img
        - combobox [ref=e28]:
          - generic: 普通
          - img
        - combobox [ref=e29]:
          - img
        - combobox [ref=e30]:
          - generic: 无项目
          - img
        - textbox [ref=e31]
        - textbox "阻塞原因（可选）" [ref=e32]
      - paragraph [ref=e33]: 当前里程碑：未知 · 项目：无项目
      - generic [ref=e34]:
        - button "保存" [ref=e35]
        - button "删除" [ref=e36]:
          - img
          - text: 删除
    - button "Close" [ref=e37]:
      - img [ref=e38]
      - generic [ref=e41]: Close
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test("task-10 processing session button presence in task detail", async ({ page }) => {
  4  | 	const uniqueTitle = `验收测试任务-10-${Date.now()}`;
  5  | 
  6  | 	await page.goto("/");
  7  | 
  8  | 	// Login with default password
  9  | 	await page.getByRole("textbox", { name: "密码" }).fill("ridge-admin");
  10 | 	await page.getByRole("textbox", { name: "密码" }).press("Enter");
  11 | 
  12 | 	// Wait for navigation to complete after login
  13 | 	await page.waitForURL("/", { timeout: 10000 });
  14 | 
  15 | 	// Navigate to tasks page
  16 | 	await page.getByRole("button", { name: "任务", exact: true }).click();
  17 | 
  18 | 	// Wait for tasks page to load
  19 | 	await expect(page.getByRole("heading", { name: "任务", level: 2 })).toBeVisible();
  20 | 
  21 | 	// Create a new task
  22 | 	await page.getByRole("textbox", { name: "任务标题" }).fill(uniqueTitle);
  23 | 	await page
  24 | 		.getByRole("textbox", { name: "完成标准（必填）" })
  25 | 		.fill("验证任务10处理会话功能");
  26 | 
  27 | 	await page.getByRole("button", { name: "新建任务" }).click();
  28 | 
  29 | 	// Wait for task to appear in kanban
  30 | 	await expect(
  31 | 		page.getByRole("button", { name: new RegExp(uniqueTitle) }),
  32 | 	).toBeVisible({ timeout: 5000 });
  33 | 
  34 | 	// Click on the task card to open detail
  35 | 	await page.getByRole("button", { name: new RegExp(uniqueTitle) }).click();
  36 | 
  37 | 	// Verify the detail dialog is open
  38 | 	await expect(
  39 | 		page.getByRole("dialog", { name: uniqueTitle }),
  40 | 	).toBeVisible({ timeout: 5000 });
  41 | 
  42 | 	// Scroll dialog to bottom to ensure all content is visible
  43 | 	await page.evaluate(() => {
  44 | 		const dialog = document.querySelector('[role="dialog"]');
  45 | 		if (dialog) {
  46 | 			dialog.scrollTop = dialog.scrollHeight;
  47 | 		}
  48 | 	});
  49 | 
  50 | 	// Verify "开始处理" button is present
  51 | 	const startProcessingBtn = page.getByRole("button", { name: "开始处理" });
> 52 | 	await expect(startProcessingBtn).toBeVisible({ timeout: 2000 });
     |                                   ^ Error: expect(locator).toBeVisible() failed
  53 | 
  54 | 	// Click "开始处理" button
  55 | 	await startProcessingBtn.click();
  56 | 
  57 | 	// Wait for a session tab to be opened (or a toast/error)
  58 | 	// The button click should trigger openProcessingSession
  59 | 	// which emits openSession event to WorkspacePage
  60 | 	await expect(
  61 | 		page.getByRole("button", { name: /继续处理/ }),
  62 | 	).toBeVisible({ timeout: 5000 });
  63 | });
  64 | 
```