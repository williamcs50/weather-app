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