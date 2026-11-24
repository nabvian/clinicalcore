import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, num, showIssues, markFields, copy, toast } from '../shared/ui.js';

const MINUTES = [1, 5, 10, 15, 20];
const SIGNS = [
  ['color', 'Colour', ['Blue or pale', 'Acrocyanosis', 'Pink'], ['Blue or pale', 'Acrocyanosis, centrally pink', 'Completely pink']],
  ['heart_rate', 'Heart rate', ['Absent', '100 or less', 'Over 100'], ['Absent', '100 or less', 'Over 100']],
  ['reflex', 'Reflexes', ['None', 'Grimace', 'Cry, withdraws'], ['No response', 'Grimace, or reduced for gestation', 'Cry or active withdrawal, or as expected for gestation']],
  ['tone', 'Tone', ['Limp', 'Some flexion', 'Active'], ['Limp', 'Some flexion, or reduced for gestation', 'Active motion, or as expected for gestation']],
  ['respiration', 'Breathing', ['Absent', 'Weak, irregular', 'Good, crying'], ['Absent', 'Weak cry, hypoventilation, small or irregular chest movement', 'Good, crying, regular chest movement']],
];
const SUPPORT = [
  ['cpap', 'CPAP'], ['oxygen', 'Oxygen'], ['mask_bag', 'Mask and bag'], ['intubation', 'Intubation'],
  ['compressions', 'Chest compressions'], ['surfactant', 'Surfactant'], ['drugs', 'Adrenaline / drugs'],
];
const BORN_KEY = 'clinicalcore.apgar.born';

const state = Object.fromEntries(MINUTES.map(m => [m, { support: {} }]));
let minute = 1;
let engine;
let result;
let sign;
let born = null;
let ticker = null;
let wakeLock = null;
let audio = null;
const alerted = new Set();

const pad = n => String(n).padStart(2, '0');
const clockText = ms => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}`;
const scored = m => (result?.rows ?? []).some(r => r.minute === m && r.apgar !== null);

function input() {
  return {
    gestation_weeks: num($('#gestation').value),
    birth_time: $('#birth_time').value,
    cord_clamped: $('#cord_clamped').value,
    resuscitation_started: $('#resuscitation_started').value,
    comments: $('#comments').value,
    assessments: MINUTES.map(m => ({ minute: m, ...state[m] })),
  };
}

function choose(m) {
  minute = m;
  drawScore();
  drawMinutes();
}

const notYet = m => born !== null && Date.now() - born < m * 60000 - 15000;

function drawMinutes() {
  const required = new Set(result?.required ?? [1, 5]);
  $('#minutes').replaceChildren(...MINUTES.map(m => {
    const wait = notYet(m) ? ` in ${clockText(m * 60000 - (Date.now() - born))}` : '';
    const label = scored(m) ? `${m} min ✓` : required.has(m) ? `${m} min${wait}` : `${m} min (if needed)`;
    const chip = el('button', { type: 'button', class: 'chip', role: 'tab', 'aria-pressed': String(m === minute) }, label);
    chip.disabled = notYet(m) && m !== minute;
    chip.addEventListener('click', () => choose(m));
    return chip;
  }));
}

function drawScore() {
  const s = state[minute];
  $('#signs').replaceChildren(...SIGNS.map(([key, name, short]) => {
    const levels = el('div', { class: 'levels', role: 'group', 'aria-label': name });
    short.forEach((text, value) => {
      const b = el('button', { type: 'button', class: 'level', 'aria-pressed': String(s[key] === value), 'aria-label': `${name} ${value}, ${text}` }, el('b', {}, String(value)), el('span', {}, text));
      b.addEventListener('click', () => {
        if (notYet(minute)) return toast(`The ${minute}-minute score is not due yet`);
        s[key] = s[key] === value ? undefined : value;
        drawScore();
        update();
      });
      levels.append(b);
    });
    return el('div', { class: 'sign-row' }, el('span', { class: 'sign-name' }, name), levels);
  }));
  $('#support').replaceChildren(...SUPPORT.map(([key, name]) => {
    const b = el('button', { type: 'button', class: 'toggle', 'aria-pressed': String(Boolean(s.support[key])) }, name);
    b.addEventListener('click', () => {
      if (notYet(minute)) return toast(`The ${minute}-minute score is not due yet`);
      s.support[key] = !s.support[key];
      drawScore();
      update();
    });
    return b;
  }));
  const previous = MINUTES.filter(m => m < minute && scored(m)).pop();
  $('#same').disabled = previous === undefined;
  $('#same').textContent = previous === undefined ? 'Same as last time' : `Same as ${previous} min`;
}

function drawWording() {
  $('#wording tbody').replaceChildren(...SIGNS.map(([, name, , full]) => el('tr', {}, el('td', {}, name), ...full.map(t => el('td', {}, t)))));
}

function nextDue() {
  return (result?.required ?? [1, 5]).find(m => !scored(m));
}

function beep() {
  try {
    audio ??= new AudioContext();
    [0, 0.3].forEach(at => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.2;
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + at);
      o.stop(audio.currentTime + at + 0.18);
    });
  } catch {}
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([200, 100, 200]);
}

function tick() {
  if (born === null) return;
  const elapsed = Date.now() - born;
  $('#clock').textContent = clockText(elapsed);
  const due = nextDue();
  if (due === undefined) {
    $('#due').textContent = 'All required scores done';
    $('#alert').hidden = true;
  } else {
    const wait = due * 60000 - elapsed;
    $('#due').textContent = wait > 0 ? `${due}-min score in ${clockText(wait)}` : `${due}-min score due now`;
    if (wait <= 0 && !alerted.has(due)) {
      alerted.add(due);
      choose(due);
      beep();
    }
    $('#alert').hidden = wait > 0;
    $('#alert').textContent = `Score now: ${due} minute${due === 1 ? '' : 's'}`;
  }
  $('#subline').textContent = `⏱ ${clockText(elapsed)}${due === undefined ? '' : ` · next ${due} min`}`;
  if (Math.floor(elapsed / 1000) !== tick.second) {
    tick.second = Math.floor(elapsed / 1000);
    drawMinutes();
  }
}

async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {}
}

function startTimer(at, fresh) {
  born = at;
  if (fresh) {
    const d = new Date(at);
    $('#birth_time').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  try { sessionStorage.setItem(BORN_KEY, String(at)); } catch {}
  $('#born').hidden = true;
  $('#reset').hidden = false;
  keepAwake();
  clearInterval(ticker);
  ticker = setInterval(tick, 250);
  update();
  tick();
}

function resetTimer() {
  if (!confirm('Stop the timer and clear all scores?')) return;
  clearInterval(ticker);
  born = null;
  alerted.clear();
  try { sessionStorage.removeItem(BORN_KEY); } catch {}
  wakeLock?.release?.();
  for (const m of MINUTES) state[m] = { support: {} };
  $('#clock').textContent = '00:00';
  $('#due').textContent = 'Tap when the baby is born';
  $('#alert').hidden = true;
  $('#born').hidden = false;
  $('#reset').hidden = true;
  $('#birth_time').value = '';
  choose(1);
  update();
}

function update() {
  result = engine('apgar', input());
  if (result.error) {
    $('#note').textContent = 'Check the gestation: whole weeks only.';
    return;
  }
  const rows = result.rows;
  const last = [...rows].reverse().find(r => r.apgar !== null);
  const headline = $('#headline');
  headline.textContent = last ? `${last.minute}-min Apgar ${last.apgar} · Combined ${last.combined}` : 'Score at 1 minute';
  headline.classList.toggle('unknown', !last);
  if (born === null) $('#subline').textContent = result.next_minute ? `Next: ${result.next_minute} min` : rows.length ? 'All required scores done' : '';

  $('#record-panel').hidden = rows.length === 0;
  $('#record').replaceChildren(...rows.map(r => el('tr', {},
    el('td', {}, `${r.minute} min`),
    el('td', {}, r.apgar === null ? 'incomplete' : `${r.apgar}/10`),
    el('td', {}, `${r.expanded}/7`),
    el('td', {}, r.combined ?? '–'),
    el('td', {}, r.support.join(', ') || 'None'))));
  $('#band').hidden = !result.five_minute_band;
  $('#band').textContent = result.five_minute_band ? `5-minute score in a term or late-preterm baby: ${result.five_minute_band} (ACOG/AAP). This is a description, not a diagnosis.` : '';

  showIssues($('#issues'), result.issues);
  markFields($('#form'), result.issues);
  $('#note').textContent = result.note;
  drawMinutes();
  $('#same').disabled = !MINUTES.some(m => m < minute && scored(m));
  sign?.refresh();
  tick();
}

async function start() {
  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = 'The calculation engine could not load. Open this page through a web server, not as a local file.';
    return;
  }
  for (const id of ['gestation', 'birth_time', 'cord_clamped', 'resuscitation_started', 'comments']) $(`#${id}`).addEventListener('input', update);
  $('#born').addEventListener('click', () => {
    try { audio ??= new AudioContext(); audio.resume?.(); } catch {}
    startTimer(Date.now(), true);
    toast('Timer started');
  });
  $('#reset').addEventListener('click', resetTimer);
  $('#all-normal').addEventListener('click', () => {
    if (notYet(minute)) return toast(`The ${minute}-minute score is not due yet`);
    state[minute] = { color: 2, heart_rate: 2, reflex: 2, tone: 2, respiration: 2, support: {} };
    drawScore();
    update();
  });
  $('#same').addEventListener('click', () => {
    if (notYet(minute)) return toast(`The ${minute}-minute score is not due yet`);
    const previous = MINUTES.filter(m => m < minute && scored(m)).pop();
    if (previous === undefined) return;
    const p = state[previous];
    state[minute] = { ...p, support: { ...p.support } };
    drawScore();
    update();
    toast(`Copied from ${previous} min: change what is different`);
  });
  document.addEventListener('visibilitychange', () => { if (born !== null && document.visibilityState === 'visible') keepAwake(); });
  drawWording();
  drawScore();
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));
  update();
  let saved = null;
  try { saved = Number(sessionStorage.getItem(BORN_KEY)) || null; } catch {}
  if (saved && Date.now() - saved < 60 * 60000) startTimer(saved, false);
}

start();
