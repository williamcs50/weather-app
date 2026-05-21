// ── FETCH ──────────────────────────────────────────────────────────────
// These functions know nothing about the DOM. They take inputs, return data,
// and throw on failure. renderForecast() is the only thing that touches the page.

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
  // NWS /points endpoint returns a forecast URL specific to that grid cell.
  // It only covers the US, so non-US coordinates will get a 404.
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

// Orchestrates the three-step chain: geocode → points → forecast
async function fetchForecast(city, state) {
  const { lat, lon } = await geocodeCity(city, state);
  const forecastUrl = await getNWSPoints(lat, lon);
  return getForecastPeriods(forecastUrl);
}

// timezone=auto makes Open-Meteo return local times for the coordinates;
// without it times are UTC and the day/night split is wrong for US cities
async function fetchAIFSForecast(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation&models=ecmwf_aifs025_single&forecast_days=10&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch AIFS forecast.');
  const data = await res.json();
  return parseAIFSPeriods(data);
}

// Maps a total precipitation amount (mm per 12-hour block) to a short string.
// Thresholds are a first pass — adjust after seeing real AIFS output.
function deriveShortForecast(precipMm) {
  if (precipMm === 0)   return 'Dry';
  if (precipMm < 2)     return 'Light Rain';
  if (precipMm < 10)    return 'Rain';
  return 'Heavy Rain';
}

function parseAIFSPeriods(data) {
  const times  = data.hourly.time;            // "2024-05-21T06:00" local time
  const temps  = data.hourly.temperature_2m;  // °C
  const precip = data.hourly.precipitation;   // mm

  // Group each hour into a 12-hour block: day = 06:00–17:59, night = 18:00–05:59.
  // Night hours 00:00–05:59 are attached to the previous calendar date's night block.
  const blocks = {};
  times.forEach((timeStr, i) => {
    const hour     = parseInt(timeStr.slice(11, 13), 10);
    const dateStr  = timeStr.slice(0, 10);
    let blockKey, isDaytime;

    if (hour >= 6 && hour < 18) {
      blockKey  = `${dateStr}-day`;
      isDaytime = true;
    } else {
      // Hours 0–5 belong to the night that started the previous evening
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
      const date   = block.date;
      const dt     = new Date(date + 'T12:00:00');
      const isToday = date === today;
      const name   = isToday
        ? (block.isDaytime ? 'Today' : 'Tonight')
        : dayNames[dt.getDay()] + (block.isDaytime ? '' : ' Night');

      const avgTempC = block.temps.reduce((a, b) => a + b, 0) / block.temps.length;
      const tempF    = Math.round(avgTempC * 9 / 5 + 32); // AIFS is °C; convert to match NWS

      return {
        name,
        temperature:     tempF,
        temperatureUnit: 'F',
        shortForecast:   deriveShortForecast(block.precipSum),
        isDaytime:       block.isDaytime,
      };
    })
    .slice(0, 8); // keep ~4 days to match NWS output length
}

// ── RENDER ─────────────────────────────────────────────────────────────
// These functions only read data and write to the DOM. No fetch calls here.

// isDaytime keeps nighttime "Clear" from mapping to ☀️
function getEmoji(shortForecast, isDaytime) {
  const f = shortForecast.toLowerCase();
  if (f.includes('thunder'))                              return '⛈️';
  if (f.includes('blizzard') || f.includes('snow'))       return '🌨️';
  if (f.includes('sleet') || f.includes('freezing'))      return '🌧️';
  if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return '🌧️';
  if (f.includes('fog') || f.includes('haze'))            return '🌫️';
  if (f.includes('mostly sunny') || f.includes('partly cloudy')) return isDaytime ? '⛅' : '🌙';
  if (f.includes('sunny') || f.includes('clear') || f.includes('fair')) return isDaytime ? '☀️' : '🌙';
  if (f.includes('mostly cloudy') || f.includes('overcast')) return '🌥️';
  if (f.includes('cloudy'))                               return '☁️';
  return isDaytime ? '🌡️' : '🌙';
}

function renderError(message) {
  document.getElementById('results').innerHTML =
    `<p class="error">${message}</p>`;
}

function renderForecast(nwsPeriods, aifsPeriods, city, state) {
  const current = nwsPeriods[0];

  document.getElementById('results').innerHTML = `
    <h2>${city}, ${state}</h2>
    <div class="current">
      <h3>${getEmoji(current.shortForecast, current.isDaytime)} ${current.name}</h3>
      <p class="temp-large">${current.temperature}°${current.temperatureUnit}</p>
      <p>${current.detailedForecast}</p>
    </div>
    <div id="comparison"></div>
  `;

  renderComparison(nwsPeriods.slice(1, 7), aifsPeriods.slice(1, 7));
}

function renderComparison(nwsPeriods, aifsPeriods) {
  const aifsByName = Object.fromEntries(aifsPeriods.map(p => [p.name, p]));

  const cards = nwsPeriods.map(nws => {
    const aifs = aifsByName[nws.name];
    return `
      <div class="comparison-card">
        <div class="comparison-card-header">
          ${getEmoji(nws.shortForecast, nws.isDaytime)} ${nws.name}
        </div>
        <div class="comparison-card-body">
          <div class="comparison-source">
            <span class="source-label">NWS</span>
            <span class="source-temp">${nws.temperature}°${nws.temperatureUnit}</span>
          </div>
          <div class="comparison-source">
            <span class="source-label">AIFS</span>
            <span class="source-temp">${aifs ? `${aifs.temperature}°F` : '—'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('comparison').innerHTML = `
    <div class="comparison-grid">${cards}</div>
  `;
}

// ── APP ────────────────────────────────────────────────────────────────

document.getElementById('weather-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const city  = document.getElementById('city').value.trim();
  const state = document.getElementById('state').value.trim();
  const status  = document.getElementById('status');
  const results = document.getElementById('results');

  results.innerHTML  = '';
  status.textContent = 'Fetching forecast…';

  try {
    // Geocode once, then fetch both sources in parallel
    const { lat, lon }          = await geocodeCity(city, state);
    const forecastUrl           = await getNWSPoints(lat, lon);
    const [nwsPeriods, aifsPeriods] = await Promise.all([
      getForecastPeriods(forecastUrl),
      fetchAIFSForecast(lat, lon),
    ]);
    status.textContent = '';
    renderForecast(nwsPeriods, aifsPeriods, city, state);
  } catch (err) {
    status.textContent = '';
    renderError(err.message);
  }
});
