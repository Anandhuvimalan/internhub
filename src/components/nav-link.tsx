"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children, badge }: { href: string; children: ReactNode; badge?: number }) {
  const path = usePathname();
  const active = path === href || (href !== "/" && path.startsWith(href + "/"));
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      <span>{children}</span>
      {badge ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink">{badge}</span> : null}
    </Link>
  );
}
