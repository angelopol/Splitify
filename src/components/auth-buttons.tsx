"use client";

import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

export function SignInButton() {
  return (
    <button
      className="focus-ring inline-flex h-12 items-center gap-2 rounded-full bg-[var(--accent)] px-6 font-bold text-[#04140a] shadow-[0_0_30px_rgba(29,185,84,0.35)] transition hover:bg-[var(--accent-strong)] hover:shadow-[0_0_40px_rgba(29,185,84,0.5)]"
      onClick={() => signIn("spotify")}
      type="button"
    >
      <LogIn aria-hidden="true" size={18} />
      Connect Spotify
    </button>
  );
}

export function SignOutButton() {
  return (
    <button
      className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
      onClick={() => signOut()}
      type="button"
    >
      <LogOut aria-hidden="true" size={16} />
      Sign out
    </button>
  );
}
