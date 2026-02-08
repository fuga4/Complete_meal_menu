const CATEGORY_MAP = { 1: "主食", 2: "主菜", 3: "副菜", 4: "汁物", 5: "デザート" };

let currentUser = 'boy';   
let currentMeal = 'morning'; 
let currentTheme = 'minimal'; 
let menuData = { morning: {}, dinner: {} }; 
let nutritionMap = {}; 
// 初期値
let currentFirebaseData = { checks: {}, otherFinish: '', otherLeft: '' }; 
let historyData = {}; 

let myChart = null;
let weatherAnimInterval = null;
let weatherCode = null; 

let touchStartX = 0;
let touchStartY = 0;

// リスナー解除用の変数
let unsubscribeData = null;
let unsubscribeHistory = null;

const DAY_SWITCH_HOUR = 4;

// グローバル関数として公開
window.initApp = function() {
  console.log("App initializing...");

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
  
  // CSV読み込み後に描画。
  loadMenuCsv().finally(() => {
    renderPage();
    initChart();
    initCalc();
    getWeather(); 
    setupSwipeListener(); 
    
    if (window.db) {
        setupRealtimeListener();
    } else {
        console.error("Firebase DB not ready.");
    }
  });
}

// テーマ切り替え
window.switchTheme = function(themeName) {
    currentTheme = themeName;
    localStorage.setItem('fc_theme', themeName);
    document.body.setAttribute('data-theme', themeName);
    
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`theme-btn-${themeName}`);
    if(activeBtn) activeBtn.classList.add('active');

    if (weatherCode !== null) applyWeatherEffect(weatherCode);
    if(myChart) updateChartAndScore();
}

// --- イベントリスナー ---
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
    if (Math.abs(diffY) > Math.abs(diffX)) return;
    if (Math.abs(diffX) > 50) {
        if (diffX > 0) {
            if (currentUser === 'girl') switchUser('boy');
        } else {
            if (currentUser === 'boy') switchUser('girl');
        }
    }
}

// --- 計算機 ---
function initCalc() {
    const tbody = document.getElementById('calc-body');
    if(!tbody) return;
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

// --- 天気 ---
async function getWeather() {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=35.6995&longitude=139.6355&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo";
    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.daily) return;

    const currentHour = new Date().getHours();
    const isPm = currentHour >= 12;
    const targetIndex = isPm ? 1 : 0;
    const targetLabel = isPm ? "明日" : "今日";

    const daily = data.daily;
    weatherCode = daily.weathercode[targetIndex]; 
    const maxTemp = daily.temperature_2m_max[targetIndex];
    const minTemp = daily.temperature_2m_min[targetIndex];
    const pop = daily.precipitation_probability_max[targetIndex];

    document.getElementById('weather-date-label').textContent = targetLabel + "：";
    document.getElementById('weather-text').textContent = getWmoWeatherText(weatherCode);
    document.getElementById('weather-icon').textContent = getWmoWeatherIconName(weatherCode);
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
      if (code === 0 || code === 1) body.classList.add('weather-sunny');
      else if (code <= 3 || code === 45 || code === 48) body.classList.add('weather-cloudy');
    }

    if ([71, 73, 75, 77, 85, 86].includes(code)) startSnowAnimation(container);
    else if (code > 3) startRainAnimation(container);
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
    const c = document.getElementById('weather-animation-container');
    if(c) c.innerHTML = '';
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

// --- Firebase リスナー ---
function setupRealtimeListener() {
  if (!window.db || !window.ref || !window.onValue) {
      console.error("Firebase not initialized.");
      return;
  }

  // ★重要：既存のリスナーがあれば解除
  if (unsubscribeData) {
      unsubscribeData(); 
      unsubscribeData = null;
  }
  if (unsubscribeHistory) {
      unsubscribeHistory();
      unsubscribeHistory = null;
  }

  // ★重要：データ混在を防ぐため、一旦メモリ上のデータをリセット
  currentFirebaseData = { checks: {}, otherFinish: '', otherLeft: '' };
  historyData = {};
  renderPage(); // クリア状態で描画

  // 1. 履歴データのリスナー
  const historyPath = `history/${currentUser}`;
  const historyRef = window.ref(window.db, historyPath);
  unsubscribeHistory = window.onValue(historyRef, (snapshot) => {
      historyData = snapshot.val() || {};
      renderPage(); // 履歴更新時も再描画
  });

  // 2. 当日の食事データのリスナー
  const dataPath = `users/${currentUser}/${currentMeal}`;
  const dataRef = window.ref(window.db, dataPath);
  unsubscribeData = window.onValue(dataRef, (snapshot) => {
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

// --- 日付ロジック ---
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
    if(!statusBar) return; 

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

// --- CSV読み込み ---
async function loadMenuCsv() {
  try {
    const response = await fetch('menu.csv?' + new Date().getTime());
    if (!response.ok) throw new Error("CSV error");
    const text = await response.text();
    parseCsv(text);
  } catch (e) {
    const c = document.getElementById('list-container');
    if(c) c.innerHTML = `<div style="text-align:center; margin-top:20px; color:var(--text-sub);">メニュー読込エラー</div>`;
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

// --- 画面描画 ---
function renderPage() {
  const container = document.getElementById('list-container');
  if(!container) return; 

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const activeTab = document.getElementById(`tab-${currentMeal}`);
  if(activeTab) activeTab.classList.add('active');
  
  const partnerBtn = document.getElementById('btn-partner-copy');
  if(partnerBtn) partnerBtn.innerHTML = `<span class="material-symbols-rounded">content_copy</span> コピー`;

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

    // サブカテゴリ無し
    const noSubItems = items.filter(i => !i.sub);
    noSubItems.forEach(itemObj => {
        card.appendChild(createItemRow(itemObj, checks));
    });

    // サブカテゴリ有り
    let subCategories = [...new Set(items.filter(i => i.sub).map(i => i.sub))];
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

        const subItems = items.filter(i => i.sub === subName);
        subItems.forEach(itemObj => {
            card.appendChild(createItemRow(itemObj, checks));
        });
    });

    container.appendChild(card);
  });

  const ofInput = document.getElementById('other-finish');
  const olInput = document.getElementById('other-left');
  if (ofInput && document.activeElement !== ofInput) ofInput.value = savedData.otherFinish || '';
  if (olInput && document.activeElement !== olInput) olInput.value = savedData.otherLeft || '';
}

// 週カレンダー生成
function getWeekDates() {
    const now = new Date();
    if (now.getHours() < DAY_SWITCH_HOUR) {
        now.setDate(now.getDate() - 1);
    }
    const currentDay = now.getDay();
    const dates = [];
    
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - currentDay);

    for (let i = 0; i < 7; i++) {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + i);
        const y = d.getFullYear();
        const m = ('0' + (d.getMonth() + 1)).slice(-2);
        const day = ('0' + d.getDate()).slice(-2);
        dates.push({
            dateStr: `${y}-${m}-${day}`,
            label: ['日','月','火','水','木','金','土'][i],
            isToday: i === currentDay
        });
    }
    return dates;
}

function createItemRow(itemObj, checks) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const itemName = itemObj.name;
    const savedVal = checks[itemName] || 'none';
    
    // ★変更：ラジオボタンのname属性にユーザーIDを含めてユニークにする
    const radioName = `radio_${currentUser}_${itemName}`;

    let iconHtml = '';
    if(itemObj.icon && itemObj.color) {
        iconHtml = `<span class="material-symbols-rounded menu-icon-disp" style="color:${itemObj.color};">${itemObj.icon}</span>`;
    }

    const weekDates = getWeekDates();
    let historyHtml = '<div class="history-week">';
    const itemHistory = (historyData[itemName] || {});

    weekDates.forEach(d => {
        const isAte = itemHistory[d.dateStr] === true;
        const ateClass = isAte ? 'ate' : '';
        const todayClass = d.isToday ? 'today' : '';
        historyHtml += `<span class="history-day ${ateClass} ${todayClass}">${d.label}</span>`;
    });
    historyHtml += '</div>';

    row.innerHTML = `
      <div class="item-name">
        <div class="item-name-top">
          ${iconHtml}
          <span>${itemName}</span>
        </div>
        ${historyHtml}
      </div>
      <div class="options">
        <label><input type="radio" name="${radioName}" value="finish" 
          ${savedVal === 'finish' ? 'checked' : ''} onchange="saveData(this, '${itemName}')">
          <span class="radio-label">完食</span></label>
        <label><input type="radio" name="${radioName}" value="left" 
          ${savedVal === 'left' ? 'checked' : ''} onchange="saveData(this, '${itemName}')">
          <span class="radio-label">残し</span></label>
        <label><input type="radio" name="${radioName}" value="none" 
          ${savedVal === 'none' ? 'checked' : ''} onchange="saveData(this, '${itemName}')">
          <span class="radio-label">―</span></label>
      </div>
    `;
    return row;
}

// --- グラフ ---
function initChart() {
  const canvas = document.getElementById('nutritionChart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  
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

  let totalY = 0;
  let totalR = 0;
  let totalG = 0;

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

  const scoreTextEl = document.getElementById('score-text');
  const commentEl = document.getElementById('score-comment');
  if(scoreTextEl) scoreTextEl.innerHTML = `${totalScore} <span style="font-size:1.2rem;">pt</span>`;

  let comment = "";
  if (totalScore === 0) {
      comment = "何を食べるかな？";
  } else if (totalScore < 5) {
      comment = `もう少し食べよう！<span class="material-symbols-rounded" style="vertical-align: text-bottom;">rice_bowl</span>`;
  } else if (totalScore < 10) {
      comment = `良い調子！その調子<span class="material-symbols-rounded" style="vertical-align: text-bottom;">thumb_up</span>`;
  } else if (totalScore < 15) {
      comment = `ナイスバランス！素晴らしい<span class="material-symbols-rounded" style="vertical-align: text-bottom;">auto_awesome</span>`;
  } else {
      comment = `エネルギー満タン！元気100倍<span class="material-symbols-rounded" style="vertical-align: text-bottom;">fitness_center</span>`;
  }
  if(commentEl) commentEl.innerHTML = comment;
}

// --- ユーザー操作系 ---
window.switchUser = function(user) {
  currentUser = user;
  localStorage.setItem('fc_last_user', user);
  updateTheme();
  
  if (window.db) {
      setupRealtimeListener();
  }
}

window.switchMeal = function(meal) {
  currentMeal = meal;
  if (window.db) {
      setupRealtimeListener();
  }
}

function updateTheme() {
  document.body.setAttribute('data-user', currentUser);
  if(myChart) updateChartAndScore(); 
}

// ★変更：引数でitemNameも受け取るようにして確実に処理
window.saveData = function(targetInput, itemName) {
  const data = {
    checks: {},
    otherFinish: document.getElementById('other-finish').value,
    otherLeft: document.getElementById('other-left').value
  };

  const inputs = document.querySelectorAll('input[type="radio"]:checked');
  inputs.forEach(input => {
    // 識別子を除去して純粋なアイテム名を取得するロジックは使わず、
    // radioNameの構造に依存しないようにname属性から解析するか、
    // あるいは単純に保持しているchecksデータを作る
    // ここでは単純に全ての checked radio を走査するが、
    // 他のユーザーのradioは存在しない(再描画されている)はずなので大丈夫。
    //念のため name 属性から パースする
    // name="radio_boy_パン" -> split('_') -> [radio, boy, パン...]
    
    const parts = input.name.split('_');
    // parts[0] is 'radio', parts[1] is user, parts[2...] is item name
    if(parts.length >= 3 && parts[1] === currentUser) {
        const name = parts.slice(2).join('_');
        data.checks[name] = input.value;
    }
  });

  data.lastUpdatedDate = getLogicalDate();
  data.lastUpdatedTime = getCurrentTimeStr();

  const dataPath = `users/${currentUser}/${currentMeal}`;
  window.set(window.ref(window.db, dataPath), data);

  // 履歴更新
  if (targetInput && itemName) {
      const changedValue = targetInput.value;
      const todayDate = getLogicalDate();
      
      const historyPath = `history/${currentUser}/${itemName}/${todayDate}`;
      const historyRef = window.ref(window.db, historyPath);

      if (changedValue === 'finish') {
          window.set(historyRef, true);
      } else {
          window.set(historyRef, null);
      }
  }
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
  const dataPath = `users`;
  window.set(window.ref(window.db, dataPath), null);
}

// トースト通知
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
  
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

window.copyToPartner = function() {
  const targetUser = currentUser === 'boy' ? 'girl' : 'boy';
  const targetName = currentUser === 'boy' ? '女の子' : '男の子';
  const mealName = currentMeal === 'morning' ? '朝食' : '夕食';
  
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
          if (val === 'finish') {
              resultLines.push(`【${catName}】${ICON_FINISH}${itemName}`);
          } else if (val === 'left') {
              resultLines.push(`【${catName}】${ICON_LEFT}${itemName}`);
          }
      });
  });

  const otherF = savedData.otherFinish;
  const otherL = savedData.otherLeft;
  if(otherF) resultLines.push(`【その他】${ICON_FINISH}${otherF}`);
  if(otherL) resultLines.push(`【その他】${ICON_LEFT}${otherL}`);

  if(resultLines.length === 0) {
     showToast("選択項目がありません");
     return;
  }

  let resultText = resultLines.join("\n");

  const executeCopy = () => {
      if (navigator.clipboard) {
          navigator.clipboard.writeText(resultText).then(() => {
              showToast("コピーしました！");
              if (shouldLaunch) {
                  setTimeout(() => {
                      window.open('https://parents.codmon.com/contact', '_blank');
                  }, 800); 
              }
          });
      } else {
          const ta = document.createElement('textarea');
          ta.value = resultText;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          showToast("コピーしました！");
          if (shouldLaunch) {
              setTimeout(() => {
                  window.open('https://parents.codmon.com/contact', '_blank');
              }, 800);
          }
      }
  };

  executeCopy();
}
