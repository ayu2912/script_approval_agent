"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-[var(--muted)] hover:text-[var(--text)]"
      title="Sign out"
    >
      <LogOut size={13} />
    </button>
  );
}
