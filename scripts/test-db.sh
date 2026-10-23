#!/usr/bin/env bash
# Runs the database tests in supabase/tests against a throwaway database.
#
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres npm run test:db
#
# Connection settings come from the usual PG* environment variables. Needs
# psql and a Postgres 15+ server where that user can create databases and
# roles. The database "campus_social_test" is dropped and recreated.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=campus_social_test
PSQL=(psql -X -q -o /dev/null -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "set client_min_messages = warning" -c "drop database if exists $DB" -c "create database $DB"

run() {
  local out status=0
  echo "$1"
  out=$("${PSQL[@]}" -d "$DB" -f "$1" 2>&1) || status=$?
  printf '%s\n' "$out" | sed -n 's/^psql:.*NOTICE:  ok - /  ok  /p'
  if ((status)); then
    printf '%s\n' "$out" | grep -v NOTICE | tail -8
    echo "FAILED: $1"
    exit 1
  fi
}

run supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do run "$f"; done
run supabase/seed.sql
for f in supabase/tests/[0-9][0-9]_*.sql; do
  [[ "$f" == *00_supabase_stub.sql ]] || run "$f"
done
echo "All database tests passed."
