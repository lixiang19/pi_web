# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: task18-file-processing-status.spec.ts >> 任务18 — 文件处理状态展示与失败重试 >> index_failed 失败原因可见且可重试
- Location: e2e/task18-file-processing-status.spec.ts:162:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-test=\'file-row\']').filter({ hasText: 'task18-e2e-1778680952954.txt' }).locator('text=待处理')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-test=\'file-row\']').filter({ hasText: 'task18-e2e-1778680952954.txt' }).locator('text=待处理')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - generic [ref=e6]:
        - button "闪念 98" [ref=e7]:
          - img [ref=e8]
          - generic [ref=e11]: 闪念
          - generic [ref=e12]: "98"
        - button "任务" [ref=e13]:
          - img [ref=e14]
          - generic [ref=e17]: 任务
        - button "文件" [ref=e18]:
          - img [ref=e19]
          - generic [ref=e23]: 文件
        - button "终端" [ref=e24]:
          - img [ref=e25]
          - generic [ref=e28]: 终端
        - button "自动化" [ref=e29]:
          - img [ref=e30]
          - generic [ref=e33]: 自动化
        - button "设置" [ref=e34]:
          - img [ref=e35]
          - generic [ref=e38]: 设置
      - generic [ref=e39]:
        - generic [ref=e40]: 项目
        - button "AuroraPlatformWeb /Users/lixiang/Documents/myCode/AuroraPlatformWeb 外部仓库 本地文件夹 Git 离线" [ref=e43]:
          - img [ref=e44]
          - generic [ref=e46]: AuroraPlatformWeb
          - generic [ref=e47]: /Users/lixiang/Documents/myCode/AuroraPlatformWeb
          - generic [ref=e48]: 外部仓库
          - generic [ref=e49]: 本地文件夹
          - generic [ref=e50]: Git
          - generic [ref=e51]: 离线
        - button "openchamber /Users/lixiang/Documents/myCode/openchamber 外部仓库 本地文件夹 离线" [ref=e54]:
          - img [ref=e55]
          - generic [ref=e57]: openchamber
          - generic [ref=e58]: /Users/lixiang/Documents/myCode/openchamber
          - generic [ref=e59]: 外部仓库
          - generic [ref=e60]: 本地文件夹
          - generic [ref=e61]: 离线
      - generic [ref=e62]:
        - generic [ref=e63]: 工作空间会话
        - button "你好" [ref=e64]:
          - generic [ref=e65]: 你好
      - generic [ref=e67]:
        - button "新建" [ref=e68]:
          - img [ref=e69]
          - text: 新建
        - button "文件夹" [ref=e72]:
          - img [ref=e73]
          - text: 文件夹
        - button "Canvas" [ref=e75]:
          - img [ref=e76]
          - text: Canvas
        - button "Base" [ref=e81]:
          - img [ref=e82]
          - text: Base
      - generic [ref=e88]:
        - tablist [ref=e89]:
          - tab [selected] [ref=e90]:
            - img
          - tab [ref=e91]:
            - img
          - tab [ref=e92]:
            - img
          - tab [ref=e93]:
            - img
        - tabpanel [ref=e94]:
          - button [ref=e96]:
            - img [ref=e97]
          - generic [ref=e105]:
            - generic [ref=e107]:
              - button "笔记" [ref=e108]:
                - img [ref=e109]
                - img [ref=e111]
                - generic [ref=e113]: 笔记
              - button [ref=e114]:
                - img [ref=e115]
            - generic [ref=e120]:
              - button "测试" [ref=e121]:
                - img [ref=e122]
                - img [ref=e124]
                - generic [ref=e126]: 测试
              - button [ref=e127]:
                - img [ref=e128]
            - generic [ref=e133]:
              - button "测试文件夹" [ref=e134]:
                - img [ref=e135]
                - img [ref=e137]
                - generic [ref=e139]: 测试文件夹
              - button [ref=e140]:
                - img [ref=e141]
            - generic [ref=e146]:
              - button "附件" [ref=e147]:
                - img [ref=e148]
                - img [ref=e150]
                - generic [ref=e152]: 附件
              - button [ref=e153]:
                - img [ref=e154]
            - generic [ref=e159]:
              - button "记忆" [ref=e160]:
                - img [ref=e161]
                - img [ref=e163]
                - generic [ref=e165]: 记忆
              - button [ref=e166]:
                - img [ref=e167]
            - generic [ref=e172]:
              - button "剪藏" [ref=e173]:
                - img [ref=e174]
                - img [ref=e176]
                - generic [ref=e178]: 剪藏
              - button [ref=e179]:
                - img [ref=e180]
            - generic [ref=e185]:
              - button "空间" [ref=e186]:
                - img [ref=e187]
                - img [ref=e189]
                - generic [ref=e191]: 空间
              - button [ref=e192]:
                - img [ref=e193]
            - generic [ref=e198]:
              - button "日记" [ref=e199]:
                - img [ref=e200]
                - img [ref=e202]
                - generic [ref=e204]: 日记
              - button [ref=e205]:
                - img [ref=e206]
            - generic [ref=e211]:
              - button "收件箱" [ref=e212]:
                - img [ref=e213]
                - img [ref=e215]
                - generic [ref=e217]: 收件箱
              - button [ref=e218]:
                - img [ref=e219]
            - generic [ref=e224]:
              - button "数据库" [ref=e225]:
                - img [ref=e226]
                - img [ref=e228]
                - generic [ref=e230]: 数据库
              - button [ref=e231]:
                - img [ref=e232]
            - generic [ref=e237]:
              - button "未命名文件夹" [ref=e238]:
                - img [ref=e239]
                - img [ref=e241]
                - generic [ref=e243]: 未命名文件夹
              - button [ref=e244]:
                - img [ref=e245]
            - generic [ref=e250]:
              - button "项目" [ref=e251]:
                - img [ref=e252]
                - img [ref=e254]
                - generic [ref=e256]: 项目
              - button [ref=e257]:
                - img [ref=e258]
            - generic [ref=e263]:
              - button "阅读" [ref=e264]:
                - img [ref=e265]
                - img [ref=e267]
                - generic [ref=e269]: 阅读
              - button [ref=e270]:
                - img [ref=e271]
            - generic [ref=e276]:
              - button "canvas" [ref=e277]:
                - img [ref=e278]
                - img [ref=e280]
                - generic [ref=e282]: canvas
              - button [ref=e283]:
                - img [ref=e284]
            - generic [ref=e289]:
              - button "chat" [ref=e290]:
                - img [ref=e291]
                - img [ref=e293]
                - generic [ref=e295]: chat
              - button [ref=e296]:
                - img [ref=e297]
            - generic [ref=e302]:
              - button "Wiki" [ref=e303]:
                - img [ref=e304]
                - img [ref=e306]
                - generic [ref=e308]: Wiki
              - button [ref=e309]:
                - img [ref=e310]
            - generic [ref=e315] [cursor=pointer]:
              - button "未命名4.md" [ref=e316]:
                - img [ref=e317]
                - img [ref=e319]
                - generic [ref=e322]: 未命名4.md
              - button [ref=e323]:
                - img [ref=e324]
            - generic [ref=e329] [cursor=pointer]:
              - button "legacy-1778639136963.db" [ref=e330]:
                - img [ref=e331]
                - img [ref=e333]
                - generic [ref=e336]: legacy-1778639136963.db
              - button [ref=e337]:
                - img [ref=e338]
            - generic [ref=e343] [cursor=pointer]:
              - button "legacy-1778639136963.db-shm" [ref=e344]:
                - img [ref=e345]
                - img [ref=e347]
                - generic [ref=e350]: legacy-1778639136963.db-shm
              - button [ref=e351]:
                - img [ref=e352]
            - generic [ref=e357] [cursor=pointer]:
              - button "legacy-1778639136963.db-wal" [ref=e358]:
                - img [ref=e359]
                - img [ref=e361]
                - generic [ref=e364]: legacy-1778639136963.db-wal
              - button [ref=e365]:
                - img [ref=e366]
            - generic [ref=e371] [cursor=pointer]:
              - button "legacy-1778639170784.db" [ref=e372]:
                - img [ref=e373]
                - img [ref=e375]
                - generic [ref=e378]: legacy-1778639170784.db
              - button [ref=e379]:
                - img [ref=e380]
            - generic [ref=e385] [cursor=pointer]:
              - button "task18-e2e-1778680952954.txt" [ref=e386]:
                - img [ref=e387]
                - img [ref=e389]
                - generic [ref=e392]: task18-e2e-1778680952954.txt
              - button [ref=e393]:
                - img [ref=e394]
            - generic [ref=e399] [cursor=pointer]:
              - button "task18-e2e-test.txt" [ref=e400]:
                - img [ref=e401]
                - img [ref=e403]
                - generic [ref=e406]: task18-e2e-test.txt
              - button [ref=e407]:
                - img [ref=e408]
            - generic [ref=e413] [cursor=pointer]:
              - button "task18-test-file.md" [ref=e414]:
                - img [ref=e415]
                - img [ref=e417]
                - generic [ref=e420]: task18-test-file.md
              - button [ref=e421]:
                - img [ref=e422]
            - generic [ref=e427] [cursor=pointer]:
              - button "task18-upload-test.txt" [ref=e428]:
                - img [ref=e429]
                - img [ref=e431]
                - generic [ref=e434]: task18-upload-test.txt
              - button [ref=e435]:
                - img [ref=e436]
            - generic [ref=e441] [cursor=pointer]:
              - button "task18-verify-1778607856080.txt" [ref=e442]:
                - img [ref=e443]
                - img [ref=e445]
                - generic [ref=e448]: task18-verify-1778607856080.txt
              - button [ref=e449]:
                - img [ref=e450]
            - generic [ref=e455] [cursor=pointer]:
              - button "test-backslash.txt" [ref=e456]:
                - img [ref=e457]
                - img [ref=e459]
                - generic [ref=e462]: test-backslash.txt
              - button [ref=e463]:
                - img [ref=e464]
            - generic [ref=e469] [cursor=pointer]:
              - button "test-posix.txt" [ref=e470]:
                - img [ref=e471]
                - img [ref=e473]
                - generic [ref=e476]: test-posix.txt
              - button [ref=e477]:
                - img [ref=e478]
      - button "归档" [ref=e483]:
        - img [ref=e484]
        - generic [ref=e487]: 归档
    - main [ref=e488]:
      - generic [ref=e489]:
        - generic [ref=e491]:
          - tablist [ref=e492]:
            - tab "主页" [ref=e493] [cursor=pointer]:
              - generic [ref=e494]: 主页
              - button [ref=e495]:
                - img [ref=e496]
            - tab "文件" [ref=e499] [cursor=pointer]:
              - generic [ref=e501]: 文件
              - button [ref=e502]:
                - img [ref=e503]
          - button [ref=e506]:
            - img [ref=e507]
        - generic [ref=e510]:
          - generic [ref=e512]:
            - generic [ref=e513]: 文件
            - img [ref=e514]
            - generic [ref=e517]: 工作空间
          - generic [ref=e521]:
            - button "笔记" [ref=e522]:
              - img [ref=e523]
              - generic [ref=e525]: 笔记
            - button "测试" [ref=e526]:
              - img [ref=e527]
              - generic [ref=e529]: 测试
            - button "测试文件夹" [ref=e530]:
              - img [ref=e531]
              - generic [ref=e533]: 测试文件夹
            - button "附件" [ref=e534]:
              - img [ref=e535]
              - generic [ref=e537]: 附件
            - button "记忆" [ref=e538]:
              - img [ref=e539]
              - generic [ref=e541]: 记忆
            - button "剪藏" [ref=e542]:
              - img [ref=e543]
              - generic [ref=e545]: 剪藏
            - button "空间" [ref=e546]:
              - img [ref=e547]
              - generic [ref=e549]: 空间
            - button "日记" [ref=e550]:
              - img [ref=e551]
              - generic [ref=e553]: 日记
            - button "收件箱" [ref=e554]:
              - img [ref=e555]
              - generic [ref=e557]: 收件箱
            - button "数据库" [ref=e558]:
              - img [ref=e559]
              - generic [ref=e561]: 数据库
            - button "未命名文件夹" [ref=e562]:
              - img [ref=e563]
              - generic [ref=e565]: 未命名文件夹
            - button "项目" [ref=e566]:
              - img [ref=e567]
              - generic [ref=e569]: 项目
            - button "阅读" [ref=e570]:
              - img [ref=e571]
              - generic [ref=e573]: 阅读
            - button "canvas" [ref=e574]:
              - img [ref=e575]
              - generic [ref=e577]: canvas
            - button "chat" [ref=e578]:
              - img [ref=e579]
              - generic [ref=e581]: chat
            - button "Wiki" [ref=e582]:
              - img [ref=e583]
              - generic [ref=e585]: Wiki
            - button "未命名4.md" [ref=e586] [cursor=pointer]:
              - img [ref=e587]
              - generic [ref=e590]: 未命名4.md
            - button "legacy-1778639136963.db" [ref=e591] [cursor=pointer]:
              - img [ref=e592]
              - generic [ref=e595]: legacy-1778639136963.db
            - button "legacy-1778639136963.db-shm" [ref=e596] [cursor=pointer]:
              - img [ref=e597]
              - generic [ref=e600]: legacy-1778639136963.db-shm
            - button "legacy-1778639136963.db-wal" [ref=e601] [cursor=pointer]:
              - img [ref=e602]
              - generic [ref=e605]: legacy-1778639136963.db-wal
            - button "legacy-1778639170784.db" [ref=e606] [cursor=pointer]:
              - img [ref=e607]
              - generic [ref=e610]: legacy-1778639170784.db
            - 'button "task18-e2e-1778680952954.txt Index engine unavailable: Elasticsearch connection timeout 索引失败" [ref=e611] [cursor=pointer]':
              - img [ref=e612]
              - generic [ref=e615]: task18-e2e-1778680952954.txt
              - generic [ref=e616]:
                - 'generic "Index engine unavailable: Elasticsearch connection timeout" [ref=e617]'
                - button "重试处理" [active] [ref=e618]:
                  - img [ref=e619]
              - generic [ref=e624]: 索引失败
            - button "task18-e2e-test.txt 待处理" [ref=e625] [cursor=pointer]:
              - img [ref=e626]
              - generic [ref=e629]: task18-e2e-test.txt
              - generic [ref=e630]: 待处理
            - button "task18-test-file.md" [ref=e631] [cursor=pointer]:
              - img [ref=e632]
              - generic [ref=e635]: task18-test-file.md
            - button "task18-upload-test.txt 待处理" [ref=e636] [cursor=pointer]:
              - img [ref=e637]
              - generic [ref=e640]: task18-upload-test.txt
              - generic [ref=e641]: 待处理
            - button "task18-verify-1778607856080.txt 待处理" [ref=e642] [cursor=pointer]:
              - img [ref=e643]
              - generic [ref=e646]: task18-verify-1778607856080.txt
              - generic [ref=e647]: 待处理
            - button "test-backslash.txt" [ref=e648] [cursor=pointer]:
              - img [ref=e649]
              - generic [ref=e652]: test-backslash.txt
            - button "test-posix.txt" [ref=e653] [cursor=pointer]:
              - img [ref=e654]
              - generic [ref=e657]: test-posix.txt
  - button "打开闪念捕捉" [ref=e659]:
    - img
  - region "Notifications alt+T":
    - list
```

# Test source

```ts
  139 | 		// Wait for API call and refresh
  140 | 		await page.waitForTimeout(800);
  141 | 
  142 | 		// Verify still on files page (no navigation to file preview/editor)
  143 | 		await expect(page.getByText("工作空间").first()).toBeVisible();
  144 | 
  145 | 		// Step 6: Verify status changed back to "待处理" (pending)
  146 | 		await expect(fileRow.locator("text=待处理")).toBeVisible();
  147 | 
  148 | 		// Verify error message is gone
  149 | 		await expect(fileRow.locator("text=Unsupported format: this file type cannot be converted")).toHaveCount(0);
  150 | 
  151 | 		// Step 7: Verify via API that status is indeed pending
  152 | 		const afterRetryTree = await page.evaluate(async ({ path }: { path: string }) => {
  153 | 			const r = await fetch(`/api/workspace/files/tree?path=${encodeURIComponent(path)}`);
  154 | 			return await r.json();
  155 | 		}, { path: workspaceDir! });
  156 | 		const afterRetryEntry = afterRetryTree.entries.find((e: Record<string, unknown>) => e.path === filePath);
  157 | 		expect(afterRetryEntry).toBeDefined();
  158 | 		expect(afterRetryEntry.processingStatus).toBe("pending");
  159 | 		expect(afterRetryEntry.processingError).toBeUndefined();
  160 | 	});
  161 | 
  162 | 	test("index_failed 失败原因可见且可重试", async ({ page }) => {
  163 | 		const { testFile, filePath } = getTestFile();
  164 | 		createdFiles.push(filePath);
  165 | 
  166 | 		// Upload file
  167 | 		await page.evaluate(
  168 | 			async ({ workspace, fileName }: { workspace: string; fileName: string }) => {
  169 | 				const form = new FormData();
  170 | 				form.append("root", workspace);
  171 | 				form.append("directory", workspace);
  172 | 				const blob = new Blob(["task18 e2e index failed test"], { type: "text/plain" });
  173 | 				form.append("files", blob, fileName);
  174 | 				await fetch("/api/files/upload", { method: "POST", body: form });
  175 | 			},
  176 | 			{ workspace: workspaceDir!, fileName: testFile },
  177 | 		);
  178 | 
  179 | 		// Set status: pending → converting → converted → index_failed
  180 | 		await page.evaluate(
  181 | 			async ({ filePath: p }: { filePath: string }) => {
  182 | 				await fetch("/api/workspace/files/status", {
  183 | 					method: "PATCH",
  184 | 					headers: { "Content-Type": "application/json" },
  185 | 					body: JSON.stringify({ path: p, status: "converting" }),
  186 | 				});
  187 | 			},
  188 | 			{ filePath },
  189 | 		);
  190 | 		await page.evaluate(
  191 | 			async ({ filePath: p }: { filePath: string }) => {
  192 | 				await fetch("/api/workspace/files/status", {
  193 | 					method: "PATCH",
  194 | 					headers: { "Content-Type": "application/json" },
  195 | 					body: JSON.stringify({ path: p, status: "converted" }),
  196 | 				});
  197 | 			},
  198 | 			{ filePath },
  199 | 		);
  200 | 		await page.evaluate(
  201 | 			async ({ filePath: p }: { filePath: string }) => {
  202 | 				await fetch("/api/workspace/files/status", {
  203 | 					method: "PATCH",
  204 | 					headers: { "Content-Type": "application/json" },
  205 | 					body: JSON.stringify({
  206 | 						path: p,
  207 | 						status: "index_failed",
  208 | 						error: "Index engine unavailable: Elasticsearch connection timeout",
  209 | 					}),
  210 | 				});
  211 | 			},
  212 | 			{ filePath },
  213 | 		);
  214 | 
  215 | 		// Navigate to Files and verify
  216 | 		await page.goto(`${BASE_URL}/`);
  217 | 		await page.waitForLoadState("networkidle");
  218 | 		await page.getByRole("button", { name: "文件", exact: true }).click();
  219 | 		await page.waitForTimeout(500);
  220 | 		await expect(page.getByText("工作空间").first()).toBeVisible();
  221 | 
  222 | 		const fileRow = page.locator("[data-test='file-row']", { hasText: testFile });
  223 | 		await expect(fileRow).toBeVisible();
  224 | 
  225 | 		// Verify error visible
  226 | 		await expect(
  227 | 			fileRow.locator("text=Index engine unavailable: Elasticsearch connection timeout"),
  228 | 		).toBeVisible();
  229 | 
  230 | 		// Verify status badge
  231 | 		await expect(fileRow.locator("text=索引失败")).toBeVisible();
  232 | 
  233 | 		// Click retry
  234 | 		const retryButton = fileRow.getByRole("button", { name: "重试处理" });
  235 | 		await retryButton.click();
  236 | 		await page.waitForTimeout(800);
  237 | 
  238 | 		// Verify back to pending
> 239 | 		await expect(fileRow.locator("text=待处理")).toBeVisible();
      |                                             ^ Error: expect(locator).toBeVisible() failed
  240 | 		await expect(
  241 | 			fileRow.locator("text=Index engine unavailable: Elasticsearch connection timeout"),
  242 | 		).toHaveCount(0);
  243 | 	});
  244 | 
  245 | 	test("文件行支持键盘 Enter/Space 打开并触发文件预览", async ({ page }) => {
  246 | 		const { testFile, filePath } = getTestFile();
  247 | 		createdFiles.push(filePath);
  248 | 
  249 | 		await page.evaluate(
  250 | 			async ({ workspace, fileName }: { workspace: string; fileName: string }) => {
  251 | 				const form = new FormData();
  252 | 				form.append("root", workspace);
  253 | 				form.append("directory", workspace);
  254 | 				const blob = new Blob(["keyboard test content"], { type: "text/plain" });
  255 | 				form.append("files", blob, fileName);
  256 | 				const r = await fetch("/api/files/upload", { method: "POST", body: form });
  257 | 				return r.status;
  258 | 			},
  259 | 			{ workspace: workspaceDir!, fileName: testFile },
  260 | 		);
  261 | 
  262 | 		await page.goto(`${BASE_URL}/`);
  263 | 		await page.waitForLoadState("networkidle");
  264 | 		await page.getByRole("button", { name: "文件", exact: true }).click();
  265 | 		await page.waitForTimeout(500);
  266 | 		await expect(page.getByText("工作空间").first()).toBeVisible();
  267 | 
  268 | 		const fileRow = page.locator("[data-test='file-row']", { hasText: testFile });
  269 | 		await expect(fileRow).toBeVisible();
  270 | 
  271 | 		// Press Enter should open file preview (observable: preview/editor panel appears)
  272 | 		await fileRow.press("Enter");
  273 | 		await page.waitForTimeout(500);
  274 | 
  275 | 		// File preview is observable by checking for a tab with the file name
  276 | 		await expect(page.getByRole("tab", { name: testFile })).toBeVisible();
  277 | 
  278 | 		// Close the tab and verify Space also opens
  279 | 		const closeBtn = page.locator("[data-test='close-tab-btn']").first();
  280 | 		if (await closeBtn.isVisible().catch(() => false)) {
  281 | 			await closeBtn.click();
  282 | 			await page.waitForTimeout(300);
  283 | 		}
  284 | 
  285 | 		// Refocus files tab
  286 | 		await page.getByRole("button", { name: "文件", exact: true }).click();
  287 | 		await page.waitForTimeout(300);
  288 | 		await expect(fileRow).toBeVisible();
  289 | 
  290 | 		await fileRow.press(" ");
  291 | 		await page.waitForTimeout(500);
  292 | 		await expect(page.getByRole("tab", { name: testFile })).toBeVisible();
  293 | 	});
  294 | });
```