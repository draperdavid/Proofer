-- Lock down direct REST access (Phase 1.1). All app access to these tables goes
-- through server-side code using the service-role client, which bypasses RLS.
-- No policies are added for anon/authenticated, so the public REST endpoint
-- (reachable with the browser-shipped anon key) is deny-all on these tables.
alter table health_check enable row level security;
alter table contacts enable row level security;
alter table project_stages enable row level security;
alter table projects enable row level security;
