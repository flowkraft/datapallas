package com.flowkraft.ai.prompts;

import java.util.List;

public final class CustomDbSeedScript {

    private CustomDbSeedScript() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "CUSTOM_DB_SEED_SCRIPT",
            "Write a Custom Database Seed Script",
            "Generate a Groovy script that creates custom tables and populates them with sample data alongside the existing Northwind schema",
            List.of("database", "groovy", "seed", "custom-schema"),
            "Seed Data / Apps",
            """
Write a Groovy database seed script for **[VENDOR]** that creates custom tables and populates them with realistic sample data.

**YOUR SCHEMA & DATA REQUIREMENTS:**

<REQUIREMENT>
[USER: DESCRIBE THE TABLES AND SAMPLE DATA YOU WANT HERE — every table name prefixed my_*, with its columns (mark PK/FK), the row count, and which values are fixed vs DataFaker-generated.]
</REQUIREMENT>

*Example of a well-formed requirement (replace the placeholder above with your own):*
- Table: my_departments (dept_id PK, dept_name, location) — 6 rows with fixed names: Engineering, Marketing, Sales, HR, Finance, Operations
- Table: my_employees (emp_id PK, first_name, last_name, email, salary, dept_id FK→my_departments) — 20 rows
- Use DataFaker for realistic first/last names, email addresses, salaries between 45000–150000
- Each employee assigned to a random department

**Pre-configured variables (DO NOT create them yourself):**
- `dbSql` — a `groovy.sql.Sql` instance already connected to the [VENDOR] database
- `vendor` — String with the database vendor name
- `log` — SLF4J Logger

**DataFaker library** (`net.datafaker.Faker`) is on the classpath.
Docs: https://www.datafaker.net/documentation/getting-started/#usage
```groovy
import net.datafaker.Faker
def faker = new Faker(new Random(42)) // fixed seed → deterministic data
faker.name().fullName()
faker.company().name()
faker.address().city()
faker.internet().emailAddress()
faker.number().numberBetween(45000, 150000)
```

**`groovy.sql.Sql` methods you'll use:**
- `dbSql.execute("CREATE TABLE ...")` — DDL
- `dbSql.execute("INSERT INTO ... VALUES (?, ?)", [v1, v2])` — parameterized DML (SQL-injection safe)
- `dbSql.withTransaction { ... }` — wraps DML; rolls back on any exception

**HARD RULES — these are required for the script to work on every supported vendor:**

1. **Idempotency via DROP + CREATE, NOT `CREATE TABLE IF NOT EXISTS`.**
   `CREATE TABLE IF NOT EXISTS` is rejected by SQL Server, Oracle, and DB2. Use this universal pattern instead — define a `safeDrop` helper that swallows "table doesn't exist" on the first run, then plain `CREATE TABLE`:
   ```groovy
   def safeDrop = { String t ->
       try { dbSql.execute("DROP TABLE " + t) }
       catch (Exception ignored) { /* didn't exist — fine */ }
   }
   safeDrop("my_employees")     // children first (FK order)
   safeDrop("my_departments")
   dbSql.execute(\"\"\"CREATE TABLE my_departments (...)\"\"\")
   dbSql.execute(\"\"\"CREATE TABLE my_employees  (...)\"\"\")
   ```
   For ClickHouse you may use `DROP TABLE IF EXISTS` natively (it supports the syntax cleanly).

2. **Explicit IDs in INSERTs — do NOT rely on auto-increment.**
   Auto-increment syntax differs across every vendor (SERIAL / IDENTITY / AUTO_INCREMENT / sequences) and DuckDB needs an explicit sequence. Define columns as plain `INT NOT NULL PRIMARY KEY` (or `NUMBER` for Oracle, `UInt32` for ClickHouse) and supply the ID in every INSERT. Example:
   ```groovy
   deptNames.eachWithIndex { name, i ->
       dbSql.execute("INSERT INTO my_departments (dept_id, dept_name, location) VALUES (?, ?, ?)",
                     [i + 1, name, faker.address().city()])
   }
   ```

3. **DO NOT use `TRUNCATE`.** TRUNCATE is DDL that auto-commits on Oracle, MySQL, and MariaDB — it breaks `withTransaction` rollback semantics. The DROP+CREATE pattern in rule #1 makes TRUNCATE unnecessary anyway (the table is empty after CREATE).

4. **DDL outside the transaction; DML inside.**
   - `safeDrop(...)` and `CREATE TABLE` calls go BEFORE `dbSql.withTransaction { ... }`.
   - All `INSERT` statements go INSIDE `dbSql.withTransaction { ... }` so a mid-insert failure rolls everything back.
   - For **ClickHouse**, omit `withTransaction` entirely — ClickHouse has no multi-statement transactions.

5. **Use [VENDOR]-native data types in CREATE TABLE:**
   - Integer PK: `INT` (use `NUMBER` for Oracle, `UInt32` for ClickHouse)
   - String:    `VARCHAR(n)` (use `VARCHAR2(n)` for Oracle, `String` for ClickHouse)
   - Decimal:   `DECIMAL(10,2)` (use `Decimal64(2)` for ClickHouse)
   - Date:      `DATE`
   - ClickHouse tables additionally need `ENGINE = MergeTree() ORDER BY <pk>`.

6. **Touch ONLY tables prefixed `my_*`. NEVER read, write, or drop the Northwind tables (customer, product, employee, orders, etc.) OR the sample `seed_inv_*` invoice tables — both are existing data. Your tables are NEW, named from the requirement above and prefixed `my_*`.**

7. **Use DataFaker with a fixed seed (e.g. `new Random(42)`)** so re-runs produce identical data.

8. **Wrap inserts in `dbSql.withTransaction`** (except for ClickHouse). Do NOT call any FK-disabling commands (e.g. `SET session_replication_role`, `ALTER TABLE NOCHECK CONSTRAINT`) — they either need elevated privileges (Postgres/Supabase) or auto-commit (Oracle/DB2). Inserts in parents-first order satisfy FKs without disabling them.

**Working reference for [VENDOR]** — the ACTUAL, vendor-tested seed script DataPallas ships (it seeds the sample `seed_inv_*` tables). COPY its structure and vendor handling exactly — DROP+CREATE outside the transaction, INSERTs inside `withTransaction`, explicit IDs, fixed-seed DataFaker — but emit YOUR `my_*` tables from the requirement above. Do NOT reproduce its `seed_inv_*` names; those are its data, not yours:

```groovy
[VENDOR_EXAMPLE_SCRIPT]
```

**Final acceptance criteria for your generated script:**
- Re-running it 5× in a row on a [VENDOR] database produces the exact same final state with zero errors and zero warnings.
- It compiles as valid Groovy and runs end-to-end with only `dbSql`, `vendor`, and `log` as inputs.
- Every CREATE TABLE / INSERT statement uses [VENDOR]-correct syntax and types.

Now generate a complete, working Groovy script for **[VENDOR]** that satisfies the schema requirements above and follows all 8 hard rules."""
        );
    }
}
