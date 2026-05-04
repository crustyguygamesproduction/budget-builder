# Coach Brain Numbers And Trends

Last updated: 2026-05-04

## Architecture

Coach is not the bank-statement parser.

The intended flow is:

```text
CSV or bank feed
-> import parser
-> money understanding and statement intelligence
-> app money model
-> compact Coach context
-> AI Coach wording and judgement
```

`src/lib/appMoneyModel.js` now emits `cleanMonthlyFacts`, also exposed to Coach as `clean_monthly_facts`.

## Clean Monthly Facts

The clean facts object gives Coach:

- latest full month
- previous full month
- recent monthly average
- worst recent month
- trend direction
- worsening and improving categories
- risky accelerating categories
- budget sanity flags
- uncertainty flags
- capped monthly rows
- raw all-history totals with an explicit warning

Raw all-history totals are kept only for sanity checking. They must not be compared to monthly income.

## Spending Discipline

For advice such as "what should I fix?", Coach should use this order:

1. `query_focus` for exact lookup questions.
2. `clean_monthly_facts.latest_full_month`.
3. `clean_monthly_facts.recent_monthly_average`.
4. `clean_monthly_facts.trend`.
5. `clean_monthly_facts.worst_recent_month`, clearly labelled as worst month.
6. `raw_history_totals`, only if clearly labelled as all uploaded history.

## Exclusions

Clean real spending excludes:

- own-account transfers
- savings and investment movements
- pass-through or work/client money
- refunds, reversals and reimbursements
- shared rent or shared bill contributions

Only real income and real spending should drive blunt monthly coaching.

## Review Loop

When the model is unsure, it should ask through Review/Checks. Review can now save answers for:

- rent contribution
- bill contribution
- rent
- bill
- subscription
- wages/income
- friend/family
- work/pass-through
- refund/reimbursement
- own transfer
- ignore from budget

Those answers become `transaction_rules`, so future imports learn from the user instead of making the same guess again.
