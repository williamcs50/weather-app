# Project Retrospective: Phases 1–2 (Trustworthy Scoreboard & Real Ensemble Confidence)

Completed June 2026. Three-day project to make the weather app's model comparison defensible.


## What worked 

- The pre-registration was committed to GitHub before the pipeline ran. When the results went the opposite direction from the prediction, there was no question of whether expectations had shifted after the fact. The timestamp made it tamper-evident.

- The hand-check gave independent verification before trusting the pipeline output. Running the scratch script against raw API responses confirmed the scoreboard numbers were correct before reporting them. If the pipeline had a silent bug, this would have caught it.

- Switching observation sources from ERA5 to Iowa Mesonet eliminated shared-bias risk. ERA5 is produced by ECMWF, the same organization behind AIFS. Using it as ground truth created a risk that both sides of the comparison shared the same systematic errors. Iowa Mesonet ASOS data comes from independent physical weather stations.

- The label redesign made the scoreboard readable to a non-technical visitor. Replacing MAE with "avg error in degrees" and ASOS with "airport weather station readings" meant a reader without a meteorology background could understand what the number represented and where it came from on first read.

- Choosing to show a real GEFS ensemble band for GFS and no band for AIFS kept the page honest. Displaying the asymmetry as it actually exists was better than constructing something symmetric that would have misled a reader about what AIFS uncertainty data was available.

- When AIFS turned out to have a published ensemble, the design updated immediately. The Phase 2 confidence bands ended up symmetric after all, but because the data supported it, not because symmetry was the goal. The discipline at each stage was the same: make the best honest call with what is known, then update when the picture changes.


## What surprised you

- AIFS turned out to have a published ensemble. Going into Phase 2, the assumption was that no spread data would be available for the ML side. Finding that ECMWF had released ensemble members for AIFS changed the Phase 2 design entirely.

- The `past_days` flaw in the original scoreboard was not obvious until it was diagnosed. The API returned values that looked like historical forecasts but were actually the model's current best reconstruction of past conditions. The scoreboard appeared defensible while measuring the wrong thing.

- How much climate type drove the results was not anticipated. San Diego and Chicago produced numbers so different that comparing their MAE values on the same scale was almost meaningless. A single aggregate across cities would have hidden the most interesting signal.


## What I'd do differently

- Running more cities before reporting results would have been the right call. Four hand-checked cities is enough to trust the pipeline but not enough to make a claim about which model wins overall.

- Pre-registering city selection before any geocoding would have eliminated the selection bias risk. Choosing Chicago and San Diego after searching them introduces that risk, even if unintentionally.

- Starting with a longer sample window would have reduced sensitivity to individual events. Thirty days is defensible as a pilot but the Chicago result was heavily influenced by a single frontal event across two consecutive days.

- Diagnosing the `past_days` flaw earlier was possible with a code review of data source assumptions before the scoreboard went live.


---

# Project Retrospective: Phase B and C (WeatherNext Third Lineage and Compliance)

Completed June 17, 2026. Added Google DeepMind WeatherNext (GenCast v3) as a third lineage on the accuracy scoreboard, measured on the same metric as GFS and AIFS, with attribution and compliance.


## What worked

- The charter re-run rule held the line. When the Chicago AIFS number changed between June 15 and June 17 due to an upstream archive revision, the rule gave a clear framework: document it as a caveat, do not re-run to chase a cleaner number. The project closed with an honest finding rather than a revised result.

- Pre-registration before the aggregate run kept the results honest. The six-city numbers were genuinely unseen when the prediction was committed. When WeatherNext beat GFS (the opposite of the predicted ranking), the pre-registration made it clear this was a real finding that needed verification, not a result to quietly accept.

- Staged verification caught a real bug. The all-three-coverage check found that the Mesonet exclusive end-date was silently dropping June 12 from every city. Without the verification step, the pipeline would have shipped with 29 days mislabeled as 30 across all six cities.

- The charter amendment process for retiring the daily-maximum non-goal was the right call. Running two parallel scoreboards (daily-high for GFS and AIFS, 18 UTC for WeatherNext) would have produced numbers a reader would conflate. The single 18 UTC metric made the comparison honest and readable.

- Pre-computing WeatherNext to a static JSON solved the browser quota problem cleanly. The BigQuery REST API from the browser hit quota limits and was reverted. Shifting the computation offline and serving a JSON file eliminated the dependency entirely and made the page load fast.

- The 0.5 degree proximity threshold for matching searched cities to the pre-computed JSON worked without any manual configuration. Detroit covered Birmingham without any code change.


## What surprised you

- The Open-Meteo AIFS archive silently revised historical values between June 15 and June 17. Chicago AIFS went from 3.0°F to 4.5°F on the same dates with no changelog. GFS values were unchanged. This means AIFS scores are not reproducible on a future date, which undermines the "forecasts as issued" guarantee. It was not anticipated that the upstream archive would behave this way.

- WeatherNext finished second in the six-city aggregate, beating GFS. The pre-registration predicted GFS second and WeatherNext third. Denver was the primary driver: GFS posted 5.4°F there while WeatherNext posted 2.7°F. Complex terrain at the base of the Rockies appears to be a genuine weakness for GFS in this sample.

- The Mesonet exclusive end-date bug produced no error. The API returned clean data for all other dates, and the pipeline reported a plausible 29-day result with no warning. Silent data truncation is harder to catch than an explicit failure.

- Belleair was WeatherNext's worst city at 4.9°F. Without Belleair, the WeatherNext six-city average drops to approximately 2.76°F, essentially tied with AIFS. A single coastal Florida city carries significant weight in a six-city warm-season sample.


## What I'd do differently

- The WeatherNext JSON needs a refresh strategy. Pre-computing a fixed window and serving it statically works for launch, but the rolling window drifts away from the JSON one day at a time. A scheduled weekly refresh would keep the comparison current without requiring a manual run.

- Storing a snapshot of the AIFS scores at the time of the pipeline run would protect against archive instability. The current pipeline re-fetches from Open-Meteo on every page load, which means the displayed number can change if the archive is revised. Snapshotting the results the way WeatherNext is snapshotted would make all three models equally reproducible.

- City selection for the pre-computed JSON should have been pre-registered before any city was run. Belleair was run as a pipeline verification before the prediction was written, which was disclosed, but the other five were not formally committed before selection. A pre-registered city list would have eliminated any selection bias question entirely.

- The coordinate divergence between Nominatim geocoding in the live scoreboard and the stored coordinates in the JSON is a latent inconsistency. Both sets of coordinates fall in the same Open-Meteo grid cell in practice, but standardizing on one coordinate source throughout the pipeline would remove the risk entirely.

- The next project's definition of done should include merge-to-main and live-site verification as explicit steps, not implied ones. At the end of Phase B, working results were on a branch that was not merged and not live. The code was correct but the project was not done in any meaningful sense. Deploy is part of done.