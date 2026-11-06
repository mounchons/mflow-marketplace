# Test parts per stack

A **part** is one command the runner runs and records as one row: the build, a test project, a slice of a
big one, a lint. Parts live in `.mtest/config.json` under `parts`, in the order they run.

## Fields

| Field | Meaning |
|---|---|
| `name` | short id (`build`, `unit`, `integration-ar`); `/mtest:test <name>` runs it alone |
| `kind` | `build` (at most one; when it fails, the other parts of the run are not run), `unit`, `integration`, `check` (lint, format check, a front-end build), `e2e` (never in the whole suite) |
| `command` | the command line, run through the shell from `cwd`; no output redirection, no `&` |
| `cwd` | folder inside the project, default the root |
| `results` | how the runner reads the outcome: `trx`, `junit`, `playwright-json`, `vitest-json`, `jest-json`, or `exit` (the exit code only, for builds and checks) |
| `resultsArgs` | arguments that make the tool write its results file, when the default below does not fit; `{dir}` and `{out}` become the results folder and file (quoted) |
| `requires` | prerequisites, all of which must hold: `tcp:<host>:<port>`, `env:<NAME>`, `cmd:<command that must exit 0>`, `file:<path from cwd>`; alternatives in one entry joined by ` \| ` |
| `timeoutMin` | minutes before the part is stopped; default 9 in a Claude Code session (the shell's limit is 10), 60 from a terminal |
| `paths` | globs of the source a part covers; `since` then runs the whole part when one of them changed |

A part counts as **verified** once a record in `mtest/runs/` shows it passing. Nothing writes that back
into the config: a change to `.mtest/config.json` makes the next `since` run the whole suite.

A part whose prerequisite is missing is recorded as **skipped** with the reason, and the run is
`incomplete`: it proves nothing about that part, and it never fails silently.

## Defaults the runner adds

| `results` | Added to the command when it has no `{out}`/`{dir}` and no `resultsArgs` |
|---|---|
| `trx` | `--logger trx --results-directory <dir>` (dotnet test with VSTest) |
| `playwright-json` | `--reporter=list,json`, with `PLAYWRIGHT_JSON_OUTPUT_NAME` set to the results file |
| `vitest-json` | `--reporter=default --reporter=json --outputFile.json=<out>` |
| `jest-json` | `--json --outputFile=<out>` |
| `junit` | nothing: write `{out}` where the tool takes its JUnit path (`pytest --junitxml={out}`) |

When the results file is missing, the runner reads the counts from the tool's console summary (dotnet,
Playwright, Vitest, pytest), and says so in the row.

## Per stack

| Stack | Build part | Test part | `results` | One class or test (for `--args`) | Count the tests |
|---|---|---|---|---|---|
| .NET, VSTest (xUnit, NUnit, MSTest) | `dotnet build <sln>` | `dotnet test <project> --no-build` | `trx` | `--filter "FullyQualifiedName~<Class>"` | `dotnet test <project> --no-build --list-tests` |
| .NET, Microsoft.Testing.Platform | `dotnet build <sln>` | `dotnet test --project <project> --no-build` | `trx`, `resultsArgs: "--report-trx --results-directory {dir}"` | the framework's filter option | `--list-tests` |
| Vitest | `npm run build` or `npx tsc --noEmit` (`check`) | `npx vitest run` | `vitest-json` | a file path, or `-t "<name>"` | `npx vitest list` |
| Jest | as above | `npx jest` | `jest-json` | a file path, or `-t "<name>"` | `npx jest --listTests` |
| Playwright | — | `npx playwright test` (`e2e`) | `playwright-json` | a file path, or `-g "<title>"` | `npx playwright test --list` |
| pytest | — | `pytest --junitxml={out}` | `junit` | `-k "<expr>"` | `pytest --collect-only -q` |
| Go | `go build ./...` | `go test ./...` | `exit` | `-run '<regex>'` | `go test -list . ./...` |
| Maven | `mvn -q -DskipTests package` | `mvn test -Dsurefire.reportsDirectory={dir}` | `junit` | `-Dtest=<Class>` | — |
| PHPUnit | — | `vendor/bin/phpunit --log-junit {out}` | `junit` | `--filter <name>` | `--list-tests` |

Build once, then test with the build's output (`--no-build` in .NET), so the parts do not build again.

## Prerequisites to look for

- **A database**: integration tests that connect to PostgreSQL, SQL Server or MySQL on `localhost`
  (`tcp:localhost:5432`, `:1433`, `:3306`), or start one with Testcontainers (`cmd:docker info`). Both:
  `"requires": ["tcp:localhost:5432 | cmd:docker info"]`.
- **Node packages**: `file:node_modules` in the folder of a Node part; the fix is `npm ci` there.
- **Browsers**: Playwright's are installed by `npx playwright install chromium` in the E2E folder.
- **Variables**: `env:<NAME>` for a connection string or a flag the tests read.

## Splitting a slow part

A part that takes longer than `partMinutes` (8) is split by filter into parts of that size, so each fits
in one shell call: by namespace or folder first, then by class. The parts of one project must add up to
the whole project, or a new class that matches no filter is never run. Count the project's tests with the
command above, and after the run compare it with the passed, failed and skipped of its parts added
together: a shortfall is a class no part matches, so run it as an extra part and add it to the filter of
the part its name belongs to.

## Example

```json
{
  "version": 1,
  "defaultBranch": "main",
  "e2eMaxWorkers": 4,
  "partMinutes": 8,
  "parts": [
    { "name": "build", "kind": "build", "command": "dotnet build Shop.slnx" },
    { "name": "unit", "kind": "unit", "command": "dotnet test tests/Shop.UnitTests --no-build", "results": "trx" },
    { "name": "integration", "kind": "integration", "command": "dotnet test tests/Shop.IntegrationTests --no-build", "results": "trx",
      "requires": ["tcp:localhost:5432 | cmd:docker info"] },
    { "name": "web", "kind": "check", "command": "npm run build", "cwd": "web", "requires": ["file:node_modules"] },
    { "name": "e2e", "kind": "e2e", "command": "npx playwright test", "cwd": "tests/Shop.E2E", "results": "playwright-json",
      "requires": ["tcp:localhost:5432", "file:node_modules"] }
  ]
}
```
