# Stack profiles

The kit, the prototype seams and the tests in mflow are contracts: what a component takes, which states it shows, what must never reach production. A **stack profile** says how those contracts land in one technology. The project's choice lives in one place, AGENTS.md `## Stack`, and every skill reads names and paths from there.

## Profiles

| Option | Profile | What it is | Support |
|---|---|---|---|
| a) | `mvc-htmx` | ASP.NET Core MVC + Razor + Bootstrap 5.3 + HTMX, EF Core, xUnit, Playwright | Full: every skill's names and examples are written for it |
| b) | `react-vite` | React + Vite (TypeScript) front end, ASP.NET Core Web API back end, EF Core, xUnit for domain and API, Vitest for UI, Playwright | The same contracts as React components; the API owns permissions, data scope and paging |
| c) | `custom` | Any other stack the user names (Next.js, Laravel, Django, Vue…) | Claude fills the rows below for that stack and the user confirms them; not yet tested with mflow |

## Rows of `## Stack`

AGENTS.md holds `Project name (code): <Name>` (see "Project name" below), `Profile: <id>` and this table for the chosen profile only (two columns: Seam, Value). `<ProjectName>` in the rows is that name, and `<Part>` the part of the web app that hosts the prototype screens, usually `Backend` (app names: code-structure in `${CLAUDE_PLUGIN_ROOT}/skills/discuss/references/topics.md`). Commands (build, test, run) live in AGENTS.md `## Commands`, not here.

| Seam | `mvc-htmx` | `react-vite` |
|---|---|---|
| UI files (UI rule `paths:`) | `src/**/Views/**/*.cshtml`, `src/**/Pages/**/*.cshtml`, `src/**/wwwroot/css/**/*.css` | `src/<ProjectName>.Web.<Part>/src/**/*.tsx`, `src/<ProjectName>.Web.<Part>/src/**/*.css` |
| Tokens file | `wwwroot/css/tokens.css`, with the Bootstrap 5.3 bridge | `src/styles/tokens.css`; keep the Bootstrap bridge only if the UI uses Bootstrap |
| App shell | `Views/Shared/_Layout.cshtml` | `src/components/layout/AppShell.tsx` |
| Components | `Views/Shared/Components/` (partials, view components, tag helpers) | `src/components/ui/` |
| Style guide | `/_styleguide` | `/_styleguide` route, dev and prototype builds only |
| Prototype data | `src/<ProjectName>.Web.<Part>/PrototypeData/` | `PrototypeData/` in the API project; the UI reads it only through the API |
| Prototype-mode flag | `Prototype:UseFakeData` | `Prototype:UseFakeData` in the API; the UI shows the banner and switcher only when the API reports it |
| Data access | EF Core + migrations | EF Core + migrations in the API |
| Unit tests | xUnit (`[Theory]` + `[InlineData]` / `[MemberData]`) | xUnit for domain and API, Vitest for UI |
| E2E tests | Playwright | Playwright |
| Golden data folder | `tests/<ProjectName>.Domain.Tests/Golden/` | `tests/<ProjectName>.Domain.Tests/Golden/` |

For `custom`, fill every row for the named stack. The prototype-mode flag row must also say how fake users, the role switcher and fake repositories are kept out of production: left out of the production build, or refused at startup when the flag is on outside a development or prototype environment. A runtime flag alone is not enough. A row that cannot be filled is written `TODO: <why>` and raised before `/mflow:theme`; it is never guessed.

## Asking

`/mflow:init` asks this right after its inventory report. Any other skill that finds no `## Stack`, or `Profile: TODO`, asks it before doing anything else. That covers projects set up before mflow 0.10.

1. **Infer.** Take the evidence from the repo: `*.csproj` with `Views/` points to a); `package.json` with `vite` beside an ASP.NET Core Web API points to b); anything else points to c), naming what was found. In an empty repo, recommend a), the fully supported profile.
2. **Ask, always**, while `## Stack` has no profile, even when the evidence is clear (a profile already chosen is kept on a rerun, as `/mflow:init` step 2 says). Show the options `a)` `b)` `c)`, one line each, with the recommendation and its evidence. A letter is a full answer. For c), ask which stack.
3. **Record.** Write `## Stack` in AGENTS.md: `Project name (code): <Name>`, `Profile: <id>` and the rows for that profile, with `<ProjectName>` filled in. For c), write the filled rows and show them; they need no separate yes, because the `tech-stack` discussion doc reviews them before `/mflow:theme`. The Apps, Libraries and Later parts of `## Stack` stay `TODO`: the `tech-stack` discussion doc, the first topic on the agenda, fills them before `/mflow:theme`, and may change the profile and its paths, which is still cheap at that point.

Done when: AGENTS.md has `## Stack` with a project name and a profile, and every row has a value or `TODO: <why>`.

## Project name

The name in code that every project, folder and namespace starts with: `<ProjectName>.Domain`, `<ProjectName>.Api`, `<ProjectName>.Web.Backend` (the app names are in code-structure, `${CLAUDE_PLUGIN_ROOT}/skills/discuss/references/topics.md`). It is not the display name of the AGENTS.md title or `backlog init`, which may be Thai.

`/mflow:init` asks it in the same message as the stack. A skill or discussion that needs it and finds `Project name (code)` missing or `TODO` (projects set up before mflow 0.22) asks it first, the same way; a repo whose solution already exists offers its current prefix as the recommendation.

- **Suggest three, recommend one,** then "or type your own": a) what the customer calls the system, in English or transliterated (ระบบบริหารบุคลากรโรงเรียน → `SchoolHr`); b) the display name or folder name in PascalCase (`school-hr-system` → `SchoolHrSystem`); c) a short brand-like name (`KruHub`). A letter or a typed name is a full answer.
- **Rules for any name, suggested or typed:** ASCII letters and digits in PascalCase, starting with a letter; no spaces, hyphens or underscores; a company prefix only as `Company.Product` (`Acme.SchoolHr`); about 20 characters at most, so `<ProjectName>.Web.Frontend.Tests` stays readable; never a name that clashes with .NET or reads as a layer or a kind (`System`, `Microsoft`, `App`, `Web`, `Api`, `Core`, `Domain`). A typed name that breaks a rule gets the nearest valid form offered back.
- **Changing it** is cheap until the solution exists. After that it renames projects, folders and namespaces: a new code-structure discussion doc and an OpenSpec change, never a side effect of rerunning `/mflow:init`.

## Reading the skills under another profile

The skills name things the `mvc-htmx` way: controller, ViewModel, partial, `PrototypeDataStore`, `Prototype:UseFakeData`. Under another profile, read each name by its role and build the equivalent at the path `## Stack` gives. The contract stays the same: the inputs, the states, server-side paging, state in the URL, permission keys checked where data is served, and data scope applied in the query.

One invariant holds for every profile: fake users, the role switcher and fake repositories exist only under the prototype-mode flag and can never run in production. The flag is decided at runtime, so the app also refuses to start with it on outside a development or prototype environment, unless the production build leaves that code out ("Production safety" in `${CLAUDE_PLUGIN_ROOT}/skills/screen/references/prototype-data.md`). `/mflow:review` treats a breach as a blocker.

## Changing the stack later

- **Before `/mflow:theme`:** edit `## Stack`, or ask the question again, and rerun the commands in `## Commands`.
- **After a static preview but before `/mflow:theme port`:** still cheap. The preview is plain HTML, CSS and JavaScript; only its CSS base (Bootstrap or not) may need adjusting.
- **After the kit or screens exist:** this is a rebuild of the kit and screens, not a setting. Record it with `backlog decision create` and plan it with the user. mflow does not move screens between stacks.
