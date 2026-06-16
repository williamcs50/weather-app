# Pre-Registration: Accuracy Scoreboard

**Date:** 2026-06-09  
**Lead time:** +3 days  
**Forecast source:** Open-Meteo Previous Runs API (GFS, ECMWF AIFS)  
**Observation source:** Iowa Mesonet ASOS daily high  
**Metric:** Mean Absolute Error (degrees Fahrenheit)

I would expect GFS to show a lower mean absolute error than AIFS across a larger sample. Based on the hand-check, I expect aggregate MAE for GFS to fall in the 3.5 to 4.5 degrees Fahrenheit range and aggregate MAE for AIFS to fall in the 4.5 to 5.5 degrees Fahrenheit range. I expect GFS to outperform AIFS by roughly 0.8 to 1.5 degrees Fahrenheit in overall MAE.

I expect AIFS to remain competitive on days with strong frontal activity, but I still expect GFS to win overall due to better performance in stable warm-season conditions and fewer large misses.

Regarding surprise thresholds, if GFS aggregate MAE comes back at 2.0 degrees Fahrenheit, I would suspect a pipeline bug because that would be unrealistically low compared to the errors seen even on quiet days in the hand-check. If it comes back at 8.0 degrees Fahrenheit, I would also suspect a pipeline issue, since that would be higher than the worst individual day errors observed outside of strong frontal events. If AIFS beats GFS overall, I would treat it as a genuine and surprising finding as long as the margin stays under about 1.5 degrees Fahrenheit. However, if AIFS wins by more than 3.0 degrees Fahrenheit, or if one model dominates more than 75 percent of all location-dates, that would make me question whether something is wrong with the pipeline rather than accept it as a real model difference.


# Pre-Registration: Three-Way Aggregate (GFS, AIFS, WeatherNext)

**Date:** 2026-06-16  
**Lead time:** +3 days  
**Forecast source:** Open-Meteo Previous Runs API (GFS, AIFS); BigQuery WeatherNext ensemble mean via pre-computed JSON  
**Observation source:** Iowa Mesonet ASOS hourly, closest observation to 18:00 UTC per date  
**Metric:** Mean Absolute Error in degrees Fahrenheit, instantaneous 2m temperature at 18:00 UTC  
**Cities:** Chicago IL, San Diego CA, Belleair FL, San Antonio TX, Denver CO, Seattle WA  
**Window:** 30 days ending 4 days before run date

I expect all three models to fall in the 3 to 7 degrees Fahrenheit MAE range. I expect AIFS to win, GFS to finish second, and WeatherNext to finish third.

Regarding surprise thresholds, any model below 2 degrees Fahrenheit would be suspiciously good and warrants a pipeline check before accepting. Any model above 10 degrees Fahrenheit would be suspiciously bad and also warrants investigation. If WeatherNext beats GFS or AIFS in the aggregate, I will verify the result before accepting it.

Note: Belleair, FL was run as a pipeline verification before this prediction was written and its results were known at time of writing: GFS 3.6°F, AIFS 3.7°F, WeatherNext 5.1°F. The remaining five cities were unseen at the time this prediction was committed.