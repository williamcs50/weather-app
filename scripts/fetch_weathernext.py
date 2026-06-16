#!/usr/bin/env python3
"""
fetch_weathernext.py  —  WeatherNext Phase B extraction script

Queries BigQuery for WeatherNext 18 UTC 2m temperature at +3-day lead across
all target cities and the current 30-day scoreboard window. Writes results to
data/weathernext_scores.json for the scoreboard to read offline.

Run on demand before presenting the scoreboard, or on a schedule.

Requirements:
    pip install google-cloud-bigquery
    gcloud auth application-default login
    gcloud auth application-default set-quota-project gen-lang-client-0473545431
"""

import json, os
from datetime import datetime, timedelta, timezone
from google.cloud import bigquery

PROJECT  = "gen-lang-client-0473545431"
TABLE    = f"{PROJECT}.weathernext_2.weathernext_2_0_0"
OUT      = os.path.join(os.path.dirname(__file__), "..", "data", "weathernext_scores.json")

WINDOW_DAYS = 30
BUFFER_DAYS = 4   # days before today before ASOS obs are considered final

# Coordinates match what Nominatim returns for each city — same as the scoreboard geocoder.
CITIES = [
    {"name": "Chicago, IL",     "lat": 41.8781,  "lon": -87.6298},
    {"name": "San Diego, CA",   "lat": 32.7157,  "lon": -117.1611},
    {"name": "Belleair, FL",    "lat": 27.9342,  "lon": -82.8043},
    {"name": "San Antonio, TX", "lat": 29.4241,  "lon": -98.4936},
    {"name": "Denver, CO",      "lat": 39.7392,  "lon": -104.9903},
    {"name": "Seattle, WA",     "lat": 47.6062,  "lon": -122.3321},
]


def kelvin_to_f(k):
    return (k - 273.15) * 9 / 5 + 32


def query_mean(client, lat, lon, init_date_str, target_date_str):
    """
    Returns (mean_f, forecast_hours, member_count) for one city-date.
    Filters on forecast.time so the lead time falls out as a logged audit field.
    """
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


def main():
    client = bigquery.Client(project=PROJECT)

    today  = datetime.now(timezone.utc).date()
    end    = today - timedelta(days=BUFFER_DAYS)
    start  = end   - timedelta(days=WINDOW_DAYS - 1)
    dates  = [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(WINDOW_DAYS)]

    print(f"Window: {start} to {end}  ({WINDOW_DAYS} dates)")

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_start":  str(start),
        "window_end":    str(end),
        "cities": {},
    }

    for city in CITIES:
        name, lat, lon = city["name"], city["lat"], city["lon"]
        print(f"\n{name}  ({lat}, {lon})")
        city_entry = {"lat": lat, "lon": lon, "forecasts": {}}

        for target_date in dates:
            target_dt = datetime.strptime(target_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            init_str  = (target_dt - timedelta(days=3)).strftime("%Y-%m-%d")

            print(f"  {target_date}  init={init_str} ... ", end="", flush=True)

            mean_f, hours, count = query_mean(client, lat, lon, init_str, target_date)
            if mean_f is None:
                print("no data")
                continue

            city_entry["forecasts"][target_date] = {
                "forecast_f":    round(mean_f, 4),
                "init_time":     f"{init_str}T00:00:00Z",
                "valid_time":    f"{target_date}T18:00:00Z",
                "forecast_hours": hours,
                "member_count":  count,
            }
            print(f"{mean_f:.2f}°F  ({count} members, {hours}h lead)")

        n = len(city_entry["forecasts"])
        print(f"  -> {n}/{WINDOW_DAYS} dates populated")
        result["cities"][name] = city_entry

    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(result, fh, indent=2)
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()