# Data dictionary of the shell pack

The shell stores no table of its own. Filters, sort, page and page size live in the address (SHELL-D11); the sidebar's expanded or rail choice and each filter panel's open or closed state are per-browser conveniences that the kit keeps in a cookie or in browser storage, never in the database. The menu definition is code, and the keys behind it belong to the permission pack.

Two answers add one column each to the account table of the users pack, not a table here: option c) of SHELL-D07 (a language switch) adds `preferred_language` (`text`, `th` or `en`, default the project's first language), and option c) of SHELL-D08 (a time zone per user) adds `time_zone` (`text`, an IANA zone name, default `shell.time_zone`). With the pack's answers, neither column exists.
