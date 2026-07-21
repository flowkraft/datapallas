import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { redirectTo } from "@/lib/http";

export async function GET(req: NextRequest) {
  const res = redirectTo(req, "/login");
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
