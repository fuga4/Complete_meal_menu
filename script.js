const CATEGORY_MAP = { 1: "主食", 2: "主菜", 3: "副菜", 4: "汁物", 5: "デザート" };

let currentUser = 'boy';   
let currentMeal = 'morning'; 
let currentTheme = 'minimal'; 
let menuData = { morning: {}, dinner: {} }; 
let nutritionMap = {}; 

// データ保持用
let currentFirebaseData = { checks: {}, otherFinish: '', otherLeft: '' }; 

let myChart = null;
let weatherAnimInterval = null;
let weatherCode = null; 

let touchStartX = 0;
let touchStartY = 0;

// リスナー解除用の関数
let unsubscribe = null;

const DAY_SWITCH_HOUR = 4;

// --- アプリ起動 ---
window.initApp = function() {
  console.log("App initializing...");

  // 1. ローカル設定の復元
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

  // 2. 時間帯判定
  const currentHour = new Date().getHours();
  if (currentHour >= 4 && currentHour < 14) {
      currentMeal = 'morning';
  } else {
      currentMeal = 'dinner';
  }

  updateTheme(); 
  
  // 3. メニューデータ読み込み
  loadMenuCsv()
    .then(() => {
       console.log("CSV loaded");
    })
    .catch((e) => {
       console.error("CSV Error", e);
       // エラーでも止まらずに進む
    })
    .finally(() => {
       // 4. まずは強制的に画面を描画（これで「読み込み中」が消える）
       renderPage();
       initChart();
       initCalc();
       getWeather(); 
       setupSwipeListener(); 
       
       // 5. データ接続開始（遅延があっても画面は操作可能）
       connectToFirebase();
    });
}

// --- Firebase接続管理 ---
function connectToFirebase() {
    // 既存接続を切断
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    // 画面データをクリアしてリセット
    currentFirebaseData = { checks: {}, otherFinish: '', otherLeft: '' };
    updateStatusIndicator(null); // ステータスを「確認中」に
    
    // UI反映（データ空の状態）
    renderPage();
    updateChartAndScore();

    // DBチェック
    if (!window.db) {
        // まだDB準備できていない場合は、0.5秒後に再トライ
        setTimeout(connectToFirebase, 500);
        return;
    }

    // 新しいパスに接続
    const dataPath = `users/${currentUser}/${currentMeal}`;
    const dataRef = window.ref(window.db, dataPath);

    unsubscribe = window.onValue(dataRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
            currentFirebaseData = val;
        } else {
            currentFirebaseData = { checks: {}, otherFinish: '', otherLeft: '' };
        }
        
        // データ受信 -> 画面更新
        renderPage();
        updateChartAndScore();
        updateStatusIndicator(currentFirebaseData);
    });
}

// --- ユーザー切り替え ---
window.switchUser = function(user) {
  if (currentUser === user) return;
  currentUser = user;
  localStorage.setItem('fc_last_user', user);
  updateTheme();
  connectToFirebase(); 
}

// --- 食事切り替え ---
window.switchMeal = function(meal) {
  if (currentMeal === meal) return;
  currentMeal = meal;
  connectToFirebase(); 
}

// --- テーマ更新 ---
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

function updateTheme() {
  document.body.setAttribute('data-user', currentUser);
}

// --- CSV読み込み ---
async function loadMenuCsv() {
  const response = await fetch('menu.csv?' + new Date().getTime());
  if (!response.ok) throw new Error("CSV error");
  const text = await response.text();
  parseCsv(text);
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
  
  const checks = currentFirebaseData.checks || {};

  const ofInput = document.getElementById('other-finish');
  const olInput = document.getElementById('other-left');
  if (ofInput && document.activeElement !== ofInput) ofInput.value = currentFirebaseData.otherFinish || '';
  if (olInput && document.activeElement !== olInput) olInput.value = currentFirebaseData.otherLeft || '';

  Object.values(CATEGORY_MAP).forEach(catName => {
    const items = menuData[currentMeal][catName];
    if (!items || items.length === 0) return;

    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = catName;
    container.appendChild(title);

    const card = document.createElement('div');
    card.className = 'list-card';

    items.filter(i => !i.sub).forEach(itemObj => {
        card.appendChild(createItemRow(itemObj, checks));
    });

    const subCategories = [...new Set(items.filter(i => i.sub).map(i => i.sub))];
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

        items.filter(i => i.sub === subName).forEach(itemObj => {
            card.appendChild(createItemRow(itemObj, checks));
        });
    });

    container.appendChild(card);
  });
}

function createItemRow(itemObj, checks) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const itemName = itemObj.name;
    const savedVal = checks[itemName] || 'none';
    
    // ★重要：ユーザーIDを名前に含めてユニーク化（同期バグ防止）
    const radioName = `radio_${currentUser}_${itemName}`;

    let iconHtml = '';
    if(itemObj.icon && itemObj.color) {
        iconHtml = `<span class="material-symbols-rounded menu-icon-disp" style="color:${itemObj.color};">${itemObj.icon}</span>`;
    }

    row.innerHTML = `
      <div class="item-name">
        ${iconHtml}
        <span>${itemName}</span>
      </div>
      <div class="options">
        <label><input type="radio" class="menu-radio" name="${radioName}" data-item="${itemName}" value="finish" 
          ${savedVal === 'finish' ? 'checked' : ''} onchange="saveData()">
          <span class="radio-label">完食</span></label>
        <label><input type="radio" class="menu-radio" name="${radioName}" data-item="${itemName}" value="left" 
          ${savedVal === 'left' ? 'checked' : ''} onchange="saveData()">
          <span class="radio-label">残し</span></label>
        <label><input type="radio" class="menu-radio" name="${radioName}" data-item="${itemName}" value="none" 
          ${savedVal === 'none' ? 'checked' : ''} onchange="saveData()">
          <span class="radio-label">―</span></label>
      </div>
    `;
    return row;
}

// --- データ保存 ---
window.saveData = function() {
  const data = {
    checks: {},
    otherFinish: document.getElementById('other-finish').value,
    otherLeft: document.getElementById('other-left').value
  };

  // 画面上のチェック済みラジオボタンを集計
  const inputs = document.querySelectorAll('.menu-radio:checked');
  inputs.forEach(input => {
      // 現在のユーザー用のボタンか確認
      if(input.name.indexOf(`radio_${currentUser}_`) === 0) {
          const name = input.getAttribute('data-item');
          if(name) data.checks[name] = input.value;
      }
  });

  data.lastUpdatedDate = getLogicalDate();
  data.lastUpdatedTime = getCurrentTimeStr();

  const dataPath = `users/${currentUser}/${currentMeal}`;
  window.set(window.ref(window.db, dataPath), data);
}

// --- ユーティリティ ---
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

    if (!statusBar) return;

    if (data === null) {
        statusIcon.textContent = 'history';
        statusText.textContent = "確認中...";
        statusBar.className = 'status-bar';
        return;
    }

    const todayLogical = getLogicalDate();
    const lastUpdatedDate = data.lastUpdatedDate;
    const lastUpdatedTime = data.lastUpdatedTime;

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

  const scoreTextEl = document.getElementById('score-text');
  const commentEl = document.getElementById('score-comment');
  if(scoreTextEl) scoreTextEl.innerHTML = `${totalScore} <span style="font-size:1.2rem;">pt</span>`;

  let comment = "";
  if (totalScore === 0) {
      comment = "何を食べるかな？";
  } else if (totalScore < 5) {
      comment = `もう少し食べよう！<span class="material-symbols-rounded" style="vertical-align: bottom;">rice_bowl</span>`;
  } else if (totalScore < 10) {
      comment = `良い調子！その調子<span class="material-symbols-rounded" style="vertical-align: bottom;">thumb_up</span>`;
  } else if (totalScore < 15) {
      comment = `ナイスバランス！素晴らしい<span class="material-symbols-rounded" style="vertical-align: bottom;">auto_awesome</span>`;
  } else {
      comment = `エネルギー満タン！元気100倍<span class="material-symbols-rounded" style="vertical-align: bottom;">fitness_center</span>`;
  }
  commentEl.innerHTML = comment;
}

// --- その他ツール (計算機・スワイプ・天気など) ---
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

// --- モーダル・リセット等 ---
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

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show';
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

window.copyToPartner = function() {
  const targetUser = currentUser === 'boy' ? 'girl' : 'boy';
  const targetName = currentUser === 'boy' ? '女の子' : '男の子';
  const dataPath = `users/${currentUser}/${currentMeal}`;
  
  window.get(window.ref(window.db, dataPath)).then((snapshot) => {
    if (snapshot.exists()) {
      const targetPath = `users/${targetUser}/${currentMeal}`;
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
  const checks = currentFirebaseData.checks || {};
  
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

  const otherF = currentFirebaseData.otherFinish;
  const otherL = currentFirebaseData.otherLeft;
  if(otherF) resultLines.push(`【その他】${ICON_FINISH}${otherF}`);
  if(otherL) resultLines.push(`【その他】${ICON_LEFT}${otherL}`);

  if(resultLines.length === 0) {
     showToast("選択項目がありません");
     return;
  }

  let resultText = resultLines.join("\n");

  if (navigator.clipboard) {
      navigator.clipboard.writeText(resultText).then(() => {
          showToast("コピーしました！");
          if (shouldLaunch) setTimeout(() => { window.open('https://parents.codmon.com/contact', '_blank'); }, 800);
      });
  } else {
      const ta = document.createElement('textarea');
      ta.value = resultText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast("コピーしました！");
      if (shouldLaunch) setTimeout(() => { window.open('https://parents.codmon.com/contact', '_blank'); }, 800);
  }
}
