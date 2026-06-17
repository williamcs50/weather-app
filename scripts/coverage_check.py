import json, urllib.request, time

with open('data/weathernext_scores.json') as f:
    wd = json.load(f)

START, END = "2026-05-14", "2026-06-12"
CITIES = {
    "Chicago, IL":     {"lat": 41.8781,  "lon": -87.6298,  "station": "MDW"},
    "San Diego, CA":   {"lat": 32.7157,  "lon": -117.1611, "station": "SAN"},
    "Belleair, FL":    {"lat": 27.9342,  "lon": -82.8043,  "station": "PIE"},
    "San Antonio, TX": {"lat": 29.4241,  "lon": -98.4936,  "station": "SSF"},
    "Denver, CO":      {"lat": 39.7392,  "lon": -104.9903, "station": "APA"},
    "Seattle, WA":     {"lat": 47.6062,  "lon": -122.3321, "station": "BFI"},
}

def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()

def asos_dates(station):
    url = (f"https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
           f"?station={station}&data=tmpf"
           f"&year1=2026&month1=05&day1=14&year2=2026&month2=06&day2=13"
           f"&tz=UTC&format=comma&latlon=no&missing=M&trace=T")
    lines = fetch(url).decode().strip().splitlines()
    obs, best = {}, {}
    for line in lines:
        l = line.strip()
        if not l or l.startswith('#') or l.startswith('station,'): continue
        cols = l.split(',')
        if len(cols) < 3: continue
        ts, tmpf = cols[1].strip(), cols[2].strip()
        if not tmpf or tmpf in ('M', 'T'): continue
        date = ts[:10]
        hh, mm = int(ts[11:13]), int(ts[14:16])
        mins = abs(hh*60+mm - 18*60)
        if mins > 90: continue
        if date not in best or mins < best[date]:
            obs[date] = float(tmpf)
            best[date] = mins
    return set(obs.keys())

def openmeteo_dates(lat, lon, model):
    url = (f"https://previous-runs-api.open-meteo.com/v1/forecast"
           f"?latitude={lat}&longitude={lon}"
           f"&start_date={START}&end_date={END}"
           f"&hourly=temperature_2m_previous_day3&timezone=UTC&models={model}")
    d = json.loads(fetch(url))
    dates = set()
    for t, c in zip(d['hourly']['time'], d['hourly']['temperature_2m_previous_day3']):
        if t.endswith('T18:00') and c is not None:
            dates.add(t[:10])
    return dates

print(f"{'City':<18} {'WN':>4} {'GFS':>4} {'AIFS':>4} {'ASOS':>4} {'Scored':>7}  Model gaps  ASOS-only drops")
print("-" * 80)
total_scored = 0
for city, cfg in CITIES.items():
    wn_dates   = set(wd['cities'][city]['forecasts'].keys())
    gfs_dates  = openmeteo_dates(cfg['lat'], cfg['lon'], 'gfs_seamless')
    aifs_dates = openmeteo_dates(cfg['lat'], cfg['lon'], 'ecmwf_aifs025_single')
    time.sleep(3)
    asos_dates_ = asos_dates(cfg['station'])
    time.sleep(3)

    all_model_dates = wn_dates & gfs_dates & aifs_dates
    scored          = all_model_dates & asos_dates_
    model_gaps      = sorted((gfs_dates | aifs_dates | wn_dates) - all_model_dates)
    asos_drops      = sorted(all_model_dates - asos_dates_)

    total_scored += len(scored)
    gap_str  = ", ".join(model_gaps) if model_gaps else "none"
    drop_str = ", ".join(asos_drops) if asos_drops else "none"
    print(f"{city:<18} {len(wn_dates):>4} {len(gfs_dates):>4} {len(aifs_dates):>4} {len(asos_dates_):>4} {len(scored):>7}  {gap_str:<12}  {drop_str}")

print()
print(f"Total scored city-date rows: {total_scored}  (expected 174 = 6 cities x 29 days)")