import { auth } from "@/auth";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";
import { Dashboard } from "@/components/dashboard";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-10 sm:px-6">
        <section className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-[var(--accent-strong)]">
              Splitify
            </p>
            <h1 className="mt-3 max-w-3xl text-5xl font-bold tracking-normal text-[var(--foreground)]">
              Sort Spotify playlists with an AI agent.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              Sign in, choose a playlist, review the editable preview, and create
              new private playlists in your account.
            </p>
            <div className="mt-8">
              <SignInButton />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
            <div className="grid aspect-square place-items-center rounded-md bg-[var(--ink)] text-white">
              <div className="text-center">
                <p className="text-6xl font-bold">S</p>
                <p className="mt-2 text-sm font-semibold text-[#8ce0ad]">
                  AI Playlist Router
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-10">
        <SignOutButton />
      </div>
      <Dashboard userName={session.user.name} />
    </>
  );
}
