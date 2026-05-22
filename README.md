# weather-app

This app shows side-by-side weather forecasts for US locations, comparing classical physics-based numerical weather prediction with modern machine-learning forecasts. The physics side is the [National Weather Service](https://www.weather.gov), which has been running global weather prediction for decades. The ML side is [ECMWF's AIFS](https://www.ecmwf.int/en/about/media-centre/news/2025/ecmwfs-ai-forecasts-become-operational), accessed via the [Open-Meteo ECMWF API](https://open-meteo.com/en/docs/ecmwf-api), part of a new generation of ML-based forecasts that also includes [Google DeepMind's WeatherNext](https://developers.google.com/weathernext/). v2 ships against AIFS so you can see where physics and ML agree and where they diverge.

## How it was built

Scaffolded with Claude inside VS Code, integrated, reviewed, and shipped by me.

## Roadmap

- v3 will add a third panel using Google DeepMind's WeatherNext (GenCast), giving three lineages side-by-side: NWS physics, ECMWF AIFS, and WeatherNext. Tracked in [issue #6](https://github.com/williamcs50/weather-app/issues/6). Blocked on WeatherNext API access approval.
