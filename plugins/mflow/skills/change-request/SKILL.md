---
name: change-request
description: Assess a request against agreed scope, classify it (defect, clarification, new scope), estimate and record its impact, then go ahead on the user's instruction; draft a Thai reply or quotation only when the user wants one.
disable-model-invocation: true
argument-hint: "<request text> | @email-or-file"
---

Unpriced changes are how fixed-price projects lose money. Every request that touches something already built or approved passes through here, so its class, impact and estimate are on record. It never waits for the customer: the user (the SA, PM or system owner driving the project) speaks for the customer, so the user's instruction to do it is the approval.

## 1. Understand the request

Restate it in one or two sentences and list the screens, rules, data and documents it touches. If the request came as a file, register it by following `${CLAUDE_PLUGIN_ROOT}/skills/capture/SKILL.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

## 2. Check against the agreed baseline

Evidence, in order: archived specs in `openspec/specs/`, approved screens in `docs/ui/screens.md`, approved discussion docs in `docs/discuss/`, `docs/vision.md` scope and out-of-scope, active documents in `docs/source/INDEX.md` (never superseded ones), review summaries in `docs/reviews/`.

Classify with the evidence quoted by file and section:
- **Defect:** agreed behaviour that was built wrong → Backlog bug task, no charge.
- **Clarification:** within agreed scope, detail was open → Backlog task, or a hotspot ticket if it is a rule.
- **New scope:** not in the baseline, or changes something approved → change request.

Done when: the class is backed by at least one cited source, or the ambiguity is stated plainly for the user to decide.

## 3. For new scope: impact and estimate

Write `docs/change-requests/CR-<nnn>-<slug>.md`: request, reason for classification, impact (screens, specs, hotspots, data migration, tests), risk, estimate as a range in hours with the assumptions that drive it, effect on the delivery date, and an `Approved:` line. Create a Backlog task with label `change-request`.

## 4. Go ahead on the user's instruction

- **The user said to do it**, in the request or after seeing the estimate: that is the approval. Write `Approved: <date>, by the user` in the CR file and hand it on: a change to behaviour in `openspec/specs/` → `/opsx:propose` with the CR file as input; a prototype screen → `/mflow:screen`; a defect or clarification → its task, ready to work.
- **The user asked only for an assessment:** leave the task `To Do` with the note "waits for the user's go", and list it in STATUS.md. Do not ask the customer or wait for them.

## 5. Draft a reply, only when asked

When the user wants to send something to someone else (for example an SA or a PM answering the customer's email), draft it in Thai, polite and direct, no over-selling:
- Defect: acknowledge, give the fix date.
- Clarification: confirm understanding, give the date.
- New scope: thank them, summarise the request, state that it is outside the agreed scope with the reference, give the estimate and delivery impact, then say what will be done. Offer options (do now / next phase / smaller version) only if the user has not chosen yet. Never ask for written approval: the user's go is the approval.

Done when: the class is on record, the CR file (for new scope) and the task exist, and either the change has been handed on with its approval recorded, or STATUS.md lists it as waiting for the user's go.
