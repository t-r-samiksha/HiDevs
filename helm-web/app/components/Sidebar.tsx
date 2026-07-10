"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { NAV_ITEMS, EMPLOYEE_NAV_ITEMS, isActive } from "./nav";
import { useRole } from "../lib/useRole";

/**
 * Left navigation rail (250px on desktop, icons-only when collapsed).
 * On mobile it slides in as an overlay; `open` / `onClose` are driven by the
 * hamburger button in the Topbar.
 */
export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { isManager } = useRole();
  const navItems = isManager ? NAV_ITEMS : EMPLOYEE_NAV_ITEMS;
  const [collapsed, setCollapsed] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  // Unread chat count. The chat tables are owned by Member 1 and may not exist
  // yet — fail silently to 0 so the sidebar never breaks.
  useEffect(() => {
    let active = true;
    async function loadUnread() {
      try {
        // TODO: Replace with a real unread query once Member 1 ships the
        // messages / channel_members tables and read-receipt tracking.
        const { count, error } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true });
        if (!active || error) return;
        setUnreadChat(count ?? 0);
      } catch {
        /* table not ready — leave badge at 0 */
      }
    }
    loadUnread();
    return () => {
      active = false;
    };
  }, []);

  const width = collapsed ? "w-[68px]" : "w-[250px]";

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={[
          "z-40 flex h-screen flex-col border-r border-slate-800 bg-slate-900 text-slate-300 transition-all duration-200",
          width,
          // Desktop: static. Mobile: fixed slide-in.
          "fixed inset-y-0 left-0 md:static",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-lg text-white">
            ⎈
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold text-white">Helm</span>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={[
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-600/15 text-blue-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
                ].join(" ")}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && item.badge === "chat" && unreadChat > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                    {unreadChat > 99 ? "99+" : unreadChat}
                  </span>
                )}
                {/* Collapsed: a dot instead of the count */}
                {collapsed && item.badge === "chat" && unreadChat > 0 && (
                  <span className="absolute ml-6 -mt-4 h-2 w-2 rounded-full bg-red-500" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden items-center justify-center border-t border-slate-800 px-3 py-3 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-200 md:flex"
        >
          {collapsed ? "»" : "« Collapse"}
        </button>
      </aside>
    </>
  );
}
