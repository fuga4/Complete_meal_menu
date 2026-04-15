const CATEGORY_MAP = { 1: "主食", 2: "主菜", 3: "副菜", 4: "汁物", 5: "デザート" };

let currentUser = 'boy';   
let currentMeal = 'morning'; 
let currentTheme = 'minimal'; 
let menuData = { morning: {}, dinner: {} }; 
let nutritionMap = {}; 
let currentFirebaseData = { checks: {}, otherFinish: '', otherLeft: '' }; 
let myChart = null;
let weatherAnimInterval = null;
let weatherCode = null; 

let touchStartX = 0;
let touchStartY = 0;

const DAY_SWITCH_HOUR = 4;

// グローバル関数として公開
window.initApp = function() {
  const lastUser = localStorage.getItem('fc_last_user');
  if(lastUser) currentUser = lastUser;

  const lastTheme = localStorage.getItem('fc_theme');
  if(lastTheme) {
      if (['minimal', 'glass', 'clay'].includes(lastTheme)) {
          switchTheme(lastTheme);
      } else {
          switchTheme('minimal');
      }
  }

  const currentHour = new Date().getHours();
  if (currentHour >= 4 && currentHour < 14) {
      currentMeal = 'morning';
  } else {
      currentMeal = 'dinner';
  }

  updateTheme(); 
  updateTicker(); // ★追加：火曜日メッセージの判定

  loadMenuCsv().then(() => {
    initChart();
    setupRealtimeListener(); 
    getWeather(); 
    initCalc();
    setupSwipeListener(); 
  });
}

// ★追加：火曜日のメッセージ表示判定
function updateTicker() {
    const ticker = document.getElementById('ticker-container');
    if (!ticker) return;

    const now = new Date();
    // 4時を日付の切り替わりとする
    if (now.getHours() < DAY_SWITCH_HOUR) {
        now.setDate(now.getDate() - 1);
    }
    
    // getDay() は 0(日)〜6(土)。2 は火曜日。
    if (now.getDay() === 2) {
        ticker.style.display = 'block';
    } else {
        ticker.style.display = 'none';
    }
}

// テーマ切り替え
window.switchTheme = function(themeName) {
    currentTheme = themeName;
    localStorage.setItem('fc_theme', themeName);
    
    document.body.setAttribute('data-theme', themeName);
    
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`theme-btn-${themeName}`);
    if(activeBtn) activeBtn.classList.add('active');

    if (weatherCode !== null) {
        applyWeatherEffect(weatherCode);
    }
    
    if(myChart) updateChartAndScore();
}

function setupSwipeListener() {
  document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
  }, { passive: true });
}

function handleSwipe(startX, startY, endX, endY) {
    const diffX = endX - startX;
    const diffY = endY - startY;
    const threshold = 50; 

    if (Math.abs(diffY) > Math.abs(diffX)) return;

    if (Math.abs(diffX) > threshold) {
        if (diffX > 0) {
            if (currentUser === 'girl') switchUser('boy');
        } else {
            if (currentUser === 'boy') switchUser('girl');
        }
    }
}

function initCalc() {
    const tbody = document.getElementById('calc-body');
    tbody.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const row = document.createElement('tr');
        row.className = 'calc-row';
        row.innerHTML = `
            <td><input type="number" class="calc-input qty" placeholder="0" oninput="updateCalc()"></td>
            <td><input type="number" class="calc-input price" placeholder="0" oninput="updateCalc()"></td>
            <td class="calc-result">-</td>
        `;
        tbody.appendChild(row);
    }
}

window.updateCalc = function() {
    const rows = document.querySelectorAll('.calc-row');
    let minUnit = Infinity;
    let validRows = [];

    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.qty').value);
        const price = parseFloat(row.querySelector('.price').value);
        const resEl = row.querySelector('.calc-result');
        
        row.classList.remove('is-cheapest'); 

        if (qty > 0 && price > 0) {
            const unitPrice = price / qty;
            resEl.textContent = unitPrice.toFixed(2);
            validRows.push({ row, unitPrice });
            if (unitPrice < minUnit) minUnit = unitPrice;
        } else {
            resEl.textContent = '-';
        }
    });

    if (validRows.length >= 2) {
        validRows.forEach(item => {
            if (item.unitPrice === minUnit) {
                item.row.classList.add('is-cheapest');
                item.row.querySelector('.calc-result').innerHTML = 
                    `<span class="material-symbols-rounded" style="font-size:1rem; vertical-align:text-bottom; color:var(--color-danger);">trophy</span> ${item.unitPrice.toFixed(2)}`;
            }
        });
    }
};

window.clearCalc = function() {
    const inputs = document.querySelectorAll('.calc-input');
    inputs.forEach(input => input.value = '');
    window.updateCalc();
};

async function getWeather() {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=35.6995&longitude=139.6355&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo";
    
    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.daily) throw new Error("No data");

    const currentHour = new Date().getHours();
    const isPm = currentHour >= 12;
    
    const targetIndex = isPm ? 1 : 0;
    const targetLabel = isPm ? "明日" : "今日";

    const daily = data.daily;
    weatherCode = daily.weathercode[targetIndex]; 
    const weatherText = getWmoWeatherText(weatherCode);
    const weatherIcon = getWmoWeatherIconName(weatherCode);
    const maxTemp = daily.temperature_2m_max[targetIndex];
    const minTemp = daily.temperature_2m_min[targetIndex];
    const pop = daily.precipitation_probability_max[targetIndex];

    document.getElementById('weather-date-label').textContent = targetLabel + "：";
    document.getElementById('weather-text').textContent = weatherText;
    document.getElementById('weather-icon').textContent = weatherIcon;
    document.getElementById('weather-pop').textContent = (pop !== null) ? pop : "--";
    document.getElementById('temp-min').textContent = (minTemp !== null) ? Math.round(minTemp) : "--";
    document.getElementById('temp-max').textContent = (maxTemp !== null) ? Math.round(maxTemp) : "--";
    
    document.getElementById('weather-bar').style.display = 'flex';

    applyWeatherEffect(weatherCode);
    updateWeatherBadge(weatherCode, maxTemp); 

  } catch (e) {
    console.log("Weather error: ", e);
  }
}

function applyWeatherEffect(code) {
    const body = document.body;
    const container = document.getElementById('weather-animation-container');
    
    body.classList.remove('weather-sunny', 'weather-cloudy');
    clearWeatherAnimation();

    if (currentTheme !== 'glass') {
      if (code === 0 || code === 1) { 
          body.classList.add('weather-sunny');
      } else if (code <= 3 || code === 45 || code === 48) { 
          body.classList.add('weather-cloudy');
      }
    }

    if ([71, 73, 75, 77, 85, 86].includes(code)) { 
        startSnowAnimation(container);
    } else if (code > 3) { 
        startRainAnimation(container);
    }
}

function updateWeatherBadge(code, maxTemp) {
    const badge = document.getElementById('weather-sticky-badge');
    const icon = document.getElementById('badge-icon');
    const temp = document.getElementById('badge-temp');
    
    badge.className = 'weather-badge'; 
    badge.style.display = 'flex'; 

    let iconName = 'help';
    let styleClass = '';

    if (code === 0 || code === 1) { 
        iconName = 'sunny'; styleClass = 'badge-sunny';
    } else if (code <= 3 || code === 45 || code === 48) { 
        iconName = 'cloud'; styleClass = 'badge-cloudy';
    } else if ([71, 73, 75, 77, 85, 86].includes(code)) {
        iconName = 'ac_unit'; styleClass = 'badge-snow';
    } else if (code >= 95) {
        iconName = 'thunderstorm'; styleClass = 'badge-rainy';
    } else {
        iconName = 'rainy'; styleClass = 'badge-rainy';
    }

    badge.classList.add(styleClass);
    icon.textContent = iconName;
    temp.textContent = (maxTemp !== null) ? `${Math.round(maxTemp)}℃` : '--';
}

function clearWeatherAnimation() {
    if (weatherAnimInterval) {
        clearInterval(weatherAnimInterval);
        weatherAnimInterval = null;
    }
    document.getElementById('weather-animation-container').innerHTML = '';
}

function startRainAnimation(container) {
    weatherAnimInterval = setInterval(() => {
        const drop = document.createElement('div');
        drop.classList.add('rain-drop');
        drop.style.left = Math.random() * 100 + 'vw';
        drop.style.animationDuration = (Math.random() * 0.5 + 0.5) + 's';
        container.appendChild(drop);
        setTimeout(() => { drop.remove(); }, 1000);
    }, 50);
}

function startSnowAnimation(container) {
    weatherAnimInterval = setInterval(() => {
        const flake = document.createElement('div');
        flake.classList.add('snow-flake');
        flake.style.left = Math.random() * 100 + 'vw';
        flake.style.opacity = Math.random();
        flake.style.animationDuration = (Math.random() * 3 + 2) + 's';
        container.appendChild(flake);
        setTimeout(() => { flake.remove(); }, 5000);
    }, 200);
}

function getWmoWeatherIconName(code) {
  if (code === 0) return "sunny";
  if ([1, 2, 3].includes(code)) return "partly_cloudy_day";
  if ([45, 48].includes(code)) return "foggy";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rainy";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "ac_unit";
  if (code >= 95) return "thunderstorm";
  return "cloud";
}

function getWmoWeatherText(code) {
  if (code === 0) return "晴天";
  if ([1, 2, 3].includes(code)) return "くもり"; 
  if ([45, 48].includes(code)) return "霧";
  if ([51, 53, 55].includes(code)) return "霧雨";
  if ([61, 63, 65].includes(code)) return "雨";
  if ([71, 73, 75, 77].includes(code)) return "雪";
  if ([80, 81, 82].includes(code)) return "にわか雨";
  if ([85, 86].includes(code)) return "雪";
  if (code >= 95) return "雷雨";
  return "--";
}

function setupRealtimeListener() {
  const dataPath = `users/${currentUser}/${currentMeal}`;
  const dataRef = window.ref(window.db, dataPath);

  window.onValue(dataRef, (snapshot) => {
    const val = snapshot.val();
    if (val) {
      currentFirebaseData = val;
    } else {
      currentFirebaseData = { checks: {}, otherFinish: '', otherLeft: '' };
    }
    updateStatusIndicator(currentFirebaseData);
    renderPage(); 
    updateChartAndScore(); 
  });
}

function getLogicalDate() {
    const now = new Date();
    if (now.getHours() < DAY_SWITCH_HOUR) {
        now.setDate(now.getDate() - 1);
    }
    const y = now.getFullYear();
    const m = ('0' + (now.getMonth() + 1)).slice(-2);
    const d = ('0' + now.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
}

function getCurrentTimeStr() {
    const now = new Date();
    const h = ('0' + now.getHours()).slice(-2);
    const m = ('0' + now.getMinutes()).slice(-2);
    return `${h}:${m}`;
}

function updateStatusIndicator(data) {
    const statusBar = document.getElementById('status-bar');
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    const container = document.getElementById('list-container');

    const todayLogical = getLogicalDate();
    const lastUpdatedDate = data ? data.lastUpdatedDate : null;
    const lastUpdatedTime = data ? data.lastUpdatedTime : null;

    statusBar.classList.remove('is-today', 'is-old');
    container.classList.remove('data-old');

    if (lastUpdatedDate === todayLogical) {
        statusBar.classList.add('is-today');
        statusIcon.textContent = 'check_circle';
        const timeStr = lastUpdatedTime ? ` (${lastUpdatedTime} 更新)` : '';
        statusText.textContent = `今日の記録${timeStr}`;
    } else {
        statusBar.classList.add('is-old');
        statusIcon.textContent = 'error'; 
        
        let dateMsg = "未入力";
        if(lastUpdatedDate) {
            const parts = lastUpdatedDate.split('-');
            if(parts.length === 3) dateMsg = `データは ${parseInt(parts[1])}/${parseInt(parts[2])} のもの`;
        }
        
        statusText.textContent = dateMsg;
        container.classList.add('data-old');
    }
}

async function loadMenuCsv() {
  try {
    const response = await fetch('menu.csv?' + new Date().getTime());
    if (!response.ok) throw new Error("CSV error");
    const text = await response.text();
    parseCsv(text);
  } catch (e) {
    document.getElementById('list-container').innerHTML = `<div style="text-align:center; margin-top:20px; color:var(--text-sub);">menu.csv読込エラー</div>`;
  }
}

function parseCsv(text) {
  const lines = text.split(/\r\n|\n/);
  menuData = { morning: {}, dinner: {} };
  nutritionMap = {};
  
  Object.values(CATEGORY_MAP).forEach(cat => { menuData.morning[cat] = []; menuData.dinner[cat] = []; });
  
  lines.forEach(line => {
    const parts = line.split(',');
    if (parts.length < 6) return;
    const [m, c, item, y, r, g, sub, icon, color] = parts; 
    const catName = CATEGORY_MAP[c.trim()];
    
    if (!catName) return;
    const itemName = item.trim();
    const subCat = sub ? sub.trim() : ''; 
    const iconName = icon ? icon.trim() : '';
    const colorCode = color ? color.trim() : '';

    const dataObj = { name: itemName, sub: subCat, icon: iconName, color: colorCode };

    if (m.trim() === '1') menuData.morning[catName].push(dataObj);
    else if (m.trim() === '2') menuData.dinner[catName].push(dataObj);

    nutritionMap[itemName] = {
      yellow: parseInt(y) || 0,
      red: parseInt(r) || 0,
      green: parseInt(g) || 0
    };
  });
}

function isFavorite(itemName) {
    try {
        const favs = JSON.parse(localStorage.getItem('fc_favorites') || '[]');
        return favs.includes(itemName);
    } catch(e) {
        return false;
    }
}

window.toggleFavorite = function(itemName) {
    window.saveData();
    let favs = [];
    try {
        favs = JSON.parse(localStorage.getItem('fc_favorites') || '[]');
    } catch(e) {
        favs = [];
    }
    if (favs.includes(itemName)) {
        favs = favs.filter(name => name !== itemName);
    } else {
        favs.push(itemName);
    }
    localStorage.setItem('fc_favorites', JSON.stringify(favs));
    renderPage();
}

function renderPage() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${currentMeal}`).classList.add('active');
  
  const partnerBtn = document.getElementById('btn-partner-copy');
  partnerBtn.innerHTML = `<span class="material-symbols-rounded">content_copy</span> コピー`;

  const container = document.getElementById('list-container');
  container.innerHTML = '';
  
  const savedData = currentFirebaseData;
  const checks = savedData.checks || {};

  Object.values(CATEGORY_MAP).forEach(catName => {
    const items = menuData[currentMeal][catName];
    if (!items || items.length === 0) return;

    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = catName;
    container.appendChild(title);

    const card = document.createElement('div');
    card.className = 'list-card';

    const favItems = items.filter(i => isFavorite(i.name));
    if (favItems.length > 0) {
        favItems.forEach(itemObj => {
            card.appendChild(createItemRow(itemObj, checks));
        });
        if (favItems.length < items.length) {
            const separator = document.createElement('div');
            separator.style.borderBottom = '2px dotted var(--border-color)';
            separator.style.opacity = '0.5';
            card.appendChild(separator);
        }
    }

    const noSubItems = items.filter(i => !i.sub && !isFavorite(i.name));
    noSubItems.forEach(itemObj => {
        card.appendChild(createItemRow(itemObj, checks));
    });

    let subCategories = [...new Set(items.filter(i => i.sub && !isFavorite(i.name)).map(i => i.sub))];
    const ORDER_LIST = ["豆・卵・乳", "芋・栗・南瓜", "おかず・粉もの", "野菜・きのこ"];
    subCategories.sort((a, b) => {
        let idxA = ORDER_LIST.indexOf(a);
        let idxB = ORDER_LIST.indexOf(b);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });
    
    subCategories.forEach(subName => {
        const subHeader = document.createElement('div');
        subHeader.className = 'subcategory-title';
        subHeader.textContent = subName;
        card.appendChild(subHeader);

        const subItems = items.filter(i => i.sub === subName && !isFavorite(i.name));
        subItems.forEach(itemObj => {
            card.appendChild(createItemRow(itemObj, checks));
        });
    });

    container.appendChild(card);
  });

  const ofInput = document.getElementById('other-finish');
  const olInput = document.getElementById('other-left');
  if (document.activeElement !== ofInput) ofInput.value = savedData.otherFinish || '';
  if (document.activeElement !== olInput) olInput.value = savedData.otherLeft || '';
}

function createItemRow(itemObj, checks) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const itemName = itemObj.name;
    const savedVal = checks[itemName] || 'none';
    const radioName = `radio_${itemName}`;

    let iconHtml = '';
    if(itemObj.icon && itemObj.color) {
        iconHtml = `<span class="material-symbols-rounded menu-icon-disp" style="color:${itemObj.color};">${itemObj.icon}</span>`;
    }

    const isFav = isFavorite(itemName);
    const favClass = isFav ? 'fav-active' : '';

    row.innerHTML = `
      <div class="item-name">
        <span class="material-symbols-rounded fav-btn ${favClass}" onclick="toggleFavorite('${itemName}')">star</span>
        ${iconHtml}
        <span>${itemName}</span>
      </div>
      <div class="options">
        <label><input type="radio" name="${radioName}" value="finish" 
          ${savedVal === 'finish' ? 'checked' : ''} onchange="saveData()">
          <span class="radio-label">完食</span></label>
        <label><input type="radio" name="${radioName}" value="left" 
          ${savedVal === 'left' ? 'checked' : ''} onchange="saveData()">
          <span class="radio-label">残し</span></label>
        <label><input type="radio" name="${radioName}" value="none" 
          ${savedVal === 'none' ? 'checked' : ''} onchange="saveData()">
          <span class="radio-label">―</span></label>
      </div>
    `;
    return row;
}

function initChart() {
  const ctx = document.getElementById('nutritionChart').getContext('2d');
  myChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['エネルギー', 'からだ作り', '調子を整える'],
      datasets: [{
        label: '摂取バランス',
        data: [0, 0, 0],
        backgroundColor: 'rgba(0, 122, 255, 0.2)',
        borderColor: 'rgba(0, 122, 255, 1)',
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: ['#FF9500', '#FF3B30', '#34C759'],
        pointBorderColor: '#fff',
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 5 },
      scales: {
        r: {
          angleLines: { display: true, color: '#E5E5EA' },
          suggestedMin: 0,
          suggestedMax: 8,
          pointLabels: {
            font: { size: 13, weight: '600' },
            color: '#8E8E93' 
          },
          ticks: { display: false, stepSize: 2 },
          grid: { color: '#E5E5EA' } 
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function updateChartAndScore() {
  if (!myChart) return;
  let totalY = 0, totalR = 0, totalG = 0;
  const checks = currentFirebaseData.checks || {};
  Object.keys(checks).forEach(item => {
    if (checks[item] === 'finish' && nutritionMap[item]) {
      totalY += nutritionMap[item].yellow;
      totalR += nutritionMap[item].red;
      totalG += nutritionMap[item].green;
    }
  });
  myChart.data.datasets[0].data = [totalY, totalR, totalG];
  const rootStyles = getComputedStyle(document.documentElement);
  const accentColorHex = currentUser === 'boy' 
     ? rootStyles.getPropertyValue('--color-boy').trim()
     : rootStyles.getPropertyValue('--color-girl').trim();
  let r=0, g=0, b=0;
  if(accentColorHex.startsWith('#')) {
      const hex = accentColorHex.slice(1);
      r = parseInt(hex.substring(0,2), 16);
      g = parseInt(hex.substring(2,4), 16);
      b = parseInt(hex.substring(4,6), 16);
  }
  myChart.data.datasets[0].backgroundColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
  myChart.data.datasets[0].borderColor = `rgba(${r}, ${g}, ${b}, 1)`;
  const isDark = currentTheme === 'glass' && window.matchMedia('(prefers-color-scheme: dark)').matches; 
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E5EA';
  const labelColor = isDark ? 'rgba(255,255,255,0.6)' : '#8E8E93';
  myChart.options.scales.r.grid.color = gridColor;
  myChart.options.scales.r.angleLines.color = gridColor;
  myChart.options.scales.r.pointLabels.color = labelColor;
  myChart.update();
  const totalScore = totalY + totalR + totalG;
  const scoreTextEl = document.getElementById('score-text');
  const commentEl = document.getElementById('score-comment');
  scoreTextEl.innerHTML = `${totalScore} <span style="font-size:1.2rem;">pt</span>`;
  let comment = "";
  if (totalScore === 0) comment = "何を食べるかな？";
  else if (totalScore < 5) comment = `もう少し食べよう！<span class="material-symbols-rounded" style="vertical-align: text-bottom;">rice_bowl</span>`;
  else if (totalScore < 10) comment = `良い調子！その調子<span class="material-symbols-rounded" style="vertical-align: text-bottom;">thumb_up</span>`;
  else if (totalScore < 15) comment = `ナイスバランス！素晴らしい<span class="material-symbols-rounded" style="vertical-align: text-bottom;">auto_awesome</span>`;
  else comment = `エネルギー満タン！元気100倍<span class="material-symbols-rounded" style="vertical-align: text-bottom;">fitness_center</span>`;
  commentEl.innerHTML = comment;
}

window.switchUser = function(user) {
  currentUser = user;
  localStorage.setItem('fc_last_user', user);
  updateTheme();
  setupRealtimeListener(); 
}

window.switchMeal = function(meal) {
  currentMeal = meal;
  setupRealtimeListener(); 
}

function updateTheme() {
  document.body.setAttribute('data-user', currentUser);
  if(myChart) updateChartAndScore(); 
}

window.saveData = function() {
  const data = {
    checks: {},
    otherFinish: document.getElementById('other-finish').value,
    otherLeft: document.getElementById('other-left').value
  };
  const inputs = document.querySelectorAll('input[type="radio"]:checked');
  inputs.forEach(input => {
    const itemName = input.name.replace('radio_', '');
    data.checks[itemName] = input.value;
  });
  data.lastUpdatedDate = getLogicalDate();
  data.lastUpdatedTime = getCurrentTimeStr();
  const dataPath = `users/${currentUser}/${currentMeal}`;
  window.set(window.ref(window.db, dataPath), data);
}

window.showResetModal = function() {
  document.getElementById('reset-modal').style.display = 'flex';
}
window.closeModal = function() {
  document.getElementById('reset-modal').style.display = 'none';
}

window.showNutritionHelp = function() {
  document.getElementById('nutrition-modal').style.display = 'flex';
}
window.closeNutritionModal = function() {
  document.getElementById('nutrition-modal').style.display = 'none';
}

window.resetCurrent = function() {
  closeModal();
  const userName = currentUser === 'boy' ? '男の子' : '女の子';
  const mealName = currentMeal === 'morning' ? '朝食' : '夕食';
  if(!confirm(`「${userName}」の「${mealName}」のみリセットしますか？`)) return;
  const dataPath = `users/${currentUser}/${currentMeal}`;
  window.set(window.ref(window.db, dataPath), null);
}

window.resetAll = function() {
  closeModal();
  if(!confirm("【注意】\n全員の全てのデータを消去しますか？\nこの操作は取り消せません。")) return;
  window.set(window.ref(window.db, `users`), null);
}

function ensureToastElement() {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    return toast;
}

function showToast(message) {
  const toast = ensureToastElement();
  toast.textContent = message;
  toast.className = 'toast show';
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

window.copyToPartner = function() {
  const targetUser = currentUser === 'boy' ? 'girl' : 'boy';
  const targetName = currentUser === 'boy' ? '女の子' : '男の子';
  const sourcePath = `users/${currentUser}/${currentMeal}`;
  const targetPath = `users/${targetUser}/${currentMeal}`;
  window.get(window.ref(window.db, sourcePath)).then((snapshot) => {
    if (snapshot.exists()) {
      window.set(window.ref(window.db, targetPath), snapshot.val());
      showToast(`${targetName}へコピーしました！`);
    } else {
      showToast("データがありません");
    }
  });
}

window.generateAndCopy = function(shouldLaunch) {
  const ICON_FINISH = "⭕️";
  const ICON_LEFT   = "🔺"; 
  const savedData = currentFirebaseData;
  const checks = savedData.checks || {};
  let resultLines = [];
  Object.keys(CATEGORY_MAP).forEach(key => {
      const catName = CATEGORY_MAP[key];
      const items = menuData[currentMeal][catName];
      if (!items) return;
      items.forEach(itemObj => {
          const itemName = itemObj.name;
          const val = checks[itemName];
          if (val === 'finish') resultLines.push(`【${catName}】${ICON_FINISH}${itemName}`);
          else if (val === 'left') resultLines.push(`【${catName}】${ICON_LEFT}${itemName}`);
      });
  });
  const otherF = savedData.otherFinish, otherL = savedData.otherLeft;
  if(otherF) resultLines.push(`【その他】${ICON_FINISH}${otherF}`);
  if(otherL) resultLines.push(`【その他】${ICON_LEFT}${otherL}`);
  if(resultLines.length === 0) { showToast("選択項目がありません"); return; }
  let resultText = resultLines.join("\n");
  if (navigator.clipboard) {
      navigator.clipboard.writeText(resultText).then(() => {
          showToast("コピーしました！");
          if (shouldLaunch) setTimeout(() => { window.open('https://parents.codmon.com/contact', '_blank'); }, 800);
      });
  } else {
      const ta = document.createElement('textarea');
      ta.value = resultText; document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); showToast("コピーしました！");
      if (shouldLaunch) setTimeout(() => { window.open('https://parents.codmon.com/contact', '_blank'); }, 800);
  }
}
