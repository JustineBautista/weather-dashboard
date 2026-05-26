/* ══════════════════════════════════════════════════════════════════════════
   WEATHER DASHBOARD — APP LOGIC
   Keyless Open-Meteo API, Chart.js, Geolocation, Favorites
   ══════════════════════════════════════════════════════════════════════════ */

// ── STATE ──────────────────────────────────────────────────────────────────
const state = {
  unit: localStorage.getItem('weatherUnit') || 'C',
  favorites: JSON.parse(localStorage.getItem('weatherFavs') || '[]'),
  current: null,  // { lat, lon, name, country, temp, ... }
  hourlyChart: null,
};

// ── DOM REFS ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = {
  body: $('appBody'),
  search: $('searchInput'),
  results: $('searchResults'),
  geo: $('geolocateBtn'),
  unitBtn: $('unitToggle'),
  loc: $('currentLocation'),
  date: $('currentDate'),
  temp: $('currentTemp'),
  cond: $('currentCondition'),
  feels: $('feelsLike'),
  visual: $('weatherVisual'),
  humidity: $('humidity'),
  humidityBar: $('humidityBar'),
  wind: $('windSpeed'),
  windDir: $('windDir'),
  uv: $('uvIndex'),
  uvLabel: $('uvLabel'),
  aqi: $('aqi'),
  aqiLabel: $('aqiLabel'),
  pressure: $('pressure'),
  visibility: $('visibility'),
  chart: $('hourlyChart'),
  daily: $('dailyForecast'),
  favList: $('favoritesList'),
  addFav: $('addFavoriteBtn'),
  sunrise: $('sunrise'),
  sunset: $('sunset'),
  sunDot: $('sunDot'),
  loader: $('loadingOverlay'),
};

// ── WMO WEATHER CODES ──────────────────────────────────────────────────────
const WMO = {
  0:  { desc: 'Clear Sky',        icon: '☀️', theme: 'clear',  visual: 'sun' },
  1:  { desc: 'Mainly Clear',     icon: '🌤️', theme: 'clear',  visual: 'sun' },
  2:  { desc: 'Partly Cloudy',    icon: '⛅',  theme: 'cloudy', visual: 'partial' },
  3:  { desc: 'Overcast',         icon: '☁️', theme: 'cloudy', visual: 'cloud' },
  45: { desc: 'Foggy',            icon: '🌫️', theme: 'cloudy', visual: 'cloud' },
  48: { desc: 'Rime Fog',         icon: '🌫️', theme: 'cloudy', visual: 'cloud' },
  51: { desc: 'Light Drizzle',    icon: '🌦️', theme: 'rain',   visual: 'rain' },
  53: { desc: 'Moderate Drizzle', icon: '🌦️', theme: 'rain',   visual: 'rain' },
  55: { desc: 'Dense Drizzle',    icon: '🌧️', theme: 'rain',   visual: 'rain' },
  56: { desc: 'Freezing Drizzle', icon: '🌧️', theme: 'snow',   visual: 'rain' },
  57: { desc: 'Heavy Freezing Drizzle', icon: '🌧️', theme: 'snow', visual: 'rain' },
  61: { desc: 'Slight Rain',      icon: '🌦️', theme: 'rain',   visual: 'rain' },
  63: { desc: 'Moderate Rain',    icon: '🌧️', theme: 'rain',   visual: 'rain' },
  65: { desc: 'Heavy Rain',       icon: '🌧️', theme: 'rain',   visual: 'rain' },
  66: { desc: 'Freezing Rain',    icon: '🌧️', theme: 'snow',   visual: 'rain' },
  67: { desc: 'Heavy Freezing Rain', icon: '🌧️', theme: 'snow', visual: 'rain' },
  71: { desc: 'Slight Snowfall',  icon: '🌨️', theme: 'snow',   visual: 'snow' },
  73: { desc: 'Moderate Snowfall',icon: '🌨️', theme: 'snow',   visual: 'snow' },
  75: { desc: 'Heavy Snowfall',   icon: '❄️', theme: 'snow',   visual: 'snow' },
  77: { desc: 'Snow Grains',      icon: '❄️', theme: 'snow',   visual: 'snow' },
  80: { desc: 'Rain Showers',     icon: '🌦️', theme: 'rain',   visual: 'rain' },
  81: { desc: 'Moderate Showers', icon: '🌧️', theme: 'rain',   visual: 'rain' },
  82: { desc: 'Violent Showers',  icon: '🌧️', theme: 'storm',  visual: 'storm' },
  85: { desc: 'Snow Showers',     icon: '🌨️', theme: 'snow',   visual: 'snow' },
  86: { desc: 'Heavy Snow Showers',icon:'❄️', theme: 'snow',   visual: 'snow' },
  95: { desc: 'Thunderstorm',     icon: '⛈️', theme: 'storm',  visual: 'storm' },
  96: { desc: 'Thunderstorm with Hail', icon: '⛈️', theme: 'storm', visual: 'storm' },
  99: { desc: 'Severe Thunderstorm', icon: '⛈️', theme: 'storm', visual: 'storm' },
};

function getWMO(code) {
  return WMO[code] || { desc: 'Unknown', icon: '🌡️', theme: 'clear', visual: 'sun' };
}

// ── TEMPERATURE CONVERSION ─────────────────────────────────────────────────
function toUnit(celsius) {
  if (state.unit === 'F') return Math.round(celsius * 9 / 5 + 32);
  return Math.round(celsius);
}

function unitSymbol() {
  return state.unit === 'F' ? '°F' : '°C';
}

// ── API ENDPOINTS ──────────────────────────────────────────────────────────
const API = {
  forecast: (lat, lon) =>
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,uv_index`
    + `&hourly=temperature_2m,weather_code`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset`
    + `&timezone=auto&forecast_days=8`,
  aqi: (lat, lon) =>
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`,
  geo: (query) =>
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en`,
};

// ── FETCH HELPERS ──────────────────────────────────────────────────────────
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── MAIN DATA LOADER ───────────────────────────────────────────────────────
async function loadWeather(lat, lon, name, country) {
  showLoader();
  try {
    const [forecast, airQ] = await Promise.all([
      fetchJSON(API.forecast(lat, lon)),
      fetchJSON(API.aqi(lat, lon)).catch(() => null),
    ]);

    state.current = { lat, lon, name, country };

    const c = forecast.current;
    const wmo = getWMO(c.weather_code);

    // Theme
    el.body.className = `theme-${wmo.theme}`;

    // Current
    el.loc.textContent = `${name}, ${country}`;
    el.date.textContent = formatDate(new Date());
    el.temp.textContent = `${toUnit(c.temperature_2m)}°`;
    el.cond.textContent = wmo.desc;
    el.feels.textContent = `${toUnit(c.apparent_temperature)}°`;

    // Weather visual
    renderWeatherVisual(wmo.visual);

    // Stats
    el.humidity.textContent = `${c.relative_humidity_2m}%`;
    el.humidityBar.style.width = `${c.relative_humidity_2m}%`;

    const windKmh = c.wind_speed_10m;
    el.wind.textContent = state.unit === 'F'
      ? `${Math.round(windKmh * 0.6214)} mph`
      : `${Math.round(windKmh)} km/h`;
    el.windDir.textContent = degToCompass(c.wind_direction_10m);

    el.uv.textContent = Math.round(c.uv_index);
    el.uvLabel.textContent = uvLevel(c.uv_index);

    el.pressure.textContent = `${Math.round(c.surface_pressure)} hPa`;

    // Visibility is not always available from Open-Meteo current, estimate from conditions
    const vis = estimateVisibility(c.weather_code);
    el.visibility.textContent = `${vis} km`;

    // AQI
    if (airQ && airQ.current) {
      el.aqi.textContent = airQ.current.us_aqi;
      el.aqiLabel.textContent = aqiLevel(airQ.current.us_aqi);
    } else {
      el.aqi.textContent = 'N/A';
      el.aqiLabel.textContent = '';
    }

    // Sun
    if (forecast.daily) {
      const sr = forecast.daily.sunrise[0];
      const ss = forecast.daily.sunset[0];
      el.sunrise.textContent = formatTime(sr);
      el.sunset.textContent = formatTime(ss);
      updateSunArc(sr, ss);
    }

    // Hourly chart
    renderHourlyChart(forecast.hourly, forecast.timezone);

    // Daily forecast
    renderDailyForecast(forecast.daily);

    // Update fav list active state
    renderFavorites();

  } catch (err) {
    console.error('Weather load error:', err);
    el.loc.textContent = 'Error loading data';
  } finally {
    hideLoader();
  }
}

// ── WEATHER VISUAL RENDERER ────────────────────────────────────────────────
function renderWeatherVisual(type) {
  let html = '';
  switch (type) {
    case 'sun':
      html = `
        <div class="wv-sun">
          <div class="wv-sun-ray"></div>
          <div class="wv-sun-ray" style="transform:rotate(45deg)"></div>
          <div class="wv-sun-ray" style="transform:rotate(90deg)"></div>
          <div class="wv-sun-ray" style="transform:rotate(135deg)"></div>
        </div>`;
      break;
    case 'partial':
      html = `
        <div class="wv-sun" style="width:50px;height:50px;top:25%;left:60%">
          <div class="wv-sun-ray"></div>
          <div class="wv-sun-ray" style="transform:rotate(45deg)"></div>
        </div>
        <div class="wv-cloud" style="top:55%;left:40%"></div>`;
      break;
    case 'cloud':
      html = `<div class="wv-cloud"></div>
              <div class="wv-cloud" style="width:55px;height:28px;top:35%;left:62%;opacity:0.6;animation-delay:-2s">
                <style>.wv-cloud[style*="55px"]::before{width:30px;height:30px;top:-16px;left:10px}.wv-cloud[style*="55px"]::after{width:22px;height:22px;top:-10px;left:28px}</style>
              </div>`;
      break;
    case 'rain':
      html = `
        <div class="wv-cloud" style="top:30%"></div>
        <div class="wv-rain-container" style="bottom:15px">
          <div class="wv-raindrop"></div><div class="wv-raindrop"></div><div class="wv-raindrop"></div>
          <div class="wv-raindrop"></div><div class="wv-raindrop"></div>
        </div>`;
      break;
    case 'snow':
      html = `
        <div class="wv-cloud" style="top:25%"></div>
        <div class="wv-rain-container" style="bottom:10px;height:50px">
          <div class="wv-snowflake"></div><div class="wv-snowflake"></div><div class="wv-snowflake"></div>
          <div class="wv-snowflake"></div><div class="wv-snowflake"></div>
        </div>`;
      break;
    case 'storm':
      html = `
        <div class="wv-cloud" style="top:25%"></div>
        <div class="wv-lightning">⚡</div>
        <div class="wv-rain-container" style="bottom:10px">
          <div class="wv-raindrop"></div><div class="wv-raindrop"></div><div class="wv-raindrop"></div>
        </div>`;
      break;
    default:
      html = `<div class="wv-sun"></div>`;
  }
  el.visual.innerHTML = html;
}

// ── HOURLY CHART ───────────────────────────────────────────────────────────
function renderHourlyChart(hourly, timezone) {
  const now = new Date();
  const nowISO = now.toISOString().slice(0, 13);

  // Find current hour index
  let startIdx = 0;
  for (let i = 0; i < hourly.time.length; i++) {
    if (hourly.time[i] >= nowISO.replace('T', 'T')) {
      startIdx = Math.max(0, i - 1);
      break;
    }
  }
  // But use a simpler approach: find the closest hour
  const currentHour = now.getHours();
  const todayStr = now.toISOString().slice(0, 10);
  startIdx = hourly.time.findIndex(t => t.startsWith(todayStr));
  if (startIdx === -1) startIdx = 0;
  startIdx += currentHour;
  startIdx = Math.max(0, Math.min(startIdx, hourly.time.length - 25));

  const labels = [];
  const temps = [];
  const icons = [];
  for (let i = startIdx; i < startIdx + 24 && i < hourly.time.length; i++) {
    const d = new Date(hourly.time[i]);
    labels.push(d.getHours().toString().padStart(2, '0') + ':00');
    temps.push(toUnit(hourly.temperature_2m[i]));
    icons.push(getWMO(hourly.weather_code[i]).icon);
  }

  if (state.hourlyChart) {
    state.hourlyChart.destroy();
  }

  const ctx = el.chart.getContext('2d');

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  const accentRGB = getThemeAccentRGB();
  gradient.addColorStop(0, `rgba(${accentRGB}, 0.3)`);
  gradient.addColorStop(1, `rgba(${accentRGB}, 0.0)`);

  state.hourlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: temps,
        borderColor: getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#60a5fa',
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#60a5fa',
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,19,32,0.9)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f0f2f5',
          bodyColor: '#a0a8b8',
          cornerRadius: 10,
          padding: 12,
          displayColors: false,
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => `${item.raw}${unitSymbol()}  ${icons[item.dataIndex]}`,
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: '#5e6678',
            font: { size: 11, family: 'DM Sans' },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
          border: { display: false },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: '#5e6678',
            font: { size: 11, family: 'DM Sans' },
            callback: (v) => `${v}°`,
          },
          border: { display: false },
        }
      }
    }
  });
}

function getThemeAccentRGB() {
  const cls = el.body.className;
  if (cls.includes('clear'))  return '251,191,36';
  if (cls.includes('rain'))   return '56,189,248';
  if (cls.includes('snow'))   return '186,230,253';
  if (cls.includes('storm'))  return '167,139,250';
  if (cls.includes('cloudy')) return '148,163,184';
  return '96,165,250';
}

// ── DAILY FORECAST ─────────────────────────────────────────────────────────
function renderDailyForecast(daily) {
  if (!daily) return;

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const allMin = Math.min(...daily.temperature_2m_min);
  const allMax = Math.max(...daily.temperature_2m_max);
  const range = allMax - allMin || 1;

  let html = '';
  for (let i = 0; i < daily.time.length && i < 7; i++) {
    const d = new Date(daily.time[i] + 'T00:00:00');
    const dayName = i === 0 ? 'Today' : days[d.getDay()];
    const isToday = i === 0;
    const wmo = getWMO(daily.weather_code[i]);
    const min = toUnit(daily.temperature_2m_min[i]);
    const max = toUnit(daily.temperature_2m_max[i]);

    // Bar position (percentage of total range)
    const leftPct = ((daily.temperature_2m_min[i] - allMin) / range) * 100;
    const rightPct = 100 - ((daily.temperature_2m_max[i] - allMin) / range) * 100;

    html += `
      <div class="daily-item${isToday ? ' fade-in' : ''}" style="animation-delay:${i * 0.05}s">
        <div class="daily-day${isToday ? ' today' : ''}">${dayName}</div>
        <div class="daily-icon">${wmo.icon}</div>
        <div class="daily-bar-wrapper">
          <span class="daily-min">${min}°</span>
          <div class="daily-bar">
            <div class="daily-bar-fill" style="left:${leftPct}%;right:${rightPct}%"></div>
          </div>
          <span class="daily-max">${max}°</span>
        </div>
        <div class="daily-temps">
          <span class="hi">${max}°</span>
          <span class="lo">${min}°</span>
        </div>
      </div>
    `;
  }
  el.daily.innerHTML = html;
}

// ── SEARCH / GEOCODING ─────────────────────────────────────────────────────
let searchTimeout = null;

el.search.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = el.search.value.trim();
  if (q.length < 2) {
    closeSearch();
    return;
  }
  searchTimeout = setTimeout(() => searchCity(q), 300);
});

el.search.addEventListener('focus', () => {
  if (el.results.children.length > 0 && !el.results.querySelector('.fav-empty')) {
    el.results.classList.add('open');
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrapper')) closeSearch();
});

async function searchCity(query) {
  try {
    const data = await fetchJSON(API.geo(query));
    if (!data.results || data.results.length === 0) {
      el.results.innerHTML = '<div class="search-result-item"><span class="result-city">No results found</span></div>';
      el.results.classList.add('open');
      return;
    }
    el.results.innerHTML = data.results.map(r => `
      <div class="search-result-item" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${r.name}" data-country="${r.country || r.country_code || ''}">
        <span class="result-city">${r.name}</span>
        <span class="result-country">${r.admin1 ? r.admin1 + ', ' : ''}${r.country || r.country_code || ''}</span>
      </div>
    `).join('');
    el.results.classList.add('open');
  } catch (err) {
    console.error('Search error:', err);
  }
}

el.results.addEventListener('click', (e) => {
  const item = e.target.closest('.search-result-item');
  if (!item || !item.dataset.lat) return;
  const { lat, lon, name, country } = item.dataset;
  el.search.value = '';
  closeSearch();
  loadWeather(parseFloat(lat), parseFloat(lon), name, country);
});

function closeSearch() {
  el.results.classList.remove('open');
}

// ── GEOLOCATION ────────────────────────────────────────────────────────────
el.geo.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  el.geo.classList.add('locating');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      el.geo.classList.remove('locating');
      const { latitude, longitude } = pos.coords;
      // Reverse geocode
      try {
        const data = await fetchJSON(
          `https://geocoding-api.open-meteo.com/v1/search?name=&count=1&language=en`
        ).catch(() => null);
        // Open-Meteo doesn't have reverse geocode, so use a simple approach
        // We'll use the coordinate-based lookup
        const name = 'My Location';
        const country = '';
        loadWeather(latitude, longitude, name, country);
      } catch {
        loadWeather(latitude, longitude, 'My Location', '');
      }
    },
    (err) => {
      el.geo.classList.remove('locating');
      console.error('Geolocation error:', err);
      // Fallback to default city
      loadWeather(14.6349, 121.0942, 'Quezon City', 'Philippines');
    },
    { timeout: 10000 }
  );
});

// ── UNIT TOGGLE ────────────────────────────────────────────────────────────
el.unitBtn.textContent = `°${state.unit}`;

el.unitBtn.addEventListener('click', () => {
  state.unit = state.unit === 'C' ? 'F' : 'C';
  el.unitBtn.textContent = `°${state.unit}`;
  localStorage.setItem('weatherUnit', state.unit);
  if (state.current) {
    loadWeather(state.current.lat, state.current.lon, state.current.name, state.current.country);
  }
});

// ── FAVORITES ──────────────────────────────────────────────────────────────
el.addFav.addEventListener('click', () => {
  if (!state.current) return;
  const { lat, lon, name, country } = state.current;
  // Check if already in favorites
  const exists = state.favorites.find(f => f.lat === lat && f.lon === lon);
  if (exists) return;
  state.favorites.push({ lat, lon, name, country });
  localStorage.setItem('weatherFavs', JSON.stringify(state.favorites));
  renderFavorites();
});

function renderFavorites() {
  if (state.favorites.length === 0) {
    el.favList.innerHTML = '<div class="fav-empty">No saved cities yet. Search for a city and click <strong>+</strong> to save it.</div>';
    return;
  }

  el.favList.innerHTML = state.favorites.map((f, i) => {
    const isActive = state.current && state.current.lat === f.lat && state.current.lon === f.lon;
    return `
      <div class="fav-item${isActive ? ' active' : ''}" data-idx="${i}">
        <span class="fav-city">${f.name}${f.country ? ', ' + f.country : ''}</span>
        <button class="fav-remove" data-remove="${i}" title="Remove">×</button>
      </div>
    `;
  }).join('');
}

el.favList.addEventListener('click', (e) => {
  // Remove button
  const removeBtn = e.target.closest('.fav-remove');
  if (removeBtn) {
    e.stopPropagation();
    const idx = parseInt(removeBtn.dataset.remove);
    state.favorites.splice(idx, 1);
    localStorage.setItem('weatherFavs', JSON.stringify(state.favorites));
    renderFavorites();
    return;
  }

  // Click on fav item
  const item = e.target.closest('.fav-item');
  if (item) {
    const idx = parseInt(item.dataset.idx);
    const f = state.favorites[idx];
    loadWeather(f.lat, f.lon, f.name, f.country);
  }
});

// ── SUN ARC ────────────────────────────────────────────────────────────────
function updateSunArc(sunriseISO, sunsetISO) {
  if (!el.sunDot) return;
  const now = new Date();
  const rise = new Date(sunriseISO);
  const set = new Date(sunsetISO);
  const dayLen = set - rise;

  if (dayLen <= 0) {
    el.sunDot.setAttribute('cx', 100);
    el.sunDot.setAttribute('cy', 50);
    return;
  }

  let progress = (now - rise) / dayLen;
  progress = Math.max(0, Math.min(1, progress));

  // Quadratic bezier: P = (1-t)^2*P0 + 2*(1-t)*t*P1 + t^2*P2
  const p0 = { x: 10, y: 100 };
  const p1 = { x: 100, y: -10 };
  const p2 = { x: 190, y: 100 };
  const t = progress;
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;

  el.sunDot.setAttribute('cx', x);
  el.sunDot.setAttribute('cy', y);
}

// ── HELPER FUNCTIONS ───────────────────────────────────────────────────────
function formatDate(d) {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function formatTime(isoStr) {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function degToCompass(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function uvLevel(uv) {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

function aqiLevel(aqi) {
  if (aqi <= 50)  return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy (Sensitive)';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function estimateVisibility(weatherCode) {
  if ([45, 48].includes(weatherCode)) return '< 1';
  if ([95, 96, 99].includes(weatherCode)) return '2-5';
  if ([65, 67, 75, 82, 86].includes(weatherCode)) return '3-6';
  if ([51, 53, 55, 61, 63, 71, 73, 80, 81, 85].includes(weatherCode)) return '5-8';
  if ([2, 3].includes(weatherCode)) return '8-12';
  return '10+';
}

// ── LOADER ─────────────────────────────────────────────────────────────────
function showLoader() {
  el.loader.classList.remove('hidden');
}
function hideLoader() {
  el.loader.classList.add('hidden');
}

// ── INITIAL LOAD ───────────────────────────────────────────────────────────
(function init() {
  renderFavorites();

  // Try geolocation first, fallback to Quezon City (user's location)
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        loadWeather(pos.coords.latitude, pos.coords.longitude, 'My Location', '');
      },
      () => {
        // Fallback: Quezon City, Philippines
        loadWeather(14.6349, 121.0942, 'Quezon City', 'Philippines');
      },
      { timeout: 5000 }
    );
  } else {
    loadWeather(14.6349, 121.0942, 'Quezon City', 'Philippines');
  }
})();
