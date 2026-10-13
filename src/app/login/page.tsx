"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const supabase = supabaseBrowser();
    // shouldCreateUser: false — only existing accounts get a link; strangers
    // can't self-register. Unknown emails get the same "check your email"
    // screen so the form doesn't reveal who has an account.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
    });
    setSubmitting(false);
    if (error && error.code !== "otp_disabled" && error.code !== "signup_disabled") {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <main>
        <h1>Check your email</h1>
        <p>If {email} has an account, we sent it a sign-in link.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Client sign in</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send magic link"}
        </button>
      </form>
    </main>
  );
}
