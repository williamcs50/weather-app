# WeatherNext (v3): Project Charter

## Part I: Project Charter

### 1. Objective

Add Google DeepMind's WeatherNext (GenCast) as a third lineage in the weather-app's historic accuracy comparison (GFS, ECMWF AIFS, and now WeatherNext), measured by the same honest yardstick already built.

**Why it matters.** The existing scoreboard is a ruler: forecasts as issued, fixed lead, verified against real observations. Phases 1 and 2 made that ruler defensible for two models. This project proves the ruler generalizes: a third model, from a different lineage, measured identically, without bending the method to fit it.


### 2. Done criteria

The project is complete when all of these are true:

- WeatherNext historic forecast data is accessed from Google's platform (BigQuery) and reduced to a point forecast for a US city at a fixed lead time.
- WeatherNext appears as a third lineage in the historic scoreboard, measured identically to GFS and AIFS: same lead time, same observation source (ASOS), same metric, forecasts as issued. If identical measurement proves impossible, the limitation is surfaced honestly, not papered over.
- The WeatherNext number can be explained and defended: what it measures, where it comes from, and whether it is truly comparable to the other two.
- Licensing is respected: only historic (more than 48 hours old) data is used, required Google attribution and the experimental-use disclaimer are on the page, and the app displays no live or real-time WeatherNext data.
- README and roadmap reflect WeatherNext shipped and the historic-only boundary.

**Explicit non-goals: what done does NOT require:**

- A live or real-time WeatherNext panel. Barred by real-time experimental licensing terms. This is the hard scope line.
- A WeatherNext confidence-band or ensemble panel. Deferred to keep this project to the scoreboard third lineage.
- Any change to the existing GFS or AIFS numbers. Those stand. This project adds to the scoreboard without re-running existing measurements. (See amendment 2026-06-15.)
- A particular result. Done does not require that WeatherNext wins, loses, or ties. An honestly measured number is the deliverable.


### 3. Phases

| Phase | Focus | Deliverable |
|---|---|---|
| A: Access and data shape | Confirm access works, pull historic WeatherNext gridded data, and extract a point, fixed-lead forecast for a city | Hand-checked point forecasts for a few city-dates, proven against raw data |
| B: Third lineage | Wire WeatherNext into the historic scoreboard, measured identically to GFS and AIFS, hand-check, and label honestly | WeatherNext live as a third column, same yardstick |
| C: Compliance and close-out | Attribution and experimental-use disclaimer on the page, README and roadmap, and retrospective | Project closed clean. Complete. |

**Pace note.** Phase A carries the project's real unknown. WeatherNext is gridded scientific data on a cloud platform, not a simple JSON endpoint. If it cannot be measured the same way as the other two, that is a genuine finding that reshapes scope, not a failure.


### 4. Decisions

- **Lead time:** +3 days, matching the existing GFS and AIFS pipeline.
- **Cities:** flexible, starting with the hand-check cities from the existing scoreboard (Chicago, San Diego, Belleair, San Antonio).
- **Access channel:** BigQuery.
- **Metric:** 18 UTC instantaneous 2m temperature at +3-day lead. Scoreboard label: "temperature at 18 UTC, 3 days ahead."
- **Ground truth:** Iowa Mesonet ASOS observation closest to 18:00 UTC, used as proxy for 18 UTC valid time. Stations report at approximately :51 or :53 past the hour, and the closest observation is used consistently across all cities and models.


### 5. Scope guardrails

- In scope: historic WeatherNext as a third lineage on the existing scoreboard measured by the existing method, attribution and disclaimer, and docs.
- Deferred: live or real-time WeatherNext, a WeatherNext confidence-band panel, and any model beyond the third.
- The re-run rule: once a number is run under a pre-registered prediction, no re-running to chase a better one. Methodology bugs may be fixed. A clean number you do not like stands.
- The licensing line: historic data only. The moment work drifts toward live or real-time display, stop.


### 6. Amendments

Dated log of any change to objective, done-criteria, or scope after the project starts.

- **2026-06-12:** Metric changed from daily maximum temperature to 18 UTC instantaneous 2m temperature at +3-day lead. Reason: WeatherNext only provides 6-hourly instantaneous snapshots, and deriving a daily max would carry a systematic cold bias because the snapshots miss the afternoon peak. 18 UTC is identical and directly readable across all three models with no derivation.
- **2026-06-12:** Ground truth rule generalized from ":51 past 18 UTC" to "closest ASOS observation to 18:00 UTC." Reason: not all stations report at :51, and the generalized rule covers all stations regardless of their reporting offset.
- **2026-06-15:** Non-goal retired: "Any change to the existing GFS or AIFS numbers. Those stand. This project adds to the scoreboard without re-running existing measurements." The metric change to 18 UTC instantaneous 2m temperature (see amendment 2026-06-12) makes it possible to measure all three models on the same yardstick. Running two scoreboards in parallel, one daily-high for GFS and AIFS and one 18 UTC for WeatherNext, would produce numbers a reader would conflate. The daily-high scoreboard is replaced by the 18 UTC scoreboard for all three models. Re-running GFS and AIFS under the new metric is not a result-chasing re-run: the methodology change is documented here, dated, and no number is being revised to improve an outcome.
