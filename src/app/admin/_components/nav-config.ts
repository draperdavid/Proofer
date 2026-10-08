// The admin navigation as plain data, so the "which item is active" rules can
// be tested without rendering anything. Modeled on Pixieset: two apps, primary
// links, then a "Tools" section of groups. Only links to pages that exist.

export type IconName =
  | "home"
  | "folder"
  | "user"
  | "dollar"
  | "calendar"
  | "file"
  | "copy"
  | "image"
  | "bag"
  | "chevron";

export type Leaf = { href: string; name: string; icon?: IconName; on?: (path: string) => boolean };
export type Group = { name: string; icon: IconName; children: Leaf[] };

const exact = (href: string) => (p: string) => p === href;

// Matches the prefix itself and anything under it, except the excluded sub-trees.
export const under =
  (prefix: string, except: string[] = []) =>
  (p: string) =>
    (p === prefix || p.startsWith(prefix + "/")) && !except.some((e) => p === e || p.startsWith(e + "/"));

export const TEMPLATE_PATHS = ["/admin/contracts/templates", "/admin/questionnaires/templates", "/admin/emails"];

export const studio = {
  primary: [
    { href: "/admin", name: "Home", icon: "home", on: exact("/admin") },
    { href: "/admin/projects", name: "Projects", icon: "folder" },
    { href: "/admin/contacts", name: "Contacts", icon: "user" },
  ] as Leaf[],
  tools: [
    { name: "Payments", icon: "dollar", children: [{ href: "/admin/invoices", name: "Invoices" }] },
    {
      name: "Bookings",
      icon: "calendar",
      children: [
        { href: "/admin/session-types", name: "Session types" },
        { href: "/admin/availability", name: "Availability" },
      ],
    },
    {
      name: "Documents",
      icon: "file",
      children: [
        { href: "/admin/contracts", name: "Contracts", on: under("/admin/contracts", ["/admin/contracts/templates"]) },
        {
          href: "/admin/questionnaires",
          name: "Questionnaires",
          on: under("/admin/questionnaires", ["/admin/questionnaires/templates"]),
        },
        { href: "/admin/quotes", name: "Quotes" },
      ],
    },
  ] as Group[],
  templates: {
    href: "/admin/contracts/templates",
    name: "Templates",
    icon: "copy",
    on: (p: string) => TEMPLATE_PATHS.some((t) => p === t || p.startsWith(t + "/")),
  } as Leaf,
};

export const gallery = {
  primary: [{ href: "/admin/galleries", name: "Collections", icon: "image" }] as Leaf[],
  tools: [{ href: "/admin/store", name: "Store", icon: "bag" }] as Leaf[],
};

export const inGalleryApp = (p: string) =>
  p === "/admin/galleries" || p.startsWith("/admin/galleries/") || p === "/admin/store" || p.startsWith("/admin/store/");

export function isOn(leaf: Leaf, path: string): boolean {
  return leaf.on ? leaf.on(path) : path === leaf.href || path.startsWith(leaf.href + "/");
}

// Every leaf in the Studio Manager app, flattened (for tests and the active lookup).
export function studioLeaves(): Leaf[] {
  return [...studio.primary, ...studio.tools.flatMap((g) => g.children), studio.templates];
}
