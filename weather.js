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

function renderForecast(periods, city, state) {
  // NWS periods are 12-hour blocks (day/night). Periods[0] is the current or
  // next named period; slice 1–5 covers roughly the next 48 hours.
  const current = periods[0];
  const upcoming = periods.slice(1, 6);

  const upcomingHtml = upcoming.map(p => `
    <div class="period">
      <span class="period-emoji">${getEmoji(p.shortForecast, p.isDaytime)}</span>
      <strong>${p.name}</strong>
      <span class="temp">${p.temperature}°${p.temperatureUnit}</span>
      <p>${p.shortForecast}</p>
    </div>
  `).join('');

  document.getElementById('results').innerHTML = `
    <h2>${city}, ${state}</h2>
    <div class="current">
      <h3>${getEmoji(current.shortForecast, current.isDaytime)} ${current.name}</h3>
      <p class="temp-large">${current.temperature}°${current.temperatureUnit}</p>
      <p>${current.detailedForecast}</p>
    </div>
    <h3>Next 48 hours</h3>
    <div class="forecast-grid">${upcomingHtml}</div>
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
    const periods = await fetchForecast(city, state);
    status.textContent = '';
    renderForecast(periods, city, state);
  } catch (err) {
    status.textContent = '';
    renderError(err.message);
  }
});
