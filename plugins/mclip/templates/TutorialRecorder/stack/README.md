# The tutorial stack

The recorder signs in, clicks and saves for real, so it runs against a throwaway copy of the app: test data only, its
own database, its own port, never the copy that holds real data. `reset.ps1` recreates that copy from nothing, so every
recording starts from the same data and a rerun gives the same clip.

What `reset.ps1` must do (the scenario's `setup:` runs it before each recording; `--no-setup` skips it):

| Call | Does |
|---|---|
| `reset.ps1` | drops the copy and its data, starts it again, waits until the app answers, prints `ready: <url>` |
| `reset.ps1 -Build` | the same, rebuilding the app from the current source first |
| `reset.ps1 -Down` | drops the copy and its data, nothing else |

It exits non-zero when the app does not come up, so the recording does not start against nothing.

`reset.example.ps1` is the Docker Compose version: its own compose project name (so its own volumes), the app's
`docker-compose.yml` plus `docker-compose.tutorial.yml` beside it (test seed, fake external services, another port).
`/mclip:init` writes `reset.ps1` and the override for the project from it; a project without Docker gets a script that
does the same three things its own way (a test database restored from a seed, the app started on another port).
