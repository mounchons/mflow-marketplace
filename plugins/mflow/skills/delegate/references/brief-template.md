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
