'use strict';

const STORAGE_KEY = 'ikkyu-study-v1';
const MAX_ROUNDS = 10; // tap上限（暴発防止）

const state = {
  config: null,
  data: { progress: {}, logs: [] },
  activeSubject: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// === Storage ===
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.data = JSON.parse(raw);
  } catch (e) {
    console.warn('localStorage load failed:', e);
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

// === Init ===
async function init() {
  const res = await fetch('data/subjects.json?v=' + Date.now());
  state.config = await res.json();

  // 初期化: 各科目に空のprogressを作成
  for (const s of state.config.subjects) {
    if (!state.data.progress[s.id]) state.data.progress[s.id] = {};
    for (const cat of s.categories) {
      if (state.data.progress[s.id][cat] == null) {
        state.data.progress[s.id][cat] = 0;
      }
    }
  }

  state.activeSubject = state.config.subjects[0].id;
  load();

  // 念のため、ロード後にも構造を埋め直す
  for (const s of state.config.subjects) {
    if (!state.data.progress[s.id]) state.data.progress[s.id] = {};
    for (const cat of s.categories) {
      if (state.data.progress[s.id][cat] == null) {
        state.data.progress[s.id][cat] = 0;
      }
    }
  }

  bindEvents();
  render();
}

// === Render ===
function render() {
  renderCountdown();
  renderTabs();
  renderSubjectView();
  renderOverall();
  renderLogs();
}

function renderCountdown() {
  const examDate = new Date(state.config.examDate + 'T09:00:00+09:00');
  const today = new Date();
  const diff = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
  $('#days-left').textContent = Math.max(0, diff);
  $('#exam-date').textContent = state.config.examDate;
}

function renderTabs() {
  const tabs = $('#tabs');
  tabs.innerHTML = '';
  for (const s of state.config.subjects) {
    const btn = document.createElement('button');
    btn.className = 'tab' + (s.id === state.activeSubject ? ' active' : '');
    btn.style.setProperty('--subject-color', s.color);
    btn.dataset.id = s.id;

    const goalReached = countGoalReached(s);
    const total = s.categories.length;
    btn.innerHTML = `${s.name}<span class="tab-count">${goalReached}/${total}</span>`;
    btn.addEventListener('click', () => {
      state.activeSubject = s.id;
      render();
    });
    tabs.appendChild(btn);
  }
}

function renderSubjectView() {
  const view = $('#subject-view');
  const s = state.config.subjects.find(x => x.id === state.activeSubject);
  if (!s) return;
  view.style.setProperty('--subject-color', s.color);

  const total = s.categories.length;
  if (total === 0) {
    view.innerHTML = `
      <div class="subject-header" style="--subject-color:${s.color}">
        <div class="subject-title" style="color:${s.color}">${s.name}</div>
        <div class="subject-meta">アプリ範囲外。テキスト/法令集ベースで別途管理</div>
      </div>
      <div class="empty-state">
        <strong>このサイトでは未管理</strong>
        法規はテキストと法令集で別途進捗管理予定。<br>
        後日、単元リストを追加する予定です。
      </div>
    `;
    return;
  }

  const totalRounds = s.categories.reduce((sum, c) => sum + Math.min(state.data.progress[s.id][c], state.config.targetRounds), 0);
  const maxRounds = total * state.config.targetRounds;
  const pct = Math.round((totalRounds / maxRounds) * 100);
  const avgRounds = (totalRounds / total).toFixed(1);

  const minPct = (state.config.minRounds / state.config.targetRounds) * 100;

  let html = `
    <div class="subject-header" style="--subject-color:${s.color}">
      <div class="subject-title" style="color:${s.color}">${s.name}</div>
      <div class="subject-meta">${total}単元 / 平均 ${avgRounds}周 / ${pct}%</div>
      <div class="subject-bar">
        <div class="bar-fill" style="width:${pct}%; background:${s.color}"></div>
        <div class="bar-marker bar-marker-min" style="left:${minPct}%; background:${s.color}; opacity:0.7"></div>
        <div class="bar-marker bar-marker-target" style="background:${s.color}"></div>
      </div>
    </div>
    <div class="cat-list">
  `;

  for (const cat of s.categories) {
    const rounds = state.data.progress[s.id][cat];
    const status = getStatus(rounds);
    const icon = statusIcon(status);
    const miniPct = Math.min(100, (rounds / state.config.targetRounds) * 100);
    html += `
      <div class="cat-item" data-cat="${escapeAttr(cat)}" data-status="${status}">
        <div class="cat-icon">${icon}</div>
        <div class="cat-name">${escapeHtml(cat)}</div>
        <div class="cat-count"><strong>${rounds}</strong><span>/${state.config.targetRounds}</span></div>
        <button class="cat-undo-btn" data-action="undo" aria-label="1周減らす">−</button>
        <div class="cat-mini-bar"><div class="cat-mini-fill" style="width:${miniPct}%; background:${s.color}"></div></div>
      </div>
    `;
  }
  html += '</div>';
  view.innerHTML = html;

  // バインド: カード本体タップで+1, −ボタンで-1
  $$('#subject-view .cat-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const cat = el.dataset.cat;
      if (e.target.closest('[data-action="undo"]')) {
        e.stopPropagation();
        decrementRound(state.activeSubject, cat);
      } else {
        incrementRound(state.activeSubject, cat);
      }
    });
  });
}

function getStatus(rounds) {
  const { minRounds, targetRounds } = state.config;
  if (rounds === 0) return 'zero';
  if (rounds >= targetRounds) return 'goal-reached';
  if (rounds >= minRounds) return 'min-cleared';
  return 'progress';
}

function statusIcon(status) {
  switch (status) {
    case 'goal-reached': return '🌟';
    case 'min-cleared': return '🛸';
    case 'progress': return '☄';
    default: return '·';
  }
}

function incrementRound(subjectId, cat) {
  const cur = state.data.progress[subjectId][cat] || 0;
  if (cur >= MAX_ROUNDS) return;
  state.data.progress[subjectId][cat] = cur + 1;
  save();
  // 効率: 全部renderするとちょっと重いので、要素単位で更新したいが、簡潔さ優先で全render
  render();

  // フィードバック
  const reached = state.data.progress[subjectId][cat];
  if (reached === state.config.minRounds) {
    flash('✓ 最低クリア！', '#38bdf8');
  } else if (reached === state.config.targetRounds) {
    flash('🏆 目標達成！', '#fbbf24');
  }
}

function decrementRound(subjectId, cat) {
  const cur = state.data.progress[subjectId][cat] || 0;
  if (cur === 0) return;
  state.data.progress[subjectId][cat] = cur - 1;
  save();
  render();
}

function countGoalReached(subject) {
  return subject.categories.filter(c => state.data.progress[subject.id][c] >= state.config.targetRounds).length;
}

function renderOverall() {
  let totalRounds = 0;
  let total = 0;
  for (const s of state.config.subjects) {
    if (s.categories.length === 0) continue;
    for (const c of s.categories) {
      totalRounds += Math.min(state.data.progress[s.id][c], state.config.targetRounds);
      total += 1;
    }
  }
  const max = total * state.config.targetRounds;
  const pct = max > 0 ? Math.round((totalRounds / max) * 100) : 0;
  $('#overall-fill').style.width = pct + '%';
  $('#overall-pct').textContent = pct + '%';

  // ペース計算
  const examDate = new Date(state.config.examDate + 'T09:00:00+09:00');
  const today = new Date();
  const daysLeft = Math.max(1, Math.ceil((examDate - today) / (1000 * 60 * 60 * 24)));
  const remainingRounds = max - totalRounds;
  const perDay = (remainingRounds / daysLeft).toFixed(1);
  $('#pace-target').textContent = remainingRounds;
  $('#pace-per-day').textContent = perDay;
}

// === Daily Log ===
function renderLogs() {
  const list = $('#log-history');
  list.innerHTML = '';
  const recent = state.data.logs.slice(-7).reverse();
  if (recent.length === 0) {
    list.innerHTML = '<div class="log-row"><span class="log-date">まだログなし</span></div>';
    return;
  }
  for (const l of recent) {
    const stars = '★'.repeat(l.mood) + '☆'.repeat(5 - l.mood);
    const accuracy = l.problems > 0 ? Math.round((l.correct / l.problems) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `
      <span class="log-date">${l.date}</span>
      <span class="log-stats">${l.problems}問 / 正答${l.correct} (${accuracy}%)</span>
      <span class="log-mood-stars">${stars}</span>
    `;
    list.appendChild(row);
  }
}

function saveLog() {
  const problems = parseInt($('#log-problems').value || '0', 10);
  const correct = parseInt($('#log-correct').value || '0', 10);
  const mood = parseInt($('#log-mood').value, 10);
  if (!problems && !correct) {
    flash('数値を入力してください', '#ef4444');
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  // 同日のログがあれば上書き
  const existing = state.data.logs.findIndex(l => l.date === date);
  const entry = { date, problems, correct, mood };
  if (existing >= 0) state.data.logs[existing] = entry;
  else state.data.logs.push(entry);
  save();
  $('#log-problems').value = '';
  $('#log-correct').value = '';
  flash('💾 保存しました', '#22c55e');
  renderLogs();
}

// === Flash message ===
let flashTimer = null;
function flash(msg, color = '#38bdf8') {
  let el = $('#flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash';
    el.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      padding: 12px 20px;
      background: rgba(15, 23, 42, 0.95);
      border-radius: 30px;
      color: white;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5);
      z-index: 1000;
      transition: transform 0.3s ease, opacity 0.3s;
      opacity: 0;
      pointer-events: none;
      backdrop-filter: blur(10px);
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.borderLeft = `4px solid ${color}`;
  el.style.transform = 'translateX(-50%) translateY(0)';
  el.style.opacity = '1';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    el.style.transform = 'translateX(-50%) translateY(100px)';
    el.style.opacity = '0';
  }, 1800);
}

// === Export / Import / Reset ===
function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ikkyu-study-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  flash('📦 エクスポートしました', '#22c55e');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.progress && data.logs) {
        state.data = data;
        save();
        render();
        flash('📥 インポート完了', '#22c55e');
      } else {
        flash('不正なファイル形式', '#ef4444');
      }
    } catch (err) {
      flash('JSONパースエラー', '#ef4444');
    }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm('全ての進捗データをリセットしますか？\n（先にエクスポートでバックアップ推奨）')) return;
  state.data = { progress: {}, logs: [] };
  for (const s of state.config.subjects) {
    state.data.progress[s.id] = {};
    for (const cat of s.categories) {
      state.data.progress[s.id][cat] = 0;
    }
  }
  save();
  render();
  flash('🗑 リセット完了', '#ef4444');
}

// === Util ===
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

function bindEvents() {
  $('#log-save').addEventListener('click', saveLog);
  $('#export-btn').addEventListener('click', exportData);
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importData(f);
  });
  $('#reset-btn').addEventListener('click', resetData);

  // 瞑想
  $('#meditate-fab').addEventListener('click', openMeditate);
  $('#meditate-close').addEventListener('click', closeMeditate);
  $('#meditate-start').addEventListener('click', startMeditate);
  $('#meditate-stop').addEventListener('click', stopMeditate);
}

// === 瞑想モジュール ===
const meditate = {
  duration: 5 * 60, // 秒
  remaining: 5 * 60,
  timerId: null,
  audioCtx: null,
  oscillators: [],
  masterGain: null,
  voiceQueue: [],
  voiceTimers: [],
  running: false,
};

function openMeditate() {
  $('#meditate-modal').hidden = false;
  resetMeditateUI();
}

function closeMeditate() {
  if (meditate.running) stopMeditate();
  $('#meditate-modal').hidden = true;
}

function resetMeditateUI() {
  meditate.remaining = meditate.duration;
  $('#meditate-timer').textContent = formatTime(meditate.remaining);
  $('#breathing-text').textContent = '準備';
  $('#meditate-start').hidden = false;
  $('#meditate-stop').hidden = true;
  document.querySelector('.breathing-circle').classList.remove('active');
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function startMeditate() {
  meditate.running = true;
  meditate.remaining = meditate.duration;
  $('#meditate-start').hidden = true;
  $('#meditate-stop').hidden = false;
  document.querySelector('.breathing-circle').classList.add('active');

  const wantMusic = $('#toggle-music').checked;
  const wantVoice = $('#toggle-voice').checked;

  if (wantMusic) startMusic();
  if (wantVoice) scheduleVoice();
  startBreathingText();

  meditate.timerId = setInterval(() => {
    meditate.remaining -= 1;
    $('#meditate-timer').textContent = formatTime(meditate.remaining);
    if (meditate.remaining <= 0) {
      finishMeditate();
    }
  }, 1000);
}

function stopMeditate() {
  meditate.running = false;
  clearInterval(meditate.timerId);
  stopMusic();
  stopVoice();
  resetMeditateUI();
}

function finishMeditate() {
  meditate.running = false;
  clearInterval(meditate.timerId);
  // 終わりの一言（音声ON時）
  if ($('#toggle-voice').checked) {
    speak('お疲れさまでした。ゆっくり目を開けてください', { rate: 0.9 });
  }
  // 音楽は緩やかにフェードアウト
  fadeOutMusic(3);
  flash('🧘 完了 +5分', '#fbbf24');
  setTimeout(() => {
    if (!meditate.running) resetMeditateUI();
  }, 4000);
}

// === Web Audio: ヒーリングパッド ===
function startMusic() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    meditate.audioCtx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 3); // フェードイン
    meditate.masterGain = master;

    // 主和音 (Amaj7 つぽい): A2, E3, A3, C#4, E4
    const freqs = [110, 164.81, 220, 277.18, 329.63];
    const types = ['sine', 'sine', 'triangle', 'sine', 'sine'];

    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = types[i];
      osc.frequency.value = f;

      const gain = ctx.createGain();
      gain.gain.value = 0.18 / freqs.length;

      // 微妙な揺らぎ (LFO)
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.05 + Math.random() * 0.1;
      lfoGain.gain.value = 0.04 / freqs.length;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      // ピッチも微妙に揺らす
      const pitchLfo = ctx.createOscillator();
      const pitchLfoGain = ctx.createGain();
      pitchLfo.frequency.value = 0.1 + Math.random() * 0.15;
      pitchLfoGain.gain.value = 0.5;
      pitchLfo.connect(pitchLfoGain);
      pitchLfoGain.connect(osc.frequency);
      pitchLfo.start();

      osc.connect(gain);
      gain.connect(master);
      osc.start();

      meditate.oscillators.push(osc, lfo, pitchLfo);
    });

    // ローパスフィルタ（あたたかく）
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    // すでに master に接続済みなので、フィルタはオプション。シンプル維持
  } catch (e) {
    console.warn('Audio failed:', e);
  }
}

function fadeOutMusic(seconds) {
  if (!meditate.audioCtx || !meditate.masterGain) return;
  const ctx = meditate.audioCtx;
  meditate.masterGain.gain.cancelScheduledValues(ctx.currentTime);
  meditate.masterGain.gain.setValueAtTime(meditate.masterGain.gain.value, ctx.currentTime);
  meditate.masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
  setTimeout(stopMusic, seconds * 1000 + 100);
}

function stopMusic() {
  meditate.oscillators.forEach(o => { try { o.stop(); } catch (e) {} });
  meditate.oscillators = [];
  if (meditate.audioCtx) {
    try { meditate.audioCtx.close(); } catch (e) {}
    meditate.audioCtx = null;
  }
  meditate.masterGain = null;
}

// === ガイド音声 (Web Speech API) ===
function speak(text, opts = {}) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = opts.rate || 0.85;
  u.pitch = opts.pitch || 1;
  u.volume = opts.volume || 0.85;
  // 日本語ボイスがあれば使う
  const voices = speechSynthesis.getVoices();
  const jp = voices.find(v => v.lang && v.lang.startsWith('ja'));
  if (jp) u.voice = jp;
  speechSynthesis.speak(u);
}

function scheduleVoice() {
  // 5分間の瞑想ガイド (秒数:文)
  const script = [
    [2, '瞑想を始めます。楽な姿勢で、目を閉じてください'],
    [20, '深く息を吸って'],
    [25, 'ゆっくり吐いて'],
    [40, '体の力を抜いて、呼吸に意識を向けて'],
    [70, '雑念が浮かんでも、優しく呼吸に戻ります'],
    [110, '吸う息で、新しい空気が入ってきます'],
    [115, '吐く息で、緊張が抜けていきます'],
    [160, '今この瞬間に、ただ意識を向けて'],
    [220, 'もう少しで終わります。最後にもう一度深呼吸を'],
    [270, 'ゆっくりと意識を戻していきましょう'],
  ];

  meditate.voiceTimers = script.map(([sec, text]) => {
    return setTimeout(() => {
      if (meditate.running && $('#toggle-voice').checked) {
        speak(text);
      }
    }, sec * 1000);
  });
}

function stopVoice() {
  meditate.voiceTimers.forEach(t => clearTimeout(t));
  meditate.voiceTimers = [];
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// 呼吸テキスト (吸う/吐く 4秒ずつ → アニメと同期)
let breathingTextTimer = null;
function startBreathingText() {
  const el = $('#breathing-text');
  let phase = 0;
  const phases = ['吸って', '吐いて'];
  el.textContent = phases[0];
  breathingTextTimer = setInterval(() => {
    if (!meditate.running) {
      clearInterval(breathingTextTimer);
      return;
    }
    phase = (phase + 1) % 2;
    el.textContent = phases[phase];
  }, 4000);
}

// 音声リストの初期化（一部ブラウザで必要）
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => {};
}

init();
