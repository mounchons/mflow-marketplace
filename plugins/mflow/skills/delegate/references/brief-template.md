# Brief template

The answer always comes back as the tool's **final message**, which the command saves to `docs/ai-inbox/` (`-o`, `> file`, or พี่ปู saving a chat answer). Tools run read-only for analyze and review, so they must not be asked to write files.

```markdown
---
brief: <date>-<id>-<mode>-<tool or any>
mode: analyze | review | code
to: <tool or any>
subject: <TASK-ID | change-name | hotspot-slug | topic>
---

# Goal
<two sentences> Done when: <condition>.

# Read first
- AGENTS.md (commands, architecture, domain vocabulary, boundaries)
- <spec / change / hotspot / source paths, each with why it matters>

# Scope
<files and folders to examine (analyze/review) or to change (code)>

# Boundaries
- Edit no files (analyze, review). Code mode: only inside the scope, on branch agent/<tool or any>/<id>.
- Never edit: openspec/specs/, backlog/, STATUS.md, .mflow/, docs/source/ originals
- Do not merge, push, or change CI/secrets
- <project-specific boundaries from AGENTS.md>

# Attach (tools without repo access only)
- <context pack path>

# Output
Your final message is the report, in exactly this format, and nothing else:
<the contract for this mode, copied from below>
```

## Mandatory opening sections (every mode)

```markdown
---
status: new
from: <your tool name>
mode: <mode>
brief: <brief id>
---
# <subject>

## Understanding
Five lines at most: what the system does, the bounded context involved, the rules and
constraints that matter for this brief, and anything in the brief you found unclear.

## Files read
- <every file you actually opened, repo-relative; say "(partial)" if you read only part>
```

A reader uses these two sections to decide how far to trust everything after them: a wrong Understanding or a missing file behind a claim lowers that claim's weight.

## Contract: analyze

```markdown
## Findings
### F1 <title>
- Claim: <one sentence>
- Evidence: <file:line, spec section, or source doc + page — must be in Files read>
- Impact: high | medium | low
- Suggestion: <what to change>
- Confidence: high | medium | low
```

## Contract: review

```markdown
## Verdict
approve | changes-requested

## Findings
### R1 <title>
- Severity: blocker | major | minor | nit
- Location: <file:line — must be in Files read>
- Problem: <what is wrong and why, citing a spec scenario or AGENTS.md rule>
- Fix: <concrete change>
```

## Contract: discuss

Used by `/mflow:discuss <NN> consult`. The brief's mode stays `analyze` (read-only), and the subject is `discuss-<NN>-r<revision>`. Several tools answer the same brief. พี่ปู reads all their views side by side and makes the choices, so the value of each report is an independent judgment, not agreement with the doc.

Instructions that go into the brief's Goal:
- Read the sources first and the discussion doc second. Test every statement tagged `[อนุมาน]` or `[เสนอ]` against a source.
- For every open decision (`### D<n>` with an empty `**พี่ปูเลือก:**`), give your own pick and reason, even when it matches Claude's recommendation. You may add an option.
- Check the topic checklist pasted into the brief. Report every item the doc neither answers nor lists as out of scope.
- Write the findings in Thai; keep paths and identifiers as they are. Edit no files.
- A diagram, wireframe or screenshot that contradicts the text or a source is a `challenge` targeting that picture's caption; the Suggestion may include a corrected mermaid block.
- Do not open `docs/ai-inbox/`. Other tools are answering the same brief, and your view must stay independent. Earlier rounds reach you through section 8 of the doc.

```markdown
## Picks
- D<n>: <option letter or new option> — <reason in one or two sentences>

## Findings
### C1 <title>
- Type: challenge | gap | alternative | customer-question | risk
- Target: <§ or D-number in the doc>, rev <revision read>
- Claim: <one sentence>
- Evidence: <source file + section, or doc § — must be in Files read; "reasoning" if none>
- Suggestion: <what the doc should say, add, or ask>
- Confidence: high | medium | low
```

## Contract: code

Do the work on the branch, commit with the test command's summary in the commit body, tick the matching boxes in `openspec/changes/<name>/tasks.md` if this is an OpenSpec change. Then give as the final message the opening sections plus:

```markdown
## Done
- <what was implemented, by task>

## Not done / deviations
- <anything skipped or done differently from the spec, and why>

## Tests
<command run and its summary>

## Open questions
- <…>
```
