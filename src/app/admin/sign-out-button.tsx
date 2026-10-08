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

  return (
    <button type="button" className="ghost" onClick={handleSignOut} style={{ padding: "4px 0" }}>
      Sign out
    </button>
  );
}
