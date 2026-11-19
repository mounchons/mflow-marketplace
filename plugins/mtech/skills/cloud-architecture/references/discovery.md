# Discovery: inventory the As-Is from code

Read the repo's own `AGENTS.md` / `CLAUDE.md` / README first; they often state hosting, build and pitfalls. Then fill the table. Use Grep / Glob over the code (an index such as a code graph may skip legacy languages like VB.NET, `.aspx`, `.ascx`).

## Inventory table (one row each, evidence = `path:line` or "question")

| Area | Find | Typical search | Why it matters on cloud |
|---|---|---|---|
| Runtime | framework + version per project (.NET Framework 4.x, .NET 8/9, Java, PHP, Node) | `*.vbproj`, `*.csproj` `TargetFramework`, `web.config` `targetFramework`, `pom.xml`, `package.json` | .NET Framework / WebForms needs Windows; containers need .NET Core+ or Windows containers |
| UI tech | WebForms, MVC, SPA, third-party UI / report suites (DevExpress, Telerik, Crystal) | `*.aspx`, `Register Assembly`, `*.repx`, `*.rpt` | Windows-only libraries block Linux containers; licence cost |
| Hosting | IIS sites, app pools, Windows services, console jobs | `web.config`, `Global.asax`, `Program.cs`, `Module1.vb`, `*.bat`, docs | Scheduled jobs often live in Task Scheduler, outside the repo: list them as a question |
| Data stores | each DB, engine, how many, linked servers | connection-string names in config (record the NAME and file, never the value) | Engine change (SQL Server → PostgreSQL) couples to the code rewrite |
| SQL lock-in | stored procs, views, T-SQL syntax, `NOLOCK`, `GETDATE`, CLR, collation | `*.sql`, `.edmx`, `ExecuteSqlCommand`, `FromSql`, `SqlCommand` | Drives refactor effort and whether a DB move can be separate |
| ORM | EF6 edmx, EF Core, Dapper, raw ADO | `*.edmx`, `DbContext` | EF6 database-first ties to SQL Server |
| Files on disk | uploads, images, exports, temp, UNC shares | `Server.MapPath`, `File.Write`, `Directory.`, `\\\\server` | Must move to object storage; count files and TB (PUT cost is per file) |
| State in process | InProc session, static caches, `lock` / `SyncLock`, singletons, SignalR hubs | `Session(`, `Session[`, `SyncLock`, `lock (`, `static`, `Hub` | Breaks behind a load balancer; needs Redis / DB / backplane |
| Auth | Membership, Identity, custom tables, password storage, roles | `MembershipProvider`, `Roles.`, `passwordFormat` | Plain or weak hashes force a reset / lazy-migration plan; MFA needs |
| Integrations | partner APIs in / out, SOAP / ASMX, SFTP / FTP, email, SMS | `HttpClient`, `WebClient`, `.asmx`, `Renci.SshNet`, `SmtpClient` | IP allow-lists, static egress IP (NAT + Elastic IP), endpoint changes to announce |
| Scheduling | console apps, timers, Hangfire, Quartz | `Main(`, `Timer`, `RecurringJob` | Become scheduled tasks / functions; check overlap and timezone |
| Logging | file logs, event log, log4net / Serilog / NLog | `App_Data\\Logs`, `log4net`, `Serilog` | Containers need stdout JSON logs; audit requirements |
| Time | `DateTime.Now`, server timezone assumptions | `DateTime.Now`, `GETDATE()` | Cloud defaults to UTC |
| Large request limits | upload size, timeouts | `maxRequestLength`, `executionTimeout`, `MaxRequestBodySize` | Load balancer idle timeouts; presigned uploads |
| Secrets in repo | config files, docs, `.env` with real credentials | `password=`, `pwd=`, `ApiKey`, `.env`, `appsettings*.json` | Record file paths only; plan rotation into a secrets manager |
| Existing newer services | containers, docker-compose, CDC pipelines, dashboards | `Dockerfile`, `docker-compose*.yml`, `*.sln` | Easy first movers; reuse patterns |
| Size facts | DB size, rows of big tables, file count / TB, monthly growth, egress, users, peak hours | not in code → ask; sample folders to estimate average file size | Every cost line depends on these |

## Blockers summary

After the table, list the hard blockers (e.g. "WebForms cannot run in Linux containers", "EF6 edmx is SQL Server-only", "InProc session × 213 call sites") with counts from Grep, and the scale-out code changes (session, data-protection keys, locks, local files, logs, SignalR, timezone, upload limits). These feed the options step and the "code changes before scale-out" section of the README.

## Questions list

Everything the code cannot answer becomes a numbered question with the decision it drives, e.g. "Uplink of the on-prem site → under 100 Mbps the 12 TB upload exceeds 12 days; consider a physical transfer device".
