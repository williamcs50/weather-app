import urllib.request, urllib.parse, json

START, END = "2026-05-26", "2026-05-30"

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
station_k = stations["features"][0]["properties"]["stationIdentifier"]  # e.g. KORD
station   = station_k.lstrip("K")                                        # e.g. ORD
print(f"  Nearest ASOS station: {station_k}\n")

# ── Iowa Mesonet: independent daily high (cross-reference) ───────────────
def mesonet_highs(station, state, start, end):
    y1, m1, d1 = start.split("-")
    y2, m2, d2 = end.split("-")
    url = (f"https://mesonet.agron.iastate.edu/cgi-bin/request/daily.py"
           f"?network={state}_ASOS&stations={station}"
           f"&year1={y1}&month1={m1}&day1={d1}"
           f"&year2={y2}&month2={m2}&day2={d2}"
           f"&vars[]=max_tmpf&what=view&delim=comma")
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as r:
        lines = r.read().decode().strip().splitlines()
    result = {}
    for line in lines[1:]:  # skip header
        cols = line.split(",")
        if len(cols) >= 3 and cols[2] not in ("", "M"):
            result[cols[1]] = float(cols[2])
    return result

mesonet = mesonet_highs(station, state, START, END)

def daily_max_f(times, temps):
    d = {}
    for t, v in zip(times, temps):
        if v is not None:
            day = t[:10]
            d[day] = max(d.get(day, float("-inf")), round(v * 9/5 + 32, 1))
    return d


# ── Forecasts: Previous Runs API at +3-day lead ───────────────────────────
forecasts = {}
for model in ["gfs_seamless", "ecmwf_aifs025_single"]:
    data = get(f"https://previous-runs-api.open-meteo.com/v1/forecast"
               f"?latitude={LAT}&longitude={LON}"
               f"&start_date={START}&end_date={END}"
               f"&hourly=temperature_2m_previous_day3"
               f"&models={model}")
    forecasts[model] = daily_max_f(data["hourly"]["time"],
                                   data["hourly"]["temperature_2m_previous_day3"])

# ── Comparison table ──────────────────────────────────────────────────────
print(f"\n{city}  |  +3-day lead  |  {START} -> {END}\n")
def fmt(val, obs):
    if val == "—" or obs == "—":
        return f"{'—':>8}"
    diff = round(val - obs, 1)
    sign = "+" if diff >= 0 else ""
    return f"{val:>6.1f} ({sign}{diff})"

print(f"{'Date':<12}  {'ASOS °F':>8}  {'GFS °F (err)':>16}  {'AIFS °F (err)':>16}")
print("─" * 58)
all_dates = sorted(set(mesonet) | set(forecasts["gfs_seamless"]) | set(forecasts["ecmwf_aifs025_single"]))
for d in all_dates:
    m = mesonet.get(d, "—")
    g = forecasts["gfs_seamless"].get(d, "—")
    a = forecasts["ecmwf_aifs025_single"].get(d, "—")
    print(f"{d:<12}  {str(m):>8}  {fmt(g, m):>16}  {fmt(a, m):>16}")