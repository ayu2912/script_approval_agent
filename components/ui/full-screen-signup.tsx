"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export const FullScreenSignup = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      setError("Invalid username or password");
      setLoading(false);
    } else if (result?.ok) {
      window.location.href = callbackUrl;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center overflow-hidden p-4">
      <div className="w-full relative max-w-5xl overflow-hidden flex flex-col md:flex-row shadow-xl rounded-3xl">
        <div className="w-full h-full z-2 absolute bg-linear-to-t from-transparent to-black"></div>
        <div className="flex absolute z-2 overflow-hidden backdrop-blur-2xl">
          <div className="h-[40rem] z-2 w-[4rem] bg-linear-90 from-[#ffffff00] via-[#000000] via-[69%] to-[#ffffff30] opacity-30 overflow-hidden"></div>
          <div className="h-[40rem] z-2 w-[4rem] bg-linear-90 from-[#ffffff00] via-[#000000] via-[69%] to-[#ffffff30] opacity-30 overflow-hidden"></div>
          <div className="h-[40rem] z-2 w-[4rem] bg-linear-90 from-[#ffffff00] via-[#000000] via-[69%] to-[#ffffff30] opacity-30 overflow-hidden"></div>
          <div className="h-[40rem] z-2 w-[4rem] bg-linear-90 from-[#ffffff00] via-[#000000] via-[69%] to-[#ffffff30] opacity-30 overflow-hidden"></div>
          <div className="h-[40rem] z-2 w-[4rem] bg-linear-90 from-[#ffffff00] via-[#000000] via-[69%] to-[#ffffff30] opacity-30 overflow-hidden"></div>
          <div className="h-[40rem] z-2 w-[4rem] bg-linear-90 from-[#ffffff00] via-[#000000] via-[69%] to-[#ffffff30] opacity-30 overflow-hidden"></div>
        </div>
        <div className="w-[15rem] h-[15rem] bg-[var(--accent-primary)] absolute z-1 rounded-full bottom-0"></div>
        <div className="w-[8rem] h-[5rem] bg-white absolute z-1 rounded-full bottom-0"></div>
        <div className="w-[8rem] h-[5rem] bg-white absolute z-1 rounded-full bottom-0"></div>

        <div className="bg-[#1C1917] text-white p-8 md:p-12 md:w-1/2 relative rounded-bl-3xl overflow-hidden">
          <h1 className="text-2xl md:text-3xl font-medium leading-tight z-10 tracking-tight relative" style={{ fontFamily: "var(--font-playfair), serif" }}>
            Power your agency and boost productivity by AI agents while being in the loop.
          </h1>
        </div>

        <div className="p-8 md:p-12 md:w-1/2 flex flex-col bg-[var(--card)] z-99 text-[var(--text)]">
          <div className="flex flex-col items-left mb-8">
            <h2 className="text-3xl font-medium mb-2 tracking-tight" style={{ fontFamily: "var(--font-playfair), serif" }}>
              Sign In
            </h2>
            <p className="text-left text-[var(--muted)]">
              Enter your credentials to access Greenlit.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-xs font-medium text-[var(--muted)]">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent transition-all"
                placeholder="Enter username"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[var(--muted)]">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent transition-all"
                placeholder="Enter password"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-[var(--accent-primary)] hover:opacity-90 text-white font-medium py-3 px-4 rounded-lg transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <p className="text-center text-[var(--muted)] text-sm">
              Access restricted to Scrollhouse team members.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};
