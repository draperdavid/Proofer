"use client";

import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await supabaseBrowser().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return <button onClick={handleSignOut}>Sign out</button>;
}
