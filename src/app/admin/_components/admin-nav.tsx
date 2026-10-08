"use client";

// Admin shell: a slim top bar (brand, search, account) and a bottom icon bar
// (Lark-style) with Projects raised in the center. "More" opens a sheet with
// everything that doesn't fit on the bar. Items come from nav-config.ts.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BAR, MORE_GROUPS, activeKey, type BarItem, type IconName } from "./nav-config";
import { MenuCloser } from "./menu-closer";

const ICONS: Record<IconName, string> = {
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  image: "M3 5h18v14H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 19",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export function AdminShell({ email, signOut, children }: { email: string; signOut: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = activeKey(pathname);
  const initial = (email[0] ?? "?").toUpperCase();

  // Close the sheet on Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const slot = (b: BarItem) => (
    <Link
      key={b.key}
      href={b.href}
      className={`bi${active === b.key ? " on" : ""}${b.center ? " center" : ""}`}
      aria-current={active === b.key ? "page" : undefined}
    >
      <span className="bicon">
        <Icon name={b.icon} />
      </span>
      <span className="blabel">{b.name}</span>
    </Link>
  );

  return (
    <div className="app">
      <header className="top">
        <Link href="/admin" className="brand">
          Proof<span>er</span>
        </Link>

        <form action="/admin/search" method="get" role="search" className="search">
          <Icon name="search" size={16} />
          <input type="search" name="q" placeholder="Search contacts, projects, galleries" aria-label="Search" />
        </form>

        <details className="menu acct">
          <summary className="avatar big" aria-label="Account">
            {initial}
          </summary>
          <div className="menu-pop">
            <div className="who" title={email}>
              {email}
            </div>
            {signOut}
          </div>
        </details>
      </header>

      <div className="content">{children}</div>

      {moreOpen && (
        <>
          <div className="scrim" onClick={() => setMoreOpen(false)} />
          <div className="sheet" role="dialog" aria-label="More">
            {MORE_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="slabel">{g.label}</div>
                {g.links.map((l) => (
                  <Link key={l.href} href={l.href} className={l.on(pathname) ? "on" : undefined} onClick={() => setMoreOpen(false)}>
                    {l.name}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <nav className="bar" aria-label="Main">
        {BAR.slice(0, 4).map(slot)}
        {BAR.slice(4).map(slot)}
        <button
          type="button"
          className={`bi${active === "more" || moreOpen ? " on" : ""}`}
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
        >
          <span className="bicon">
            <Icon name="more" />
          </span>
          <span className="blabel">More</span>
        </button>
      </nav>

      <MenuCloser />
    </div>
  );
}
