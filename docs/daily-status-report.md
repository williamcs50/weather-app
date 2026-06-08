# Monday, Jun 8th: Phase 1 kickoff

Pre-registration (measurement days only — fill BEFORE running):

Prediction: N/A (not a measurement day)
Bands: N/A

What landed today:

- Diagnosed that the current accuracy scoreboard uses the regular Open-Meteo API with past_days. This returns recent model output instead of actual forecasts issued at specific lead times.

- Confirmed this is the main reason the current scoreboard is not defensible.

- Identified the Historical Forecast API (https://open-meteo.com/en/docs/historical-forecast-api) as the correct fix. This is different from the current ECMWF forecast API.

- Decided to start with +3 day lead time for maximum temperature.



What's open (carrying forward):

- Add formal pre-registration for +3 day maximum temperature.

- Implement corrected verification using the Historical Forecast API for AIFS.

- Update the scoreboard.


Result against prediction (measurement days only):

- N/A (not a measurement day)


What's next:

- Do pre-registration tomorrow.

- Decide on the best approach for measuring both models given the different APIs.

Anything surprising or worth flagging:

- Looking through the Open-Meteo and NWS APIs was overwhelming at first. It took time to figure out which endpoint returns what before the diagnosis clicked.