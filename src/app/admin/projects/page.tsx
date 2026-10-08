import { redirect } from "next/navigation";

// Projects is now the main page at /admin. This keeps old links and bookmarks working.
export default async function ProjectsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) if (typeof value === "string") qs.set(key, value);
  const rest = qs.toString();
  redirect(rest ? `/admin?${rest}` : "/admin");
}
