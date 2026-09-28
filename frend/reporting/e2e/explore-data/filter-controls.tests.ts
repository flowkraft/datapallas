// Filter-controls scenarios — "give me a dropdown / button group so my
// dashboard users can narrow the data". autoFilterPaneField picks the column.
//
// Comment above each `it(...)` is the matching row from README.md.

import { autoFilterPaneField } from "@/lib/explore-data/smart-defaults";
import { filterValueApplies } from "@/lib/explore-data/filter-values";

import {
  customersSchema,
  customersCardinality,
  ordersSchema,
  ordersCardinality,
  shippersSchema,
  categoriesSchema,
  employeesSchema,
  employeesCardinality,
} from "./fixtures/northwind.fixture";

describe("Dashboard builder adds a 'filter customers by country' control", () => {
  // | 116 | Customer-country filter → picks "Region" | Customers schema+cardinality | result === `"Region"` |
  // Region (4 distinct values) has lower cardinality than Country (10). The auto-pick
  // algorithm sorts by cardinality ascending and returns the lowest-card non-ID column.
  // Cardinality-based interestingness: columns with < 10 distinct values are preferred.
  // The user can override to "Country" in the filter-pane config panel.
  it("Region is auto-picked — cardinality 4 beats Country's 10 (lowest-card non-ID wins)", () => {
    const suggested = autoFilterPaneField(
      customersSchema,
      customersCardinality,
    );
    expect(suggested).toBe("Region");
  });

  // | 117 | Customer-country — doesn't pick ContactName (free text) | Same | result !== `"ContactName"` |
  it("ContactName is NOT picked — free-text fields are excluded from filter dropdowns", () => {
    const suggested = autoFilterPaneField(
      customersSchema,
      customersCardinality,
    );
    expect(suggested).not.toBe("ContactName");
  });
});

describe("Dashboard builder adds a 'filter orders by country'", () => {
  // | 118 | Order-country filter → picks "ShipRegion" | Orders schema+cardinality | result === `"ShipRegion"` |
  // ShipRegion (4 distinct values) has lower cardinality than ShipCountry (10).
  it("ShipRegion is auto-picked — cardinality 4 beats ShipCountry's 10", () => {
    const suggested = autoFilterPaneField(
      ordersSchema,
      ordersCardinality,
    );
    expect(suggested).toBe("ShipRegion");
  });

  // | 119 | Order filter skips IDs | Same | result not in `[OrderID,CustomerID,EmployeeID,ShipVia]` | ref filters also exclude FKs by convention |
  it("OrderID / CustomerID / EmployeeID / ShipVia are all skipped — IDs never make good filters", () => {
    const suggested = autoFilterPaneField(
      ordersSchema,
      ordersCardinality,
    );
    expect(["OrderID", "CustomerID", "EmployeeID", "ShipVia"]).not.toContain(suggested);
  });
});

describe("Dashboard builder adds a 'filter by shipper' — only 3 shippers, should still work", () => {
  const shippersCardinality = { ShipperID: 3, CompanyName: 3, Phone: 3 };

  // | 120 | Shipper filter → picks "CompanyName" (ShipperID is PK) | Shippers | result === `"CompanyName"` | ref: user picks Name field manually |
  it("CompanyName is picked (ShipperID is a PK, skipped) — 3 shippers (Speedy, United, Federal)", () => {
    const suggested = autoFilterPaneField(
      shippersSchema,
      shippersCardinality,
    );
    expect(suggested).toBe("CompanyName");
  });
});

describe("Dashboard builder adds a 'filter by category'", () => {
  const categoriesCardinality = { CategoryID: 8, CategoryName: 8, Description: 8 };

  // | 121 | Category filter → picks "CategoryName" | Categories | result === `"CategoryName"` | Same — manual |
  it("CategoryName is picked — CategoryID is a PK/ID, Description is free-text (skipped)", () => {
    const suggested = autoFilterPaneField(
      categoriesSchema,
      categoriesCardinality,
    );
    expect(suggested).toBe("CategoryName");
  });
});

describe("Dashboard builder adds a 'filter employees by title' — only 2 distinct titles", () => {
  // | 122 | Employee-title filter (2 distinct titles) | Employees | result === `"Title"` | ref: Title column auto-ranks high for filters |
  it("Title is picked — 2 distinct values (Sales Representative / VP Sales), prefect filter material", () => {
    const suggested = autoFilterPaneField(
      employeesSchema,
      employeesCardinality,
    );
    expect(suggested).toBe("Title");
  });
});

describe("A dashboard filter the user clears means the filter is not applied", () => {
  // The canvas hears every value through one `valueChange` event, fired both when
  // <rb-parameters> seeds itself and when a person changes a control. Empty means
  // opposite things in the two cases, and `rbInit` is what tells them apart.
  it("a value a person cleared reaches the canvas — the filter goes, the rows come back", () => {
    expect(filterValueApplies("", "2026-01-31", false)).toBe(true);
  });

  it("the component seeding itself may not write an empty over a value already there", () => {
    expect(filterValueApplies("", "2026-01-31", true)).toBe(false);
  });

  it("a seeded empty with nothing already there is simply the empty value", () => {
    expect(filterValueApplies("", undefined, true)).toBe(true);
    expect(filterValueApplies("", "", true)).toBe(true);
  });

  it("a value that is something always applies, whoever wrote it", () => {
    expect(filterValueApplies("2026-01-31", "", true)).toBe(true);
    expect(filterValueApplies("2026-01-31", "2026-02-01", false)).toBe(true);
  });
});
