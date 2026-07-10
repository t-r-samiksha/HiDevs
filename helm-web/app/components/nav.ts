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
  /** Section this item belongs to (renders a quiet group label above the first). */
  group: string;
  /** Set on items that show an unread/pending count badge. */
  badge?: "chat";
};

/**
 * Single source of truth for the sidebar navigation order and the topbar
 * breadcrumb labels. Grouped into Workspace · Insight · You.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, group: "Workspace" },
  { label: "Upload", href: "/upload", icon: Upload, group: "Workspace" },
  { label: "Items", href: "/items", icon: ListTodo, group: "Workspace" },
  { label: "Decisions", href: "/decisions", icon: Gavel, group: "Workspace" },
  { label: "Meetings", href: "/meetings", icon: Mic, group: "Workspace" },
  { label: "Chat", href: "/chat", icon: MessageSquare, badge: "chat", group: "Workspace" },
  { label: "Calendar", href: "/calendar", icon: Calendar, group: "Workspace" },
  { label: "Team", href: "/team", icon: Users, group: "Insight" },
  { label: "Reports", href: "/reports", icon: BarChart3, group: "Insight" },
  { label: "Search", href: "/search", icon: Search, group: "Insight" },
  { label: "Review Queue", href: "/review", icon: ShieldCheck, group: "Insight" },
  { label: "Approval Queue", href: "/followups", icon: MailCheck, group: "Insight" },
  { label: "Observability", href: "/observability", icon: Activity, group: "Insight" },
  { label: "Settings", href: "/settings", icon: Settings, group: "You" },
];

/** Simplified nav for employees/ICs — personal work only, no org-wide tools. */
export const EMPLOYEE_NAV_ITEMS: NavItem[] = [
  { label: "My Tasks", href: "/items", icon: ListTodo, group: "Workspace" },
  { label: "Meetings", href: "/meetings", icon: Mic, group: "Workspace" },
  { label: "Chat", href: "/chat", icon: MessageSquare, badge: "chat", group: "Workspace" },
  { label: "Calendar", href: "/calendar", icon: Calendar, group: "Workspace" },
  { label: "Search", href: "/search", icon: Search, group: "Workspace" },
  { label: "Settings", href: "/settings", icon: Settings, group: "You" },
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
