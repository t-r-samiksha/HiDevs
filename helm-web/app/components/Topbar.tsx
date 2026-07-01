"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { labelForPath } from "./nav";
import NotificationBell from "./NotificationBell";

/**
 * Full-width top bar: breadcrumb on the left, notifications + user avatar on
 * the right, hamburger on mobile to open the sidebar.
 */
export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const email = user?.email ?? "";
  const initial = email ? email[0]!.toUpperCase() : "?";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        {/* Breadcrumb */}
        <nav className="text-sm text-slate-400">
          <span className="text-slate-500">Helm</span>
          <span className="mx-2 text-slate-600">/</span>
          <span className="font-medium text-slate-100">{labelForPath(pathname)}</span>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />

        {/* User avatar + menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
            aria-label="Account menu"
          >
            {initial}
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className="border-b border-slate-800 px-4 py-3">
                <p className="truncate text-sm font-medium text-slate-200">
                  {email || "Not signed in"}
                </p>
              </div>
              {user ? (
                <button
                  onClick={signOut}
                  className="block w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-800"
                >
                  Sign out
                </button>
              ) : (
                <a
                  href="/login"
                  className="block px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-800"
                >
                  Sign in
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
