import { NextResponse } from "next/server";
import { logout } from "@/services/auth.service";

export async function POST() {
  await logout();
  return NextResponse.json({ data: { ok: true } });
}
