import { supabaseServer } from "@/lib/supabase/server";
import { AdminShell } from "./_components/admin-nav";
import { SignOutButton } from "./sign-out-button";

// The shell only wraps signed-in pages. Signed-out visitors (the login page)
// get the bare page; each page still enforces its own redirect.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <>{children}</>;

  return (
    <AdminShell email={user.email ?? ""} signOut={<SignOutButton />}>
      {children}
    </AdminShell>
  );
}
