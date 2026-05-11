# Daily Inspection Verification Report

## Commands Run

| Command | Exit Code | Status |
|---------|-----------|--------|
| `cd packages/server && pnpm test` | 0 | Pass (140 tests, 21 files) |
| `cd packages/web && pnpm test` | 0 | Pass (173 tests, 30 files) |
| `npm run check` (root) | 0 | Pass (0 errors, 16 pre-existing warnings) |
| `cd packages/web && ./node_modules/.bin/playwright test e2e/daily-inspection.spec.ts` | 0 | Pass (2 tests) |
| `cd packages/web && ./node_modules/.bin/playwright test e2e/session-attachments.spec.ts` | 0 | Pass (4 tests) |
| `cd packages/web && ./node_modules/.bin/playwright test e2e/workspace-home-session.spec.ts` | 0 | Pass (5 tests) |

## Web Acceptance (Playwright CLI)

- Browser: Chromium via playwright-cli
- Server: Already running on `http://[::1]:5175`
- Login required: Password `ridge-admin`
- Console: 4x 401 errors on `/api/system/info`, `/api/providers`, `/api/sessions`, `/api/session-contexts` **before** login — expected unauthenticated behavior, not a regression.

### TaskView Project Filter
- **Initial state:** Combobox shows "全部项目" (ref=e210).
- **Dropdown opened** (ref=e210 click): Options visible:
  - "全部项目" (ref=e250)
  - "无项目" (ref=e254)
  - "openchamber" (ref=e257)
  - "AuroraPlatformWeb" (ref=e260)
- **Selection tested:** Clicked "无项目" (ref=e254). Combobox updated to show "无项目".
- **Screenshot evidence:** `screenshots/03-task-view-project-filter.png`, `04-task-filter-none-selected.png`

### Home Tab Attachment Flow
- **Attachment button** (data-testid="home-attachment-btn") opens file chooser modal.
- **File upload** (`test-attachment.txt`) succeeded; pending chip appears with filename and close button.
- **Screenshot evidence:** `screenshots/06-home-attachment-pending.png`

### Automated Coverage for Upload Failure / Orphan Cleanup
- `packages/web/src/pages/__tests__/WorkspacePage.test.ts` lines 519–552 contain a test:
  - **Name:** `handleHomeSubmit 附件上传失败时不 replaceTab 并 toast 报错`
  - **Behavior verified:** When `uploadSessionAttachments` rejects, `replaceTab` is **not** called, leaving the home tab intact.
  - This is the automated coverage for "Home/session attachment flow does not replace the home tab on upload failure".

## Artifacts

```
自动化测试/final-daily-inspection-2026-05-11-1026/
├── report.md (this file)
├── screenshots/
│   ├── 01-login-blocked.png
│   ├── 02-workspace-home.png
│   ├── 03-task-view-project-filter.png
│   ├── 04-task-filter-none-selected.png
│   └── 06-home-attachment-pending.png
└── e2e spec:
    packages/web/e2e/daily-inspection.spec.ts (2 passed)
```

## E2E Spec

- **Path:** `packages/web/e2e/daily-inspection.spec.ts`
- **Tests:**
  1. `TaskView project filter control exists and can switch between all/none/specific project options`
  2. `Home tab attachment button opens file picker and shows pending chip after file selection`
- **Result:** 2 passed (1.6s)

## Final Conclusion

All required validation passed:
- Server tests: 140/140 pass
- Web tests: 173/173 pass
- Root `npm run check`: 0 errors (16 pre-existing warnings only)
- Web acceptance: Task project filter UI verified interactively; home attachment pending chip verified interactively.
- Existing automated coverage for upload-failure orphan cleanup passes (WorkspacePage.test.ts).
- All e2e specs (new + existing) pass.
