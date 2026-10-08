// "Documents" is one place on the bottom bar; this switches between its three lists.
import Link from "next/link";

const kinds = [
  { key: "contracts", href: "/admin/contracts", label: "Contracts" },
  { key: "questionnaires", href: "/admin/questionnaires", label: "Questionnaires" },
  { key: "quotes", href: "/admin/quotes", label: "Quotes" },
] as const;

export function DocumentsSwitch({ active }: { active: (typeof kinds)[number]["key"] }) {
  return (
    <div className="doctitle">
      <h1>Documents</h1>
      <nav className="seg" aria-label="Document type">
        {kinds.map((k) => (
          <Link key={k.key} href={k.href} className={k.key === active ? "on" : undefined}>
            {k.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
