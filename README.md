# weather-app

This app shows side-by-side weather forecasts for US locations, comparing classical physics-based numerical weather prediction with modern machine-learning forecasts. The physics side is the [National Weather Service](https://www.weather.gov), which has been running global weather prediction for decades. The ML side is [ECMWF's AIFS](https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational), accessed via the [Open-Meteo ECMWF API](https://open-meteo.com/en/docs/ecmwf-api), part of a new generation of ML-based forecasts that also includes [Google DeepMind's WeatherNext](https://developers.google.com/weathernext/). v2 ships against AIFS so you can see where physics and ML agree and where they diverge.

[**Live demo**](https://williamcs50.github.io/weather-app/) — try it with any US city

![Weather-app v2 dashboard](./assets/dashboard.png)

**Build mode.** Scoped as a rapid MVP to practice AI-assisted development as a discipline. I directed the design and verified each piece against the live page. AI did the heavy lifting in implementation. The verification process, reviewing the rendered output, catching errors, and integrating, was the practice.

## Why this project

Weather forecasting is in the middle of a transition. For decades, the field has run on physics-based numerical models like those from the National Weather Service. In the last two years, machine-learning models — ECMWF's AIFS, Google DeepMind's WeatherNext — have started matching or beating those physics models on multi-day forecasts. I wanted to see the diff for myself, on the same locations, side by side. The interesting questions live in the gap.

## Roadmap

- v3 will add a third panel using Google DeepMind's WeatherNext (GenCast), giving three lineages side-by-side: NWS physics, ECMWF AIFS, and WeatherNext. Tracked in [issue #6](https://github.com/williamcs50/weather-app/issues/6). Blocked on WeatherNext API access approval.
