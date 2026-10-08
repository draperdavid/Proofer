// Small shared pieces used across admin list pages (Pixieset-style: a client is
// an initials avatar + name, a status is a colored pill).
import Link from "next/link";

// A many-to-one Supabase embed comes back as an object (or occasionally a one-item array).
export function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return <span className="avatar">{initials || "?"}</span>;
}

export function ClientCell({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="muted">—</span>;
  return (
    <span className="clientcell">
      <Avatar name={name} />
      {name}
    </span>
  );
}

type Tone = "green" | "amber" | "blue" | "red" | "grey";

export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`st ${tone}`}>{children}</span>;
}

// Status tabs under a page title, driven by ?status=. `tabs` is [value, label].
export function StatusTabs({
  basePath,
  tabs,
  active,
}: {
  basePath: string;
  tabs: [string, string][];
  active: string;
}) {
  return (
    <nav className="tabs" aria-label="Filter by status">
      {tabs.map(([value, label]) => (
        <Link
          key={value}
          href={value === "all" ? basePath : `${basePath}?status=${value}`}
          className={value === active ? "on" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
