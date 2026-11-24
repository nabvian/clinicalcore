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
const CASE_KEY = 'clinicalcore.apgar.case';
const KEEP_MS = 24 * 60 * 60000;
const FIELDS = ['gestation', 'birth_time', 'cord_clamped', 'resuscitation_started', 'comments'];
const REPORT_FIELDS = ['r-unit', 'r-mother', 'r-reg', 'r-sex', 'r-weight', 'r-mode'];

const blank = () => Object.fromEntries(MINUTES.map(m => [m, { support: {} }]));
let state = blank();
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
const timeOfDay = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const filled = m => SIGNS.every(([key]) => state[m][key] !== undefined);
const touched = m => SIGNS.some(([key]) => state[m][key] !== undefined) || Object.values(state[m].support).some(Boolean);
const scored = m => (result?.rows ?? []).some(r => r.minute === m && r.apgar !== null);
const notYet = m => born !== null && Date.now() - born < m * 60000 - 15000;
const locked = m => state[m].saved && !state[m].editing && MINUTES.some(later => later > m && (touched(later) || alerted.has(later)));

function input() {
  return {
    gestation_weeks: num($('#gestation').value),
    birth_time: $('#birth_time').value,
    cord_clamped: $('#cord_clamped').value,
    resuscitation_started: $('#resuscitation_started').value,
    comments: $('#comments').value,
    assessments: MINUTES.map(m => {
      const { saved, editing, elapsed, corrected_at, ...rest } = state[m];
      return { minute: m, ...rest };
    }),
  };
}

function store() {
  try {
    const fields = Object.fromEntries(FIELDS.map(id => [id, $(`#${id}`).value]));
    localStorage.setItem(CASE_KEY, JSON.stringify({ at: Date.now(), born, state, fields, alerted: [...alerted] }));
  } catch {}
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(CASE_KEY));
    if (!saved || Date.now() - saved.at > KEEP_MS) return false;
    state = { ...blank(), ...saved.state };
    for (const [id, v] of Object.entries(saved.fields ?? {})) $(`#${id}`).value = v;
    (saved.alerted ?? []).forEach(m => alerted.add(m));
    if (saved.born) startTimer(saved.born, false);
    return MINUTES.some(touched) || Boolean(saved.born);
  } catch {
    return false;
  }
}

function choose(m) {
  minute = m;
  drawScore();
  drawMinutes();
}

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

function guard() {
  if (notYet(minute)) {
    toast(`The ${minute}-minute score is not due yet`);
    return false;
  }
  if (locked(minute)) {
    toast('Saved. Tap Edit to correct it.');
    return false;
  }
  return true;
}

function save(m) {
  const s = state[m];
  if (!filled(m)) return;
  const first = !s.saved;
  const correcting = Boolean(s.editing);
  if (correcting) s.corrected = true;
  s.saved = true;
  s.editing = false;
  const now = new Date();
  if (first) {
    s.recorded_at = timeOfDay(now);
    s.elapsed = born === null ? '' : clockText(now.getTime() - born);
  }
  if (correcting) s.corrected_at = timeOfDay(now);
  update();
  if (correcting) {
    toast(`${m}-min score corrected`);
    drawScore();
    return;
  }
  if (!first) {
    drawScore();
    return;
  }
  toast(`${m}-min score saved`);
  const next = result.required.find(x => x > m && !scored(x));
  if (next !== undefined && !notYet(next)) choose(next);
  else drawScore();
}

function drawSaved() {
  const s = state[minute];
  $('#saved').hidden = !s.saved;
  if (!s.saved) return;
  const at = s.elapsed ? `${s.elapsed} after birth, ${s.recorded_at}` : s.recorded_at;
  $('#saved-text').textContent = `${s.editing ? 'Editing' : 'Saved'} · ${minute} min${at ? ` · ${at}` : ''}${s.corrected ? ` · corrected ${s.corrected_at ?? ''}` : ''}`;
  $('#edit').hidden = !locked(minute);
}

function drawScore() {
  const s = state[minute];
  const isLocked = locked(minute);
  $('#signs').replaceChildren(...SIGNS.map(([key, name, short]) => {
    const levels = el('div', { class: `levels${isLocked ? ' locked' : ''}`, role: 'group', 'aria-label': name });
    short.forEach((text, value) => {
      const b = el('button', { type: 'button', class: 'level', 'aria-pressed': String(s[key] === value), 'aria-label': `${name} ${value}, ${text}` }, el('b', {}, String(value)), el('span', {}, text));
      b.addEventListener('click', () => {
        if (!guard()) return;
        s[key] = value;
        drawScore();
        update();
        if (filled(minute)) save(minute);
      });
      levels.append(b);
    });
    return el('div', { class: 'sign-row' }, el('span', { class: 'sign-name' }, name), levels);
  }));
  $('#support').className = `toggles${isLocked ? ' locked' : ''}`;
  $('#support').replaceChildren(...SUPPORT.map(([key, name]) => {
    const b = el('button', { type: 'button', class: 'toggle', 'aria-pressed': String(Boolean(s.support[key])) }, name);
    b.addEventListener('click', () => {
      if (!guard()) return;
      s.support[key] = !s.support[key];
      if (s.saved) {
        save(minute);
      } else {
        drawScore();
        update();
      }
    });
    return b;
  }));
  const previous = MINUTES.filter(m => m < minute && scored(m)).pop();
  $('#same').disabled = previous === undefined;
  $('#same').textContent = previous === undefined ? 'Same as last time' : `Same as ${previous} min`;
  drawSaved();
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
    $('#due').textContent = 'All required scores done · Final report ready';
    $('#alert').hidden = true;
  } else {
    const wait = due * 60000 - elapsed;
    $('#due').textContent = wait > 0 ? `${due}-min score in ${clockText(wait)}` : `${due}-min score due now`;
    if (wait <= 0 && !alerted.has(due)) {
      alerted.add(due);
      choose(due);
      beep();
      store();
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
  $('#born').hidden = true;
  keepAwake();
  clearInterval(ticker);
  ticker = setInterval(tick, 250);
  if (fresh) update();
  tick();
}

function newBaby() {
  if (!confirm('Start a new baby? This clears the timer, all scores and the report details on this device.')) return;
  clearInterval(ticker);
  born = null;
  alerted.clear();
  state = blank();
  try { localStorage.removeItem(CASE_KEY); } catch {}
  wakeLock?.release?.();
  for (const id of [...FIELDS, ...REPORT_FIELDS]) $(`#${id}`).value = '';
  $('#clock').textContent = '00:00';
  $('#due').textContent = 'Tap when the baby is born';
  $('#alert').hidden = true;
  $('#born').hidden = false;
  choose(1);
  update();
}

function buildReport() {
  const r = result;
  const rows = r.rows;
  const cols = MINUTES.filter(m => r.required.includes(m) || rows.some(x => x.minute === m));
  const row = m => rows.find(x => x.minute === m);
  const value = id => $(`#${id}`).value.trim();
  const dateText = born ? new Date(born).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const missing = r.required.filter(m => !row(m) || row(m).apgar === null);
  const signed = sign.current();

  const cell = text => el('td', {}, String(text));
  const detail = (label, text) => el('div', {}, el('b', {}, label), text || ' ');
  const head = () => el('tr', {}, el('th', {}, ''), ...cols.map(m => el('th', {}, `${m} min`)));
  const signRows = SIGNS.map(([key, name]) => el('tr', {}, cell(name), ...cols.map(m => cell(state[m][key] ?? '–'))));
  const total = el('tr', { class: 'total' }, cell('Apgar (0–10)'), ...cols.map(m => cell(row(m)?.apgar ?? '–')));
  const supportRows = SUPPORT.map(([key, name]) => el('tr', {}, cell(name), ...cols.map(m => cell(state[m].support[key] ? '✓' : ''))));
  const expanded = el('tr', { class: 'total' }, cell('Expanded-Apgar (0–7)'), ...cols.map(m => cell(row(m) ? row(m).expanded : '–')));
  const combined = el('tr', { class: 'total' }, cell('Combined-Apgar'), ...cols.map(m => cell(row(m)?.combined ?? '–')));
  const recorded = el('tr', {}, cell('Recorded (after birth, clock time)'), ...cols.map(m => {
    const x = state[m];
    if (!x.recorded_at) return cell('');
    const when = x.elapsed ? `${x.elapsed} · ${x.recorded_at}` : x.recorded_at;
    return cell(x.corrected ? `${when}, corrected ${x.corrected_at ?? ''}` : when);
  }));

  const notes = [];
  if (r.five_minute_band) notes.push(`5-minute score in a term or late-preterm baby: ${r.five_minute_band} (ACOG/AAP description, not a diagnosis).`);
  const five = row(5)?.apgar;
  if (five !== undefined && five !== null && five <= 5) notes.push('5-minute score 5 or less: umbilical artery blood gas from a clamped section of cord; placenta for pathology may be valuable.');
  if (rows.some(x => x.support.length)) notes.push('Scores given during resuscitation are not equivalent to scores of a baby breathing on its own; the support is recorded above.');

  $('#report').replaceChildren(
    el('h1', {}, 'Apgar Score Record'),
    el('p', { class: 'sub' }, 'Expanded form (ACOG Committee Opinion 644 with the American Academy of Pediatrics) with Combined-Apgar (TEST-Apgar)'),
    ...(missing.length || !r.complete ? [el('p', { class: 'stamp' }, `INCOMPLETE${missing.length ? `: ${missing.map(m => `${m} min`).join(', ')} not scored` : ''}`)] : []),
    el('div', { class: 'details' },
      detail('Hospital or unit', value('r-unit')),
      detail("Mother's name", value('r-mother')),
      detail('Registration number', value('r-reg')),
      detail('Date of birth', dateText),
      detail('Time of birth', value('birth_time') || (born ? new Date(born).toTimeString().slice(0, 5) : '')),
      detail("Baby's sex", value('r-sex')),
      detail('Birth weight', value('r-weight') ? `${value('r-weight')} g` : ''),
      detail('Gestation', value('gestation') ? `${value('gestation')} weeks` : ''),
      detail('Mode of delivery', value('r-mode')),
      detail('Cord clamped', value('cord_clamped')),
      detail('Resuscitation started', value('resuscitation_started')),
      detail('Scores due', r.required.map(m => `${m} min`).join(', '))),
    el('p', { class: 'section' }, 'Apgar score'),
    el('table', {}, el('thead', {}, head()), el('tbody', {}, ...signRows, total)),
    el('p', { class: 'section' }, 'Resuscitation (✓ = given at the time of the score)'),
    el('table', {}, el('thead', {}, head()), el('tbody', {}, ...supportRows, expanded, combined, recorded)),
    ...(notes.length ? [el('p', { class: 'section' }, 'Notes'), ...notes.map(t => el('p', { class: 'line' }, t))] : []),
    ...(value('comments') ? [el('p', { class: 'section' }, 'Comments'), el('p', { class: 'line' }, value('comments'))] : []),
    el('p', { class: 'line' }, 'The Apgar score describes the condition of the baby; it does not predict outcome or diagnose asphyxia.'),
    el('div', { class: 'sign' },
      detail('Recorded by', signed?.name ?? ''),
      detail('Qualification', signed?.qualification ?? ''),
      detail('Registration number', signed?.registration ?? ''),
      detail('Signature and date', signed ? `Signed electronically ${signed.when}` : '')),
    el('p', { class: 'foot' }, `Prepared with ClinicalCore Apgar Record (nabvian.github.io/clinicalcore) on ${new Date().toLocaleString('en-GB')}. Software not clinically validated; check against local protocol.`),
  );
}

function printReport() {
  if (!result?.rows.length) {
    toast('Score at least the 1-minute Apgar first');
    return;
  }
  const missing = result.required.filter(m => !scored(m));
  if (missing.length && !confirm(`${missing.map(m => `${m} min`).join(', ')} not scored yet. Print an incomplete report?`)) return;
  buildReport();
  window.print();
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
  drawSaved();
  $('#same').disabled = !MINUTES.some(m => m < minute && scored(m));
  sign?.refresh();
  store();
  tick();
}

async function start() {
  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = 'The calculation engine could not load. Open this page through a web server, not as a local file.';
    return;
  }
  for (const id of FIELDS) $(`#${id}`).addEventListener('input', update);
  $('#born').addEventListener('click', () => {
    try { audio ??= new AudioContext(); audio.resume?.(); } catch {}
    startTimer(Date.now(), true);
    toast('Timer started');
  });
  $('#reset').addEventListener('click', newBaby);
  $('#report-btn').addEventListener('click', printReport);
  $('#edit').addEventListener('click', () => {
    state[minute].editing = true;
    drawScore();
    toast('Editing: the change is marked as a correction');
  });
  $('#all-normal').addEventListener('click', () => {
    if (!guard()) return;
    const s = state[minute];
    Object.assign(s, { color: 2, heart_rate: 2, reflex: 2, tone: 2, respiration: 2, support: {} });
    save(minute);
  });
  $('#same').addEventListener('click', () => {
    if (!guard()) return;
    const previous = MINUTES.filter(m => m < minute && scored(m)).pop();
    if (previous === undefined) return;
    const p = state[previous];
    const s = state[minute];
    Object.assign(s, { color: p.color, heart_rate: p.heart_rate, reflex: p.reflex, tone: p.tone, respiration: p.respiration, support: { ...p.support } });
    save(minute);
    toast(`Copied from ${previous} min and saved: change what is different`);
  });
  window.addEventListener('beforeprint', () => { if (result?.rows.length) buildReport(); });
  document.addEventListener('visibilitychange', () => { if (born !== null && document.visibilityState === 'visible') keepAwake(); });
  drawWording();
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));
  const restored = restore();
  update();
  const next = nextDue();
  choose(next !== undefined && !notYet(next) ? next : minute);
  if (restored) toast('Restored the saved record on this device');
}

start();
