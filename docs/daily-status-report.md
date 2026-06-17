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

- Formal pre-registration for +3 day maximum temperature is to be added.

- Corrected verification using the Historical Forecast API for AIFS is to be implemented.

- The scoreboard is to be updated.


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

- Phase 2 covers real forecast uncertainty. Confidence bands and decay are to be driven by real ensemble spread. The prototype caveat is to be removed.

## Anything surprising or worth flagging

- AIFS performed significantly better than predicted across all four cities tested, consistently coming in well below its expected 4.5 to 5.5°F range. GFS won in three of the four cities but also came in below its predicted range in most cases. The Chicago result was the most striking. AIFS won by 2.7°F on a period with strong frontal activity, which the pre-registration flagged as a scenario where AIFS might be competitive but did not expect it to dominate the aggregate. The San Antonio hand-check added a secondary note: AIFS won the May 26 to 30 window despite GFS winning the 30-day aggregate, which suggests the result is sensitive to the specific days sampled.


# Wednesday, June 10th: Phase 2 complete

## Pre-registration

Prediction: N/A (pipeline not run today)

Bands: N/A

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

## Result against prediction

- N/A (pipeline not run today)

## What's next

- WeatherNext (GenCast, v3) is to be added as a third comparison panel. Access is granted; integration is deferred pending gridded-data and licensing review (see Issue #6).


## Anything surprising or worth flagging

- At the start of the day, it was not clear whether both models could be compared the same way for uncertainty. Both models produce real ensemble members (GFS: 31, AIFS: 51), which meant the confidence bands could be built the same way mechanically for both, though the two ensembles sample different kinds of uncertainty. That finding is now reflected in labels on the page.


# Thursday, June 11th: Close-out

## Pre-registration

Prediction: N/A (pipeline not run today)

Bands: N/A

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

## Result against prediction

- N/A (pipeline not run today)

## What's next

- WeatherNext: separate project with its own charter. The real blockers are integrating gridded model data into a point-forecast pipeline and navigating the real-time data licensing constraint. API access is already in hand.

- The verification discipline (hand-checks, pre-registration, independent ground truth) and the scope discipline carry forward to the next project.

## Anything surprising or worth flagging

- Nothing to flag. Done-criteria verification passed clean across all six items.


# Thursday, June 11th (afternoon): WeatherNext Phase A kickoff

## Pre-registration

Prediction: N/A (pipeline not run today)

Bands: N/A

## Charter

- Committed as drafted, no changes. Lead time is +3 days, matching the existing pipeline. Cities are flexible, starting with the same hand-check cities used in Phase 1.

## What landed today

- Read the full Earth Engine catalog schema for WeatherNext 2. The complete bands table was reviewed. There is no daily maximum temperature variable. The only surface temperature field is instantaneous `2m_temperature` in Kelvin, sampled every 6 hours.

- Established data shape from documentation: 0.25 degree grid, instantaneous 6-hourly 2m temperature, 64 ensemble members, `forecast_hour` in 6-hour steps out to 15 days.

- Identified the comparability finding: WeatherNext cannot be measured identically to NWS and AIFS on daily maximum temperature. Deriving a daily max from 6-hourly snapshots would carry a systematic cold bias because those snapshots miss the afternoon peak. This is a methodological gap, not an infrastructure problem.

## What's open (carrying forward)

- Access unconfirmed. Allowlist confirmation received by email but no query has been run against the actual dataset.

## Result against prediction

- N/A (pipeline not run today)

## What's next

- BigQuery access is to be confirmed against the actual dataset.

- Historic point forecasts for a few city-dates are to be pulled and hand-checked against raw data.

## Anything surprising or worth flagging

- The comparability finding was not anticipated. WeatherNext has no daily maximum temperature variable. The only surface temperature output is instantaneous 6-hourly 2m temperature in Kelvin. This reshapes the measurement approach before any data has been pulled.


# Friday, June 12th: WeatherNext Phase A continued

## Pre-registration

Prediction: N/A (pipeline not run today)

Bands: N/A

## What landed today

- Confirmed BigQuery access directly from the data. The connection is operational, the dataset is present, and queries for any city and date return the full complement of 64 raw ensemble members. Access is verified against the actual dataset, not through correspondence alone.

- Settled the metric. Daily maximum temperature was ruled out: WeatherNext provides four 6-hourly snapshots per day and those snapshots systematically miss the afternoon peak, producing a cold bias by construction. The metric is 18 UTC instantaneous 2m temperature at +3-day lead, which is directly readable from WeatherNext, GFS, and AIFS with no derivation. Ground truth is the closest ASOS observation to 18:00 UTC. The offset is not hardcoded to :51 because stations differ: ORD reports at :51, PIE at :53.

- Committed the WeatherNext project charter ([charter.md](charter.md)) with two amendments dated June 12th: metric changed from daily maximum temperature to 18 UTC instantaneous 2m temperature, and ground truth rule generalized from a hardcoded :51 offset to the closest ASOS observation to 18:00 UTC.

- Expanded the sample to twelve data points across six cities and two seasons. Measurements are clean across all twelve cases: forecast errors vary by city, season, and weather regime in the manner expected of genuine forecast error, not pipeline artifacts.


## Results by city

- **Chicago, IL:** Winter was 1.3°F warm with approximately 7 K of spread, the smallest error in the original four-city set. Summer was 2.3°F cold with nearly 12 K of spread, the widest in the original set. Members clustered into two distinct groups rather than a single distribution, suggesting the model resolved two possible weather regimes for that date. Observation timestamps: winter 2024-12-13 18:51 UTC, summer 2024-07-15 18:51 UTC.

- **San Antonio, TX:** Winter was 4.7°F warm, one of three warm-biased cases in the full twelve-point set. Summer flipped to 6.3°F cold with moderate spread. The swing from warm in winter to cold in summer was the largest directional shift across seasons of any city in the set. Observation timestamps: winter 2024-12-13 18:51 UTC, summer 2024-07-15 18:51 UTC.

- **San Diego, CA:** Winter was 3.6°F cold with approximately 3 K of spread, the tightest in the full set. The model was confident and uniformly wrong by a consistent amount across nearly all members. Summer was 5.0°F cold with moderate spread. The ASOS record showed the temperature holding at 69°F for sixteen consecutive hours before rising to 74°F at 18:51, consistent with a marine layer burn-off where observation timing contributes to apparent error. Observation timestamps: winter 2024-12-13 18:51 UTC, summer 2024-07-15 18:51 UTC.

- **Belleair, FL:** Winter was 4.9°F cold with moderate spread. Summer was 6.9°F cold with approximately 9 K of spread, the second-largest error in the set. Florida summer convection drives genuine forecast uncertainty and the ensemble reflected it. A data quality note: PIE had a ten-hour ASOS observation gap in the winter case. The 18 UTC observation was present and the comparison was not affected, but the pipeline will need graceful handling for gaps of this kind. Observation timestamps: winter 2024-12-13 18:53 UTC, summer 2024-07-15 18:53 UTC.

- **Denver, CO:** Summer was 5.4°F cold with approximately 9.5 K of spread. Winter was the largest single miss in the full set at 10.5°F cold with nearly 11 K of spread. Some members captured a scenario near the observed 59°F while others were substantially colder, pulling the ensemble mean well below the observation. Complex terrain at the base of the Rockies produces genuine forecast difficulty and the ensemble spread reflects it. Observation timestamps: winter 2023-12-17 18:53 UTC, summer 2024-07-15 18:53 UTC.

- **Seattle, WA:** Winter was the best result in the full twelve-point set, off by 0.2°F. Summer was the only strongly warm-biased case in the set at 6.7°F warm. The observed 62°F was a cool July day consistent with marine influence or overcast, and only one ensemble member came close to the observation. The model forecast typical summer warmth that did not materialize. Observation timestamps: winter 2023-12-17 18:53 UTC, summer 2024-07-15 18:53 UTC.


## What's open (carrying forward)

- PIE (St. Pete-Clearwater, used for Belleair) had a ten-hour ASOS observation gap in the winter case. The pipeline needs graceful handling for observation gaps before Phase B.

- Twelve points across six cities is sufficient to trust the pipeline but not large enough to draw conclusions about model-level bias or ranking.

## Result against prediction

- N/A (pipeline not run today)

## What's next

- Graceful handling for ASOS observation gaps is to be added to the pipeline.

- WeatherNext temperatures are currently compared in Kelvin. Conversion to Fahrenheit for display is to be handled when Phase B wires the third lineage into the scoreboard.

- Phase B begins once the gap handling is in place.

## Anything surprising or worth flagging

- The Chicago July ensemble distribution appeared bimodal rather than unimodal. Members split into two clusters, suggesting the model resolved two distinct weather regimes for that date. A symmetric confidence band would misrepresent this kind of distribution, which is worth tracking if a confidence-band panel is added later.

- Seattle summer was the only strongly warm-biased case in the full set. Only one of 64 members came close to the observed temperature, suggesting the model does not handle marine layer suppression well in Pacific Northwest summer cases.

- Denver winter produced the largest single error in the set at 10.5°F cold despite the ensemble capturing a warm scenario in some members. Wide spread did not protect against a large mean error.

- San Antonio showed the largest seasonal directional flip in the set: warm-biased in winter and cold-biased in summer. No other city reversed direction by this margin across seasons.


# Monday, June 15th: Phase B scoreboard migration

## Pre-registration

Prediction: N/A (pipeline not run today)

Bands: N/A

## What landed today

- Committed the Phase B charter amendment, dated June 15. The non-goal blocking GFS and AIFS re-runs under the daily-maximum metric was retired. This cleared the path to running both models under the new 18 UTC metric without protocol conflict.

- Migrated the GFS and AIFS scoreboard from daily-maximum temperature to instantaneous 2m temperature at 18:00 UTC. The Previous Runs API now uses timezone=UTC, and the parser filters for the T18:00 row instead of taking a daily maximum. The ASOS source switched from the daily.py endpoint to the asos.py hourly endpoint, selecting the observation closest to 18:00 UTC within a 90-minute window. Station selection was corrected to filter for ASOS provider, which fixed a silent bug where non-ASOS stations were being returned as the nearest match.

- Updated the scoreboard label to describe the new metric precisely: each model's temperature forecast at 18:00 UTC, verified against the nearest airport weather station reading at that hour, not a daily high. Added a note below the scoreboard cards stating that scores before June 15 used a different metric and are not directly comparable to scores from that date forward.

- Hand-checked the migrated pipeline against Belleair, FL on May 20, 2026. GFS returned 86.90°F and AIFS returned 86.54°F, both against an ASOS observation of 89°F at 17:53 UTC. GFS reproduced the migration session value exactly: a fresh pull today through the full pipeline returned 86.90°F. AIFS was independently verified for the first time under the new metric via a separate Python call; it matched the pipeline output exactly.

- Updated scratch_forecast_check.py to match the new metric: asos.py hourly endpoint, T18:00 filter on the Previous Runs API, and the ASOS provider fix for station selection. The script now takes any US city and date range and produces a GFS and AIFS comparison table in one run.

- Explored a BigQuery OAuth approach to add WeatherNext to the live scoreboard as a third column. The implementation was built and tested: OAuth sign-in worked, the BigQuery REST API was reached, and the query structure was correct. The project hit its free query bytes quota and returned a 403 error. The implementation was reverted. WeatherNext shows as a placeholder in the scoreboard.

- Committed the migration and scratch script update to the phase-b-scoreboard branch.

## What's open (carrying forward)

- WeatherNext is not on the live scoreboard. The architecture is unsolved. The BigQuery quota blocks the REST API approach from the browser without billing enabled.

- The WeatherNext scoreboard card currently reads "v3 · no data yet" with no explanation of why there is no data. A reader cannot distinguish a build state from an excluded model or a failure. The label needs to say something closer to "integration pending" to prevent the wrong reading.

- Pre-registration for the Phase B aggregate prediction was not written. This must be done before the pipeline is run across multiple cities.

- The full pipeline has not been run. No aggregate scores exist yet under the new metric.

## Result against prediction

- N/A (pipeline not run today)

## What's next

- Write the pre-registration before running the pipeline on any additional cities.

- Run the scratch script across multiple cities to build up a hand-checked dataset under the new metric.

- Decide on the WeatherNext architecture. The most realistic path is pre-computed JSON updated on a schedule, which avoids live BigQuery calls entirely.

## Anything surprising or worth flagging

- AIFS had not been independently hand-checked under the new metric before today. The Phase 1 hand-check covered AIFS under the daily-maximum metric only. The migration session recorded only the GFS value for May 20. The AIFS verification was a new check, not a reproduction of prior work. Both values came back clean.

- The BigQuery OAuth approach worked technically. Authentication, token exchange, and the query structure all functioned correctly. The failure was quota, not code. The same approach could be revived if billing is enabled or if the monthly quota resets and query costs are kept small.


# Tuesday, June 16th: Phase B WeatherNext integration

## Pre-registration

Prediction: All three models (GFS, AIFS, and WeatherNext) will fall in the 3 to 7°F MAE range. Ranking: AIFS wins, GFS second, and WeatherNext third.

Bands: Below 2°F for any model is suspiciously good, check the pipeline. Above 10°F for any model is suspiciously bad, check the pipeline. If WeatherNext beats GFS or AIFS in the aggregate, verify before accepting.

Note: Belleair, FL was run as a pipeline verification before this prediction was written: GFS 3.6°F, AIFS 3.7°F, WeatherNext 5.1°F. The remaining five cities are unseen.


## What landed today

- `scripts/fetch_weathernext.py` created and run across six cities.

- `data/weathernext_scores.json` populated: 30-day window, 6 cities, 64 members, 90 forecast hours per entry.

- WeatherNext added to the accuracy scoreboard in `weather.js` reading from static JSON.

- `scratch_forecast_check.py` updated to include WeatherNext column for spot-checks.

- Pre-registration committed before pipeline run.

- Six-city results recorded and verified against prediction.

- `--city` flag added to `fetch_weathernext.py` so any US city can be pre-computed on demand, not just the original six.

- Quota error handling added: catches API errors per date, logs clearly, and writes partial results via a `finally` block so nothing is lost silently.

- `requirements.txt` created with `google-cloud-bigquery`.

- App title updated to "Weather Forecast + Model Comparison".

- README updated to reflect current state: WeatherNext on scoreboard, 18 UTC metric documented, Phase B marked complete.

- WeatherNext confidence panel badge changed from "PENDING" to "HISTORIC ONLY" with a note that forward forecasts are not available under current licensing terms.

- Timestamp query parameter added to the `weathernext_scores.json` fetch so the browser always pulls the latest file instead of a cached version.


## What's open (carrying forward)

- WeatherNext data requires a manual `--city` run for any city outside the original six. There is no automatic fallback in the browser for unseen cities.

- Eleven of the twelve Phase A hand-check points have not been run against the batch pipeline output. Only one spot-check was completed before the pre-registration. This is unfinished verification, not optional follow-up.

- San Antonio AIFS at 1.8°F was verified at the pipeline-logic level only. The stronger form of verification, going back to the raw Open-Meteo value and the raw ASOS observation and recomputing the absolute difference by hand, has not been done.

- All-three-coverage has not been formally confirmed on the aggregate sample. The 29-day overlap was observed in practice but not verified by inspecting every city-date for a non-null score from all three models.

## Result against prediction

City-level results (29 days each, warm-season window May 14 to June 12):

| City | GFS | AIFS | WeatherNext |
|---|---|---|---|
| Belleair, FL | 3.6°F | 3.7°F | 5.1°F |
| Chicago, IL | 5.8°F | 3.0°F | 3.9°F |
| San Diego, CA | 2.3°F | 2.7°F | 2.8°F |
| San Antonio, TX | 3.3°F | 1.8°F | 2.1°F |
| Denver, CO | 5.5°F | 3.1°F | 2.7°F |
| Seattle, WA | 3.4°F | 2.3°F | 2.3°F |
| Six-city average | 3.98°F | 2.77°F | 3.15°F |

Prediction was all three models in the 3 to 7°F range, ranking AIFS first, GFS second, WeatherNext third. The range prediction held for most results but San Antonio AIFS came in at 1.8°F (below the 2°F band floor) and San Diego GFS came in at 2.3°F (just above it). The ranking prediction was partially correct: AIFS won as predicted. WeatherNext finished second and GFS finished third, the opposite of the predicted order for those two models.

Two band flags were triggered and investigated. San Antonio AIFS at 1.8°F is below the 2°F threshold. A hand-check on May 20 showed AIFS at -1.64°F off for San Antonio, a genuinely close forecast. The low aggregate appears to be a real result, not a pipeline artifact. WeatherNext beating GFS in the aggregate triggered the pre-registration verification flag. A hand-check on May 20 across all six cities showed the pattern is consistent with individual dates: WeatherNext was close in Denver and San Antonio on that date, GFS had large misses in both. The result stands.

These results reflect a warm-season window only. A longer or cross-season sample may look different.

## What's next

- Complete the three open verification steps before anything else: eleven-point pipeline calibration, San Antonio raw-measurement confirmation, and all-three-coverage check on the aggregate sample. Close-out does not begin until all three pass.

- Add attribution and experimental-use disclaimer to the page for WeatherNext.

- Update README and roadmap to mark Phase C in progress.

- Write the Phase B retrospective.

## Anything surprising or worth flagging

- WeatherNext finished second in the six-city aggregate, beating GFS, which was the opposite of the predicted ranking for those two models. The pre-registration said to verify before accepting. The hand-check confirmed it is a real result.

- San Antonio AIFS came in at 1.8°F, below the 2°F surprise threshold. Also verified clean.

- Denver drove the GFS/WeatherNext ranking swap. GFS at 5.5°F is the worst single-city score in the table. WeatherNext at 2.7°F is the best. Complex terrain at the base of the Rockies produces genuine forecast difficulty and GFS appears most affected by it in this sample.

- Belleair carries 17% of the WeatherNext six-city average and is WeatherNext's worst result at 5.1°F. Without Belleair, WeatherNext's average drops to approximately 2.76°F, essentially tied with AIFS. The six-city aggregate is sensitive to this one result and the small sample size should be kept in mind when reading the ranking.

# Wednesday, June 17th: Phase B verification close-out and Mesonet bug fix

## Pre-registration

No new prediction. Phase B verification only.

## What landed today

- Completed all three Phase B verification tasks: eleven-point pipeline calibration, San Antonio raw-measurement confirmation, and all-three-coverage check. All three passed.

- Found and fixed a methodology bug: Iowa Mesonet's `asos.py` endpoint treats the end date as exclusive on multi-day requests. The pipeline was requesting `day2=12` when the intended last date was June 12, silently dropping that date for every city. Fixed in `weather.js` and `scripts/coverage_check.py` by adding one day to the end date before constructing the Mesonet URL. This is a methodology bug under the charter, not result-chasing. The correct window is 30 days and the pipeline was silently computing 29.

- Recomputed the six-city aggregate on the corrected 30-day window using `scripts/recompute_mae.py`, which queries BigQuery directly for WeatherNext so results are independent of the rolling JSON window.

- Found that the Open-Meteo AIFS archive silently revised values for Chicago between June 15 and June 17. The original scoreboard recorded Chicago AIFS at 3.0°F; fresh data shows 4.5°F. GFS for Chicago is unchanged across the same dates. This means the old 29-day AIFS aggregate (2.77°F) cannot be exactly reproduced from a fresh query today. Documented in README as a known upstream data fidelity limitation.

- Documented `scratch_forecast_check.py --lat/--lon` flags so hand-checks use stored coordinates and avoid coordinate divergence.

## Amendment: corrected 30-day results (May 14 to June 12)

Recomputed using `scripts/recompute_mae.py` with BigQuery for WeatherNext. Old column reflects the buggy 29-day window (June 12 dropped). New column is the corrected 30-day window.

| City | GFS (29d) | AIFS (29d) | WN (29d) | GFS (30d) | AIFS (30d) | WN (30d) |
|---|---|---|---|---|---|---|
| Belleair, FL | 3.6°F | 3.7°F | 5.1°F | 3.5°F | 3.6°F | 4.9°F |
| Chicago, IL | 6.0°F | 4.5°F | 3.9°F | 5.8°F | 4.5°F | 3.8°F |
| San Diego, CA | 2.3°F | 2.8°F | 2.8°F | 2.3°F | 2.8°F | 3.0°F |
| San Antonio, TX | 3.3°F | 1.8°F | 2.1°F | 3.2°F | 1.7°F | 2.1°F |
| Denver, CO | 5.5°F | 3.1°F | 2.7°F | 5.4°F | 3.1°F | 2.7°F |
| Seattle, WA | 3.3°F | 2.4°F | 2.3°F | 3.3°F | 2.4°F | 2.3°F |
| Six-city avg | 4.00°F | 3.05°F | 3.15°F | 3.92°F | 3.02°F | 3.13°F |

Rankings are unchanged across both windows: AIFS first, WeatherNext second, GFS third. The shifts from adding June 12 are small and directionally consistent with a legitimate bug fix rather than result-chasing.

Note: the old 29-day AIFS aggregate above (3.05°F) differs from the 2.77°F recorded on June 16 due to the Open-Meteo AIFS archive revision for Chicago. The June 16 number was correct at time of recording. The 3.05°F is what the archive returns today on the same dates.

## What's open (carrying forward)

- Nothing. All three verification tasks passed. The Mesonet bug is fixed and the AIFS archive revision is documented. Phase C is the next and final phase.

## Result against prediction

- N/A. Verification and bug fix only, no new measurement.

## What's next

- Phase C: add CC BY 4.0 attribution and experimental-use disclaimer to the page, update README and roadmap, and write the retrospective.

## Anything surprising or worth flagging

- The Mesonet exclusive end-date bug was silent. The API returned clean data for 29 dates with no error or warning. The only indication was a date count one short of 30.

- The Open-Meteo AIFS archive revision was unexpected. An API described as serving forecasts as originally issued silently changed historical values between two queries 48 hours apart.

---

# Wednesday, June 17th: Phase C compliance and close-out

## Pre-registration

No new prediction. Phase C is compliance and documentation only.

## What landed today

- Added CC BY 4.0 attribution and experimental-use disclaimer to the page.

- Moved "lower is better" into the metric label.

- Updated README with AIFS archive stability note and licensing boundary sentence.

- Updated roadmap to mark Phase C complete.

- Wrote Phase B and C into the retrospective.

- Verified all five charter done-criteria against the live page.

- Closed [issue #6](https://github.com/williamcs50/weather-app/issues/6).

## What's open (carrying forward)

- None. The project is closed.

## Result against prediction

- N/A (not a measurement day)

## What's next

- Project closed. No active work. Standing maintenance item: WeatherNext JSON requires a manual refresh run periodically as the rolling window drifts forward. No scheduled date.

## Anything surprising or worth flagging

- Found and fixed a Mesonet exclusive end-date bug that was silently dropping the last date from every city, reporting 29 days as 30 with no error.

- Found that the Open-Meteo AIFS archive silently revised Chicago historical values between June 15 and June 17 with no changelog. Documented as a known upstream limitation rather than a pipeline fix.

- WeatherNext finished second in the six-city aggregate, beating GFS. Pre-registration predicted the opposite ranking. Denver was the primary driver: GFS posted 5.4°F, WeatherNext posted 2.7°F. Complex terrain at the base of the Rockies appears to be a genuine weakness for GFS in this sample.
