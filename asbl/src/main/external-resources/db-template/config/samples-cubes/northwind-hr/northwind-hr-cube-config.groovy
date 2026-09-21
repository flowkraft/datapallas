// ═══════════════════════════════════════════════════════════════════════════
// Northwind Human Resources cube
// ═══════════════════════════════════════════════════════════════════════════
//
// Cube source: Employees
// Connection: rbt-sample-northwind-sqlite-4f2
//
// Entire point: HR view of the workforce — who works here, where, how long,
// what role, what territories they cover.
//
// Northwind's Employees table is small (~9 rows in seed data)
// so the cube is appropriately focused. Real HR questions answerable here:
//   - "Workforce composition by country / city / title?"
//   - "Average tenure of the workforce?"
//   - "Average employee age?"
//   - "Reporting structure — how many direct reports per manager ID?"
//   - "Territory coverage — how many sales regions does the team cover?"
//
// JOIN graph (3-level chain):
//
//   Employees (cube source)
//     └── EmployeeTerritories (L1, parent=CUBE — one_to_many junction)
//           └── Territories     (L2, parent=EmployeeTerritories — many_to_one)
//                 └── Region    (L3, parent=Territories — many_to_one)
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'Employees'
  title 'Northwind Human Resources'
  description 'Workforce composition, tenure, age, and territory coverage'

  // ── Dimensions: Employees (cube source) ────────────────────────────────
  dimension {
    name 'EmployeeID'
    title 'Employee ID'
    description 'Unique employee identifier'
    sql '${CUBE}.EmployeeID'
    type 'number'
    primary_key true
  }
  dimension {
    name 'EmployeeName'
    title 'Employee'
    description 'Full name (FirstName LastName)'
    sql "FirstName || ' ' || LastName"
    type 'string'
  }
  dimension {
    name 'Title'
    title 'Job Title'
    description 'Employee job title (e.g. "Sales Representative")'
    sql 'Title'
    type 'string'
  }
  dimension {
    name 'HireDate'
    title 'Hire Date'
    description 'Date employee was hired (group by year for hiring trends)'
    sql 'HireDate'
    type 'time'
  }
  dimension {
    name 'City'
    title 'City'
    description 'Employee city'
    sql 'City'
    type 'string'
  }
  dimension {
    name 'Country'
    title 'Country'
    description 'Employee country'
    sql 'Country'
    type 'string'
  }
  dimension {
    name 'ReportsTo'
    title 'Manager Employee ID'
    description 'EmployeeID of the manager (NULL = top of org chart). Self-join not supported \u2014 group by this to count direct reports per manager ID.'
    sql 'ReportsTo'
    type 'number'
  }

  // ── Dimensions: Territories (L2 via EmployeeTerritories) ───────────────
  dimension {
    name 'TerritoryDescription'
    title 'Territory'
    description 'Human-readable territory name'
    sql 'Territories.TerritoryDescription'
    type 'string'
  }

  // ── Dimensions: Region (L3 via Territories) ───────────────────────────
  dimension {
    name 'RegionDescription'
    title 'Sales Region'
    description 'Sales region (Eastern, Western, Northern, Southern)'
    sql 'Region.RegionDescription'
    type 'string'
  }

  // ── Measures ────────────────────────────────────────────────────────────
  // These measures are designed for group-level analysis (by country / title /
  // territory / region). At per-employee grain (grouping by EmployeeID or
  // EmployeeName) they degenerate to 1 / the employee's own value \u2014 honest
  // but trivial. For per-employee browsing pick HireDate and use the employee
  // dimensions directly.
  measure {
    name 'EmployeeCount'
    title 'Employee Count'
    description 'Number of distinct employees. PICK THIS WHEN: grouping by country / title / territory / region. (At per-employee grain it always returns 1.)'
    sql '${CUBE}.EmployeeID'
    type 'count_distinct'
  }
  // The date arithmetic below is SQLite's, deliberately: this sample is wired to
  // rbt-sample-northwind-sqlite-4f2, and measure/segment sql is passed through to
  // the database verbatim - nothing translates it. SQLite has no EXTRACT, so
  // EXTRACT(YEAR FROM ...) fails here with a syntax error. The academy cubes that
  // academy-cubes.groovy writes into config/cubes run on DuckDB and PostgreSQL and
  // use EXTRACT for the same reason; that spelling belongs there, not here.
  measure {
    name 'AvgTenureYears'
    title 'Avg Tenure (years)'
    description "Average years since hire date. PICK THIS WHEN: grouping by title / country / segment. (At per-employee grain it returns that employee's own tenure.)"
    sql "(strftime('%Y', 'now') - strftime('%Y', \${CUBE}.HireDate))"
    type 'avg'
  }
  measure {
    name 'AvgAgeYears'
    title 'Avg Age (years)'
    description "Average age in years. PICK THIS WHEN: grouping by title / country / segment. (At per-employee grain it returns that employee's own age.)"
    sql "(strftime('%Y', 'now') - strftime('%Y', \${CUBE}.BirthDate))"
    type 'avg'
  }
  measure {
    name 'UniqueTerritories'
    title 'Unique Territories'
    description 'Number of distinct territories covered (requires Territories join)'
    sql 'Territories.TerritoryDescription'
    type 'count_distinct'
  }
  measure {
    name 'UniqueSalesRegions'
    title 'Unique Sales Regions'
    description 'Number of distinct sales regions covered (requires the full 3-level chain)'
    sql 'Region.RegionDescription'
    type 'count_distinct'
  }

  // ── Joins (3-level chain) ──────────────────────────────────────────────
  join {
    name 'EmployeeTerritories'
    parent 'CUBE'
    sql '${CUBE}.EmployeeID = EmployeeTerritories.EmployeeID'
    relationship 'one_to_many'
  }
  join {
    name 'Territories'
    parent 'EmployeeTerritories'
    sql 'EmployeeTerritories.TerritoryID = Territories.TerritoryID'
    relationship 'many_to_one'
  }
  join {
    name 'Region'
    parent 'Territories'
    sql 'Territories.RegionID = Region.RegionID'
    relationship 'many_to_one'
  }

  // ── Segments ────────────────────────────────────────────────────────────
  segment {
    name 'executives'
    title 'Executives (no manager)'
    description 'Employees without a ReportsTo manager \u2014 top of org chart'
    sql '${CUBE}.ReportsTo IS NULL'
  }
  segment {
    name 'individual_contributors'
    title 'Individual Contributors'
    description 'Employees who report to someone'
    sql '${CUBE}.ReportsTo IS NOT NULL'
  }
  segment {
    name 'usa_based'
    title 'USA-Based'
    description 'Employees based in the USA'
    sql "\${CUBE}.Country = 'USA'"
  }
  segment {
    name 'uk_based'
    title 'UK-Based'
    description 'Employees based in the UK'
    sql "\${CUBE}.Country = 'UK'"
  }
  segment {
    name 'senior_tenure'
    title 'Senior Tenure (5+ years)'
    description 'Employees with 5 or more years of tenure'
    sql "(strftime('%Y', 'now') - strftime('%Y', \${CUBE}.HireDate)) >= 5"
  }
  segment {
    name 'recent_hires'
    title 'Recent Hires (\u22642 years)'
    description 'Employees hired within the last 2 years'
    sql "(strftime('%Y', 'now') - strftime('%Y', \${CUBE}.HireDate)) <= 2"
  }

  // ── Hierarchies ─────────────────────────────────────────────────────────
  hierarchy {
    name 'employee_geography'
    title 'Employee Geography'
    levels 'Country', 'City', 'EmployeeName'
  }
  hierarchy {
    name 'sales_territory'
    title 'Sales Territory Hierarchy'
    levels 'RegionDescription', 'TerritoryDescription'
  }
  hierarchy {
    name 'org_chart'
    title 'Org Chart by Title'
    levels 'Title', 'EmployeeName'
  }
}
