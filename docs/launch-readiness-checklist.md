# Money Hub Launch Readiness Checklist

This checklist is for the manual-upload launch version. Live bank feeds should wait until this list is boringly reliable.

## 1. Confidence Checks

Goal: the app should ask simple questions instead of guessing when the answer changes the maths.

Must pass:
- Repeated high-value payments appear on the Checks page.
- Cards show the payee/entity, repeated amount, count, month count, and example transactions.
- User can tag a payment as Rent, Bill, Friend/family, Work/pass-through, Transfer, or Other.
- Saved rules update future transaction classification.
- Rent and bills must not leak into friends/family totals after confirmation.
- Work/pass-through payments must not be treated as normal lifestyle spending after confirmation.

Manual test prompts:
- How much money have I sent friends and family?
- Do not include rent, bills, work payments, or transfers.
- Is this person rent or friends/family?

## 2. Future Payments Calendar

Goal: Calendar predicts real upcoming money pressure, not only obvious subscriptions.

Must pass:
- Calendar opens on Future payments by default.
- Rent, phone, broadband, energy, water, council tax, insurance, subscriptions and debt-style payments appear when history supports them.
- Dates are estimated from common payment day or average day when the day moves.
- Low-confidence future payments are labelled estimated.
- The UI tells users to use Checks if a future payment looks wrong.

Manual test prompts:
- What bills are due soon?
- Are these future payments estimated or confirmed?
- Why is this payment showing on this date?

## 3. AI Coach Maths Discipline

Goal: AI explains the app's maths. It does not invent the maths.

Must pass:
- AI never claims current cash from historical statement net.
- AI uses query_focus for user-specific totals.
- AI separates money in from money out.
- AI uses pass_through_analysis for Proovia/work-style flows.
- AI tells the user to confirm uncertain categories in Checks rather than guessing.
- AI gives compact answers to compact questions.

Bad answer examples:
- "You are ahead" when the user has no current balance supplied.
- Counting rent as friends/family.
- Recalculating Proovia manually.
- Giving four paragraphs for a simple total.

## 4. Safe To Spend

Goal: safe-to-spend must feel conservative and honest.

Must pass:
- If live balances exist, subtract upcoming known/estimated fixed commitments.
- If live balances do not exist, call it a pattern read, not spendable cash.
- Never let historical net imply the user can spend.
- Explain when data is stale.
- Tell the user what to upload or confirm to improve accuracy.

Good wording:
- "This is historical movement, not cash today."
- "Safe-to-spend needs a current balance or live bank feed."
- "This protects bills before treating money as spendable."

## 5. Mobile UX and Onboarding

Goal: a user bad with money should understand what to do next without reading a manual.

Must pass:
- Bottom nav labels are short and understandable.
- AI input does not jump when typing.
- Send button is visible on iPhone-sized screens.
- Checks page is easy to find.
- Empty states explain the next action.
- Upload guidance explains why 1, 3 and 6 months matter.
- Copy avoids jargon where possible.

## 6. Launch Safety

Goal: ship the manual upload app without exposing users to avoidable trust failures.

Must pass before public launch:
- `npm run build` passes.
- Supabase migrations are applied.
- RLS policies are active.
- Receipt/document storage is private.
- Supabase Edge Function secrets are set.
- `ALLOWED_ORIGINS` is set for production and preview URLs.
- Privacy page accurately describes AI use and financial data handling.
- No service-role keys are exposed in Vercel or client env vars.
- AI functions do not log full transaction payloads in production.

## Live Bank Feed Gate

Do not start real bank-feed users until the manual-upload version is stable.

Live feeds can begin after:
- Checks reliably fixes ambiguous payees.
- Calendar predictions are useful and visibly labelled by confidence.
- AI handles current cash versus historical flow correctly.
- Safe-to-spend is conservative.
- Duplicate transaction import strategy is implemented.
- Sync logs and consent expiry handling exist.

The launch principle: manual uploads prove the intelligence. Live feeds make it automatic.
