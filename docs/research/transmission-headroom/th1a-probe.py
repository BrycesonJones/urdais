#!/usr/bin/env python3
"""TH-1A source probes. Research only: reads public endpoints, writes only local files.

Reproduces the measurements behind th1a-rights-source-contract.md.

  python3 th1a-probe.py nyiso-day 20260920      # direction formula + state counts
  python3 th1a-probe.py nyiso-eras              # sentinel convention by month
  python3 th1a-probe.py nyiso-identity          # Point ID vs name stability
  python3 th1a-probe.py ercot                   # multi-artifact semantics
"""
import csv, io, sys, urllib.request, zipfile, re
from collections import Counter, defaultdict

NY_DAY = "https://mis.nyiso.com/public/csv/ExternalLimitsFlows/{d}ExternalLimitsFlows.csv"
NY_MON = "https://mis.nyiso.com/public/csv/ExternalLimitsFlows/{ym}01ExternalLimitsFlows_csv.zip"
ER_LIST = "https://www.ercot.com/misapp/GetReports.do?reportTypeId=12302"
ER_DL = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={i}"
SENTINEL = 9999.0


def get(url):
    return urllib.request.urlopen(url, timeout=90).read()


def headroom(flow, pos, neg):
    """Select the limit by direction FIRST, then measure. Never abs() before selection."""
    if flow > 0:
        return (None, "unmonitored_direction") if abs(pos) == SENTINEL else (pos - flow, "ok")
    if flow < 0:
        return (None, "unmonitored_direction") if abs(neg) == SENTINEL else (abs(neg) - abs(flow), "ok")
    return None, "zero_flow_direction_undetermined"


def nyiso_day(d):
    rows = list(csv.DictReader(io.StringIO(get(NY_DAY.format(d=d)).decode("utf-8-sig"))))
    st, zero, negative = Counter(), 0, 0
    for r in rows:
        h, s = headroom(float(r["Flow (MWH)"]), float(r["Positive Limit (MWH)"]),
                        float(r["Negative Limit (MWH)"]))
        st[s] += 1
        if h == 0: zero += 1
        if h is not None and h < 0: negative += 1
    print(f"{d}: rows={len(rows)} interfaces={len({r['Interface Name'] for r in rows})} "
          f"timestamps={len({r['Timestamp'] for r in rows})}")
    print("  states:", dict(st), "| zero headroom:", zero, "| negative headroom:", negative)


def nyiso_eras(*yms):
    def cls(v):
        v = str(v).strip()
        if v == "": return "blank"
        f = float(v)
        return "sent9999" if abs(f) == SENTINEL else ("zero" if f == 0 else "real")
    for ym in yms:
        z = zipfile.ZipFile(io.BytesIO(get(NY_MON.format(ym=ym))))
        n = sorted(x for x in z.namelist() if x.lower().endswith(".csv"))[0]
        rows = list(csv.DictReader(io.TextIOWrapper(z.open(n), "utf-8-sig")))
        print(f"{ym}: rows={len(rows):>5} POS={dict(Counter(cls(r['Positive Limit (MWH)']) for r in rows))} "
              f"NEG={dict(Counter(cls(r['Negative Limit (MWH)']) for r in rows))} first={rows[0]['Timestamp']}")


def nyiso_identity(*yms):
    seen = defaultdict(lambda: defaultdict(set))
    for ym in yms:
        z = zipfile.ZipFile(io.BytesIO(get(NY_MON.format(ym=ym))))
        n = sorted(x for x in z.namelist() if x.lower().endswith(".csv"))[0]
        for r in csv.DictReader(io.TextIOWrapper(z.open(n), "utf-8-sig")):
            seen[r["Point ID"].strip()][r["Interface Name"].strip()].add(ym)
    for pid in sorted(seen, key=lambda x: int(x) if x.isdigit() else 0):
        names = seen[pid]
        flag = "  <-- RENAMED" if len(names) > 1 else ""
        print(f"{pid:>8}  {' | '.join(sorted(names))}{flag}")


def ercot(limit=9):
    html = get(ER_LIST).decode("utf-8", "ignore")
    items = re.findall(r"labelOptional_ind'>(cdr\.[^<]+?_csv\.zip)</td>.*?doclookupId=(\d+)'", html, re.S)
    print(f"listing: {len(items)} csv artifacts, "
          f"dates {sorted({n.split('.')[3] for n, _ in items})[0]}..{sorted({n.split('.')[3] for n, _ in items})[-1]}")
    rows = []
    for _, i in items[::max(1, len(items) // limit)][:limit]:
        z = zipfile.ZipFile(io.BytesIO(get(ER_DL.format(i=i))))
        for n in z.namelist():
            if n.lower().endswith(".csv"):
                rows += list(csv.DictReader(io.TextIOWrapper(z.open(n), "utf-8-sig")))
    print("rows:", len(rows), "| SCED timestamps:", len({r["SCEDTimeStamp"] for r in rows}))
    print("CCTStatus:", dict(Counter(r["CCTStatus"] for r in rows)))
    print("contingency:", dict(Counter("BASE CASE" if r["ContingencyName"].strip() == "BASE CASE"
                                       else "named" for r in rows)))
    byid, byname = defaultdict(set), defaultdict(set)
    for r in rows:
        byid[r["ConstraintID"]].add(r["ConstraintName"]); byname[r["ConstraintName"]].add(r["ConstraintID"])
    print("ConstraintIDs with >1 name:", sum(1 for v in byid.values() if len(v) > 1),
          "| ConstraintNames with >1 id:", sum(1 for v in byname.values() if len(v) > 1),
          "  <-- ConstraintID is NOT an identifier")
    lim = [float(r["Limit"]) for r in rows]; val = [float(r["Value"]) for r in rows]
    print(f"negative Limits={sum(1 for x in lim if x < 0)} negative Values={sum(1 for x in val if x < 0)} "
          f"| Limit max={max(lim)} (implausible rows: {sum(1 for x in lim if x > 10000)})")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "ercot"
    if cmd == "nyiso-day": nyiso_day(sys.argv[2])
    elif cmd == "nyiso-eras": nyiso_eras(*(sys.argv[2:] or ["200501", "200502", "200711", "202601"]))
    elif cmd == "nyiso-identity": nyiso_identity(*(sys.argv[2:] or ["200201", "200501", "200502", "201001"]))
    else: ercot()
