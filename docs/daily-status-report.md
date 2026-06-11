# Monday, Jun 8th: Phase 1 kickoff

## Pre-registration

Prediction: N/A (not a measurement day)

Bands: N/A

## What landed today

- Diagnosed that the current accuracy scoreboard uses `past_days` on the regular Open-Meteo API. This returns the most recent model output for the recent past, not the actual forecasts that were issued days earlier for those dates.

- Confirmed this is the main reason the current scoreboard is not defensible.

- Identified the Historical Forecast API (https://open-meteo.com/en/docs/historical-forecast-api) as the correct fix. This is different from the current ECMWF forecast API.

- Decided to start with +3 day lead time for maximum temperature.



## What's open (carrying forward)

- Add formal pre-registration for +3 day maximum temperature.

- Implement corrected verification using the Historical Forecast API for AIFS.

- Update the scoreboard.


## Result against prediction 

- N/A (not a measurement day)


## What's next

- Do pre-registration tomorrow.

- Decide on the best approach for measuring both models given the different APIs.

## Anything surprising or worth flagging

- Looking through the Open-Meteo and NWS APIs was overwhelming at first. It took time to figure out which endpoint returns what before the diagnosis clicked.


# Tuesday, Jun 9th: Phase 1 complete

## Pre-registration

Prediction: GFS MAE 3.5 to 4.5°F, AIFS MAE 4.5 to 5.5°F, GFS outperforms AIFS by 0.8 to 1.5°F overall.

Bands: GFS surprise thresholds at 2.0°F (suspiciously low) and 8.0°F (suspiciously high). If AIFS beats GFS by more than 3.0°F, question the pipeline. If AIFS wins by under 1.5°F, treat as genuine.

## What landed today

- Built and shipped the corrected scoreboard pipeline

- Hand-checked the pipeline against the scratch script for Chicago and San Diego

- Ran results across four cities

- Updated README, footer, and docs to reflect Phase 1 complete

## What's open (carrying forward)

- Nothing carrying forward from Phase 1.

## Result against prediction

- Chicago, IL: GFS 5.8°F, AIFS 3.1°F. AIFS won by 2.7°F, which is outside the predicted ranges for both models but still within the 3.0°F threshold where the pipeline would be questioned. To verify the result, I ran the scratch script against May 26 to 30 and got GFS MAE 6.4°F and AIFS MAE 2.4°F over that window, consistent with the 30-day scoreboard. The pipeline is clean.

- San Diego, CA: GFS 1.8°F, AIFS 1.9°F. The two models came in essentially tied, with both well below their predicted ranges. GFS came in at 1.8°F, close to the 2.0°F suspicion flag, which warranted a hand-check. The scratch script returned GFS MAE 2.1°F and AIFS MAE 1.6°F for May 26 to 30, consistent with the scoreboard. San Diego's stable marine climate most likely explains the low errors rather than a pipeline issue.

- Belleair, FL: GFS 2.8°F, AIFS 3.2°F over 30 days. GFS won by 0.4°F. Both models below predicted ranges. Hand-checked May 26 to 30: GFS MAE 2.5°F, AIFS MAE 2.8°F. Consistent with scoreboard. Clean.

- San Antonio, TX: GFS 2.3°F, AIFS 2.8°F over 30 days. GFS won by 0.5°F. Both models below predicted ranges. Hand-checked May 26 to 30: GFS MAE 2.8°F, AIFS MAE 1.1°F. AIFS won this 5-day window but GFS won the 30-day aggregate. Consistent with scoreboard given window variance.

All results stand as measured. No re-runs.

## What's next

- Phase 2: real forecast uncertainty. Confidence bands and decay driven by real ensemble spread. Prototype caveat removed.

## Anything surprising or worth flagging

- AIFS performed significantly better than predicted across all four cities tested, consistently coming in well below its expected 4.5 to 5.5°F range. GFS won in three of the four cities but also came in below its predicted range in most cases. The Chicago result was the most striking. AIFS won by 2.7°F on a period with strong frontal activity, which the pre-registration flagged as a scenario where AIFS might be competitive but did not expect it to dominate the aggregate. The San Antonio hand-check added a secondary note: AIFS won the May 26 to 30 window despite GFS winning the 30-day aggregate, which suggests the result is sensitive to the specific days sampled.


# Wednesday, Jun 10th: Phase 2 complete

## What landed today

- Replaced formula-driven confidence bands and decay chart with real ensemble spread for both models

- Documented the Phase 1 and Phase 2 methodology change in the README and on the in-app scoreboard

- Hand-checked ensemble output against the raw API across four cities (Chicago, San Diego, Belleair, San Antonio), all passed

- Fixed the period alignment bug (name-based lookup was silently dropping periods such as "This Afternoon")

- Removed jargon from user-facing strings

- Updated README and roadmap to mark Phase 2 complete

- Added uncertainty-source labels under each confidence band. GFS shows "runs start from varied initial conditions." AIFS shows "runs vary within the model itself."

## What's open (carrying forward)

- Nothing carrying forward from Phase 2.

## What's next

- v3: Add WeatherNext (GenCast) as third comparison panel. Access granted; deferred pending gridded-data integration and licensing review (see Issue #6).


## Anything surprising or worth flagging

- Going in today, it was not clear whether both models could be compared the same way for uncertainty. It turned out both models produce real ensemble members (GFS: 31, AIFS: 51), which meant the confidence bands could be built the same way mechanically for both, though the two ensembles sample different kinds of uncertainty. That finding is now reflected in labels on the page.