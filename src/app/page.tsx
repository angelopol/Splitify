import { ListMusic, Shuffle, Sparkles, Wand2 } from "lucide-react";

import { auth } from "@/auth";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";
import { Dashboard } from "@/components/dashboard";

const features = [
  {
    icon: Sparkles,
    title: "AI curation",
    text: "An agent reads your playlist and proposes smart, editable splits."
  },
  {
    icon: ListMusic,
    title: "You stay in control",
    text: "Rename categories, drag tracks around, drop what you don't want."
  },
  {
    icon: Shuffle,
    title: "Prompt or categories",
    text: "Describe the vibe, list your own buckets, or combine both."
  }
];

function Equalizer() {
  const bars = [0.9, 0.5, 1, 0.4, 0.75, 0.6, 1, 0.45, 0.85, 0.55, 0.7, 0.95];

  return (
    <div className="flex h-40 items-end justify-center gap-2 sm:h-56">
      {bars.map((height, index) => (
        <span
          className="eq-bar w-3 rounded-t-full sm:w-4"
          key={index}
          style={{
            height: `${height * 100}%`,
            animationDelay: `${index * 90}ms`,
            background:
              index % 3 === 0
                ? "linear-gradient(180deg, #35d06b, #1db954)"
                : index % 3 === 1
                  ? "linear-gradient(180deg, #4f8ef7, #2f6de0)"
                  : "linear-gradient(180deg, #e0e7e3, #98a29d)"
          }}
        />
      ))}
    </div>
  );
}

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-12 sm:px-6">
        <section className="rise grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[var(--accent-strong)]">
              <Wand2 aria-hidden="true" size={14} />
              Splitify
            </p>
            <h1 className="mt-6 text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              One giant playlist.
              <span className="block bg-gradient-to-r from-[#35d06b] via-[#1db954] to-[#4f8ef7] bg-clip-text text-transparent">
                Many perfect ones.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">
              Splitify reads your Spotify playlist, lets an AI agent propose a
              split by mood, era or anything you ask for — then you fine-tune the
              result and ship it back to Spotify as new playlists.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <SignInButton />
              <p className="text-sm text-[var(--muted)]">
                Private by default. Your tokens never leave the server.
              </p>
            </div>
          </div>

          <div className="panel relative overflow-hidden p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent" />
            <Equalizer />
            <p className="mt-6 text-center text-sm font-semibold text-[var(--muted)]">
              &ldquo;Split my 800-song mix into gym, late night and road trip&rdquo;
            </p>
          </div>
        </section>

        <section className="rise mt-16 grid gap-4 sm:grid-cols-3">
          {features.map((feature) => (
            <article className="panel p-5" key={feature.title}>
              <feature.icon
                aria-hidden="true"
                className="text-[var(--accent-strong)]"
                size={22}
              />
              <h2 className="mt-3 font-bold">{feature.title}</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                {feature.text}
              </p>
            </article>
          ))}
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-20">
        <SignOutButton />
      </div>
      <Dashboard userName={session.user.name} />
    </>
  );
}
