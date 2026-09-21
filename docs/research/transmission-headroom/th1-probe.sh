#!/usr/bin/env bash
# TH-1 source probes. Research only: reads public endpoints, writes nothing but local files.
#
# Reproduces the retrievals behind th1-source-reconnaissance.md. Every endpoint here was
# reachable without an account on 2026-09-21; PJM and ISO-NE are included precisely to record
# that they were not.
set -u
OUT="${1:-./th1-artifacts}"; mkdir -p "$OUT"; cd "$OUT"

probe() { printf '%-84s ' "$(echo "$1" | cut -c1-82)"
  curl -sSL -o "$2" -w 'http=%{http_code} bytes=%{size_download}\n' --max-time 90 "$1" 2>&1 | tail -1; }

echo "== NYISO: interface flow with directional limits (the only standing flow+limit series) =="
probe "http://mis.nyiso.com/public/csv/ExternalLimitsFlows/$(date -u +%Y%m%d)ExternalLimitsFlows.csv" nyiso-today.csv
probe "http://mis.nyiso.com/public/csv/ExternalLimitsFlows/20260901ExternalLimitsFlows_csv.zip" nyiso-month.zip
probe "http://mis.nyiso.com/public/csv/ExternalLimitsFlows/20050101ExternalLimitsFlows_csv.zip" nyiso-2005.zip

echo "== ERCOT: NP6-86-CD binding constraints, limit and flow pairs =="
probe "https://www.ercot.com/misapp/GetReports.do?reportTypeId=12302" ercot-listing.html
ID=$(grep -o 'doclookupId=[0-9]*' ercot-listing.html | head -1 | cut -d= -f2)
[ -n "${ID:-}" ] && probe "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId=$ID" ercot-sced.zip

echo "== CAISO: ATC/TTC capability, no flow term =="
probe "http://oasis.caiso.com/oasisapi/SingleZip?queryname=TRNS_CURR_USAGE&version=1&startdatetime=20260919T07:00-0000&enddatetime=20260920T07:00-0000&market_run_id=RTM" caiso-usage.zip

echo "== SPP: three limits, no flow =="
probe "https://portal.spp.org/file-browser-api/download/rtbm-binding-constraints?path=/RTBM-BC-latestInterval.csv" spp-latest.csv

echo "== MISO: shadow price only, no limit and no flow =="
probe "https://docs.misoenergy.org/marketreports/2026_rt_bc_HIST.csv" miso-hist.csv

echo "== PJM and ISO-NE: expected to refuse. Recorded, not worked around. =="
probe "https://api.pjm.com/api/v1/" pjm-root.json
probe "https://webservices.iso-ne.com/api/v1.1/limits/current" isone-limits.json
