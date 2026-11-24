import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, num, showIssues, markFields, copy, today } from '../shared/ui.js';

const FLAGS = ['previous_caesarean', 'previous_uterine_surgery', 'past_pph', 'medical_illness', 'multiple_pregnancy', 'blood_group', 'hiv', 'syphilis', 'hbsag', 'anomaly_scan', 'td_within_3_years', 'folic_acid', 'ifa', 'calcium', 'albendazole'];
const STATUS = { done: 'Done', due: 'Due', missed: 'Missed', upcoming: 'Upcoming', missing: 'Missing' };
let engine;
let result;
let sign;

function value(id) {
  return $(`#${id}`).value || null;
}

function visitRow() {
  const urine = el('select', { class: 'input short', 'data-k': 'urine_albumin', 'aria-label': 'Urine albumin' },
    el('option', { value: '' }, 'Urine?'), el('option', { value: 'false' }, 'Nil'), el('option', { value: 'true' }, 'Present'));
  return el('div', { class: 'rowline visit' },
    el('input', { class: 'input', type: 'date', 'data-k': 'date', 'aria-label': 'Visit date' }),
    el('input', { class: 'input short', type: 'number', inputmode: 'decimal', placeholder: 'kg', 'data-k': 'weight_kg', 'aria-label': 'Weight' }),
    el('input', { class: 'input short', type: 'number', inputmode: 'numeric', placeholder: 'SBP', 'data-k': 'bp_systolic', 'aria-label': 'Systolic BP' }),
    el('input', { class: 'input short', type: 'number', inputmode: 'numeric', placeholder: 'DBP', 'data-k': 'bp_diastolic', 'aria-label': 'Diastolic BP' }),
    el('input', { class: 'input short', type: 'number', inputmode: 'decimal', step: '0.1', placeholder: 'Hb', 'data-k': 'hb', 'aria-label': 'Haemoglobin' }),
    urine);
}

function glucoseRow() {
  return el('div', { class: 'rowline glucose' },
    el('input', { class: 'input', type: 'date', 'data-k': 'date', 'aria-label': 'Test date' }),
    el('input', { class: 'input short', type: 'number', inputmode: 'numeric', placeholder: 'mg/dL', 'data-k': 'value_mg_dl', 'aria-label': '2-hour value' }));
}

function rows(selector) {
  return [...document.querySelectorAll(selector)].map(row => {
    const out = {};
    row.querySelectorAll('[data-k]').forEach(f => {
      const k = f.dataset.k;
      if (k === 'date') out[k] = f.value || null;
      else if (k === 'urine_albumin') out[k] = f.value === '' ? null : f.value === 'true';
      else out[k] = num(f.value);
    });
    return out;
  }).filter(r => Object.values(r).some(v => v !== null));
}

function input() {
  const data = {
    lmp: value('lmp'),
    on_date: value('on_date'),
    age_years: num($('#age_years').value),
    height_cm: num($('#height_cm').value),
    parity: num($('#parity').value),
    rh_negative: $('#rh_negative').checked ? true : null,
    td1: value('td1'),
    td2: value('td2'),
    td_booster: value('td_booster'),
    visits: rows('.visit'),
    glucose: rows('.glucose'),
  };
  for (const f of FLAGS) data[f] = $(`#${f}`).checked;
  return data;
}

function badge(status) {
  return el('span', { class: `status ${status}` }, STATUS[status] ?? status);
}

function update() {
  result = engine('anc', input());
  if (result.error) {
    showIssues($('#issues'), [{ level: 'error', message: 'Check the numbers entered (whole numbers for age and parity).' }]);
    return;
  }
  const r = result;
  const headline = $('#headline');
  headline.textContent = r.ga_today ? `${r.ga_today} weeks` : 'Enter LMP and today';
  headline.classList.toggle('unknown', !r.ga_today);
  $('#subline').textContent = r.edd ? `EDD ${r.edd}${r.risks.length ? ` · ${r.risks.length} high-risk factor${r.risks.length > 1 ? 's' : ''}` : ''}` : '';

  $('#plan-panel').hidden = !r.ga_today;
  $('#contacts').replaceChildren(...r.contacts.map(c => el('tr', {},
    el('td', {}, c.label), el('td', {}, c.window), el('td', {}, badge(c.status)), el('td', {}, c.dates.join(', ')))));
  $('#items').replaceChildren(...r.items.map(i => el('tr', {},
    el('td', {}, i.label), el('td', {}, badge(i.status)), el('td', {}, i.detail))));
  $('#hb-action').hidden = !r.hb_action;
  $('#hb-action').textContent = r.hb_action ?? '';

  $('#risk-panel').hidden = r.risks.length === 0;
  $('#risks').replaceChildren(...r.risks.map(k => el('div', { class: 'risk' }, k.detail)));

  showIssues($('#issues'), r.issues);
  markFields($('#form'), r.issues);
  $('#note').textContent = r.note || 'Enter the LMP and today\'s date.';
  sign?.refresh();
}

async function start() {
  $('#visits').append(visitRow());
  $('#glucose').append(glucoseRow());
  $('#on_date').value = today();
  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = 'The calculation engine could not load. Open this page through a web server, not as a local file.';
    return;
  }
  $('#form').addEventListener('input', update);
  $('#form').addEventListener('change', update);
  $('#add-visit').addEventListener('click', () => { $('#visits').append(visitRow()); });
  $('#add-glucose').addEventListener('click', () => { $('#glucose').append(glucoseRow()); });
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));
  update();
}

start();
