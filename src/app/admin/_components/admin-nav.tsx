"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const groups: { label: string; items: { href: string; name: string }[] }[] = [
  {
    label: "Work",
    items: [
      { href: "/admin/contacts", name: "Contacts" },
      { href: "/admin/projects", name: "Projects" },
      { href: "/admin/invoices", name: "Invoices" },
    ],
  },
  {
    label: "Documents",
    items: [
      { href: "/admin/contracts/templates", name: "Contract templates" },
      { href: "/admin/questionnaires/templates", name: "Questionnaires" },
    ],
  },
  {
    label: "Booking",
    items: [
      { href: "/admin/session-types", name: "Session types" },
      { href: "/admin/availability", name: "Availability" },
    ],
  },
  {
    label: "Media and store",
    items: [
      { href: "/admin/galleries", name: "Galleries" },
      { href: "/admin/store", name: "Store" },
    ],
  },
  { label: "System", items: [{ href: "/admin/emails", name: "Emails" }] },
];

export function AdminShell({ email, signOut, children }: { email: string; signOut: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isOn = (href: string) => pathname === href || pathname.startsWith(href + "/");

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
        <div className="navgroup">
          <Link href="/admin" className={`navitem${pathname === "/admin" ? " on" : ""}`}>
            Home
          </Link>
        </div>
        {groups.map((g) => (
          <div className="navgroup" key={g.label}>
            <div className="navlabel">{g.label}</div>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className={`navitem${isOn(i.href) ? " on" : ""}`}>
                {i.name}
              </Link>
            ))}
          </div>
        ))}
        <div className="sidefoot">
          <div className="who" title={email}>
            {email}
          </div>
          {signOut}
        </div>
      </nav>
      <div className="content">{children}</div>
    </div>
  );
}
