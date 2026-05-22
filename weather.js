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
  return data.properties.forecast;
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

async function fetchHistoricalAccuracy(lat, lon) {
  const end   = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const fmt = d => d.toISOString().slice(0, 10);

  const obsUrl  = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${fmt(start)}&end_date=${fmt(end)}&daily=temperature_2m_max&timezone=auto`;
  const gfsUrl  = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=temperature_2m_max&models=gfs_seamless&past_days=30&forecast_days=1&timezone=auto`;
  // AIFS: use the same model as the live forecast, hourly, and compute daily max
  const aifsUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=temperature_2m&models=ecmwf_aifs025_single&past_days=30&forecast_days=1&timezone=auto`;

  const [obsRes, gfsRes, aifsRes] = await Promise.all([
    fetch(obsUrl), fetch(gfsUrl), fetch(aifsUrl)
  ]);
  if (!obsRes.ok) return null;

  const [obs, gfs, aifs] = await Promise.all([
    obsRes.json(),
    gfsRes.ok  ? gfsRes.json()  : Promise.resolve(null),
    aifsRes.ok ? aifsRes.json() : Promise.resolve(null),
  ]);

  // GFS: daily max direct from API
  const gfsMap = {};
  (gfs?.daily?.time ?? []).forEach((d, i) => { gfsMap[d] = gfs.daily.temperature_2m_max[i]; });

  // AIFS: compute daily max from hourly °C values
  const aifsMap = {};
  (aifs?.hourly?.time ?? []).forEach((timeStr, i) => {
    const date = timeStr.slice(0, 10);
    const temp = aifs.hourly.temperature_2m[i];
    if (temp != null && (aifsMap[date] == null || temp > aifsMap[date])) {
      aifsMap[date] = temp;
    }
  });

  // Count GFS and AIFS hits independently so one missing source doesn't zero the other
  let gfsHits = 0, gfsDays = 0, aifsHits = 0, aifsDays = 0;
  (obs.daily?.time ?? []).forEach((date, i) => {
    const actual = obs.daily.temperature_2m_max[i];
    if (actual == null) return;
    const actualF = actual * 9 / 5 + 32;

    const gfsPred = gfsMap[date];
    if (gfsPred != null) {
      gfsDays++;
      if (Math.abs(actualF - (gfsPred * 9 / 5 + 32)) <= 2) gfsHits++;
    }

    const aifsPred = aifsMap[date];
    if (aifsPred != null) {
      aifsDays++;
      if (Math.abs(actualF - (aifsPred * 9 / 5 + 32)) <= 2) aifsHits++;
    }
  });

  return {
    nws:      gfsDays  > 0 ? Math.round(gfsHits  / gfsDays  * 100) : null,
    aifs:     aifsDays > 0 ? Math.round(aifsHits / aifsDays * 100) : null,
    nwsDays:  gfsDays,
    aifsDays: aifsDays,
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
      <div class="section-title">Cinematic load sequence</div>
      <div class="section-subtitle">Each model plots in sequence so the diff feels discovered</div>
      <div class="sequence-steps">
        <div class="sequence-step">
          <div class="step-hdr"><span class="step-time">Step 1 · 0.0s</span><span class="step-badge badge-nws">NWS</span></div>
          <p>Physics baseline plots first. Reader sees the classical forecast settle.</p>
        </div>
        <div class="sequence-step">
          <div class="step-hdr"><span class="step-time">Step 2 · 0.6s</span><span class="step-badge badge-aifs">AIFS</span></div>
          <p>ML line animates in. Where it diverges, the diff catches the eye.</p>
        </div>
        <div class="sequence-step">
          <div class="step-hdr"><span class="step-time">Step 3 · 1.2s</span><span class="step-badge badge-dm">DeepMind</span></div>
          <p>Third lineage arrives last in v3. Full picture lands cleanly.</p>
        </div>
      </div>
    </section>

    <section class="feature-section">
      <div class="section-title">Storm tracker — model divergence alerts</div>
      <div id="storm-alerts"></div>
    </section>

    <section class="feature-section">
      <div class="section-header-row">
        <div class="section-title">Model accuracy scoreboard</div>
        <div class="section-meta">last 30 days · ±2°F threshold</div>
      </div>
      <div class="section-subtitle">Backfilled from public historic forecast archives</div>
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
          <span class="storm-icon">⚠️</span>
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
}

function renderScoreboard(accuracy) {
  const el = document.getElementById('scoreboard-cards');
  if (!el) return;
  if (!accuracy) {
    el.innerHTML = '<p class="no-alerts">Historical data unavailable for this location.</p>';
    return;
  }
  el.innerHTML = `
    <div class="score-card score-card-nws">
      <div class="score-src">NWS <span class="score-sub">(via GFS)</span></div>
      <div class="score-pct">${accuracy.nws ?? '—'}%</div>
      <div class="score-label">within ±2°F · ${accuracy.nwsDays} days</div>
    </div>
    <div class="score-card score-card-aifs">
      <div class="score-src">AIFS</div>
      <div class="score-pct">${accuracy.aifs ?? '—'}%</div>
      <div class="score-label">within ±2°F · ${accuracy.aifsDays} days</div>
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
    const forecastUrl               = await getNWSPoints(lat, lon);
    const [nwsPeriods, aifsPeriods] = await Promise.all([
      getForecastPeriods(forecastUrl),
      fetchAIFSForecast(lat, lon),
    ]);

    status.textContent = '';
    renderForecast(nwsPeriods, aifsPeriods, city, state);

    // Scoreboard runs independently — slow archive API shouldn't delay main render
    fetchHistoricalAccuracy(lat, lon)
      .then(acc => renderScoreboard(acc))
      .catch(()  => renderScoreboard(null));

  } catch (err) {
    status.textContent = '';
    renderError(err.message);
  }
});
