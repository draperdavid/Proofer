// The Templates hub: one place, tabs for each kind (Pixieset keeps them together).
// Each tab points at the page that already manages that kind of template.
import Link from "next/link";

const tabs = [
  { key: "contracts", href: "/admin/contracts/templates", label: "Contracts" },
  { key: "questionnaires", href: "/admin/questionnaires/templates", label: "Questionnaires" },
  { key: "emails", href: "/admin/emails", label: "Emails" },
] as const;

export function TemplatesTabs({ active }: { active: (typeof tabs)[number]["key"] }) {
  return (
    <>
      <h1 style={{ marginBottom: "var(--sp-3)", borderBottom: "none", paddingBottom: 0 }}>Templates</h1>
      <nav className="tabs" aria-label="Template type">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className={t.key === active ? "on" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
