"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

/** Routes that render WITHOUT the app chrome (no sidebar/topbar). */
const AUTH_ROUTES = ["/login", "/signup"];

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

/**
 * App-wide chrome + auth guard. Wraps every page in the root layout.
 * - Auth pages (/login, /signup) render bare (full-screen, no nav).
 * - All other pages get the Sidebar + Topbar and require a session;
 *   unauthenticated users are redirected to /login.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authRoute = isAuthRoute(pathname);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  // Resolve the current session and keep it in sync.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAuthed(!!data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
      setAuthChecked(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Redirect unauthenticated users away from protected pages.
  useEffect(() => {
    if (authChecked && !authed && !authRoute) {
      router.replace("/login");
    }
  }, [authChecked, authed, authRoute, router]);

  // Auth pages: render bare.
  if (authRoute) {
    return <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>;
  }

  // Protected pages: wait for the auth check, then guard.
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading Helm…
      </div>
    );
  }

  if (!authed) {
    // Redirect is in-flight; render nothing to avoid a flash of content.
    return <div className="min-h-screen bg-slate-950" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
