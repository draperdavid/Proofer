// A table whose migration hasn't been run on this environment yet. Postgres
// says 42P01; Supabase's REST API (PostgREST) says PGRST205 before the query
// ever reaches Postgres, which is what supabase-js actually returns.
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
