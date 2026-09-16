# UTVI Settlement Study — Runbook

**Status: internal research document. Not routed publicly, not registered in the docs catalog.**

A read-only, local study that measures how quickly OpenRouter's `rankings-daily` data settles after a UTC day closes.
It answers one question: **at what day age does the data become stable enough to classify as final rather than
provisional?** Production currently assumes D−1 provisional, D−2 and older final. This study tests that assumption
instead of confirming it.

Results accumulate in [settlement-study.md](settlement-study.md), which is generated.

## What it touches

| | |
|---|---|
| Reads | `GET https://openrouter.ai/api/v1/datasets/rankings-daily`, once per run |
| Writes | Three files under `docs/research/utvi/`. Nothing else |
| Database | **None.** No Supabase connection, no `pipeline.utvi_*` table, no migration |
| Production | **Unchanged.** No cron route called, no methodology status altered, no UI touched |
| Credential | `OPENROUTER_API_KEY`, from the environment or `.env.local`. Never printed, never written to an artifact |

It imports the production source client and normalizer deliberately, so that what the study calls a revision is by
construction what the pipeline would call one. Neither module opens a database connection — the DB-touching half of
the UTVI library is `store.ts` and `run.ts`, and nothing here reaches them.

## Run it manually

```bash
npm run utvi:settlement-study
```

One authenticated request. It reads D−1, D−2 and D−3 (UTC), records one observation per date, compares each against
the previous observation of that same date, and regenerates the summary.

| Option | Effect |
|---|---|
| `-- --dry-run` | Read and print, write nothing |
| `-- --max-day-age 7` | Also record D−4 … D−7, from the same single request |
| `-- --artifact-dir <dir>` | Write somewhere other than `docs/research/utvi` |
| `-- --allow-rerun` | Record a deliberate second read of a day already recorded, with its own identity |
| `-- --report-only` | Regenerate the summary from the ledger. **No network, no key needed** |

Running twice in a UTC day is safe: the second run records nothing and says so. `--allow-rerun` is refused inside the
source's 60-second cache window, because a read there returns a byte-identical body and would record a stability that
was never measured.

## The scheduled agent (installed)

A launchd agent runs the study **once per day at 09:00 local**. 09:00 lands at 13:00–14:00 UTC in both
daylight-saving regimes — far enough from UTC midnight that a clock shift cannot carry a run into the neighbouring
UTC day, which is what keeps "one run per UTC day" true across all fourteen.

| | |
|---|---|
| Label | `com.urdais.utvi-settlement-study` |
| Plist | `~/Library/LaunchAgents/com.urdais.utvi-settlement-study.plist` |
| Runs from | `/Users/bryceson/GitHub/urdais-utvi-study` |
| Command | `npm run utvi:settlement-study` |
| Schedule | Daily, 09:00 local |
| stdout | `~/Library/Logs/urdais/utvi-settlement-study.log` |
| stderr | `~/Library/Logs/urdais/utvi-settlement-study.err` |

### Why it runs from a dedicated checkout

`/Users/bryceson/GitHub/urdais-utvi-study` is a worktree of this repository, checked out on
`research/utvi-settlement-study`. It exists so that the scheduled job is unambiguous about **which** harness it runs.
The main checkout is routinely on another branch, and a second, unrelated settlement-study script has existed there
under a near-identical name — pointing a daily job at a directory whose branch moves underneath it is how you end up
measuring something other than what you believe you are measuring.

Daily observations accumulate in that worktree. Commit and push them as the study proceeds: they are the evidence, and
they belong on the branch.

### The credential

The plist contains **no secret**. The key reaches the process through `.env.local` in that worktree — untracked,
matched by the repo's `.env*.local` ignore rule — which the script reads at startup. A plist under
`~/Library/LaunchAgents` is world-readable and is backed up and synced like any other file in the home directory, so a
key embedded there would travel much further than one in a gitignored dotfile.

Neither log receives the key: the script never prints it, never logs a request header, and the source client keeps it
out of every error message.

### Managing it

```bash
launchctl print gui/$UID/com.urdais.utvi-settlement-study          # state, next fire, last exit status
launchctl kickstart -p gui/$UID/com.urdais.utvi-settlement-study   # run once, now
tail -f ~/Library/Logs/urdais/utvi-settlement-study.log
```

Firing it by hand is safe at any time. A second run inside the same UTC day records nothing, says so, and **makes no
request at all** — the idempotency check short-circuits before the fetch.

### Retiring it after day 14

Confirm `settlement-study-state.json` reports `runsCompleted: 14` first, and make sure the ledger is committed and
pushed. Then:

```bash
launchctl bootout gui/$UID/com.urdais.utvi-settlement-study
rm ~/Library/LaunchAgents/com.urdais.utvi-settlement-study.plist
rm -f /Users/bryceson/GitHub/urdais-utvi-study/.env.local
```

The dedicated worktree can then be removed with the usual worktree-removal command. The study ends after fourteen
**runs**, not fourteen calendar days, so a missed day pushes the end date out rather than truncating the evidence.

### cron (alternative, not installed)

```cron
0 9 * * * cd /Users/bryceson/GitHub/urdais-utvi-study && /bin/zsh -lc 'npm run utvi:settlement-study' >> ~/Library/Logs/urdais/utvi-settlement-study.log 2>&1
```

**Not a Vercel cron and not a deployment.** The study is local by design: it writes files into a working tree, which a
serverless run could not do. `-lc` runs a login shell so that Homebrew's `node` is on the `PATH`; launchd's own
environment does not include `/opt/homebrew/bin`.

## Inspect progress

```bash
cat docs/research/utvi/settlement-study-state.json        # runs completed, runs remaining, missed dates
npm run utvi:settlement-study:report                      # regenerate the summary, no network
open docs/research/utvi/settlement-study.md               # the read
```

The state file is derived, so it can always be rebuilt from the ledger.

## Generate the final summary

The summary is regenerated by every run, so at the end of the study there is nothing to build:

```bash
npm run utvi:settlement-study:report
```

Read the **verdict** block. It is marked *provisional* until fourteen runs are in, and reports one of:

| | Evidence | Reading |
|---|---|---|
| **A** | No D−2 comparison changed | Retain D−1 provisional / D−2 final |
| **B** | Some changed, largest below 100 ppm | D−2 operationally final, with late-revision supersession |
| **C** | Largest above 100 ppm | Move finalization to D−3 or later |

The 100 ppm threshold is a **study band, not a production policy** — it sits at roughly six times the drift Phase 1A
measured on the just-closed day. Turning an outcome into a methodology change is a separate, deliberate decision, and
it belongs with the rest of [the activation checklist](../../operations/utvi-activation.md).

## Artifacts

| File | Role |
|---|---|
| `settlement-study.jsonl` | **Append-only. The evidence.** One JSON object per observation, including the per-model row vector that row-level revision metrics are computed from |
| `settlement-study.csv` | Append-only, one row per observation, aggregate metrics only. What a spreadsheet reads |
| `settlement-study-state.json` | Derived each run: progress, completed runs, missed dates |
| `settlement-study.md` | Derived each run: the human summary. **Generated — do not edit by hand** |

Commit them as the study proceeds; they are the record.

## What the hash is

The revision detector is `hashDateRows` from the production normalizer: SHA-256 over every returned row's
`model_permaslug` and `total_tokens` for that date, canonically ordered.

**Excluded, deliberately:** `meta.as_of` — Phase 1A measured it advancing on *every* request whether the content moved
or not, so it detects nothing — along with `meta.start_date`, `meta.end_date`, `meta.version`, the row order the source
chose, the retrieval timestamp, and every response header.

The raw whole-body hash is recorded next to it in the CSV. It covers the whole multi-date response, so it is shared
by all three target dates of a run and cannot detect a per-date revision; it moves whenever `as_of` does. The two
diverging while the semantic hash holds is the evidence that `as_of` detects nothing.

## If something goes wrong

| Symptom | Meaning |
|---|---|
| `OPENROUTER_API_KEY is not set` | Exit 2, nothing written. The study will not record a run that did not happen |
| `retrieval: http_error` | Recorded as `http_error` with null metrics. Not a zero, and not a gap |
| `validation_status: no_rows` | The source served the date and returned nothing. Two such dates exist in its history (2025-06-15, 2025-07-15). Never a zero |
| `validation_status: not_served` | The date fell outside the window the source resolved. Never looked at |
| A missed day | Recorded in `missedRunDates`. The study ends after fourteen *runs*, so a gap extends it rather than shortening it |

## Tests

```bash
npx vitest run scripts/research/utvi-settlement-study
```

Fixtures only — no test calls the live API.
