# Business layer: turning the study into a signed proposal

When the study is for a customer (a consultant or software house selling the migration), add these after the technical work without being asked.

## Proposal structure

| Line | Charged | Notes |
|---|---|---|
| Setup / migration (one-time) | days × day rate, invoiced on signed acceptance | attach the install plan timeline and acceptance criteria as an annex |
| Managed service (monthly) | fixed fee by scope, not by hours | monitoring + alert catalog, monthly report, patching, backup tests, cost review |
| Cloud bill | customer pays the cloud vendor directly, in the customer's own account | vendor access through a cross-account role; avoids FX and credit risk |
| Development (new features, business alerts in code, app rewrite) | separate project or hourly | never folded into the managed fee |

Contract points: realistic SLA for the team size (business-hours response, critical out-of-hours), exclusions (app bugs, region-wide outages, new features), 1-year term aligned with any Reserved Instance / Savings Plan purchase, annual price review, FX clause when quoting cloud costs in local currency, VAT, data processing agreement, handover terms on exit (IaC, runbooks, access), backup person for when the owner is unavailable.

## Draft customer text (customer's language; polite, direct, no overselling)

Write a short proposal letter: what moves where (and that data stays in-country when a local region is used), the three money lines above with figures from the workbook, what the monthly service includes (alerts, reports, backups checked, security updates, response times), security points the customer cares about (audit trail, MFA for admins, logs that cannot be deleted), and an offer to meet.

## Reminders to raise

Onboarding (support channel, contacts, monthly review meeting), feedback loop after the first month, renewal and price-increase dates, commitment-purchase review at 4–8 weeks, and whether the owner is over-engineering instead of getting the proposal in front of the customer.
