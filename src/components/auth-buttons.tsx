"use client";

import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

export function SignInButton() {
  return (
    <button
      className="focus-ring inline-flex h-11 items-center gap-2 rounded-md bg-[var(--accent)] px-4 font-semibold text-white shadow-sm transition hover:bg-[var(--accent-strong)]"
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
      className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
      onClick={() => signOut()}
      type="button"
    >
      <LogOut aria-hidden="true" size={16} />
      Sign out
    </button>
  );
}
