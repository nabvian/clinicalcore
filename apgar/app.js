import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, num, showIssues, markFields, copy } from '../shared/ui.js';

const MINUTES = [1, 5, 10, 15, 20];
const SIGNS = [
  ['color', 'Colour', ['Blue or pale', 'Acrocyanosis, centrally pink', 'Completely pink']],
  ['heart_rate', 'Heart rate', ['Absent', '100 or less', 'Over 100']],
  ['reflex', 'Reflex irritability', ['No response', 'Grimace, or reduced for gestation', 'Cry or active withdrawal, or as expected for gestation']],
  ['tone', 'Muscle tone', ['Limp', 'Some flexion, or reduced for gestation', 'Active motion, or as expected for gestation']],
  ['respiration', 'Respiration', ['Absent', 'Weak cry, hypoventilation, small or irregular chest movement', 'Good, crying, regular chest movement']],
];
const SUPPORT = [
  ['cpap', 'CPAP'], ['oxygen', 'Oxygen'], ['mask_bag', 'Mask and bag ventilation'], ['intubation', 'Intubation and ventilation'],
  ['compressions', 'Chest compressions'], ['surfactant', 'Surfactant'], ['drugs', 'Drugs (adrenaline)'],
];

const state = Object.fromEntries(MINUTES.map(m => [m, { support: {} }]));
let minute = 1;
let engine;
let result;
let sign;

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

function drawMinutes() {
  const required = new Set(result?.required ?? [1, 5]);
  const scored = new Set((result?.rows ?? []).filter(r => r.apgar !== null).map(r => r.minute));
  $('#minutes').replaceChildren(...MINUTES.map(m => {
    const label = scored.has(m) ? `${m} min ✓` : required.has(m) ? `${m} min` : `${m} min (if needed)`;
    const chip = el('button', { type: 'button', class: 'chip', role: 'tab', 'aria-pressed': String(m === minute) }, label);
    chip.addEventListener('click', () => { minute = m; drawScore(); drawMinutes(); });
    return chip;
  }));
}

function drawScore() {
  const s = state[minute];
  $('#signs').replaceChildren(...SIGNS.map(([key, name, levels]) => {
    const wrap = el('div', { class: 'chips' });
    levels.forEach((text, value) => {
      const chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(s[key] === value) }, `${value} · ${text}`);
      chip.addEventListener('click', () => {
        s[key] = s[key] === value ? undefined : value;
        drawScore();
        update();
      });
      wrap.append(chip);
    });
    return el('div', { class: 'field spaced' }, el('span', { class: 'label' }, name), wrap);
  }));
  $('#support').replaceChildren(...SUPPORT.map(([key, name]) => {
    const box = el('input', { type: 'checkbox' });
    box.checked = Boolean(s.support[key]);
    box.addEventListener('change', () => { s.support[key] = box.checked; update(); });
    return el('label', {}, box, ` ${name}`);
  }));
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
  $('#subline').textContent = result.next_minute ? `Next: ${result.next_minute} min` : rows.length ? 'All required scores done' : '';

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
  sign?.refresh();
}

async function start() {
  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = 'The calculation engine could not load. Open this page through a web server, not as a local file.';
    return;
  }
  for (const id of ['gestation', 'birth_time', 'cord_clamped', 'resuscitation_started', 'comments']) $(`#${id}`).addEventListener('input', update);
  drawScore();
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));
  update();
}

start();
