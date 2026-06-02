import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { faker } from "@faker-js/faker";
import { payslips, invoices, settings, payslipStatuses, invoiceStatuses } from "./schema";
import path from "path";
import fs from "fs";

async function seed() {
  console.log("🌱 Starting database seed...");

  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Create database connection
  const sqlite = new Database(path.join(dataDir, "app.db"));
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite);

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS payslips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payslip_number TEXT NOT NULL UNIQUE,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      employee_email TEXT,
      department TEXT,
      pay_period_start TEXT NOT NULL,
      pay_period_end TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      deductions REAL DEFAULT 0,
      net_amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD' NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_address TEXT,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      subtotal REAL NOT NULL,
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD' NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      notes TEXT,
      paid_at TEXT,
      payment_method TEXT,
      payment_reference TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT,
      description TEXT,
      category TEXT DEFAULT 'general' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Clear existing data
  db.delete(payslips).run();
  db.delete(invoices).run();

  // Seed Payslips
  faker.seed(42);
  const departments = ["Engineering", "Marketing", "Sales", "HR", "Finance", "Operations"];

  const payslipData = Array.from({ length: 10 }, (_, i) => {
    const grossAmount = faker.number.int({ min: 3000, max: 8000 });
    const deductions = faker.number.int({ min: 500, max: 1500 });
    const startDate = faker.date.recent({ days: 30 });
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 14);

    return {
      payslipNumber: `PAY-2026-${String(i + 1).padStart(4, "0")}`,
      employeeId: `EMP-${faker.string.alphanumeric(6).toUpperCase()}`,
      employeeName: faker.person.fullName(),
      employeeEmail: faker.internet.email(),
      department: faker.helpers.arrayElement(departments),
      payPeriodStart: startDate.toISOString().split("T")[0],
      payPeriodEnd: endDate.toISOString().split("T")[0],
      grossAmount,
      deductions,
      netAmount: grossAmount - deductions,
      currency: "USD",
      status: faker.helpers.arrayElement([...payslipStatuses]),
    };
  });

  db.insert(payslips).values(payslipData).run();
  console.log("✅ Seeded 10 payslips");

  // Seed Invoices
  faker.seed(123);

  const invoiceData = Array.from({ length: 10 }, (_, i) => {
    const issueDate = faker.date.recent({ days: 60 });
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 30);
    const subtotal = faker.number.int({ min: 500, max: 15000 });
    const taxRate = faker.number.int({ min: 0, max: 20 });
    const taxAmount = subtotal * (taxRate / 100);
    const discount = faker.number.int({ min: 0, max: 500 });

    return {
      invoiceNumber: `INV-2026-${String(i + 1).padStart(4, "0")}`,
      customerId: `CUST-${faker.string.alphanumeric(6).toUpperCase()}`,
      customerName: faker.company.name(),
      customerEmail: faker.internet.email(),
      customerAddress: faker.location.streetAddress({ useFullAddress: true }),
      issueDate: issueDate.toISOString().split("T")[0],
      dueDate: dueDate.toISOString().split("T")[0],
      subtotal,
      taxRate,
      taxAmount,
      discount,
      totalAmount: subtotal + taxAmount - discount,
      currency: "USD",
      status: faker.helpers.arrayElement([...invoiceStatuses]),
      notes: faker.datatype.boolean() ? faker.lorem.sentence() : null,
    };
  });

  db.insert(invoices).values(invoiceData).run();
  console.log("✅ Seeded 10 invoices");

  // Seed default settings (like Grails BootStrap.groovy)
  const defaultSettings = [
    // NOTE: theme is intentionally NOT seeded. The app-wide default lives in code
    // (DEFAULT_THEME in app/layout.tsx). The 'theme.color' setting is written only
    // when a user explicitly picks a theme, so it always reflects a real user choice.
    { key: "company.name", value: "FlowKraft Inc.", category: "company", description: "Company name" },
    { key: "company.email", value: "contact@flowkraft.com", category: "company", description: "Company email" },
    { key: "preferences.currency", value: "USD", category: "preferences", description: "Default currency" },
    { key: "preferences.dateFormat", value: "MM/dd/yyyy", category: "preferences", description: "Date format" },
  ];

  db.delete(settings).run();
  for (const setting of defaultSettings) {
    db.insert(settings).values(setting).run();
  }
  console.log("✅ Seeded default settings");

  sqlite.close();
  console.log("🎉 Database seeding complete!");
}

seed().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});

