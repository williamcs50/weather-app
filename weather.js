// ── FETCH ──────────────────────────────────────────────────────────────
// These functions know nothing about the DOM. They take inputs, return data,
// and throw on failure.

async function geocodeCity(city, state) {
  // Nominatim requires a User-Agent identifying the app per their usage policy
  const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&country=US&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'nws-weather-app/1.0' }
  });
  if (!res.ok) throw new Error('Geocoding request failed.');
  const data = await res.json();
  if (data.length === 0) {
    throw new Error(`Couldn't find "${city}, ${state}". Check spelling and try again.`);
  }
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function getNWSPoints(lat, lon) {
  // NWS /points returns a forecast URL specific to that grid cell; US-only
  const res = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
  if (!res.ok) throw new Error("Location is outside NWS coverage. Try a US city.");
  const data = await res.json();
  return {
    forecastUrl: data.properties.forecast,
    stationsUrl: data.properties.observationStations,
    stateCode:   data.properties.relativeLocation.properties.state,
  };
}

async function getForecastPeriods(forecastUrl) {
  const res = await fetch(forecastUrl);
  if (!res.ok) throw new Error('Failed to retrieve forecast data.');
  const data = await res.json();
  return data.properties.periods;
}

async function fetchEnsembleSpread(lat, lon) {
  const base = `https://ensemble-api.open-meteo.com/v1/ensemble`
    + `?latitude=${lat}&longitude=${lon}`
    + `&hourly=temperature_2m&forecast_days=10&timezone=auto`;

  const [gfsRes, aifsRes] = await Promise.all([
    fetch(`${base}&models=gfs025`),
    fetch(`${base}&models=ecmwf_aifs025`),
  ]);

  const [gfsData, aifsData] = await Promise.all([
    gfsRes.ok  ? gfsRes.json()  : Promise.resolve(null),
    aifsRes.ok ? aifsRes.json() : Promise.resolve(null),
  ]);

  return {
    gfs:  gfsData  ? parseEnsemblePeriods(gfsData)  : null,
    aifs: aifsData ? parseEnsemblePeriods(aifsData) : null,
  };
}

async function fetchAIFSForecast(lat, lon) {
  // timezone=auto makes Open-Meteo return local times; without it the day/night
  // block splitting is wrong for US cities
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation&models=ecmwf_aifs025_single&forecast_days=10&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch AIFS forecast.');
  const data = await res.json();
  return parseAIFSPeriods(data);
}

function deriveShortForecast(precipMm) {
  if (precipMm === 0)  return 'Dry';
  if (precipMm < 2)   return 'Light Rain';
  if (precipMm < 10)  return 'Rain';
  return 'Heavy Rain';
}

function hasPrecip(shortForecast) {
  const f = shortForecast.toLowerCase();
  return f.includes('rain') || f.includes('shower') || f.includes('drizzle') ||
         f.includes('snow') || f.includes('sleet');
}

function parseAIFSPeriods(data) {
  const times  = data.hourly.time;
  const temps  = data.hourly.temperature_2m;
  const precip = data.hourly.precipitation;

  const blocks = {};
  times.forEach((timeStr, i) => {
    const hour    = parseInt(timeStr.slice(11, 13), 10);
    const dateStr = timeStr.slice(0, 10);
    let blockKey, isDaytime;

    if (hour >= 6 && hour < 18) {
      blockKey  = `${dateStr}-day`;
      isDaytime = true;
    } else {
      const nightDate = hour < 6
        ? new Date(new Date(dateStr).getTime() - 864e5).toISOString().slice(0, 10)
        : dateStr;
      blockKey  = `${nightDate}-night`;
      isDaytime = false;
    }

    if (!blocks[blockKey]) {
      blocks[blockKey] = { temps: [], precipSum: 0, isDaytime, date: blockKey.slice(0, 10) };
    }
    if (temps[i]  != null) blocks[blockKey].temps.push(temps[i]);
    if (precip[i] != null) blocks[blockKey].precipSum += precip[i];
  });

  const today    = new Date().toISOString().slice(0, 10);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  return Object.entries(blocks)
    .filter(([, b]) => b.temps.length > 0 && b.date >= today)
    .map(([key, block]) => {
      const date    = block.date;
      const dt      = new Date(date + 'T12:00:00');
      const isToday = date === today;
      const name    = isToday
        ? (block.isDaytime ? 'Today' : 'Tonight')
        : dayNames[dt.getDay()] + (block.isDaytime ? '' : ' Night');

      const avgTempC = block.temps.reduce((a, b) => a + b, 0) / block.temps.length;
      const tempF    = Math.round(avgTempC * 9 / 5 + 32);

      return {
        name,
        temperature:     tempF,
        temperatureUnit: 'F',
        shortForecast:   deriveShortForecast(block.precipSum),
        isDaytime:       block.isDaytime,
      };
    })
    .slice(0, 8);
}

function parseEnsemblePeriods(data) {
  const hourly     = data.hourly;
  const times      = hourly.time;
  const memberKeys = Object.keys(hourly).filter(k => k.startsWith('temperature_2m_member'));
  const allKeys    = ['temperature_2m', ...memberKeys];

  const today    = new Date().toISOString().slice(0, 10);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const blocks = {};
  times.forEach((timeStr, i) => {
    const hour    = parseInt(timeStr.slice(11, 13), 10);
    const dateStr = timeStr.slice(0, 10);
    let blockKey, isDaytime;

    if (hour >= 6 && hour < 18) {
      blockKey  = `${dateStr}-day`;
      isDaytime = true;
    } else {
      const nightDate = hour < 6
        ? new Date(new Date(dateStr).getTime() - 864e5).toISOString().slice(0, 10)
        : dateStr;
      blockKey  = `${nightDate}-night`;
      isDaytime = false;
    }

    if (!blocks[blockKey]) {
      blocks[blockKey] = { memberSamples: {}, isDaytime, date: blockKey.slice(0, 10) };
      allKeys.forEach(k => { blocks[blockKey].memberSamples[k] = []; });
    }

    allKeys.forEach(k => {
      const v = hourly[k]?.[i];
      if (v != null) blocks[blockKey].memberSamples[k].push(v);
    });
  });

  return Object.entries(blocks)
    .filter(([, b]) => b.memberSamples['temperature_2m']?.length > 0 && b.date >= today)
    .map(([, block]) => {
      const date    = block.date;
      const dt      = new Date(date + 'T12:00:00');
      const isToday = date === today;
      const name    = isToday
        ? (block.isDaytime ? 'Today' : 'Tonight')
        : dayNames[dt.getDay()] + (block.isDaytime ? '' : ' Night');

      // One mean-temperature per member for this period, in °F.
      // memberMeans[0] = control, memberMeans[1..n] = perturbed members.
      // Kept in full so a displayed band can be traced back to individual members.
      const memberMeans = allKeys.map(k => {
        const vals = block.memberSamples[k];
        if (!vals.length) return null;
        const avgC = vals.reduce((a, b) => a + b, 0) / vals.length;
        return avgC * 9 / 5 + 32;
      }).filter(v => v != null);

      const sorted = [...memberMeans].sort((a, b) => a - b);
      const p10    = sorted[Math.floor(sorted.length * 0.10)];
      const p90    = sorted[Math.floor(sorted.length * 0.90)];
      const mean   = memberMeans.reduce((a, b) => a + b, 0) / memberMeans.length;

      return {
        name,
        isDaytime:   block.isDaytime,
        mean:        Math.round(mean),
        p10:         Math.round(p10),
        p90:         Math.round(p90),
        memberMeans, // audit trail: sort these to verify p10/p90
      };
    })
    .slice(0, 8);
}

async function fetchHistoricalAccuracy(lat, lon, stationsUrl, stateCode) {
  // Measure real forecast skill: forecasts as issued at +3-day lead on daily max °F,
  // verified against Iowa Mesonet ASOS observations. Both models through identical pipeline.
  const today = new Date();
  const end   = new Date(today); end.setDate(end.getDate() - 4);   // allow obs to finalise
  const start = new Date(end);  start.setDate(start.getDate() - 29); // 30-day window
  const fmt   = d => d.toISOString().slice(0, 10);
  const startStr = fmt(start), endStr = fmt(end);

  // Nearest ASOS station via NWS observation stations list
  if (!stationsUrl) return null;
  const stRes = await fetch(stationsUrl, { headers: { 'User-Agent': 'nws-weather-app/1.0' } });
  if (!stRes.ok) return null;
  const stData  = await stRes.json();
  const asosFeat = stData.features?.find(f => f.properties?.provider?.startsWith('ASOS'));
  const stationK = asosFeat?.properties?.stationIdentifier;
  if (!stationK) return null;
  const station = stationK.replace(/^K/, '');  // "KORD" → "ORD"

  // Iowa Mesonet: ASOS hourly observations in UTC.
  // We pick the single reading closest to 18:00 UTC per date.
  const [y1, m1, d1] = startStr.split('-');
  const [y2, m2, d2] = endStr.split('-');
  const mesonetUrl = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py`
    + `?station=${station}&data=tmpf`
    + `&year1=${y1}&month1=${m1}&day1=${d1}`
    + `&year2=${y2}&month2=${m2}&day2=${d2}`
    + `&tz=UTC&format=comma&latlon=no&missing=M&trace=T`;

  // Open-Meteo Previous Runs API: temperature_2m_previous_day3 is the hourly
  // temperature from the model run issued exactly 3 days before the valid time.
  // Fetching both models through the same endpoint/variable/date range ensures
  // no asymmetry between GFS and AIFS.
  const prevBase = `https://previous-runs-api.open-meteo.com/v1/forecast`
    + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + `&start_date=${startStr}&end_date=${endStr}`
    + `&hourly=temperature_2m_previous_day3&timezone=UTC`;

  const [mesonetRes, gfsRes, aifsRes] = await Promise.all([
    fetch(mesonetUrl),
    fetch(`${prevBase}&models=gfs_seamless`),
    fetch(`${prevBase}&models=ecmwf_aifs025_single`),
  ]);

  if (!mesonetRes.ok) return null;

  const asosText = await mesonetRes.text();

  // Parse ASOS hourly CSV. Lines starting with '#' are comments; skip the
  // header row ('station,valid,tmpf'). For each date keep the single observation
  // closest to 18:00 UTC within a 90-minute window. Dates with no observation
  // in that window are simply absent from obsMap and excluded from scoring.
  const obsMap   = {};
  const bestMins = {};
  const WINDOW   = 90;
  asosText.split('\n').forEach(line => {
    const l = line.trim();
    if (!l || l.startsWith('#') || l.startsWith('station,')) return;
    const cols = l.split(',');
    if (cols.length < 3) return;
    const ts   = cols[1].trim();   // "2024-01-15 18:51"
    const tmpf = cols[2].trim();
    if (!tmpf || tmpf === 'M' || tmpf === 'T') return;

    const date       = ts.slice(0, 10);
    const hh         = parseInt(ts.slice(11, 13), 10);
    const mm         = parseInt(ts.slice(14, 16), 10);
    const minsFrom18 = Math.abs(hh * 60 + mm - 18 * 60);
    if (minsFrom18 > WINDOW) return;

    if (bestMins[date] == null || minsFrom18 < bestMins[date]) {
      obsMap[date]   = parseFloat(tmpf);
      bestMins[date] = minsFrom18;
    }
  });

  // Extract the +3-day-lead forecast valid at exactly 18:00 UTC per date.
  // With timezone=UTC, time strings are "YYYY-MM-DDTHH:00"; T18:00 is unambiguous.
  function parse18UtcF(json) {
    const map   = {};
    const times = json?.hourly?.time ?? [];
    const temps = json?.hourly?.temperature_2m_previous_day3 ?? [];
    times.forEach((t, i) => {
      if (t.endsWith('T18:00')) {
        const c = temps[i];
        if (c != null) map[t.slice(0, 10)] = c * 9 / 5 + 32;
      }
    });
    return map;
  }

  const [gfsJson, aifsJson] = await Promise.all([
    gfsRes.ok  ? gfsRes.json()  : Promise.resolve(null),
    aifsRes.ok ? aifsRes.json() : Promise.resolve(null),
  ]);

  const gfsMap  = parse18UtcF(gfsJson);
  const aifsMap = parse18UtcF(aifsJson);

  // MAE: only dates where both observation and forecast are present — no interpolation
  let gfsAbsErr = 0, gfsDays = 0;
  let aifsAbsErr = 0, aifsDays = 0;

  Object.keys(obsMap).forEach(date => {
    const obs = obsMap[date];

    const gfsPred = gfsMap[date];
    if (gfsPred != null) { gfsAbsErr += Math.abs(obs - gfsPred); gfsDays++; }

    const aifsPred = aifsMap[date];
    if (aifsPred != null) { aifsAbsErr += Math.abs(obs - aifsPred); aifsDays++; }
  });

  return {
    gfsMae:   gfsDays  > 0 ? Math.round(gfsAbsErr  / gfsDays  * 10) / 10 : null,
    aifsMae:  aifsDays > 0 ? Math.round(aifsAbsErr / aifsDays * 10) / 10 : null,
    gfsDays,
    aifsDays,
  };
}

// ── RENDER ─────────────────────────────────────────────────────────────
// These functions only read data and write to the DOM. No fetch calls here.

// isDaytime keeps nighttime "Clear" from mapping to ☀️
function getEmoji(shortForecast, isDaytime) {
  const f = shortForecast.toLowerCase();
  if (f.includes('thunder'))                                               return '⛈️';
  if (f.includes('blizzard') || f.includes('snow'))                        return '🌨️';
  if (f.includes('sleet') || f.includes('freezing'))                       return '🌧️';
  if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return '🌧️';
  if (f.includes('fog') || f.includes('haze'))                             return '🌫️';
  if (f.includes('mostly sunny') || f.includes('partly cloudy'))           return isDaytime ? '⛅' : '🌙';
  if (f.includes('sunny') || f.includes('clear') || f.includes('fair'))   return isDaytime ? '☀️' : '🌙';
  if (f.includes('mostly cloudy') || f.includes('overcast'))               return '🌥️';
  if (f.includes('cloudy'))                                                return '☁️';
  return isDaytime ? '🌡️' : '🌙';
}

function renderError(message) {
  document.getElementById('results').innerHTML = `<p class="error">${message}</p>`;
}

// Chart instances held at module scope so we can destroy them on re-render
let convergenceChart = null;
let decayChart       = null;

function renderForecast(nwsPeriods, aifsPeriods, city, state, ensembleData) {
  const current = nwsPeriods[0];

  // Destroy previous Chart.js instances; re-using a canvas without destroying
  // the old chart throws a "Canvas is already in use" error
  if (convergenceChart) { convergenceChart.destroy(); convergenceChart = null; }
  if (decayChart)       { decayChart.destroy();       decayChart = null; }

  document.getElementById('results').innerHTML = `
    <div class="current">
      <div class="current-location">${city}, ${state}</div>
      <div class="current-period">${getEmoji(current.shortForecast, current.isDaytime)} ${current.name.toUpperCase()}</div>
      <p class="temp-large">${current.temperature}°${current.temperatureUnit}</p>
      <p class="current-detail">${current.detailedForecast}</p>
    </div>

    <section class="feature-section">
      <div class="section-header-row">
        <div class="section-title">Model consensus</div>
        <div class="chart-legend">
          <span class="leg-nws">— NWS</span>
          <span class="leg-aifs">— AIFS</span>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="convergence-chart"></canvas></div>
    </section>

    <section class="feature-section">
      <div class="section-title" id="confidence-title">Model confidence</div>
      <div class="section-subtitle">How wide a range each model's forecasts cover for this period</div>
      <div class="conf-cards" id="confidence-cards"></div>
    </section>

    <section class="feature-section">
      <div class="section-title">Confidence over the coming days</div>
      <div class="section-subtitle">Shaded bands widen as forecasts get less certain further out</div>
      <div class="chart-wrap"><canvas id="decay-chart"></canvas></div>
      <div class="decay-annotations" id="decay-annotations"></div>
    </section>

    <section class="feature-section">
      <div class="section-header-row">
        <div class="section-title">Model disagreements</div>
        <div class="section-meta" id="storm-count"></div>
      </div>
      <div id="storm-alerts"></div>
    </section>

    <section class="feature-section">
      <div class="section-header-row">
        <div class="section-title">Model accuracy scoreboard</div>
        <div class="section-meta">3 days ahead · temperature at 18 UTC · average error in °F</div>
      </div>
      <div class="section-subtitle">Each model's temperature forecast at 18:00 UTC, roughly midday to early afternoon across the contiguous US, verified against the nearest airport weather station reading at that hour. Not a daily high.</div>
      <div class="scoreboard-cards" id="scoreboard-cards">
        <div class="score-loading">Loading historical data…</div>
      </div>
    </section>
  `;

  const nws  = nwsPeriods.slice(0, 7);
  const aifs = aifsPeriods.slice(0, 7);
  renderConvergenceChart(nws, aifs);
  renderConfidenceCards(nws, aifs, ensembleData);
  renderDecayChart(nws, aifs, ensembleData);
  renderStormTracker(nws.slice(1), aifs.slice(1));
}

function renderConvergenceChart(nwsPeriods, aifsPeriods) {
  const labels  = nwsPeriods.map(p => p.name);
  const nwsData = nwsPeriods.map(p => p.temperature);
  const aifsData = nwsPeriods.map((_, i) => aifsPeriods[i]?.temperature ?? null);

  const ctx = document.getElementById('convergence-chart').getContext('2d');

  convergenceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'NWS',
        data: nwsData,
        borderColor: '#1a73e8',
        backgroundColor: 'rgba(26,115,232,0.06)',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#1a73e8',
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      animation: { duration: 500 },
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: v => `${v}°` }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { grid: { display: false } },
      },
    },
  });

  setTimeout(() => {
    convergenceChart.data.datasets.push({
      label: 'AIFS',
      data: aifsData,
      borderColor: '#2e7d52',
      backgroundColor: 'rgba(46,125,82,0.06)',
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: '#2e7d52',
      tension: 0.3,
    });
    convergenceChart.update();
  }, 600);
}

function renderConfidenceCards(nwsPeriods, aifsPeriods, ensembleData) {
  const aifsByName  = Object.fromEntries(aifsPeriods.map(p => [p.name, p]));
  const gfsPeriods  = ensembleData?.gfs  ?? [];
  const aifsPeriods_ = ensembleData?.aifs ?? [];

  // Pick the period with the largest NWS/AIFS temperature divergence
  let featuredIdx = 1;
  let maxDiff     = 0;
  nwsPeriods.slice(1).forEach((p, i) => {
    const a    = aifsByName[p.name];
    const diff = a ? Math.abs(p.temperature - a.temperature) : 0;
    if (diff > maxDiff) { maxDiff = diff; featuredIdx = i + 1; }
  });

  const featured = nwsPeriods[featuredIdx] ?? nwsPeriods[0];
  const gfsEns   = gfsPeriods[featuredIdx]  ?? gfsPeriods[0];
  const aifsEns  = aifsPeriods_[featuredIdx] ?? aifsPeriods_[0];

  document.getElementById('confidence-title').textContent =
    `${featured?.name ?? ''} · model confidence`;

  const gfsRangeStr  = gfsEns  ? `${gfsEns.p10}–${gfsEns.p90}°F (middle 80% of ${gfsEns.memberMeans.length} runs)`
                                : 'forecast spread unavailable';
  const aifsRangeStr = aifsEns ? `${aifsEns.p10}–${aifsEns.p90}°F (middle 80% of ${aifsEns.memberMeans.length} runs)`
                                : 'forecast spread unavailable';

  document.getElementById('confidence-cards').innerHTML = `
    <div class="conf-card conf-nws">
      <div class="conf-hdr">
        <span class="conf-src">GFS Ensemble <span class="conf-sub">Physics model · 31 runs</span></span>
      </div>
      <div class="conf-temp">${gfsEns?.mean ?? '—'}°F</div>
      <div class="conf-range">${gfsRangeStr}</div>
      <div class="conf-source-note">runs start from varied initial conditions</div>
    </div>
    <div class="conf-card conf-aifs">
      <div class="conf-hdr">
        <span class="conf-src">AIFS Ensemble <span class="conf-sub">machine learning model · 51 runs</span></span>
      </div>
      <div class="conf-temp">${aifsEns?.mean ?? '—'}°F</div>
      <div class="conf-range">${aifsRangeStr}</div>
      <div class="conf-source-note">runs vary within the model itself</div>
    </div>
    <div class="conf-card conf-dm">
      <div class="conf-hdr">
        <span class="conf-src">DeepMind <span class="conf-sub">machine learning (v3)</span></span>
        <span class="conf-badge badge-pending">PENDING</span>
      </div>
      <div class="conf-temp conf-pending-val">—</div>
      <div class="conf-range">access granted · integration pending</div>
    </div>
  `;
}

function renderDecayChart(nwsPeriods, aifsPeriods, ensembleData) {
  const gfsPeriods  = ensembleData?.gfs  ?? [];
  const aifsPeriods_ = ensembleData?.aifs ?? [];
  const gfsByName   = Object.fromEntries(gfsPeriods.map(p  => [p.name, p]));
  const aifsEnsByName = Object.fromEntries(aifsPeriods_.map(p => [p.name, p]));

  const labels    = nwsPeriods.map(p => p.name);
  const gfsMean   = nwsPeriods.map((_, i) => gfsPeriods[i]?.mean   ?? null);
  const aifsMean  = nwsPeriods.map((_, i) => aifsPeriods_[i]?.mean  ?? null);
  const gfsUpper  = nwsPeriods.map((_, i) => gfsPeriods[i]?.p90    ?? null);
  const gfsLower  = nwsPeriods.map((_, i) => gfsPeriods[i]?.p10    ?? null);
  const aifsUpper = nwsPeriods.map((_, i) => aifsPeriods_[i]?.p90   ?? null);
  const aifsLower = nwsPeriods.map((_, i) => aifsPeriods_[i]?.p10   ?? null);

  const ctx = document.getElementById('decay-chart').getContext('2d');
  decayChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { data: gfsUpper,  fill: '+1', backgroundColor: 'rgba(26,115,232,0.12)', borderWidth: 0, pointRadius: 0, borderColor: 'transparent' },
        { data: gfsLower,  fill: false, borderWidth: 0, pointRadius: 0, borderColor: 'transparent' },
        { label: 'GFS Ensemble', data: gfsMean,  fill: false, borderColor: '#1a73e8', borderWidth: 2, pointRadius: 3, tension: 0.3 },
        { data: aifsUpper, fill: '+1', backgroundColor: 'rgba(46,125,82,0.12)', borderWidth: 0, pointRadius: 0, borderColor: 'transparent' },
        { data: aifsLower, fill: false, borderWidth: 0, pointRadius: 0, borderColor: 'transparent' },
        { label: 'AIFS Ensemble', data: aifsMean, fill: false, borderColor: '#2e7d52', borderWidth: 2, pointRadius: 3, tension: 0.3 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { filter: item => item.text === 'GFS Ensemble' || item.text === 'AIFS Ensemble' } },
      },
      scales: {
        y: { ticks: { callback: v => `${v}°` }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { grid: { display: false } },
      },
    },
  });

  // Annotations show actual p10–p90 spread at first and last period
  const firstGfs  = gfsPeriods[0];
  const lastGfs   = gfsPeriods[nwsPeriods.length - 1];
  const firstAifs = aifsPeriods_[0];
  const lastAifs  = aifsPeriods_[nwsPeriods.length - 1];

  const fmtRange = (first, last) => {
    if (!first && !last) return 'no data';
    const a = first ? `${first.p90 - first.p10}°` : '—';
    const b = last  ? `${last.p90  - last.p10}°`  : '—';
    return `${a} → ${b}`;
  };

  document.getElementById('decay-annotations').innerHTML = `
    <div class="decay-card">
      <div class="decay-model model-nws">GFS Ensemble</div>
      <div class="decay-label">middle 80% of runs</div>
      <div class="decay-range">${fmtRange(firstGfs, lastGfs)}</div>
    </div>
    <div class="decay-card">
      <div class="decay-model model-aifs">AIFS Ensemble</div>
      <div class="decay-label">middle 80% of runs</div>
      <div class="decay-range">${fmtRange(firstAifs, lastAifs)}</div>
    </div>
    <div class="decay-card decay-card-dm">
      <div class="decay-model model-dm">DeepMind</div>
      <div class="decay-label">v3 pending</div>
    </div>
  `;
}

function renderStormTracker(nwsPeriods, aifsPeriods) {
  const THRESHOLD = 5;

  const alerts = nwsPeriods
    .map((nws, i) => ({ nws, aifs: aifsPeriods[i], i }))
    .filter(({ nws, aifs }) => {
      if (!aifs) return false;
      const tempDiff      = Math.abs(nws.temperature - aifs.temperature);
      const precipMismatch = hasPrecip(nws.shortForecast) !== hasPrecip(aifs.shortForecast);
      return tempDiff >= THRESHOLD || precipMismatch;
    })
    .map(({ nws, aifs, i }) => {
      const tempDiff       = Math.abs(nws.temperature - aifs.temperature);
      const precipMismatch = hasPrecip(nws.shortForecast) !== hasPrecip(aifs.shortForecast);
      const hoursAhead     = (i + 1) * 12;

      let detail = '';
      if (tempDiff >= THRESHOLD) {
        detail += `NWS predicts ${nws.temperature}°F; AIFS predicts ${aifs.temperature}°F (${tempDiff}°F difference)`;
      }
      if (precipMismatch) {
        if (detail) detail += '. ';
        detail += `NWS: ${nws.shortForecast}; AIFS: ${aifs.shortForecast}`;
      }

      return `
        <div class="storm-alert">
          <span class="storm-icon">ℹ️</span>
          <div class="storm-body">
            <div class="storm-title">${nws.name}</div>
            <div class="storm-detail">${detail}</div>
          </div>
          <div class="storm-time">in ${hoursAhead}h</div>
        </div>`;
    });

  document.getElementById('storm-alerts').innerHTML = alerts.length
    ? alerts.join('')
    : '<p class="no-alerts">Models agree. No significant differences detected.</p>';

  const countEl = document.getElementById('storm-count');
  if (countEl) countEl.innerHTML = alerts.length
    ? `<span class="alert-badge">${alerts.length} Alert${alerts.length !== 1 ? 's' : ''}</span>`
    : '';
}

function renderScoreboard(accuracy) {
  const el = document.getElementById('scoreboard-cards');
  if (!el) return;
  if (!accuracy) {
    el.innerHTML = '<p class="no-alerts">Historical data unavailable for this location.</p>';
    return;
  }
  el.innerHTML = `
    <div class="score-card score-card-gfs">
      <div class="score-src">GFS <span class="score-sub">(NWS)</span></div>
      <div class="score-pct">${accuracy.gfsMae != null ? accuracy.gfsMae + '°F' : '—'}</div>
      <div class="score-label">average error · ${accuracy.gfsDays} days</div>
    </div>
    <div class="score-card score-card-aifs">
      <div class="score-src">AIFS</div>
      <div class="score-pct">${accuracy.aifsMae != null ? accuracy.aifsMae + '°F' : '—'}</div>
      <div class="score-label">average error · ${accuracy.aifsDays} days</div>
    </div>
    <div class="score-card score-card-dm">
      <div class="score-src model-dm">DeepMind</div>
      <div class="score-pct score-pct-dm">—</div>
      <div class="score-label">v3 · no data yet</div>
    </div>
    <p class="scoreboard-note">30-day window ending 4 days ago. One airport station per city. Early sample, not a long-term baseline.</p>
    <p class="scoreboard-note">The scoring method changed on June 10. Earlier scores used a single forecast run per model; later scores average across all ensemble members. Numbers from before and after that date are not directly comparable.</p>
  `;
}

// ── APP ────────────────────────────────────────────────────────────────

document.getElementById('weather-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const city    = document.getElementById('city').value.trim();
  const state   = document.getElementById('state').value.trim();
  const status  = document.getElementById('status');
  const results = document.getElementById('results');

  results.innerHTML  = '';
  status.textContent = 'Fetching forecast…';

  try {
    // Geocode once, then fetch both sources in parallel
    const { lat, lon }              = await geocodeCity(city, state);
    const { forecastUrl, stationsUrl, stateCode } = await getNWSPoints(lat, lon);
    const [nwsPeriods, aifsPeriods, ensembleData] = await Promise.all([
      getForecastPeriods(forecastUrl),
      fetchAIFSForecast(lat, lon),
      fetchEnsembleSpread(lat, lon).catch(() => null),
    ]);

    status.textContent = '';
    renderForecast(nwsPeriods, aifsPeriods, city, state, ensembleData);

    // Scoreboard runs independently — slow archive + mesonet APIs shouldn't delay main render
    fetchHistoricalAccuracy(lat, lon, stationsUrl, stateCode)
      .then(acc => renderScoreboard(acc))
      .catch(()  => renderScoreboard(null));

  } catch (err) {
    status.textContent = '';
    renderError(err.message);
  }
});
