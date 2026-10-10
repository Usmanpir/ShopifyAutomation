import { NextResponse, type NextRequest } from "next/server";
import { clientIp, errorResponse, parseJson } from "@/lib/api";
import { register, registerSchema } from "@/services/auth.service";

export async function POST(req: NextRequest) {
  try {
    const input = await parseJson(req, registerSchema);
    await register(input, clientIp(req));
    return NextResponse.json({ data: { ok: true } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
