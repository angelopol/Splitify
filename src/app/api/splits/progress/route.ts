import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getSplitProgress } from "@/lib/progress";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  return NextResponse.json({
    progress: getSplitProgress(session.user.id, token)
  });
}
