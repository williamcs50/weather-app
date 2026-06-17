#!/usr/bin/env python3
"""
recompute_mae.py  --  29-day vs 30-day MAE comparison

Shows what the Mesonet exclusive-end-date bug cost us:
  - OLD (29 days): May 14 to June 11  (bug silently dropped June 12)
  - NEW (30 days): May 14 to June 12  (corrected)

WeatherNext values are queried from BigQuery directly for the exact
dates needed, so this script is independent of the JSON's rolling window.

Run from the weather-app directory:
    python scripts/recompute_mae.py
"""

import json, urllib.request, time
from datetime import datetime, timedelta, timezone

try:
    from google.cloud import bigquery as bq
    _BQ = True
except ImportError:
    _BQ = False

WN_TABLE = "gen-lang-client-0473545431.weathernext_2.weathernext_2_0_0"

CITIES = {
    "Belleair, FL":    {"lat": 27.9342,  "lon": -82.8043,  "station": "PIE"},
    "Chicago, IL":     {"lat": 41.8781,  "lon": -87.6298,  "station": "MDW"},
    "San Diego, CA":   {"lat": 32.7157,  "lon": -117.1611, "station": "SAN"},
    "San Antonio, TX": {"lat": 29.4241,  "lon": -98.4936,  "station": "SSF"},
    "Denver, CO":      {"lat": 39.7392,  "lon": -104.9903, "station": "APA"},
    "Seattle, WA":     {"lat": 47.6062,  "lon": -122.3321, "station": "BFI"},
}

START      = "2026-05-14"
END_OLD    = "2026-06-11"  # last date the buggy pipeline could see
END_NEW    = "2026-06-12"  # corrected


def fetch(url):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def parse_asos(raw):
    obs, best = {}, {}
    for line in raw.decode().strip().splitlines():
        l = line.strip()
        if not l or l.startswith("#") or l.startswith("station,"):
            continue
        cols = l.split(",")
        if len(cols) < 3:
            continue
        ts, tmpf = cols[1].strip(), cols[2].strip()
        if not tmpf or tmpf in ("M", "T"):
            continue
        date = ts[:10]
        hh, mm = int(ts[11:13]), int(ts[14:16])
        mins = abs(hh * 60 + mm - 18 * 60)
        if mins > 90:
            continue
        if date not in best or mins < best[date]:
            obs[date] = float(tmpf)
            best[date] = mins
    return obs


def parse_18utc(data_dict):
    m = {}
    for t, c in zip(
        data_dict["hourly"]["time"],
        data_dict["hourly"]["temperature_2m_previous_day3"],
    ):
        if t.endswith("T18:00") and c is not None:
            m[t[:10]] = c * 9 / 5 + 32
    return m


def fetch_wn_bigquery(client, lat, lon, start, end):
    results = {}
    d     = datetime.strptime(start, "%Y-%m-%d")
    end_d = datetime.strptime(end,   "%Y-%m-%d")
    while d <= end_d:
        target = d.strftime("%Y-%m-%d")
        init   = (d - timedelta(days=3)).strftime("%Y-%m-%d")
        sql = f"""
        SELECT AVG(ensemble.`2m_temperature`) AS mean_k
        FROM `{WN_TABLE}` AS t1,
             UNNEST(forecast) AS forecast,
             UNNEST(ensemble) AS ensemble
        WHERE
          ST_CONTAINS(t1.geography_polygon, ST_GEOGPOINT({lon}, {lat}))
          AND t1.init_time  = TIMESTAMP('{init} 00:00:00 UTC')
          AND forecast.time = TIMESTAMP('{target} 18:00:00 UTC')
        GROUP BY forecast.hours
        """
        rows = list(client.query(sql).result())
        if rows and rows[0].mean_k is not None:
            results[target] = (rows[0].mean_k - 273.15) * 9 / 5 + 32
        d += timedelta(days=1)
    return results


def mae(obs_map, gfs_map, aifs_map, wn_map, end_cutoff):
    gfs_err = aifs_err = wn_err = 0.0
    n = 0
    for date in sorted(obs_map):
        if date > end_cutoff:
            continue
        if date not in wn_map:
            continue
        obs = obs_map[date]
        gfs_pred  = gfs_map.get(date)
        aifs_pred = aifs_map.get(date)
        if gfs_pred is None or aifs_pred is None:
            continue
        gfs_err  += abs(obs - gfs_pred)
        aifs_err += abs(obs - aifs_pred)
        wn_err   += abs(obs - wn_map[date])
        n += 1
    if n == 0:
        return None, None, None, 0
    return round(gfs_err/n, 1), round(aifs_err/n, 1), round(wn_err/n, 1), n


if not _BQ:
    raise SystemExit("google-cloud-bigquery is required. Run: pip install google-cloud-bigquery")

client = bq.Client(project="gen-lang-client-0473545431")

print("Fetching ASOS, GFS, AIFS, and WeatherNext for all six cities...\n")
print("(WeatherNext queries BigQuery directly -- takes ~30s per city)\n")

rows = []
tot = {"old": {"g": 0.0, "a": 0.0, "w": 0.0, "n": 0},
       "new": {"g": 0.0, "a": 0.0, "w": 0.0, "n": 0}}

for city, cfg in CITIES.items():
    lat, lon, sta = cfg["lat"], cfg["lon"], cfg["station"]
    print(f"  {city}...", flush=True)

    asos_raw = fetch(
        f"https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
        f"?station={sta}&data=tmpf"
        f"&year1=2026&month1=05&day1=14&year2=2026&month2=06&day2=13"
        f"&tz=UTC&format=comma&latlon=no&missing=M&trace=T"
    )
    obs_map = parse_asos(asos_raw)
    time.sleep(2)

    base = (
        f"https://previous-runs-api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&start_date={START}&end_date={END_NEW}"
        f"&hourly=temperature_2m_previous_day3&timezone=UTC"
    )
    gfs_map  = parse_18utc(json.loads(fetch(base + "&models=gfs_seamless")))
    time.sleep(1)
    aifs_map = parse_18utc(json.loads(fetch(base + "&models=ecmwf_aifs025_single")))
    time.sleep(1)

    wn_map = fetch_wn_bigquery(client, lat, lon, START, END_NEW)

    g29, a29, w29, n29 = mae(obs_map, gfs_map, aifs_map, wn_map, END_OLD)
    g30, a30, w30, n30 = mae(obs_map, gfs_map, aifs_map, wn_map, END_NEW)

    rows.append((city, g29, a29, w29, n29, g30, a30, w30, n30))
    tot["old"]["g"] += g29 * n29; tot["old"]["a"] += a29 * n29
    tot["old"]["w"] += w29 * n29; tot["old"]["n"] += n29
    tot["new"]["g"] += g30 * n30; tot["new"]["a"] += a30 * n30
    tot["new"]["w"] += w30 * n30; tot["new"]["n"] += n30

    print(f"    old({n29}d): GFS {g29}  AIFS {a29}  WN {w29}  |  new({n30}d): GFS {g30}  AIFS {a30}  WN {w30}")
    time.sleep(5)

n_old = tot["old"]["n"] // len(CITIES)
n_new = tot["new"]["n"] // len(CITIES)
avg_old = (
    round(tot["old"]["g"] / tot["old"]["n"], 2),
    round(tot["old"]["a"] / tot["old"]["n"], 2),
    round(tot["old"]["w"] / tot["old"]["n"], 2),
)
avg_new = (
    round(tot["new"]["g"] / tot["new"]["n"], 2),
    round(tot["new"]["a"] / tot["new"]["n"], 2),
    round(tot["new"]["w"] / tot["new"]["n"], 2),
)

print()
hdr = f"{'City':<18}  {'GFS':>6}({'old':>3}d)  {'AIFS':>6}({'old':>3}d)  {'WN':>5}({'old':>3}d)     {'GFS':>6}({'new':>3}d)  {'AIFS':>6}({'new':>3}d)  {'WN':>5}({'new':>3}d)"
hdr = (f"{'City':<18}  "
       f"{'GFS ('+str(n_old)+'d)':>10}  {'AIFS ('+str(n_old)+'d)':>11}  {'WN ('+str(n_old)+'d)':>9}  |  "
       f"{'GFS ('+str(n_new)+'d)':>10}  {'AIFS ('+str(n_new)+'d)':>11}  {'WN ('+str(n_new)+'d)':>9}")
sep = "-" * len(hdr)
print(hdr)
print(sep)
for city, g29, a29, w29, n29, g30, a30, w30, n30 in rows:
    print(f"{city:<18}  "
          f"{str(g29)+'°F':>10}  {str(a29)+'°F':>11}  {str(w29)+'°F':>9}  |  "
          f"{str(g30)+'°F':>10}  {str(a30)+'°F':>11}  {str(w30)+'°F':>9}")
print(sep)
print(f"{'Six-city avg':<18}  "
      f"{str(avg_old[0])+'°F':>10}  {str(avg_old[1])+'°F':>11}  {str(avg_old[2])+'°F':>9}  |  "
      f"{str(avg_new[0])+'°F':>10}  {str(avg_new[1])+'°F':>11}  {str(avg_new[2])+'°F':>9}")
print()
print(f"Old window: {START} to {END_OLD} ({n_old} days, Mesonet bug active -- June 12 dropped)")
print(f"New window: {START} to {END_NEW}       ({n_new} days, bug fixed)")