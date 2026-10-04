package com.flowkraft.ai.prompts;

import java.util.List;

public final class DbSchemaDomainGrouped {

    private DbSchemaDomainGrouped() {}

    public static PromptDefinition create() {
        return new PromptDefinition(
            "DB-SCHEMA-DOMAIN-GROUPED",
            "Generate Domain-Grouped Schema",
            "Groups database tables into business domains for a tree-view UI. The client hydrates full table metadata into the output after paste, so the LLM only needs to return the grouping structure with table-name references.",
            List.of("database", "schema", "domain-grouped"),
            "Database Schema",
            """
You are an expert Database Modeler and Data Architect. You group database tables into business domains for a tree-view UI.

**INPUT** — a lightweight table summary. Each entry gives you the table name, its type (TABLE or VIEW) and the set of tables it references via foreign keys:

```json
[INSERT YOUR DATABASE SCHEMA HERE]
```

**YOUR TASK:**

* Analyze the table names and their foreign-key references.
* Define 3-12 logical business domains (e.g. "Sales & Orders", "Product Catalog", "Customer Management", "Human Resources", "Inventory"). Nested sub-domains are allowed where it makes sense.
* Assign every input table to exactly one domain (no duplication, no omissions).
* Name domains based on business function (not technical purpose). Tables that are frequently used together or manage closely related entities (e.g. Orders and OrderDetails) should typically be grouped within the same domain.

**OUTPUT** — a single JSON object with exactly ONE top-level property:

1. `domainGroupedSchema` — an array of Domain Objects. Each Domain Object has:
   * `label` (string) — the domain display name.
   * `children` (array) — either nested Domain Objects (same shape) or thin table leaves. Each table leaf is a JSON object with a single property:
       `{ "tableName": "..." }`
     where `tableName` matches an input table name verbatim. When an input table has a `schemaName`,
     copy it into the leaf too: `{ "tableName": "...", "schemaName": "..." }`. The same table name can
     exist in two schemas, and that is the only way to tell the two tables apart.

**IMPORTANT:**
* Do NOT include `originalSchema` in your output — the client handles that.
* Do NOT echo back columns, foreign keys, or other table metadata — the client has them cached and will hydrate the output after you return it.
* Just return the grouping structure with table-name references. Nothing else.

Every input table must appear exactly once across all `children` arrays combined.

**Example output:**

```json
{
  "domainGroupedSchema": [
    { "label": "Customer Management", "children": [
        { "tableName": "Customers" },
        { "tableName": "CustomerDemographics" }
    ]},
    { "label": "Sales & Orders", "children": [
        { "tableName": "Orders" },
        { "tableName": "Order Details" },
        { "tableName": "Shippers" }
    ]},
    { "label": "Product Catalog", "children": [
        { "tableName": "Products" },
        { "tableName": "Categories" },
        { "tableName": "Suppliers" }
    ]}
  ]
}
```

Produce a single, valid JSON object as your output. No explanations, no prose, no code fences around the final answer."""
        );
    }
}
