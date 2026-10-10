import { NextResponse, type NextRequest } from "next/server";
import { clientIp, errorResponse, parseJson } from "@/lib/api";
import { login, loginSchema } from "@/services/auth.service";

export async function POST(req: NextRequest) {
  try {
    const input = await parseJson(req, loginSchema);
    const result = await login(input, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
    return NextResponse.json({ data: result });
  } catch (err) {
    return errorResponse(err);
  }
}
