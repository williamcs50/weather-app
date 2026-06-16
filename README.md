# weather-app

This app shows side-by-side weather forecasts for US locations, comparing classical physics-based numerical weather prediction with modern machine-learning forecasts. Live forecasts come from the [National Weather Service](https://www.weather.gov) and [Open-Meteo API](https://open-meteo.com). The physics-based model is GFS. The machine-learning models are [ECMWF's AIFS](https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational) and [Google DeepMind's WeatherNext](https://developers.google.com/weathernext/). Historical accuracy is verified against [Iowa Mesonet ASOS](https://mesonet.agron.iastate.edu/) observations. All three models appear on the accuracy scoreboard to show where physics and ML agree and where they diverge. GFS and AIFS run as ensembles, so the confidence bands and uncertainty charts reflect real forecast spread.

[**Live demo**](https://williamcs50.github.io/weather-app/) · works with any US city

![Weather-app dashboard](./assets/dashboard.png)

**Build mode.** Scoped as a rapid MVP to practice AI-assisted development as a discipline. I directed the design and verified each piece against the live page. AI did the heavy lifting in implementation. The verification process, reviewing the rendered output, catching errors, and integrating, was the practice.

## Why this project

Weather forecasting is in the middle of a transition. For decades, the field has run on physics-based numerical models like those from the National Weather Service. In the last two years, machine-learning models like ECMWF's AIFS and Google DeepMind's WeatherNext have started matching or beating those physics models on multi-day forecasts. I wanted to see the difference for myself, on the same locations, side by side. The interesting questions live in the gap.

## Evaluation Methodology

The scoring pipeline measures all three models at a +3-day lead on instantaneous 2m temperature at 18:00 UTC, verified against Iowa Mesonet ASOS observations and scored by MAE (mean absolute error in degrees Fahrenheit). 18:00 UTC corresponds to roughly midday to early afternoon across the contiguous US.

Ground truth comes from Iowa Mesonet ASOS stations, resolved automatically for any US city via the NWS `/points` API. GFS and AIFS forecast data comes from Open-Meteo's **Previous Runs API** (`previous-runs-api.open-meteo.com`), not the standard forecast endpoint. The standard API with `past_days` returns reconstruction, meaning the model's current best estimate of past conditions rather than what it actually predicted at the time. The Previous Runs API archives each model run as issued, with variables like `temperature_2m_previous_day3` explicitly representing the forecast issued exactly three days before the target date. Both GFS and AIFS are available through the same endpoint, ensuring an apples-to-apples comparison at a fixed lead time.

WeatherNext scores are drawn from Google BigQuery (`weathernext_2` dataset, ensemble mean across 64 members at 90-hour lead). Because the dataset is historic-only under current licensing terms, scores are pre-computed offline via `scripts/fetch_weathernext.py` and served as a static JSON file. The browser reads the file directly with no live BigQuery calls.

A pre-registration document (`docs/pre-registration.md`) was committed before each pipeline run. It defines expected performance ranges, surprise thresholds, and validation criteria to keep the comparison between models rigorous and defensible.

**Note on metric history.** Before June 15, 2026, the scoreboard used daily maximum temperature verified against Iowa Mesonet ASOS daily observations. On June 15, 2026, the metric was changed to instantaneous 2m temperature at 18:00 UTC to align with WeatherNext's native output format and to use a single consistent metric across all three models. Scores from before that date used a different metric and are not comparable to current results.

**Note on ensemble methodology.** Early Phase 1 results used deterministic GFS and AIFS runs as point forecasts. Phase 2 switched both to ensemble means (GFS Ensemble 0.25 degrees, 31 members; AIFS 0.25 degrees, 51 members), and derived uncertainty bands directly from member spread. Phase 1 and Phase 2 scoreboard results are not directly comparable.

## Roadmap

- Phase 1: deterministic GFS vs. AIFS point forecast comparison. Complete.
- Phase 2: ensemble means, confidence bands, and uncertainty chart. Complete.
- Phase B: WeatherNext (GenCast v3) added to the accuracy scoreboard via BigQuery pre-computed JSON. Complete.
- Phase C: attribution page, experimental-use disclaimer, retrospective. Planned.