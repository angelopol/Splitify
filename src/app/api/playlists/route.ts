import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listUserPlaylists } from "@/lib/spotify";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const playlists = await listUserPlaylists(session.user.id);
    return NextResponse.json({ playlists });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load playlists." },
      { status: 500 }
    );
  }
}
