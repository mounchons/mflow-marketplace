# Data dictionary of the foundation pack

This pack stores no table of its own. It sets how every other table is built: names in snake_case, money at `foundation.money_precision`, one DbContext in Infrastructure, and the schema changed only through migrations (FOUND-D05, FOUND-D06, FOUND-D23). A multi-organisation answer to FOUND-D08 adds a tenant key to every business table, written in the data-model documents of each aggregate. The tables themselves, and the keys, audit columns and version column they carry, belong to the data-model documents and to the audit pack.
