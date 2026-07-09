import {
  LayoutDashboard,
  Upload,
  ListTodo,
  Gavel,
  Mic,
  MessageSquare,
  Calendar,
  Users,
  BarChart3,
  Search,
  ShieldCheck,
  MailCheck,
  Settings,
  Activity,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Set on items that show an unread/pending count badge. */
  badge?: "chat";
};

/**
 * Single source of truth for the sidebar navigation order and the topbar
 * breadcrumb labels. Order matches PHASE 1 of the project plan.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Upload", href: "/upload", icon: Upload },
  { label: "Items", href: "/items", icon: ListTodo },
  { label: "Decisions", href: "/decisions", icon: Gavel },
  { label: "Meetings", href: "/meetings", icon: Mic },
  { label: "Chat", href: "/chat", icon: MessageSquare, badge: "chat" },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Team", href: "/team", icon: Users },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Search", href: "/search", icon: Search },
  { label: "Review Queue", href: "/review", icon: ShieldCheck },
  { label: "Approval Queue", href: "/followups", icon: MailCheck },
  { label: "Observability", href: "/observability", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings },
];

/** True when `pathname` belongs to the given nav `href`. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Human-readable label for the current path (used by the breadcrumb). */
export function labelForPath(pathname: string): string {
  // Longest matching href wins so /meetings/[id] resolves to "Meetings".
  const match = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActive(pathname, item.href));
  return match?.label ?? "Helm";
}
