# Project name and app names

The **project name in code** is the name every project, folder and namespace starts with: `<ProjectName>.Domain`, `<ProjectName>.Api`, `<ProjectName>.Web.Backend`. It is not the display name (the AGENTS.md title), which may be Thai. It lives in AGENTS.md `## Stack` as `Project name (code): <Name>`.

## Asking

`/mreq:init` asks it in the same message as the display name. A skill or a discussion doc that needs it and finds `Project name (code)` missing or `TODO` asks it first, the same way; a repo whose code already exists offers its current prefix as the recommendation.

- **Suggest three, recommend one,** then "or type your own": a) what the customer calls the system, in English or transliterated (ระบบบริหารบุคลากรโรงเรียน → `SchoolHr`); b) the display name or folder name in PascalCase (`school-hr-system` → `SchoolHrSystem`); c) a short brand-like name (`KruHub`). A letter or a typed name is a full answer.
- **Rules for any name, suggested or typed:** ASCII letters and digits in PascalCase, starting with a letter; no spaces, hyphens or underscores; a company prefix only as `Company.Product` (`Acme.SchoolHr`); about 20 characters at most, so `<ProjectName>.Web.Frontend.Tests` stays readable; never a name that clashes with .NET or reads as a layer or a kind (`System`, `Microsoft`, `App`, `Web`, `Api`, `Core`, `Domain`). A typed name that breaks a rule gets the nearest valid form offered back.
- **Changing it** is cheap until the builder creates the solution. After that it renames projects, folders and namespaces: a new `code-structure` discussion doc that supersedes the old one, and a line for the builder in `mreq/project/followups.md`.

## App names

Every deployable app is `<ProjectName>.<Kind>` or `<ProjectName>.<Kind>.<Part>`, for its project, its folder and its root namespace alike. The `code-structure` discussion doc settles them; the `tech-stack` doc lists the apps.

- **Kind:** `Web` for a site people open in a browser, `Api` for an HTTP API. Other kinds follow the same pattern (`Worker`, `Mobile`).
- **Part:** which app of that kind. When a kind has more than one app, or the tech-stack doc plans another one later, every app of that kind carries a part from the first, so none is renamed later. `Frontend` is หน้าบ้าน, the site or API for customers or the public; `Backend` is หลังบ้าน, the back office for staff; another audience takes its own name (`Portal`, `Partner`). Frontend and Backend name the audience, not the browser and server tiers: a web app's server side is part of that app or of its `.Api`.
- **One app of a kind, none planned:** no part (`<ProjectName>.Api`).
- **Not .NET:** a React or other web app keeps the same folder name; its package name is the same in lowercase with hyphens (`schoolhr-web-frontend`).
- Example: `SchoolHr.Web.Backend` (หลังบ้าน for HR staff), `SchoolHr.Web.Frontend` (หน้าบ้าน for teachers), `SchoolHr.Api` (the only API).

The UI kit builds one shell per kind of app with screens: a back-office shell for `Backend` apps and a site shell for public-facing ones (`Frontend`, `Portal`…). The prototype screens of each app live in `mreq/ui/prototype/<App>/`, named by the app's `<Kind>.<Part>` (`Web.Backend`).
