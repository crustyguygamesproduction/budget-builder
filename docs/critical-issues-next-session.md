# Historical Critical Issues Snapshot

Status: historical. This file is an older snapshot from before the May 2026 hardening and UX passes. Do not use it as the current task list without re-checking the live app and `docs/CODEX_CONTEXT.md`.

Resume this list before continuing structural refactors. The app's selling point is statement upload accuracy, so data correctness comes first.

## Bugs And Accuracy

1. Goals page goes blank.
2. Money figures look wrong across the app. Example: this month shows around `-£1170`, but user expects roughly break-even.
3. Uploading 3 months of data is reported as 4 months.
4. Accounts page is not useful yet. It is not distinguishing accounts from uploaded bank statements well enough.
5. Statement data may not be used correctly across the app. Audit the import, categorisation, totals, calendar, goals, accounts, and AI context logic.
6. Bank transfers between accounts may be counted as income/outgoings incorrectly.
7. Receipt upload errors with: `Could not find the ai_summary column of receipts in the schema cache`.

## UX And Product Issues

8. Receipts feels too dumb. It currently behaves mostly like file storage and does not reliably match receipts to payments. Reconsider the purpose: likely warranty/returns/proof of purchase, possibly double-sided receipts. Upload currently opens camera directly.
9. AI Chat UX is poor:
   - Old chat reopens after closing and returning to the app.
   - Visual design feels rough.
   - Long AI replies require scrolling up to read, which is bad chat UX.
10. AI coaching should use the best flagship model for financial coaching and insight quality, not merely the best coding/work model. Verify current best model choice before changing.

## Suggested Next Order

1. Fix Goals blank screen.
2. Audit statement parsing and transfer detection.
3. Fix totals/income/outgoings and month-count logic.
4. Fix receipts schema mismatch.
5. Improve Accounts from uploaded statement metadata.
6. Improve AI Chat UX and model choice.
7. Resume planned refactor after correctness is stable.
