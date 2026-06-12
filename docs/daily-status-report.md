# Monday, June 8th: Phase 1 kickoff

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

- Pre-registration is the next step before the pipeline runs.

- The best approach for measuring both models given the different APIs is to be determined.

## Anything surprising or worth flagging

- Initial exploration of the Open-Meteo and NWS APIs required working through several endpoints before the distinction between current model output and historic forecasts as issued became clear.


# Tuesday, June 9th: Phase 1 complete

## Pre-registration

Prediction: GFS MAE 3.5 to 4.5°F, AIFS MAE 4.5 to 5.5°F, GFS outperforms AIFS by 0.8 to 1.5°F overall.

Bands: GFS surprise thresholds at 2.0°F (suspiciously low) and 8.0°F (suspiciously high). If AIFS beats GFS by more than 3.0°F, question the pipeline. If AIFS wins by under 1.5°F, treat as genuine.

## What landed today

- Built and shipped the corrected scoreboard pipeline.

- Hand-checked the pipeline against the scratch script for Chicago and San Diego.

- Ran results across four cities.

- Updated README, footer, and docs to reflect Phase 1 complete.

## What's open (carrying forward)

- Nothing carrying forward from Phase 1.

## Result against prediction

- Chicago, IL: GFS 5.8°F, AIFS 3.1°F. AIFS won by 2.7°F, which is outside the predicted ranges for both models but still within the 3.0°F threshold where the pipeline would be questioned. To verify the result, the scratch script was run against May 26 to 30 and returned GFS MAE 6.4°F and AIFS MAE 2.4°F, consistent with the 30-day scoreboard. The pipeline is clean.

- San Diego, CA: GFS 1.8°F, AIFS 1.9°F. The two models came in essentially tied, with both well below their predicted ranges. GFS came in at 1.8°F, close to the 2.0°F suspicion flag, which warranted a hand-check. The scratch script returned GFS MAE 2.1°F and AIFS MAE 1.6°F for May 26 to 30, consistent with the scoreboard. San Diego's stable marine climate most likely explains the low errors rather than a pipeline issue.

- Belleair, FL: GFS 2.8°F, AIFS 3.2°F over 30 days. GFS won by 0.4°F. Both models below predicted ranges. Hand-checked May 26 to 30: GFS MAE 2.5°F, AIFS MAE 2.8°F. Consistent with scoreboard. Clean.

- San Antonio, TX: GFS 2.3°F, AIFS 2.8°F over 30 days. GFS won by 0.5°F. Both models below predicted ranges. Hand-checked May 26 to 30: GFS MAE 2.8°F, AIFS MAE 1.1°F. AIFS won this 5-day window but GFS won the 30-day aggregate. Consistent with scoreboard given window variance.

All results stand as measured. No re-runs.

## What's next

- Phase 2: real forecast uncertainty. Confidence bands and decay driven by real ensemble spread. Prototype caveat removed.

## Anything surprising or worth flagging

- AIFS performed significantly better than predicted across all four cities tested, consistently coming in well below its expected 4.5 to 5.5°F range. GFS won in three of the four cities but also came in below its predicted range in most cases. The Chicago result was the most striking. AIFS won by 2.7°F on a period with strong frontal activity, which the pre-registration flagged as a scenario where AIFS might be competitive but did not expect it to dominate the aggregate. The San Antonio hand-check added a secondary note: AIFS won the May 26 to 30 window despite GFS winning the 30-day aggregate, which suggests the result is sensitive to the specific days sampled.


# Wednesday, June 10th: Phase 2 complete

## What landed today

- Replaced formula-driven confidence bands and decay chart with real ensemble spread for both models.

- Documented the Phase 1 and Phase 2 methodology change in the README and on the in-app scoreboard.

- Hand-checked ensemble output against the raw API across four cities (Chicago, San Diego, Belleair, San Antonio), all passed.

- Fixed the period alignment bug (name-based lookup was silently dropping periods such as "This Afternoon").

- Removed jargon from user-facing strings.

- Updated README and roadmap to mark Phase 2 complete.

- Added uncertainty-source labels under each confidence band. GFS shows "runs start from varied initial conditions." AIFS shows "runs vary within the model itself."

## What's open (carrying forward)

- Nothing carrying forward from Phase 2.

## What's next

- v3: WeatherNext (GenCast) to be added as a third comparison panel. Access granted; deferred pending gridded-data integration and licensing review (see Issue #6).


## Anything surprising or worth flagging

- At the start of the day, it was not clear whether both models could be compared the same way for uncertainty. Both models produce real ensemble members (GFS: 31, AIFS: 51), which meant the confidence bands could be built the same way mechanically for both, though the two ensembles sample different kinds of uncertainty. That finding is now reflected in labels on the page.


# Thursday, June 11th: Close-out

## What landed today

- Removed the fabricated WeatherNext line from the convergence chart. The confidence card and scoreboard were already showing it as pending; the chart was the only place a placeholder line was still rendering.

- Corrected the roadmap language. The stale "blocked on access" phrasing was replaced with the real status: access granted June 1, deferral is gridded-data integration and the real-time licensing constraint.

- Wrote and committed the Phase 1 and Phase 2 retrospective ([retrospective.md](retrospective.md)).

## Done-criteria verification

- **Real-skill scoreboard**: verified. Forecasts pulled from the Previous Runs API as issued at a fixed +3-day lead, verified against Iowa Mesonet ASOS observations. No hindsight reconstruction in the pipeline.

- **Defensible numbers**: verified. Ground truth hand-checked against raw station data. Pipeline output independently verified via scratch script across four cities. Pre-registration committed to GitHub before the pipeline ran.

- **Real ensemble confidence bands**: verified. GFS uses 31-member GEFS spread; AIFS uses 51-member published ensemble spread. On-page labels note that the two ensembles sample different kinds of uncertainty.

- **Deterministic-AIFS decision**: resolved. AIFS has a published 51-member ensemble. The presumed asymmetry was investigated, dissolved, and documented in the retrospective. Issue #11 closed.

- **WeatherNext stub**: corrected. Fabricated chart line removed. Roadmap updated; issue #6 documents the licensing distinction.

- **README and roadmap**: verified against shipped state. All language reflects what is actually in the code.

## What's open (carrying forward)

- Nothing. The scoreboard runs for any US city. The four hand-checked cities establish pipeline trust, not the full scope. Broadening to more cities, lead times, or metrics is future work.

## What's next

- WeatherNext: separate project with its own charter. The real blockers are integrating gridded model data into a point-forecast pipeline and navigating the real-time data licensing constraint. API access is already in hand.

- The verification discipline (hand-checks, pre-registration, independent ground truth) and the scope discipline carry forward to the next project.


# Thursday, June 11th (afternoon): WeatherNext Phase A kickoff

## Charter

- Committed as drafted, no changes. Lead time is +3 days, matching the existing pipeline. Cities are flexible, starting with the same hand-check cities used in Phase 1.

## What landed today

- Read the full Earth Engine catalog schema for WeatherNext 2. The complete bands table was reviewed. There is no daily maximum temperature variable. The only surface temperature field is instantaneous `2m_temperature` in Kelvin, sampled every 6 hours.

- Established data shape from documentation: 0.25 degree grid, instantaneous 6-hourly 2m temperature, 64 ensemble members, `forecast_hour` in 6-hour steps out to 15 days.

- Identified the comparability finding: WeatherNext cannot be measured identically to NWS and AIFS on daily maximum temperature. Deriving a daily max from 6-hourly snapshots would carry a systematic cold bias because those snapshots miss the afternoon peak. This is a methodological gap, not an infrastructure problem.

## What's open (carrying forward)

- Access unconfirmed. Allowlist confirmation received by email but no query has been run against the actual dataset.

## What's next

- BigQuery access is to be confirmed against the actual dataset.

- Historic point forecasts for a few city-dates are to be pulled and hand-checked against raw data.


# Friday, June 12th: WeatherNext Phase A continued

## What landed today

- Confirmed BigQuery access directly from the data. The connection is operational, the dataset is present, and queries for any city and date return the full complement of 64 raw ensemble members. Access is verified against the actual dataset, not through correspondence alone.

- Settled the metric. Daily maximum temperature was ruled out: WeatherNext provides four 6-hourly snapshots per day and those snapshots systematically miss the afternoon peak, producing a cold bias by construction. The metric is 18 UTC instantaneous 2m temperature at +3-day lead, which is directly readable from WeatherNext, GFS, and AIFS with no derivation. Ground truth is the closest ASOS observation to 18:00 UTC. The offset is not hardcoded to :51 because stations differ: ORD reports at :51, PIE at :53.

- Committed the WeatherNext project charter ([charter.md](charter.md)) with two amendments dated June 12th: metric changed from daily maximum temperature to 18 UTC instantaneous 2m temperature, and ground truth rule generalized from a hardcoded :51 offset to the closest ASOS observation to 18:00 UTC.

- Expanded the sample to twelve data points across six cities and two seasons. Measurements are clean across all twelve cases: forecast errors vary by city, season, and weather regime in the manner expected of genuine forecast error, not pipeline artifacts.


## Results by city

- **Chicago, IL:** Winter was 1.3°F warm with approximately 7 K of spread, the smallest error in the original four-city set. Summer was 2.3°F cold with nearly 12 K of spread, the widest in the original set. Members clustered into two distinct groups rather than a single distribution, suggesting the model resolved two possible weather regimes for that date.

- **San Antonio, TX:** Winter was 4.7°F warm, one of three warm-biased cases in the full twelve-point set. Summer flipped to 6.3°F cold with moderate spread. The swing from warm in winter to cold in summer was the largest directional shift across seasons of any city in the set.

- **San Diego, CA:** Winter was 3.6°F cold with approximately 3 K of spread, the tightest in the full set. The model was confident and uniformly wrong by a consistent amount across nearly all members. Summer was 5.0°F cold with moderate spread. The ASOS record showed the temperature holding at 69°F for sixteen consecutive hours before rising to 74°F at 18:51, consistent with a marine layer burn-off where observation timing contributes to apparent error.

- **Belleair, FL:** Winter was 4.9°F cold with moderate spread. Summer was 6.9°F cold with approximately 9 K of spread, the second-largest error in the set. Florida summer convection drives genuine forecast uncertainty and the ensemble reflected it. A data quality note: PIE had a ten-hour ASOS observation gap in the winter case. The 18 UTC observation was present and the comparison was not affected, but the pipeline will need graceful handling for gaps of this kind.

- **Denver, CO:** Summer was 5.4°F cold with approximately 9.5 K of spread. Winter was the largest single miss in the full set at 10.5°F cold with nearly 11 K of spread. Some members captured a scenario near the observed 59°F while others were substantially colder, pulling the ensemble mean well below the observation. Complex terrain at the base of the Rockies produces genuine forecast difficulty and the ensemble spread reflects it.

- **Seattle, WA:** Winter was the best result in the full twelve-point set, off by 0.2°F. Summer was the only strongly warm-biased case in the set at 6.7°F warm. The observed 62°F was a cool July day consistent with marine influence or overcast, and only one ensemble member came close to the observation. The model forecast typical summer warmth that did not materialize.


## What's open (carrying forward)

- PIE (St. Pete-Clearwater, used for Belleair) had a ten-hour ASOS observation gap in the winter case. The pipeline needs graceful handling for observation gaps before Phase B.

- Twelve points across six cities is sufficient to trust the pipeline but not large enough to draw conclusions about model-level bias or ranking.

## What's next

- Graceful handling for ASOS observation gaps is to be added to the pipeline.

- WeatherNext temperatures are currently compared in Kelvin. Conversion to Fahrenheit for display is to be handled when Phase B wires the third lineage into the scoreboard.

- Phase B begins once the gap handling is in place.

## Anything surprising or worth flagging

- The Chicago July ensemble distribution appeared bimodal rather than unimodal. Members split into two clusters, suggesting the model resolved two distinct weather regimes for that date. A symmetric confidence band would misrepresent this kind of distribution, which is worth tracking if a confidence-band panel is added later.

- Seattle summer was the only strongly warm-biased case in the full set. Only one of 64 members came close to the observed temperature, suggesting the model does not handle marine layer suppression well in Pacific Northwest summer cases.

- Denver winter produced the largest single error in the set at 10.5°F cold despite the ensemble capturing a warm scenario in some members. Wide spread did not protect against a large mean error.

- San Antonio showed the largest seasonal directional flip in the set: warm-biased in winter and cold-biased in summer. No other city reversed direction by this margin across seasons.