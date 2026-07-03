"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListTodo, Search, MessageSquare, Menu } from "lucide-react";
import { isActive } from "./nav";

const PRIMARY = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Items", href: "/items", icon: ListTodo },
  { label: "Search", href: "/search", icon: Search },
  { label: "Chat", href: "/chat", icon: MessageSquare },
];

/**
 * Bottom navigation for mobile (<768px). Shows the primary destinations plus
 * a "More" button that opens the full sidebar drawer.
 */
export default function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-800 bg-slate-900 md:hidden">
      {PRIMARY.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
              active ? "text-blue-400" : "text-slate-400"
            }`}
          >
            <Icon size={20} />
            {item.label}
          </Link>
        );
      })}
      <button
        onClick={onMore}
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-slate-400"
      >
        <Menu size={20} />
        More
      </button>
    </nav>
  );
}
