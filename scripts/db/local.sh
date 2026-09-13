#!/usr/bin/env bash
# Local-first database harness for the Urdais Supabase foundation.
#
# Runs repository migrations against a real PostgreSQL server without needing
# Docker. Two modes:
#
#   managed  (default)   the script owns a throwaway cluster under .local/pg,
#                        started with pg_ctl on URDAIS_PG_PORT (default 54329).
#   external (CI)        set URDAIS_PG_EXTERNAL=1 and the usual PGHOST/PGPORT/
#                        PGUSER/PGPASSWORD; the script only creates/drops the
#                        working database on that server.
#
# The hosted project is never touched by this script. Remote application is a
# separate, explicit step (see package.json "db:push:remote" notes).
#
# Commands:
#   start | stop | status      manage the local cluster (managed mode only)
#   reset                      drop and recreate the working database
#   migrate                    apply supabase/migrations/*.sql in order
#   test                       run supabase/tests/*.sql (each rolls back)
#   types                      regenerate src/lib/database/database.types.ts (needs Docker)
#   check-types                fail if regeneration would change the committed types
#   replay                     reset -> migrate -> test -> reset -> migrate -> test
#   url                        print the connection URL of the working database
#   ci                         roles -> replay

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
TESTS_DIR="$REPO_ROOT/supabase/tests"
ROLES_SQL="$REPO_ROOT/scripts/db/supabase-roles.sql"
TYPES_FILE="$REPO_ROOT/src/lib/database/database.types.ts"

DB_NAME="${URDAIS_DB_NAME:-urdais_local}"
EXTERNAL="${URDAIS_PG_EXTERNAL:-0}"

if [[ "$EXTERNAL" == "1" ]]; then
  : "${PGHOST:=localhost}"
  : "${PGPORT:=5432}"
  : "${PGUSER:=postgres}"
  export PGHOST PGPORT PGUSER
else
  PG_DIR="${URDAIS_PG_DIR:-$REPO_ROOT/.local/pg}"
  export PGHOST="localhost"
  export PGPORT="${URDAIS_PG_PORT:-54329}"
  export PGUSER="postgres"
  unset PGPASSWORD
fi

MAINT_DB="postgres"

log() { printf '\033[1;34m[db]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[db] error:\033[0m %s\n' "$*" >&2; exit 1; }

require_bin() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not on PATH"
}

psql_maint() { psql -v ON_ERROR_STOP=1 -X -q -d "$MAINT_DB" "$@"; }
psql_db()    { psql -v ON_ERROR_STOP=1 -X -q -d "$DB_NAME" "$@"; }

cmd_start() {
  [[ "$EXTERNAL" == "1" ]] && { log "external mode: nothing to start"; return; }
  require_bin initdb; require_bin pg_ctl
  mkdir -p "$(dirname "$PG_DIR")"
  if [[ ! -f "$PG_DIR/PG_VERSION" ]]; then
    log "initialising cluster at $PG_DIR"
    initdb -D "$PG_DIR" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
  fi
  if pg_ctl -D "$PG_DIR" status >/dev/null 2>&1; then
    log "cluster already running on port $PGPORT"
  else
    log "starting cluster on port $PGPORT"
    pg_ctl -D "$PG_DIR" -o "-p $PGPORT -c listen_addresses=localhost" -l "$PG_DIR/server.log" -w start >/dev/null
  fi
  pg_isready -q -h "$PGHOST" -p "$PGPORT" || die "server did not become ready"
}

cmd_stop() {
  [[ "$EXTERNAL" == "1" ]] && { log "external mode: nothing to stop"; return; }
  if [[ -f "$PG_DIR/PG_VERSION" ]] && pg_ctl -D "$PG_DIR" status >/dev/null 2>&1; then
    log "stopping cluster"
    pg_ctl -D "$PG_DIR" -m fast -w stop >/dev/null
  else
    log "cluster not running"
  fi
}

cmd_status() {
  if [[ "$EXTERNAL" == "1" ]]; then
    pg_isready -h "$PGHOST" -p "$PGPORT" && log "external server reachable"
  else
    pg_ctl -D "$PG_DIR" status || true
  fi
}

cmd_roles() {
  log "ensuring Supabase platform roles exist"
  psql_maint -f "$ROLES_SQL" >/dev/null
}

cmd_reset() {
  log "recreating database $DB_NAME"
  psql_maint -c "drop database if exists \"$DB_NAME\" with (force);" >/dev/null 2>&1 \
    || psql_maint -c "drop database if exists \"$DB_NAME\";" >/dev/null
  psql_maint -c "create database \"$DB_NAME\" owner postgres;" >/dev/null
  # Per-database bootstrap of the schema Supabase uses for migration history.
  psql_db -f "$ROLES_SQL" >/dev/null
}

cmd_migrate() {
  local applied f version name
  shopt -s nullglob
  local files=("$MIGRATIONS_DIR"/*.sql)
  shopt -u nullglob
  [[ ${#files[@]} -gt 0 ]] || die "no migrations found in $MIGRATIONS_DIR"
  for f in "${files[@]}"; do
    version="$(basename "$f" | cut -d_ -f1)"
    name="$(basename "$f" .sql | cut -d_ -f2-)"
    applied="$(psql_db -tA -c "select count(*) from supabase_migrations.schema_migrations where version = '$version';")"
    if [[ "$applied" == "1" ]]; then
      log "skip   $version $name (already applied)"
      continue
    fi
    log "apply  $version $name"
    psql_db --single-transaction -f "$f" >/dev/null
    psql_db -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name');" >/dev/null
  done
}

cmd_test() {
  local f failures=0
  shopt -s nullglob
  local files=("$TESTS_DIR"/*.sql)
  shopt -u nullglob
  [[ ${#files[@]} -gt 0 ]] || die "no tests found in $TESTS_DIR"
  for f in "${files[@]}"; do
    if psql_db -f "$f" >/dev/null 2>"$f.err"; then
      log "pass   $(basename "$f")"
      rm -f "$f.err"
    else
      failures=$((failures + 1))
      printf '\033[1;31m[db] FAIL   %s\033[0m\n' "$(basename "$f")"
      sed 's/^/        /' "$f.err"
      rm -f "$f.err"
    fi
  done
  [[ $failures -eq 0 ]] || die "$failures test file(s) failed"
  log "all database tests passed"
}

db_url() {
  if [[ -n "${PGPASSWORD:-}" ]]; then
    printf 'postgresql://%s:%s@%s:%s/%s' "$PGUSER" "$PGPASSWORD" "$PGHOST" "$PGPORT" "$DB_NAME"
  else
    printf 'postgresql://%s@%s:%s/%s' "$PGUSER" "$PGHOST" "$PGPORT" "$DB_NAME"
  fi
}

cmd_url() { db_url; echo; }

gen_types() {
  require_bin supabase
  supabase gen types typescript --db-url "$(db_url)" --schema reference --schema pipeline
}

# Note: on Supabase CLI 2.x `gen types --db-url` still shells out to Docker for
# pg-meta, so this command needs a Docker daemon even though the harness itself
# does not. Phase 3 commits no generated types (nothing consumes them yet); the
# command is provided for the phase that introduces a database client.
cmd_types() {
  log "generating $TYPES_FILE"
  mkdir -p "$(dirname "$TYPES_FILE")"
  local tmp; tmp="$(mktemp)"
  {
    echo "// Generated by scripts/db/local.sh types. Do not edit by hand."
    echo "// Regenerate with: npm run db:types"
    gen_types
  } > "$tmp" || { rm -f "$tmp"; die "type generation failed; nothing was written"; }
  mv "$tmp" "$TYPES_FILE"
  log "types written"
}

cmd_check_types() {
  [[ -f "$TYPES_FILE" ]] || die "$TYPES_FILE does not exist; run 'types' first"
  local tmp; tmp="$(mktemp)"
  {
    echo "// Generated by scripts/db/local.sh types. Do not edit by hand."
    echo "// Regenerate with: npm run db:types"
    gen_types
  } > "$tmp"
  if diff -q "$tmp" "$TYPES_FILE" >/dev/null; then
    log "generated types are current"
    rm -f "$tmp"
  else
    diff -u "$TYPES_FILE" "$tmp" || true
    rm -f "$tmp"
    die "generated types are stale; run 'npm run db:types' and commit the result"
  fi
}

cmd_replay() {
  log "replay pass 1"
  cmd_reset; cmd_migrate; cmd_test
  log "replay pass 2 (deterministic bootstrap check)"
  cmd_reset; cmd_migrate; cmd_test
  log "replay complete: migrations bootstrap deterministically from zero"
}

cmd_ci() {
  cmd_roles
  cmd_replay
}

main() {
  require_bin psql
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    start)        cmd_start ;;
    stop)         cmd_stop ;;
    status)       cmd_status ;;
    roles)        cmd_roles ;;
    reset)        cmd_reset ;;
    migrate)      cmd_migrate ;;
    test)         cmd_test ;;
    types)        cmd_types ;;
    check-types)  cmd_check_types ;;
    replay)       cmd_replay ;;
    url)          cmd_url ;;
    ci)           cmd_ci ;;
    *)
      sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 1 ;;
  esac
}

main "$@"
