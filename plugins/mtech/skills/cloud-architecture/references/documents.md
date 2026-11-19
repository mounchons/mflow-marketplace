# Documents: design README, plan, alert catalog

Keep design docs in the project's docs convention (e.g. `docs/CloudMigration/`). Write for the customer's decision makers first (summary table up top), engineers second.

## README outline

1. **Executive summary** — table: target, region, approach, compute, database, storage, login, security, SSL, monthly cost (on-demand / committed, local currency), next step.
2. **As-Is from code** — inventory table with `path:line` evidence; credential files listed by path with "rotate".
3. **Facts that set the direction** — blockers (runtime, DB coupling, state), with counts.
4. **Target architecture** — diagram link + service table (service, size, why); container layout per VM.
5. **Network and security** — subnets, SG rules, edge, checklist; **5.x Identity** (OAuth scope, token lifetime, MFA by role, partner API auth, IP allow-list areas).
6. **Load balancing and scaling** — two-layer scaling, schedule (day / night), how the LB registers new tasks, code needed for scale-out; cache scaling options.
7. **Storage** — key layout, upload flow (presigned), previews, lifecycle tiers by age with comparison, bulk upload plan and its PUT cost.
8. **Database** — engine and size decision, migration method and downtime trade-off, engine gotchas, managed vs self-run, growth tables (e.g. GPS partitions).
9. **Batch, integration, CI/CD** — jobs → scheduled tasks, partner endpoints and IP changes, IaC.
10. **Backup, DR, monitoring** — RPO / RTO table; **10.1 logging and audit** (every layer, TraceId, archive with Object Lock, investigation playbook, protected vs not protected); **10.2 alert catalog**.
11. **Costs** — monthly table, 3-cloud comparison, commitment explanation, scale-up pricing, one-time table, what is free.
12. **Phases** — value-first phase table + link to the install plan.
13. **Code changes before scale-out.**
14. **Open questions** — each with the decision it drives.

Record decisions inline with dates. Every figure equals the workbook.

## Alert catalog format

Table: category | condition (threshold + duration) | level | detected by. Categories: system down, performance, business (partner exports, inbound partner jobs, stuck work, mobile telemetry, upload failures), security, cost. Levels: **Critical** immediately 24 h · **Warning** business hours · **Info** daily digest. Add routing (e.g. SNS → function → chat app; note when a vendor channel is discontinued), noise control (M of N datapoints, composite alarms), and its monthly cost. Business alerts need fixed event names in structured logs or custom metrics: list that as development work.

## Install / test / handover plan

Infrastructure only (code deploy is a separate track). For each phase: goal, steps with owner (vendor / customer / joint) and an AI-assist mark, tests with pass criteria, outputs. Typical phases: prepare and collect facts → accounts and baseline security → network → edge (DNS, TLS, CDN, WAF) → data (DB, cache, storage, backup) → compute platform → identity and email → monitoring and alerts → integrated tests (security scan, DR drill, cost check) → migration rehearsals (bulk upload with checksum manifest, DB dry runs ×2) → go-live with rollback → handover and start of managed service.

Then: **acceptance criteria** (measurable, customer signs each), **handover pack** (as-built diagrams, resource inventory, access matrix, runbooks per Critical alert, test reports, break-glass credentials to the customer, training, DPA / data-processing records, SLA), **often forgotten** (rotate secrets found in the repo, partner IP / URL notices weeks ahead, mobile store review time, service quotas in new accounts, service availability in the region, email sandbox exit, scheduled tasks outside the repo, UTC, DNS TTL, domain expiry, chat channel ownership, support plan, commitment purchase timing, secure wipe of old servers, backup person), and **after handover** cadence (daily / monthly / quarterly / yearly).

A single data file can feed both the markdown plan and an HTML page so they never drift.
