"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export type Role = "employee" | "manager" | "vp" | "admin" | null;

const MANAGER_ROLES = ["manager", "vp", "admin"];

/**
 * Current user's role/name/email. Seeds from a localStorage cache so the
 * role-aware UI (sidebar, home page) doesn't flicker on navigation, then
 * refreshes from Supabase.
 */
export function useRole() {
  const [role, setRole] = useState<Role>(() =>
    typeof window === "undefined" ? null : ((localStorage.getItem("helm_role") as Role) || null)
  );
  const [name, setName] = useState<string>(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("helm_name") || ""
  );
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(role === null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("users")
          .select("name, role, email")
          .eq("id", user.id)
          .single();
        if (!active || !data) return;
        const r = (data.role as Role) ?? "employee";
        setRole(r);
        setName(data.name ?? "");
        setEmail(data.email ?? "");
        try {
          localStorage.setItem("helm_role", r ?? "employee");
          localStorage.setItem("helm_name", data.name ?? "");
        } catch {
          /* ignore */
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isManager = role != null && MANAGER_ROLES.includes(role);
  return { role, name, email, isManager, loading };
}

/**
 * Redirects employees away from manager-only pages to /items, leaving a toast
 * message for the items page to surface. Managers/VPs/admins pass through.
 */
export function useManagerGuard() {
  const router = useRouter();
  const { role, loading } = useRole();
  useEffect(() => {
    if (!loading && role === "employee") {
      try {
        sessionStorage.setItem("helm_denied", "You don't have access to this page.");
      } catch {
        /* ignore */
      }
      router.replace("/items");
    }
  }, [role, loading, router]);
}
