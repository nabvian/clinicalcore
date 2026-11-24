import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, num, chips, showIssues, markFields, copy, nowLocal, round } from '../shared/ui.js';

let engine;
let result;
let sign;
const state = { patient: null, formula: null };

const PATIENTS = [['adult', 'Adult'], ['child', 'Child']];
const FORMULAS = [
  [2, '2 mL/kg/%TBSA · ABA 2023 adult start'],
  [4, '4 mL/kg/%TBSA · Parkland'],
];

function input() {
  return {
    patient: state.patient,
    ml_per_kg_tbsa: state.formula,
    weight_kg: num($('#weight_kg').value),
    tbsa_percent: num($('#tbsa_percent').value),
    burn_time: $('#burn_time').value || null,
    now: $('#now').value || null,
    given_ml: num($('#given_ml').value),
  };
}

function renderChoices() {
  $('#patient').replaceChildren(chips(PATIENTS, state.patient, v => { state.patient = v; renderChoices(); update(); }));
  $('#formula').replaceChildren(chips(FORMULAS, state.formula, v => { state.formula = v; renderChoices(); update(); }));
}

function clock(stamp) {
  return stamp.slice(11);
}

function phaseCard(p) {
  const rate = p.rate_ml_h === null
    ? el('div', { class: 'rate' }, el('small', {}, 'Rate: clinical decision'))
    : el('div', { class: 'rate' }, `${round(p.rate_ml_h, 1)} `, el('small', {}, 'mL/h'));
  const left = p.status === 'overdue'
    ? `${round(p.remaining_ml, 0)} mL of ${round(p.volume_ml, 0)} mL not given`
    : `${round(p.remaining_ml, 0)} mL left over ${round(p.hours_left, 1)} h`;
  return el('div', { class: `phase ${p.status}` },
    el('h3', {}, p.label),
    el('div', { class: 'when' }, `${p.starts} → ${p.ends}`),
    rate,
    el('div', { class: 'left' }, left));
}

function row(label, value) {
  return el('div', {}, el('dt', {}, label), el('dd', {}, value));
}

function update() {
  result = engine('burns', input());
  if (result.error) {
    showIssues($('#issues'), [{ level: 'error', message: 'Check the values entered.' }]);
    return;
  }

  const r = result;
  const running = r.phases.find(p => p.status === 'running');
  const headline = $('#headline');
  if (r.total_ml === null) {
    headline.textContent = 'Enter patient and burn details';
    $('#subline').textContent = '';
  } else if (!r.complete) {
    headline.textContent = 'Not checked: see review';
    $('#subline').textContent = '';
  } else if (running && running.rate_ml_h !== null) {
    headline.textContent = `${round(running.rate_ml_h, 1)} mL/h now`;
    $('#subline').textContent = `${round(r.total_ml, 0)} mL in the first 24 h`;
  } else {
    headline.textContent = 'Rate: clinical decision';
    $('#subline').textContent = `${round(r.remaining_ml, 0)} mL still due by hour 24`;
  }
  headline.classList.toggle('unknown', r.total_ml === null || !r.complete);

  $('#plan-panel').hidden = r.total_ml === null || !r.complete;
  if (r.total_ml !== null && r.complete) {
    $('#totals').replaceChildren(
      row('24-hour estimate', `${round(r.total_ml, 0)} mL`),
      row('Each half', `${round(r.half_ml, 0)} mL`),
      row('Time since burn', `${round(r.hours_since_burn, 1)} h`),
      row('Given so far', `${round(r.given_ml, 0)} mL`),
      row('Still due by hour 24', `${round(r.remaining_ml, 0)} mL`),
    );
    const marker = el('div', { class: 'now', title: 'Now' });
    marker.style.left = `calc(${(r.hours_since_burn / 24) * 100}% - 1px)`;
    $('#timeline').replaceChildren(el('div', { class: 'first' }), el('div', { class: 'second' }), marker);
    $('#scale').replaceChildren(
      el('span', {}, `Burn ${clock(r.burn_at)}`),
      el('span', {}, `8 h ${clock(r.hour8_at)}`),
      el('span', {}, `24 h ${clock(r.hour24_at)}`));
    $('#phases').replaceChildren(...r.phases.map(phaseCard));
  }

  showIssues($('#issues'), r.issues);
  markFields($('#form'), r.issues);
  $('#note').textContent = r.note || 'Enter the patient, formula, weight, burn size and time of burn.';
  sign?.refresh();
}

async function start() {
  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = 'The calculation engine could not load. Open this page through a web server, not as a local file.';
    return;
  }
  const tbsa = $('#tbsa_percent');
  const slider = $('#tbsa_slider');
  slider.addEventListener('input', () => { tbsa.value = slider.value; });
  tbsa.addEventListener('input', () => { if (tbsa.value !== '') slider.value = tbsa.value; });

  $('#now').value = nowLocal();
  $('#set-now').addEventListener('click', () => { $('#now').value = nowLocal(); update(); });
  $('#form').addEventListener('input', update);
  $('#form').addEventListener('submit', e => e.preventDefault());
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));
  renderChoices();
  update();
}

start();
