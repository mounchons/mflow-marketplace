---
name: change-request
description: Assess a customer request against agreed scope, classify it (defect, clarification, new scope), estimate impact, and draft the Thai reply or quotation before any work starts.
disable-model-invocation: true
argument-hint: "<request text> | @email-or-file"
---

Unpriced changes are how fixed-price projects lose money. Every request that touches something already approved passes through here first; nothing is built until the classification is agreed.

## 1. Understand the request

Restate it in one or two sentences and list the screens, rules, data and documents it touches. If the request came as a file, register it by following `${CLAUDE_PLUGIN_ROOT}/skills/source/SKILL.md`. Files opened with Read are not substituted: where that file writes the plugin-root variable (CLAUDE_PLUGIN_ROOT), use `${CLAUDE_PLUGIN_ROOT}`.

## 2. Check against the agreed baseline

Evidence, in order: archived specs in `openspec/specs/`, approved screens in `docs/ui/screens.md`, `docs/vision.md` scope and out-of-scope, active documents in `docs/source/INDEX.md` (never superseded ones), confirmed review summaries in `docs/reviews/`.

Classify with the evidence quoted by file and section:
- **Defect:** agreed behaviour that was built wrong → Backlog bug task, no charge.
- **Clarification:** within agreed scope, detail was open → Backlog task, or a hotspot ticket if it is a rule.
- **New scope:** not in the baseline, or changes something approved → change request.

Done when: the class is backed by at least one cited source, or the ambiguity is stated plainly for พี่ปู to decide.

## 3. For new scope: impact and estimate

Write `docs/change-requests/CR-<nnn>-<slug>.md`: request, reason for classification, impact (screens, specs, hotspots, data migration, tests), risk, estimate as a range in hours with the assumptions that drive it, and effect on the delivery date. Create a Backlog task with label `change-request`, status `To Do`, and a note that work waits for customer approval.

## 4. Draft the reply

Thai, polite and direct, no over-selling:
- Defect: acknowledge, give the fix date.
- Clarification: confirm understanding, give the date.
- New scope: thank them, summarise the request, state that it is outside the agreed scope with the reference, give the estimate and delivery impact, offer options (do now / next phase / smaller version), ask for written approval.

Done when: the CR file (for new scope), the task, and the reply draft exist, and STATUS.md lists the pending approval.
