import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function AdminHome() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  return (
    <main>
      <h1>Proofer Admin</h1>
      <p>Signed in as {user.email}.</p>
      <p>Empty admin shell. CRM/kanban lands in Phase 1.</p>
      <SignOutButton />
    </main>
  );
}
