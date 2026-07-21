package com.flowkraft.ai.prompts;

import java.util.List;

public final class CustomDbWipeScript {

    private CustomDbWipeScript() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "CUSTOM_DB_WIPE_SCRIPT",
            "Write a Custom Database Wipe Script",
            "Generate a Groovy script that completely drops the custom my_* tables a companion seed script created — the exact reverse of the seed, leaving Northwind untouched",
            List.of("database", "groovy", "wipe", "custom-schema"),
            "Seed Data / Apps",
            """
Write a Groovy database WIPE script for **[VENDOR]** that completely removes the custom tables a companion seed script created, restoring the database to exactly the state it was in before seeding.

**THE TABLES TO WIPE (the SAME schema you gave the seed prompt):**

<REQUIREMENT>
[USER: LIST THE my_* TABLES YOUR SEED SCRIPT CREATED AND WHICH TABLE REFERENCES WHICH (so the wipe drops children before parents) — OR simply paste the seed script itself here and let the wipe reverse its CREATE TABLEs. This is the SAME schema you gave the "Write a Custom Database Seed Script" prompt.]
</REQUIREMENT>

**Pre-configured variables (DO NOT create them yourself):**
- `dbSql` — a `groovy.sql.Sql` instance already connected to the [VENDOR] database
- `vendor` — String with the database vendor name
- `log` — SLF4J Logger

**HARD RULES — required for the wipe to work on every supported vendor:**

1. **Idempotent DROP via a `safeDrop` helper** (so re-running never errors on an already-gone table):
   ```groovy
   def safeDrop = { String t ->
       try { dbSql.execute("DROP TABLE " + t) }
       catch (Exception ignored) { /* didn't exist — fine */ }
   }
   ```
   There is no portable `DROP TABLE IF EXISTS` — SQL Server, Oracle, and DB2 reject it — so `safeDrop` is the universal pattern. For **ClickHouse** you may use `DROP TABLE IF EXISTS` natively.

2. **Drop CHILDREN before PARENTS (reverse FK order).** A table referenced by a foreign key cannot be dropped while the referencing table still exists — drop the many-side first:
   ```groovy
   safeDrop("my_employees")     // child (FK -> my_departments)
   safeDrop("my_departments")   // parent
   ```

3. **Touch ONLY tables prefixed `my_*`. NEVER drop, read, or write the Northwind tables (customer, product, employee, orders, etc.) OR the sample `seed_inv_*` invoice tables.** The sample database must be left completely intact.

4. **No `TRUNCATE`, no `DELETE`.** The goal is to remove the tables entirely, not empty them. `DROP TABLE` does exactly that; `TRUNCATE` is DDL that auto-commits on Oracle/MySQL/MariaDB and leaves the emptied table behind.

5. **DDL only — no `withTransaction`.** `DROP` auto-commits on most vendors, so a transaction wrapper buys nothing. Keep it a flat sequence of `safeDrop(...)` calls, children-first.

6. **Idempotent end state:** running it 5× in a row must leave the same final state — every `my_*` table gone, zero errors, zero warnings — whether the tables existed on that run or not.

**Working reference for [VENDOR]** — the ACTUAL, vendor-tested wipe script DataPallas ships (it drops the sample `seed_inv_*` tables). Note how it DISCOVERS the target tables from the vendor catalog by prefix and drops them child-first with vendor-correct DDL — the robust, schema-proof approach. Do the same for YOUR tables: discover and drop everything matching `my_%` (or drop your known `my_*` tables child-first). Emit only `my_*` — never its `seed_inv_*` names:

```groovy
[VENDOR_EXAMPLE_WIPE_SCRIPT]
```

**Final acceptance criteria for your generated script:**
- After it runs, every `my_*` table the seed created is gone and every Northwind table is untouched.
- Re-running it 5× in a row on a [VENDOR] database produces the exact same final state with zero errors and zero warnings.
- It compiles as valid Groovy and runs end-to-end with only `dbSql`, `vendor`, and `log` as inputs.

Now generate a complete, working Groovy WIPE script for **[VENDOR]** that drops exactly the `my_*` tables above, children-first, and touches nothing else."""
        );
    }
}
