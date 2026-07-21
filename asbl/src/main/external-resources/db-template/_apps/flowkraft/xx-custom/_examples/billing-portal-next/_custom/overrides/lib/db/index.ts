import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { bpAppUser, bpCustomer, bpInvoice, bpInvoiceLine } from "./schema";
import { count } from "drizzle-orm";
import { hashPassword } from "../crypto";
import path from "path";
import fs from "fs";

const isBuildTime = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE === "phase-production-build";

const dataDir = path.join(process.cwd(), "data");
if (!isBuildTime && !fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Clear name, lives in the shared dir (_shared-db) so the billing-portal-bkend can maintain it.
const sqlite = isBuildTime ? new Database(":memory:") : new Database(path.join(dataDir, "next-portal.db"));
if (!isBuildTime) {
  sqlite.pragma("journal_mode = WAL");   // WAL + busy_timeout so the billing-portal-bkend can safely
  sqlite.pragma("busy_timeout = 8000");  // write next-portal.db concurrently (it maintains overdue invoices).
}

export const db = drizzle(sqlite, { schema });

/**
 * Bring the schema up to date from the migrations drizzle-kit generated out of ./schema.ts (see
 * drizzle.config.ts; `npm run db:generate` runs at image-build time and the Dockerfile copies
 * ./drizzle into the runtime image).
 *
 * This replaces a hand-written CREATE TABLE block that sat here restating what schema.ts already
 * said. Two hand-maintained descriptions of one schema drift, and this pair did: schema.ts declared
 * contact_name/address, the DDL never created them, and since drizzle names EVERY column of a table
 * in the INSERT it builds — including ones the caller omitted — every single customer insert threw.
 * The portal booted, served /login, even accepted the REST push, and simply had no customers to sign
 * in as. schema.ts is now the only place the shape is written down, exactly as the Grails twin
 * derives its DDL from the domain classes and cannot drift either.
 *
 * It also fixes a second, nastier failure. `CREATE TABLE IF NOT EXISTS` is a NO-OP against a table
 * that already exists, and ../_shared-db is a BIND MOUNT, which survives `docker compose down -v` —
 * so a database created with a broken schema stayed broken across every teardown and rebuild, and no
 * amount of fixing the DDL could dislodge it. Migrations are versioned and journalled, so an
 * existing database gets ALTERed forward instead of silently left alone.
 *
 * Not wrapped in try/catch on purpose: a portal whose schema will not apply cannot work, so let it
 * crash with the reason in `docker logs` rather than serve a half-built database.
 */
if (!isBuildTime) migrate(db, { migrationsFolder: "drizzle" });

const daysOffset = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split("T")[0];

// Seed the billing portal demo data ON FIRST BOOT ONLY (mirrors the Grails BootStrap contract).
function autoSeed() {
  if (isBuildTime) return;
  try {
    const [{ c }] = db.select({ c: count() }).from(bpAppUser).all();
    if ((c || 0) > 0) return;
    console.log("🌱 Seeding billing portal demo data...");

    db.insert(bpAppUser).values({ username: "admin", passwordHash: hashPassword("admin123"), role: "ADMIN" }).run();

    const customers = [
      { name: "Alice Anderson", email: "alice@demo.io", city: "Berlin", country: "DE" },
      { name: "Bob Brown", email: "bob@demo.io", city: "Austin", country: "US" },
      { name: "Carol Clarke", email: "carol@demo.io", city: "Leeds", country: "GB" },
    ];
    const idByEmail: Record<string, number> = {};
    for (const cu of customers) {
      const r = db.insert(bpCustomer).values(cu).run();
      const cid = Number(r.lastInsertRowid);
      idByEmail[cu.email] = cid;
      db.insert(bpAppUser).values({ username: cu.email, passwordHash: hashPassword("demo1234"), role: "CUSTOMER", customerId: cid }).run();
    }

    const seedInvoice = (
      email: string, number: string, status: "PAID" | "DUE" | "OVERDUE", issue: number, due: number, token?: string,
    ) => {
      const r = db.insert(bpInvoice).values({
        invoiceNumber: number, customerId: idByEmail[email], status,
        invoiceDate: daysOffset(issue), dueDate: daysOffset(due),
        subtotal: 1200, tax: 96, freight: 15, total: 1311, payToken: token ?? null,
      }).run();
      const invId = Number(r.lastInsertRowid);
      db.insert(bpInvoiceLine).values([
        { invoiceId: invId, productName: "Managed Services — Monthly Retainer", qty: 2, unitPrice: 500, discount: 0, lineTotal: 1000 },
        { invoiceId: invId, productName: "Enterprise Software License", qty: 1, unitPrice: 200, discount: 0, lineTotal: 200 },
      ]).run();
    };
    seedInvoice("alice@demo.io", "INV-DEMO-0001", "PAID", -40, -10);
    seedInvoice("alice@demo.io", "INV-DEMO-0002", "OVERDUE", -20, -5);
    seedInvoice("bob@demo.io", "INV-DEMO-0003", "DUE", -5, 25);
    seedInvoice("carol@demo.io", "INV-DEMO-0004", "PAID", -30, 0);
    seedInvoice("carol@demo.io", "INV-DEMO-0005", "DUE", -3, 27, "demo-pay-token-0005");
    // A DUE invoice already PAST its due date — the billing-portal-bkend cron flips it to OVERDUE.
    seedInvoice("bob@demo.io", "INV-DEMO-0006", "DUE", -10, -2);

    console.log("✅ Seeded 1 admin, 3 customers, 6 invoices");
  } catch (e) {
    // RETHROW. This catch used to log and carry on, and that cost hours: a schema/DDL drift made
    // every bp_customer insert throw, the portal booted looking perfectly healthy, served /login,
    // even accepted the REST push — and simply had no customers to log in as. The failure surfaced
    // three layers away as an E2E that could not sign in.
    //
    // A portal that cannot seed has no users, so there is no degraded mode worth serving. Crash, and
    // let the reason be the first thing in `docker logs`.
    console.error("Auto-seed FAILED — the portal has no users and cannot work:", e);
    throw e;
  }
}
autoSeed();

export * from "./schema";
