# Reviews

One report per review, `<date>-<target>.md`, written by `/mtest:review`. The header:

```
Reviewed: <target> <base>..<end>[ with uncommitted changes]
Reviewer: claude | codex | user
Author: claude | codex | user
Level: full | short
Tests: <the run record relied on> | run by this review | none
Verdict: approve | changes-requested | none (tests not run at <commit>)
```

Then the findings by severity (blocker, major, minor, nit), each with its file:line, the problem and the fix.
`/mtest:review since` starts where the newest report ended, so every commit is reviewed once.
