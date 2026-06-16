#!/usr/bin/env python3
"""
fetch_weathernext.py  --  WeatherNext Phase B extraction script

Queries BigQuery for WeatherNext 18 UTC 2m temperature at +3-day lead and
writes results to data/weathernext_scores.json for the scoreboard to read.

Usage:
    python scripts/fetch_weathernext.py                  # refresh all cities in JSON
    python scripts/fetch_weathernext.py --city "Detroit, MI"  # add or refresh one city

Requirements:
    pip install google-cloud-bigquery
    gcloud auth application-default login
    gcloud auth application-default set-quota-project gen-lang-client-0473545431
"""

import argparse, json, os, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from google.cloud import bigquery
from google.api_core.exceptions import GoogleAPICallError

PROJECT  = "gen-lang-client-0473545431"
TABLE    = f"{PROJECT}.weathernext_2.weathernext_2_0_0"
OUT      = os.path.join(os.path.dirname(__file__), "..", "data", "weathernext_scores.json")

WINDOW_DAYS = 30
BUFFER_DAYS = 4

DEFAULT_CITIES = [
    {"name": "Chicago, IL",     "lat": 41.8781,  "lon": -87.6298},
    {"name": "San Diego, CA",   "lat": 32.7157,  "lon": -117.1611},
    {"name": "Belleair, FL",    "lat": 27.9342,  "lon": -82.8043},
    {"name": "San Antonio, TX", "lat": 29.4241,  "lon": -98.4936},
    {"name": "Denver, CO",      "lat": 39.7392,  "lon": -104.9903},
    {"name": "Seattle, WA",     "lat": 47.6062,  "lon": -122.3321},
]


def geocode(city_str):
    parts = [p.strip() for p in city_str.split(",")]
    state = parts[1] if len(parts) > 1 else ""
    q = urllib.parse.urlencode({"city": parts[0], "state": state, "country": "US", "format": "json", "limit": 1})
    req = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/search?{q}",
        headers={"User-Agent": "nws-weather-app/1.0"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        results = json.loads(r.read())
    if not results:
        raise SystemExit(f"City not found: {city_str}")
    return float(results[0]["lat"]), float(results[0]["lon"]), results[0]["display_name"]


def kelvin_to_f(k):
    return (k - 273.15) * 9 / 5 + 32


def query_mean(client, lat, lon, init_date_str, target_date_str):
    sql = f"""
    SELECT
      AVG(ensemble.`2m_temperature`) AS mean_k,
      forecast.hours                 AS forecast_hours,
      COUNT(*)                       AS member_count
    FROM
      `{TABLE}` AS t1,
      UNNEST(forecast)  AS forecast,
      UNNEST(ensemble)  AS ensemble
    WHERE
      ST_CONTAINS(t1.geography_polygon, ST_GEOGPOINT({lon}, {lat}))
      AND t1.init_time  = TIMESTAMP('{init_date_str} 00:00:00 UTC')
      AND forecast.time = TIMESTAMP('{target_date_str} 18:00:00 UTC')
    GROUP BY forecast.hours
    """
    rows = list(client.query(sql).result())
    if not rows or rows[0].mean_k is None:
        return None, None, 0
    row = rows[0]
    return kelvin_to_f(row.mean_k), int(row.forecast_hours), int(row.member_count)


def run_city(client, name, lat, lon, dates):
    print(f"\n{name}  ({lat}, {lon})")
    city_entry = {"lat": lat, "lon": lon, "forecasts": {}}
    quota_hit  = False

    for target_date in dates:
        if quota_hit:
            break
        target_dt = datetime.strptime(target_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        init_str  = (target_dt - timedelta(days=3)).strftime("%Y-%m-%d")

        print(f"  {target_date}  init={init_str} ... ", end="", flush=True)

        try:
            mean_f, hours, count = query_mean(client, lat, lon, init_str, target_date)
        except GoogleAPICallError as e:
            if "quota" in str(e).lower() or "429" in str(e):
                print(f"QUOTA EXHAUSTED: stopping. ({e})")
                quota_hit = True
            else:
                print(f"API ERROR: skipping date. ({e})")
            continue

        if mean_f is None:
            print("no data")
            continue

        city_entry["forecasts"][target_date] = {
            "forecast_f":     round(mean_f, 4),
            "init_time":      f"{init_str}T00:00:00Z",
            "valid_time":     f"{target_date}T18:00:00Z",
            "forecast_hours": hours,
            "member_count":   count,
        }
        print(f"{mean_f:.2f}°F  ({count} members, {hours}h lead)")

    n = len(city_entry["forecasts"])
    print(f"  -> {n}/{len(dates)} dates populated")
    return city_entry, quota_hit


def load_existing():
    if os.path.exists(OUT):
        with open(OUT) as f:
            return json.load(f)
    return {"cities": {}}


def main():
    parser = argparse.ArgumentParser(description="Fetch WeatherNext scores into static JSON.")
    parser.add_argument("--city", help="City to add or refresh, e.g. 'Detroit, MI'")
    args = parser.parse_args()

    client = bigquery.Client(project=PROJECT)

    today  = datetime.now(timezone.utc).date()
    end    = today - timedelta(days=BUFFER_DAYS)
    start  = end   - timedelta(days=WINDOW_DAYS - 1)
    dates  = [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(WINDOW_DAYS)]

    print(f"Window: {start} to {end}  ({WINDOW_DAYS} dates)")

    existing = load_existing()
    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_start":  str(start),
        "window_end":    str(end),
        "cities": dict(existing.get("cities", {})),
    }

    try:
        if args.city:
            lat, lon, display = geocode(args.city)
            print(f"Geocoded: {display[:70]}  ({lat:.4f}, {lon:.4f})")
            city_entry, _ = run_city(client, args.city, lat, lon, dates)
            result["cities"][args.city] = city_entry
        else:
            cities_to_run = []
            if result["cities"]:
                for name, entry in result["cities"].items():
                    cities_to_run.append({"name": name, "lat": entry["lat"], "lon": entry["lon"]})
            else:
                cities_to_run = DEFAULT_CITIES

            for city in cities_to_run:
                city_entry, quota_hit = run_city(
                    client, city["name"], city["lat"], city["lon"], dates
                )
                result["cities"][city["name"]] = city_entry
                if quota_hit:
                    print("\nQuota hit -- stopping batch early. Partial results will be saved.")
                    break
    finally:
        os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
        with open(OUT, "w") as fh:
            json.dump(result, fh, indent=2)
        print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()