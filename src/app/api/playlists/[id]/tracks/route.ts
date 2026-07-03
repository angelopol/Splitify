import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getPlaylistTracks } from "@/lib/spotify";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const tracks = await getPlaylistTracks(session.user.id, id);
    return NextResponse.json({ tracks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load tracks." },
      { status: 500 }
    );
  }
}
