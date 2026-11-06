# Test runs

One record per run, `<date>-<short commit>.md` (`-2`, `-3` for another run at the same commit the same day),
written by the mtest runner. The header says what was tested and how it ended:

```
Tested: <branch> at <commit>[ with uncommitted changes]
By: claude | codex | user | schedule
Scope: whole suite | since <base> | e2e | <what was named>
Result: pass | fail | incomplete
Duration: <the parts added up>
```

A `whole suite` or `since` record that passed, on a clean tree, proves its commit: a review of that commit
cites it instead of running the tests again. `incomplete` means a part was skipped (a prerequisite was
missing) or not run, so it proves nothing about that part.
