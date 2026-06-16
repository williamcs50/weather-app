import urllib.request, urllib.parse, json
from datetime import datetime, timedelta

try:
    from google.cloud import bigquery as bq
    _BQ = True
except ImportError:
    _BQ = False

START = "2026-05-20"
END   = "2026-05-20"

WN_TABLE = "gen-lang-client-0473545431.weathernext_2.weathernext_2_0_0"

def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

# ── Geocode ───────────────────────────────────────────────────────────────
city  = input("City, State (e.g. Chicago, IL): ").strip()
parts = [p.strip() for p in city.split(",")]
state = parts[1] if len(parts) > 1 else ""
q     = urllib.parse.urlencode({"city": parts[0], "state": state, "country": "US", "format": "json", "limit": 1})
geo   = get(f"https://nominatim.openstreetmap.org/search?{q}", {"User-Agent": "nws-weather-app/1.0"})
if not geo:
    raise SystemExit("City not found.")
LAT, LON = float(geo[0]["lat"]), float(geo[0]["lon"])
print(f"  -> {geo[0]['display_name'][:60]}  ({LAT:.4f}, {LON:.4f})\n")

# ── Nearest ASOS station via NWS /points ─────────────────────────────────
nws_pts  = get(f"https://api.weather.gov/points/{LAT:.4f},{LON:.4f}", {"User-Agent": "nws-weather-app/1.0"})
stations = get(nws_pts["properties"]["observationStations"], {"User-Agent": "nws-weather-app/1.0"})
feat = next((f for f in stations["features"] if f["properties"].get("provider", "").startswith("ASOS")), None)
if not feat:
    raise SystemExit("No ASOS station found near this city.")
station_k = feat["properties"]["stationIdentifier"]
station   = station_k.lstrip("K")
print(f"  Nearest ASOS station: {station_k}\n")

# ── Iowa Mesonet: hourly ASOS, closest obs to 18:00 UTC per date ──────────
def mesonet_18utc(station, start, end):
    y1, m1, d1 = start.split("-")
    y2, m2, d2 = end.split("-")
    url = (f"https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
           f"?station={station}&data=tmpf"
           f"&year1={y1}&month1={m1}&day1={d1}"
           f"&year2={y2}&month2={m2}&day2={d2}"
           f"&tz=UTC&format=comma&latlon=no&missing=M&trace=T")
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as r:
        lines = r.read().decode().strip().splitlines()

    obs, best = {}, {}
    WINDOW = 90
    for line in lines:
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
        if mins > WINDOW:
            continue
        if date not in best or mins < best[date]:
            obs[date]  = (float(tmpf), ts[11:16])
            best[date] = mins
    return obs

mesonet = mesonet_18utc(station, START, END)

# ── Forecasts: Previous Runs API, T18:00 UTC at +3-day lead ──────────────
def parse_18utc_f(times, temps):
    result = {}
    for t, c in zip(times, temps):
        if t.endswith("T18:00") and c is not None:
            result[t[:10]] = round(c * 9 / 5 + 32, 2)
    return result

forecasts = {}
for model in ["gfs_seamless", "ecmwf_aifs025_single"]:
    data = get(f"https://previous-runs-api.open-meteo.com/v1/forecast"
               f"?latitude={LAT:.4f}&longitude={LON:.4f}"
               f"&start_date={START}&end_date={END}"
               f"&hourly=temperature_2m_previous_day3"
               f"&timezone=UTC&models={model}")
    forecasts[model] = parse_18utc_f(data["hourly"]["time"],
                                     data["hourly"]["temperature_2m_previous_day3"])

# ── WeatherNext: BigQuery ensemble mean, forecast.time filter ─────────────
def wn_18utc(lat, lon, start, end):
    if not _BQ:
        print("  (google-cloud-bigquery not installed — WeatherNext skipped)")
        return {}
    client = bq.Client(project="gen-lang-client-0473545431")
    results = {}
    d     = datetime.strptime(start, "%Y-%m-%d")
    end_d = datetime.strptime(end,   "%Y-%m-%d")
    while d <= end_d:
        target = d.strftime("%Y-%m-%d")
        init   = (d - timedelta(days=3)).strftime("%Y-%m-%d")
        sql = f"""
        SELECT
          AVG(ensemble.`2m_temperature`) AS mean_k,
          forecast.hours                 AS forecast_hours,
          COUNT(*)                       AS member_count
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
            mean_f = (rows[0].mean_k - 273.15) * 9 / 5 + 32
            results[target] = (round(mean_f, 2), int(rows[0].forecast_hours), int(rows[0].member_count))
        d += timedelta(days=1)
    return results

wn = wn_18utc(LAT, LON, START, END)

all_dates = sorted(set(mesonet) | set(forecasts["gfs_seamless"]) | set(forecasts["ecmwf_aifs025_single"]) | set(wn))

def fmt(val, obs):
    if val is None or obs is None:
        return f"{'—':>8}"
    diff = round(val - obs, 2)
    sign = "+" if diff >= 0 else ""
    return f"{val:>6.2f} ({sign}{diff:.2f})"

# ── Comparison table ──────────────────────────────────────────────────────
print(f"\n{city}  |  +3-day lead  |  18:00 UTC  |  {START} -> {END}\n")
print(f"{'Date':<12}  {'ASOS':>14}  {'GFS (err)':>18}  {'AIFS (err)':>18}  {'WN (err)':>18}")
print("─" * 90)
for d in all_dates:
    obs_val, obs_ts = mesonet.get(d, (None, None))
    g = forecasts["gfs_seamless"].get(d)
    a = forecasts["ecmwf_aifs025_single"].get(d)
    wn_val = wn[d][0] if d in wn else None
    obs_str = f"{obs_val}°F @{obs_ts}" if obs_val else "—"
    print(f"{d:<12}  {obs_str:>14}  {fmt(g, obs_val):>18}  {fmt(a, obs_val):>18}  {fmt(wn_val, obs_val):>18}")