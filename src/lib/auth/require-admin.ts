// Server-side admin check for server actions (task 0.7). Middleware only guards
// /admin page URLs; a server action can be POSTed from any path by its id, so
// every admin action calls this first. Call it outside any try/catch: redirect()
// works by throwing.
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isAdminEmail } from "./admins";

export async function requireAdmin() {
  const {
    data: { user },
  } = await (await supabaseServer()).auth.getUser();
  if (!user) redirect("/admin/login");
  if (!isAdminEmail(user.email)) redirect("/");
  return user;
}
