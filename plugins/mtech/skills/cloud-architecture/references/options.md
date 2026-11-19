# Options: choosing the modernization path

## Per-component strategies

| Strategy | Means | Use when | Cost of choosing it |
|---|---|---|---|
| **Retire** | switch off | unused module, duplicate tool | none, but confirm with usage logs |
| **Rehost** | same app on cloud VMs (e.g. Windows EC2 + RDS SQL Server) | must leave the data centre fast; code cannot change yet | Windows + SQL Server licences, no scaling benefit |
| **Replatform** | same code, managed pieces (containers, managed DB, object storage) | app already on .NET Core / Java / Node; file and session changes are small | moderate code changes |
| **Refactor / rewrite** | new code on the target stack | blocked runtime (WebForms, Windows-only report suite), or DB engine change | largest; must be phased |

## Phase by value (strangler fig)

Order phases so each one pays off even if the next slips. The pattern that worked for a WebForms + SQL Server system:

| Phase | Delivers | Why this order |
|---|---|---|
| 0 Foundation | accounts, network, CI/CD, secrets out of git, logging | everything else needs it |
| 1 Media | files to object storage + CDN previews (dual-write first) | cuts bandwidth and disk immediately, no DB change |
| 2 Existing modern services | already-.NET-Core APIs / consoles as containers | cheapest wins |
| 3 Rewrite the UI module by module behind a reverse proxy (YARP) | removes the Windows-only blocker | biggest; keep scope tight |
| 4 Database engine move | one cutover after no old ORM / T-SQL remains | engine change is coupled to the rewrite |
| 5 Decommission | old servers off, secure wipe | stops double running cost |

State the fallback: if the business must exit on-prem before phase 3 ends, rehost the legacy part temporarily and plan its retirement.

## Decision record

For each decision write: date, the options considered (one line each with cost / risk), the choice, and what would make us revisit it. Put it next to the topic in the README, e.g. "**ตัดสินใจ 8 พ.ย. 2026:** RDS 8 GB from day one; revisit after 4–8 weeks of metrics before buying a Reserved Instance."

Recurring decisions worth asking the user explicitly: managed DB vs self-installed on VM; DB size at start vs scale-on-alarm; own upload / conversion program vs managed transfer / serverless; storage tiers by file age; identity provider scope (staff only vs partners); token lifetime; VPN vs none during migration; local-region vs nearest region; who owns the cloud account.
