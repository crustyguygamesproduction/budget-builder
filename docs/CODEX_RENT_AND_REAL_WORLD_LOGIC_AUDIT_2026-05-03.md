# Shared rent and real-world money logic audit

Last updated: 2026-05-03

This audit was created after the user reported that outgoings appear to include their brother's half of the rent again.

## User problem

The app must be robust with messy bank statements. It needs to infer real-world money flows, not just add all outgoings at face value.

Specific regression report:

- Rent appears to be counted as the full household rent again.
- The user's brother's share/half of rent should reduce the user's scheduled outgoings to cover.
- The app must not treat shared-bill money as income or lifestyle money.

## Current code areas involved

Main files:

- `src/lib/appMoneyModel.js`
- `src/lib/moneyUnderstanding.js`
- `src/lib/billFallbacks.js`
- `src/lib/coachContext.js`
- `src/pages/HomePage.jsx`
- `src/pages/CalendarPage.jsx`
- `src/pages/ConfidencePage.jsx`
- `scripts/check-money-understanding.mjs`

## What currently works

`appMoneyModel.js` has a shared-bill contribution system:

- `getSharedBillContributions()` looks for positive incoming payments that may be regular contributions.
- It tries to match those contributions against Calendar bills.
- Confirmed contributions are removed from income.
- Confirmed contributions reduce `monthlyBillBurdenTotal` and `monthlyScheduledOutgoingsTotal`.
- There is already a happy-path regression test where rent is `-1450` and `Matt rent contribution` is `+725` for three months. That test expects scheduled outgoings to become `725`, not `1450`.

This is the right direction but too brittle for real statements.

## Likely root cause of the user's issue

The current shared-bill contribution detection only confirms a contribution when a fairly strict heuristic passes.

A contribution may fail if:

- the description does not contain rent/share/half/contribution language, for example `Faster payment from Jake` or only a person's name
- the brother pays on a slightly different day from the rent
- the amount varies or includes extra top-ups
- one month is missing
- there are fewer than two recent months in the current model window
- the contribution is not very close to 50% of the matched bill
- a Calendar bill exists as gross rent, but the contribution is only marked `needsChecking` instead of `confirmed`
- there is no persistent rule type for “this person/payment is shared rent contribution”

When that happens:

- `monthlySharedContributionTotal` stays `0`
- `monthlyBillBurdenTotal` equals gross rent
- Home/Calendar/Coach can show scheduled outgoings as the full rent
- the incoming brother payment may be treated as income unless filtered elsewhere

## UI confusion still possible even when aggregate share works

Some UI still has gross bill concepts and user-share concepts side by side.

Examples to review:

- Home uses `billShare.personalTotal` for Scheduled outgoings, which is good.
- `getCalendarBillRead()` still exposes `nextBill.amount` from the gross Calendar bill.
- The hero can therefore show “Scheduled outgoings: your bit” but “Next bill: Rent £1450”, which feels like the app is counting the brother's half again.
- Calendar Future Bills has `personalBillTotal`, but individual bill rows may still show gross bill amounts.

For shared bills, the UI needs to say both values clearly:

- `Rent: £1,450 total`
- `Your share to cover: £725 after regular contribution from Brother/Jake/Matt`

Do not just show the gross rent as if that is the user's personal bill burden.

## Required product behaviour

For a messy real-world budget app:

1. Distinguish gross household bill from user's share.
2. Treat regular incoming shared-bill money as a contribution, not income.
3. If the app is confident, subtract it from scheduled outgoings.
4. If the app is not confident, surface it in Review/Checks with a one-tap correction.
5. Once the user confirms it, persist the correction so it never regresses.
6. Coach, Home, Calendar, Goals and safe-to-spend should all prefer the user's bill burden over gross household bill totals.

## Recommended implementation

### 1. Add persistent rule support for shared bill contributions

Add or reuse `transaction_rules` support for a rule like:

```text
rule_type: shared_bill_contribution
match_text: brother/jake/matt/etc
match_amount: optional usual contribution amount
category: Shared bill contribution or Shared rent contribution
is_bill: false
is_subscription: false
is_internal_transfer: false
metadata: {
  matched_bill_key,
  matched_bill_name,
  contribution_kind: rent|bills|unknown,
  contribution_share: 0.5 optional,
  cap_to_amount: optional
}
```

Then update `appMoneyModel.js` to apply confirmed shared-contribution rules before or alongside heuristic detection.

### 2. Improve heuristic detection for unnamed person transfers

Allow the app to detect regular incoming person payments even if the description does not contain rent/share words.

Candidate rule:

- positive amount >= 100
- not internal transfer
- not wages/income/refund/pass-through/savings
- appears in at least 2 months, or appears once with strong text and matching amount
- amount is between 25% and 80% of a regular bill
- ideally close to half of rent or another bill
- date is within about 10 days of the bill date, but do not require same day
- if amount is more than 65% of the bill, mark needs-checking unless user confirms

For rent specifically, be more tolerant:

- 40% to 60% of rent should be treated as likely half-share when recurring
- 30% to 70% can be needs-checking
- cap applied amount to the expected share if there are variable extra top-ups

### 3. Create Review/Checks actions for shared-bill candidates

If a contribution is `needsChecking`, create a check in the Review page:

```text
Is this money from Jake/Brother towards rent or bills?
[Yes, rent contribution] [Yes, bills contribution] [No, income] [No, friends/family]
```

When user confirms, save a `shared_bill_contribution` rule and refresh money understanding.

### 4. Use user-share bill amounts in UI consistently

Review Home and Calendar:

- Home Scheduled outgoings should remain `billShare.personalTotal`.
- Home Next bill should not show gross rent without context.
- Calendar Future Bills should show user's share where a matched contribution exists.
- Coach context already says to use user share; keep it that way.

Suggested copy:

```text
Rent: £1,450 total
Your share: about £725 after regular contribution from Jake
```

If contribution is uncertain:

```text
Rent may be shared. Check Jake's payment so Money Hub does not overstate your bills.
```

### 5. Regression tests to add

Add tests in `scripts/check-money-understanding.mjs` or a new focused script.

Minimum fixtures:

1. Exact happy path already exists:
   - rent `-1450`
   - `Matt rent contribution +725`
   - expected scheduled outgoings `725`

2. Real-world brother transfer without rent words:
   - rent `-1450`
   - `Faster payment from Jake +725`
   - appears in at least two months near rent date
   - expected contribution detected or at least needs-checking
   - if confirmed rule exists, expected scheduled outgoings `725`

3. Different day:
   - rent on 1st
   - brother pays on 28th/30th or 3rd
   - expected matched as contribution if recurring

4. Variable top-up:
   - rent `-1450`
   - brother pays `+725`, `+725`, `+900`
   - expected applied contribution capped around `725`, with extra ignored or needs-checking

5. Missing month:
   - rent appears three months
   - contribution appears two months
   - expected not to treat as income, at minimum needs-checking

6. Non-rent personal payment guard:
   - repeated friend payment not close to any bill should not reduce bills automatically
   - should be treated as personal incoming/needs-checking, not confirmed shared rent

7. Confirmed rule path:
   - a transaction rule marks `Faster payment from Jake` as shared rent contribution
   - expected scheduled outgoings reduce even if text does not say rent

## Important non-goals

Do not hard-code the user's brother's name only. This must work for any user/person.

Do not blindly subtract all incoming payments from bills.

Do not treat uncertain shared-bill money as confirmed unless the pattern is strong or the user confirms it.

Do not mix shared-bill contributions into income.

## Documentation status

Current docs are mostly aligned after the cleanup passes, but this new shared-rent regression needs to be added as the next priority.

Docs that should be updated after fixing this:

- `docs/CODEX_CONTEXT.md`
- `docs/CODEX_DEEP_AUDIT_2026-05-03_AFTER_HARDENING.md`
- `docs/CODEX_NEXT_PASS_PROMPT.md`
- `docs/launch-readiness-checklist.md`

Also update docs if the bank-feed groundwork migration has now been pushed. Some docs may still say the migration needs pushing. The safer wording is:

```text
Run `npx supabase migration list` to confirm `202605030004_bank_feed_groundwork.sql` is applied remotely before relying on bank-feed tables.
```

## Suggested Codex prompt

```text
Read docs/CODEX_CONTEXT.md, docs/CODEX_RENT_AND_REAL_WORLD_LOGIC_AUDIT_2026-05-03.md, docs/CODEX_DEEP_AUDIT_2026-05-03_AFTER_HARDENING.md, and docs/CODEX_NEXT_PASS_PROMPT.md.

Fix the shared rent/shared bill contribution logic. The app is again including the user's brother's half of rent in scheduled outgoings. Make the logic robust for messy bank statements: detect regular incoming person payments near rent/bills even when the description does not say rent, keep uncertain cases in Review/Checks, allow persistent shared-bill contribution rules, and make Home/Calendar/Coach use the user's share rather than gross household bills. Add regression tests for exact half rent, brother/Jake transfer without rent words, different payment day, variable top-up, missing month, and confirmed rule behaviour. Keep changes focused and run npm run check. Update docs so completed work is not left as pending.
```
