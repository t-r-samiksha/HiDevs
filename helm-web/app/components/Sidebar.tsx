"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NAV_ITEMS, EMPLOYEE_NAV_ITEMS, isActive } from "./nav";
import { useRole } from "../lib/useRole";
import { getTotalUnreadCount, onChannelRead } from "./chat/unread";

/**
 * Left navigation rail. Wordmark + grouped nav with a 2px accent bar on the
 * active item. On mobile it slides in as an overlay; `open` / `onClose` are
 * driven by the hamburger button in the Topbar.
 */
export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { isManager, name, role } = useRole();
  const navItems = isManager ? NAV_ITEMS : EMPLOYEE_NAV_ITEMS;
  const [collapsed, setCollapsed] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  const refreshUnread = useCallback(async () => {
    try {
      let { data: { session } } = await supabase.auth.getSession();
      const expiresAtMs = (session?.expires_at ?? 0) * 1000;
      if (session && expiresAtMs <= Date.now()) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session;
      }
      const userId = session?.user?.id;
      if (!userId) return;
      setUnreadChat(await getTotalUnreadCount(userId));
    } catch {
      /* leave the badge as-is on failure rather than flash it to 0 */
    }
  }, []);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread, pathname]);

  useEffect(() => onChannelRead(refreshUnread), [refreshUnread]);

  useEffect(() => {
    const channel = supabase
      .channel("sidebar-unread-tracker")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        refreshUnread();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshUnread]);

  const width = collapsed ? "w-[64px]" : "w-[236px]";
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        className={[
          "z-40 flex h-screen flex-col border-r bg-[var(--bg-secondary)] transition-all duration-200",
          "border-[var(--border-primary)]",
          width,
          "fixed inset-y-0 left-0 md:static",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* Wordmark */}
        <div className="flex h-16 items-center gap-2 px-4">
          <span className="text-lg leading-none text-[var(--accent)]" aria-hidden>
            ⎈
          </span>
          {!collapsed && (
            <span className="font-display text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
              Helm
            </span>
          )}
        </div>

        {/* Nav links, grouped */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2">
          {navItems.map((item, i) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const showGroup = !collapsed && (i === 0 || navItems[i - 1].group !== item.group);
            return (
              <div key={item.href}>
                {showGroup && (
                  <div className="px-2.5 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                    {item.group}
                  </div>
                )}
                <Link
                  href={item.href}
                  onClick={onClose}
                  title={collapsed ? item.label : undefined}
                  className={[
                    "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "font-medium text-[var(--text-primary)]"
                      : "font-normal text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
                  ].join(" ")}
                  style={active ? { background: "var(--accent-muted)" } : undefined}
                >
                  {/* Active accent bar */}
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                  <Icon size={17} className="shrink-0" style={active ? { color: "var(--accent)" } : undefined} />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && item.badge === "chat" && unreadChat > 0 && (
                    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[10px] font-semibold text-white">
                      {unreadChat > 99 ? "99+" : unreadChat}
                    </span>
                  )}
                  {collapsed && item.badge === "chat" && unreadChat > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* User chip */}
        {!collapsed && name && (
          <div className="flex items-center gap-2.5 border-t border-[var(--border-primary)] px-3 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] font-mono text-[11px] font-semibold text-[var(--accent)]">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--text-primary)]">{name}</p>
              <p className="truncate text-[11px] capitalize text-[var(--text-tertiary)]">{role ?? "member"}</p>
            </div>
          </div>
        )}

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden items-center gap-2 border-t border-[var(--border-primary)] px-4 py-2.5 text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] md:flex"
        >
          {collapsed ? <PanelLeft size={15} /> : (<><PanelLeftClose size={15} /> Collapse</>)}
        </button>
      </aside>
    </>
  );
}
