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
  const stationK = stData.features?.[0]?.properties?.stationIdentifier;
  if (!stationK) return null;
  const station = stationK.replace(/^K/, '');  // "KORD" → "ORD"

  // Iowa Mesonet: ASOS daily high (°F, already converted)
  const [y1, m1, d1] = startStr.split('-');
  const [y2, m2, d2] = endStr.split('-');
  const mesonetUrl = `https://mesonet.agron.iastate.edu/cgi-bin/request/daily.py`
    + `?network=${stateCode}_ASOS&stations=${station}`
    + `&year1=${y1}&month1=${m1}&day1=${d1}`
    + `&year2=${y2}&month2=${m2}&day2=${d2}`
    + `&vars[]=max_tmpf&what=view&delim=comma`;

  // Open-Meteo Previous Runs API: temperature_2m_previous_day3 is the hourly
  // temperature from the model run issued exactly 3 days before the valid time.
  // Fetching both models through the same endpoint/variable/date range ensures
  // no asymmetry between GFS and AIFS.
  const prevBase = `https://previous-runs-api.open-meteo.com/v1/forecast`
    + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + `&start_date=${startStr}&end_date=${endStr}`
    + `&hourly=temperature_2m_previous_day3&timezone=auto`;

  const [mesonetRes, gfsRes, aifsRes] = await Promise.all([
    fetch(mesonetUrl),
    fetch(`${prevBase}&models=gfs_seamless`),
    fetch(`${prevBase}&models=ecmwf_aifs025_single`),
  ]);

  if (!mesonetRes.ok) return null;

  // Parse Mesonet CSV: columns are station, date (YYYY-MM-DD), max_tmpf
  const obsMap = {};
  (await mesonetRes.text()).trim().split('\n').slice(1).forEach(line => {
    const cols = line.split(',');
    if (cols.length >= 3 && cols[2] !== '' && cols[2] !== 'M') {
      obsMap[cols[1].trim()] = parseFloat(cols[2]);
    }
  });

  // Derive daily max °F from hourly Previous Runs data
  function parseDailyMaxF(json) {
    const map   = {};
    const times = json?.hourly?.time ?? [];
    const temps = json?.hourly?.temperature_2m_previous_day3 ?? [];
    times.forEach((t, i) => {
      const day = t.slice(0, 10);
      const c   = temps[i];
      if (c != null) {
        const f = c * 9 / 5 + 32;
        if (map[day] == null || f > map[day]) map[day] = f;
      }
    });
    return map;
  }

  const [gfsJson, aifsJson] = await Promise.all([
    gfsRes.ok  ? gfsRes.json()  : Promise.resolve(null),
    aifsRes.ok ? aifsRes.json() : Promise.resolve(null),
  ]);

  const gfsMap  = parseDailyMaxF(gfsJson);
  const aifsMap = parseDailyMaxF(aifsJson);

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

function renderForecast(nwsPeriods, aifsPeriods, city, state) {
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
          <span class="leg-dm">- - DeepMind (v3)</span>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="convergence-chart"></canvas></div>
    </section>

    <section class="feature-section">
      <div class="section-title" id="confidence-title">Model confidence</div>
      <div class="section-subtitle">Gradient depth and range show each model's certainty</div>
      <div class="conf-cards" id="confidence-cards"></div>
    </section>

    <section class="feature-section">
      <div class="section-title">Confidence over the forecast horizon</div>
      <div class="section-subtitle">Shaded bands widen as model certainty decays</div>
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
        <div class="section-meta">+3-day lead · daily max °F · MAE</div>
      </div>
      <div class="section-subtitle">Forecasts as issued 3 days ahead, verified against ASOS observations</div>
      <div class="scoreboard-cards" id="scoreboard-cards">
        <div class="score-loading">Loading historical data…</div>
      </div>
    </section>
  `;

  const nws  = nwsPeriods.slice(0, 7);
  const aifs = aifsPeriods.slice(0, 7);
  renderConvergenceChart(nws, aifs);
  renderConfidenceCards(nws, aifs);
  renderDecayChart(nws, aifs);
  renderStormTracker(nws.slice(1), aifs.slice(1));
}

function renderConvergenceChart(nwsPeriods, aifsPeriods) {
  const aifsByName = Object.fromEntries(aifsPeriods.map(p => [p.name, p]));
  const labels     = nwsPeriods.map(p => p.name);
  const nwsData    = nwsPeriods.map(p => p.temperature);
  const aifsData   = nwsPeriods.map(p => aifsByName[p.name]?.temperature ?? null);
  // DeepMind stub: midpoint of NWS and AIFS with a small alternating offset
  const dmData     = nwsData.map((n, i) => {
    const a = aifsData[i];
    return (n != null && a != null) ? Math.round((n + a) / 2 + (i % 2 === 0 ? 1 : -1)) : null;
  });

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

  // Animated reveal: AIFS at 0.6s, DeepMind stub at 1.2s (Idea 4)
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

  setTimeout(() => {
    convergenceChart.data.datasets.push({
      label: 'DeepMind (v3)',
      data: dmData,
      borderColor: '#9e9e9e',
      borderDash: [5, 4],
      borderWidth: 1.5,
      pointRadius: 3,
      pointBackgroundColor: '#9e9e9e',
      tension: 0.3,
    });
    convergenceChart.update();
  }, 1200);
}

function renderConfidenceCards(nwsPeriods, aifsPeriods) {
  const aifsByName = Object.fromEntries(aifsPeriods.map(p => [p.name, p]));

  // Pick the period with the largest NWS/AIFS temperature divergence
  let featured = nwsPeriods[1] ?? nwsPeriods[0];
  let maxDiff   = 0;
  nwsPeriods.slice(1).forEach(p => {
    const a    = aifsByName[p.name];
    const diff = a ? Math.abs(p.temperature - a.temperature) : 0;
    if (diff > maxDiff) { maxDiff = diff; featured = p; }
  });

  const idx          = nwsPeriods.indexOf(featured);
  const aifsFeatured = aifsByName[featured?.name];

  // Mock confidence ranges: uncertainty grows with period index.
  // Prototype UI — v4 wires in real ensemble data from Open-Meteo.
  const nwsRange  = Math.round(2 + idx * 0.4);
  const aifsRange = Math.round(1 + idx * 0.3);
  const nwsConf   = idx < 3 ? 'HIGH' : 'MODERATE';
  const aifsConf  = idx < 4 ? 'VERY HIGH' : 'HIGH';

  document.getElementById('confidence-title').textContent =
    `${featured?.name ?? ''} — model confidence`;

  document.getElementById('confidence-cards').innerHTML = `
    <div class="conf-card conf-nws">
      <div class="conf-hdr">
        <span class="conf-src">NWS <span class="conf-sub">Physics</span></span>
        <span class="conf-badge badge-high">${nwsConf}</span>
      </div>
      <div class="conf-temp">${featured?.temperature ?? '—'}°F</div>
      <div class="conf-range">±${nwsRange}°F range</div>
    </div>
    <div class="conf-card conf-aifs">
      <div class="conf-hdr">
        <span class="conf-src">AIFS <span class="conf-sub">ML</span></span>
        <span class="conf-badge badge-very-high">${aifsConf}</span>
      </div>
      <div class="conf-temp">${aifsFeatured?.temperature ?? '—'}°F</div>
      <div class="conf-range">±${aifsRange}°F range</div>
    </div>
    <div class="conf-card conf-dm">
      <div class="conf-hdr">
        <span class="conf-src">DeepMind <span class="conf-sub">ML (v3)</span></span>
        <span class="conf-badge badge-pending">PENDING</span>
      </div>
      <div class="conf-temp conf-pending-val">—</div>
      <div class="conf-range">awaiting access</div>
    </div>
  `;
}

function renderDecayChart(nwsPeriods, aifsPeriods) {
  const aifsByName = Object.fromEntries(aifsPeriods.map(p => [p.name, p]));
  const labels     = nwsPeriods.map(p => p.name);
  const nwsCenter  = nwsPeriods.map(p => p.temperature);
  const aifsCenter = nwsPeriods.map(p => aifsByName[p.name]?.temperature ?? null);
  const nwsUpper   = nwsCenter.map((t, i) => t + 2 + i * 0.35);
  const nwsLower   = nwsCenter.map((t, i) => t - 2 - i * 0.35);
  // AIFS: confidence cliff — stays tight through day 3, then widens sharply
  const aifsUpper  = aifsCenter.map((t, i) => t != null ? t + 1 + Math.max(0, i - 3) * 0.7 : null);
  const aifsLower  = aifsCenter.map((t, i) => t != null ? t - 1 - Math.max(0, i - 3) * 0.7 : null);

  const ctx = document.getElementById('decay-chart').getContext('2d');
  decayChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        // NWS band: upper fills toward next dataset (lower bound)
        { data: nwsUpper,  fill: '+1', backgroundColor: 'rgba(26,115,232,0.12)', borderWidth: 0, pointRadius: 0, borderColor: 'transparent' },
        { data: nwsLower,  fill: false, borderWidth: 0, pointRadius: 0, borderColor: 'transparent' },
        { label: 'NWS',   data: nwsCenter,  fill: false, borderColor: '#1a73e8', borderWidth: 2, pointRadius: 3, tension: 0.3 },
        // AIFS band
        { data: aifsUpper, fill: '+1', backgroundColor: 'rgba(46,125,82,0.12)', borderWidth: 0, pointRadius: 0, borderColor: 'transparent' },
        { data: aifsLower, fill: false, borderWidth: 0, pointRadius: 0, borderColor: 'transparent' },
        { label: 'AIFS',  data: aifsCenter, fill: false, borderColor: '#2e7d52', borderWidth: 2, pointRadius: 3, tension: 0.3 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { filter: item => item.text === 'NWS' || item.text === 'AIFS' } },
      },
      scales: {
        y: { ticks: { callback: v => `${v}°` }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { grid: { display: false } },
      },
    },
  });

  const n = nwsPeriods.length - 1;
  document.getElementById('decay-annotations').innerHTML = `
    <div class="decay-card">
      <div class="decay-model model-nws">NWS</div>
      <div class="decay-label">Steady growth</div>
      <div class="decay-range">±2°→±${Math.round(2 + n * 0.35)}°</div>
    </div>
    <div class="decay-card">
      <div class="decay-model model-aifs">AIFS</div>
      <div class="decay-label">Cliff at day 3</div>
      <div class="decay-range">±1°→±${Math.round(1 + Math.max(0, n - 3) * 0.7)}°</div>
    </div>
    <div class="decay-card decay-card-dm">
      <div class="decay-model model-dm">DeepMind</div>
      <div class="decay-label">v3 pending</div>
    </div>
  `;
}

function renderStormTracker(nwsPeriods, aifsPeriods) {
  const aifsByName = Object.fromEntries(aifsPeriods.map(p => [p.name, p]));
  const THRESHOLD  = 5;

  const alerts = nwsPeriods
    .map((nws, i) => ({ nws, aifs: aifsByName[nws.name], i }))
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
        detail += `NWS predicts ${nws.temperature}°F; AIFS predicts ${aifs.temperature}°F — ${tempDiff}°F divergence`;
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
    : '<p class="no-alerts">Models agree — no significant divergence detected.</p>';

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
      <div class="score-label">mean abs error · ${accuracy.gfsDays} days</div>
    </div>
    <div class="score-card score-card-aifs">
      <div class="score-src">AIFS</div>
      <div class="score-pct">${accuracy.aifsMae != null ? accuracy.aifsMae + '°F' : '—'}</div>
      <div class="score-label">mean abs error · ${accuracy.aifsDays} days</div>
    </div>
    <div class="score-card score-card-dm">
      <div class="score-src model-dm">DeepMind</div>
      <div class="score-pct score-pct-dm">—</div>
      <div class="score-label">v3 · accumulates from access</div>
    </div>
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
    const [nwsPeriods, aifsPeriods] = await Promise.all([
      getForecastPeriods(forecastUrl),
      fetchAIFSForecast(lat, lon),
    ]);

    status.textContent = '';
    renderForecast(nwsPeriods, aifsPeriods, city, state);

    // Scoreboard runs independently — slow archive + mesonet APIs shouldn't delay main render
    fetchHistoricalAccuracy(lat, lon, stationsUrl, stateCode)
      .then(acc => renderScoreboard(acc))
      .catch(()  => renderScoreboard(null));

  } catch (err) {
    status.textContent = '';
    renderError(err.message);
  }
});
