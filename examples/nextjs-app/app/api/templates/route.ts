import { NextResponse } from "next/server";
import { templateStore } from "@/lib/template-store";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  return NextResponse.json(await templateStore.list({ limit }));
}
