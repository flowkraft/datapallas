import { NextRequest, NextResponse } from "next/server";
import { or, like, count } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, bpCustomer } from "@/lib/db";

const PAGE_SIZE = 10;

// JSON search for the invoice-form customer picker modal — paginated, so it scales to
// thousands of customers. Admin-only (mirrors the Grails AuthInterceptor guard on `customer`).
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (s?.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const where = q ? or(like(bpCustomer.name, `%${q}%`), like(bpCustomer.email, `%${q}%`)) : undefined;

  const total = db.select({ c: count() }).from(bpCustomer).where(where).all()[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1), totalPages);

  const customers = db
    .select({ id: bpCustomer.id, name: bpCustomer.name, email: bpCustomer.email, city: bpCustomer.city, country: bpCustomer.country })
    .from(bpCustomer).where(where).orderBy(bpCustomer.name)
    .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all();

  return NextResponse.json({ customers, page, totalPages, total });
}
