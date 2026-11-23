#!/usr/bin/env bash
# Run with Bash and a local Docker engine. The database has no network or host volumes.
set -euo pipefail
cd "$(dirname "$0")/.."

container=$(docker run --detach --rm --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine)
logs=$(mktemp -d)
trap 'docker stop "$container" >/dev/null; rm -f "$logs/first" "$logs/second"; rmdir "$logs"' EXIT
psql_local() { docker exec -i "$container" psql -XqAt -v ON_ERROR_STOP=1 -U postgres "$@"; }

# The entrypoint switches from an initialization server to the final server.
for ((i = 0; i < 100; i++)); do
  if docker logs "$container" 2>&1 | grep -q 'PostgreSQL init process complete' &&
     docker exec "$container" pg_isready -q -U postgres; then break; fi
  sleep 0.1
done
{
  cat <<'SQL'
create schema auth;
create role anon;
create role authenticated;
create table auth.users (id uuid primary key, is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
SQL
  cat supabase/migrations/*.sql supabase/seed.sql
} | psql_local >/dev/null

psql_local <<'SQL'
insert into auth.users (id) values
  ('00000000-0000-0000-0092-000000000001'), ('00000000-0000-0000-0092-000000000002');
-- Keep answer-trigger quest bonuses out of the point totals in this fixture.
insert into public.daily_quests (user_id, day, code, target)
select id, public.local_day(id), 'mock1', 1 from auth.users;
with q as (
  select array(select id from public.items where status = 'published' and kind = 'mcq' order by id limit 2) as items
)
insert into public.sessions (id, user_id, mode, queue)
select s.id::uuid, s.uid::uuid, 'review', q.items from q cross join (values
  ('00000000-0000-0000-0092-000000000011', '00000000-0000-0000-0092-000000000001'),
  ('00000000-0000-0000-0092-000000000012', '00000000-0000-0000-0092-000000000002'),
  ('00000000-0000-0000-0092-000000000013', '00000000-0000-0000-0092-000000000002')
) as s(id, uid);
SQL

submit_pair() {
  local learner=$1 first=$2 second=$3
  local first_pid second_code=0
  local uid="00000000-0000-0000-0092-00000000000$learner"
  local first_id="00000000-0000-0000-0092-0000000000$first"
  local second_id="00000000-0000-0000-0092-0000000000$second"
  local answer
  answer=$(psql_local -v sid="$first_id" <<'SQL'
select i.answer->>'choice' from public.items i join public.sessions s on s.queue[1] = i.id where s.id = :'sid';
SQL
)
  psql_local -v uid="$uid" -v sid="$first_id" -v answer="$answer" >"$logs/first" 2>&1 <<'SQL' &
set application_name = 'submit_first';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'uid', true);
select public.submit_answer(:'sid', :'answer', 0);
reset role;
-- Commit only after PostgreSQL confirms the other RPC is blocked by this transaction.
do $$
begin
  for i in 1..200 loop
    perform pg_stat_clear_snapshot();
    if exists (select 1 from pg_stat_activity
        where application_name = 'submit_second' and pg_backend_pid() = any(pg_blocking_pids(pid))) then
      return;
    end if;
    perform pg_sleep(0.05);
  end loop;
  raise exception 'second submit did not wait for the first';
end $$;
commit;
SQL
  first_pid=$!
  for ((i = 0; i < 100; i++)); do
    if [[ $(psql_local -c "select count(*) from pg_stat_activity where application_name = 'submit_first' and wait_event = 'PgSleep'") == 1 ]]; then break; fi
    sleep 0.05
  done
  psql_local -v uid="$uid" -v sid="$second_id" -v answer="$answer" >"$logs/second" 2>&1 <<'SQL' || second_code=$?
set application_name = 'submit_second';
set statement_timeout = '12s';
set role authenticated;
select set_config('request.jwt.claim.sub', :'uid', false);
select public.submit_answer(:'sid', :'answer', 0);
SQL
  wait "$first_pid" || { cat "$logs/first" "$logs/second"; return 1; }
  if [[ "$first" == "$second" ]]; then
    [[ "$second_code" != 0 ]] && grep -q 'question already changed' "$logs/second"
  else
    [[ "$second_code" == 0 ]] || { cat "$logs/second"; return 1; }
  fi
}

submit_pair 1 11 11
submit_pair 2 12 13

actual=$(psql_local <<'SQL'
select right(s.user_id::text, 1), sum(s.pos), count(r.id), sum(r.earned_points), sum(s.points)
from public.sessions s join public.responses r on r.session_id = s.id
group by s.user_id order by s.user_id;
SQL
)
[[ "$actual" == $'1|1|1|2|2\n2|2|2|2|2' ]] || { printf 'Unexpected position, response or points totals:\n%s\n' "$actual"; exit 1; }
printf 'PASS: overlapping submits grade one position once, and parallel sessions credit one shared item once.\n'
