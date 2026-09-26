import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

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
      <p>
        <Link href="/admin/contacts">Contacts</Link>
        {" | "}
        <Link href="/admin/projects">Projects</Link>
        {" | "}
        <Link href="/admin/invoices">Invoices</Link>
      </p>
      <SignOutButton />
    </main>
  );
}
