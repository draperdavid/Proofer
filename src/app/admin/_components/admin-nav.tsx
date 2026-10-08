"use client";

// Admin shell + navigation, modeled on Pixieset's structure: two apps (Studio
// Manager, Client Gallery) behind a switcher; primary links, then a "Tools"
// section of expandable groups. Only links to pages that exist.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MenuCloser } from "./menu-closer";
import { gallery, inGalleryApp, isOn as leafOn, studio, type IconName, type Leaf } from "./nav-config";

const ICONS: Record<IconName, string> = {
  home: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  calendar: "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  image: "M3 5h18v14H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 19",
  bag: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  chevron: "M6 9l6 6 6-6",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function AdminShell({ email, signOut, children }: { email: string; signOut: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const isGallery = inGalleryApp(pathname);
  const isOn = (l: Leaf) => leafOn(l, pathname);

  const link = (l: Leaf) => (
    <Link key={l.href} href={l.href} className={`navitem${isOn(l) ? " on" : ""}`}>
      {l.icon && <Icon name={l.icon} />}
      {l.name}
    </Link>
  );

  return (
    <div className={`shell${open ? " open" : ""}`}>
      <div className="topbar">
        <Link href="/admin" className="brand" style={{ padding: 0 }}>
          Proof<span>er</span>
        </Link>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <nav className="side" onClick={() => setOpen(false)}>
        <Link href="/admin" className="brand">
          Proof<span>er</span>
        </Link>

        <div className="switcher" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="switch-btn" onClick={() => setSwitching((s) => !s)} aria-expanded={switching}>
            <span>{isGallery ? "Client Gallery" : "Studio Manager"}</span>
            <Icon name="chevron" />
          </button>
          {switching && (
            <div className="switch-menu">
              <Link href="/admin" className={!isGallery ? "on" : undefined} onClick={() => { setSwitching(false); setOpen(false); }}>
                Studio Manager
              </Link>
              <Link href="/admin/galleries" className={isGallery ? "on" : undefined} onClick={() => { setSwitching(false); setOpen(false); }}>
                Client Gallery
              </Link>
            </div>
          )}
        </div>

        {isGallery ? (
          <>
            <div className="navgroup">{gallery.primary.map(link)}</div>
            <div className="navlabel">Tools</div>
            <div className="navgroup">{gallery.tools.map(link)}</div>
          </>
        ) : (
          <>
            <div className="navgroup">{studio.primary.map(link)}</div>
            <div className="navlabel">Tools</div>
            <div className="navgroup">
              {studio.tools.map((g) => {
                const active = g.children.some(isOn);
                return (
                  <details key={g.name} className="ngroup" open={active} onClick={(e) => e.stopPropagation()}>
                    <summary className={`navitem${active ? " parent-on" : ""}`}>
                      <Icon name={g.icon} />
                      {g.name}
                      <span className="caret">
                        <Icon name="chevron" />
                      </span>
                    </summary>
                    <div className="subnav" onClick={() => setOpen(false)}>
                      {g.children.map((c) => (
                        <Link key={c.href} href={c.href} className={`navitem sub${isOn(c) ? " on" : ""}`}>
                          {c.name}
                        </Link>
                      ))}
                    </div>
                  </details>
                );
              })}
              {link(studio.templates)}
            </div>
          </>
        )}

        <div className="sidefoot">
          <div className="who" title={email}>
            {email}
          </div>
          {signOut}
        </div>
      </nav>
      <div className="content">{children}</div>
      <MenuCloser />
    </div>
  );
}
