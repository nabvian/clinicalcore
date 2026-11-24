import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, num, showIssues, markFields, copy, today } from '../shared/ui.js';

let engine;
let result;
let sign;

function input() {
  const weeks = num($('#ga_weeks').value);
  return {
    birth_date: $('#birth_date').value || null,
    ga: weeks === null ? null : { weeks, days: num($('#ga_days').value) ?? 0 },
    on_date: $('#on_date').value || null,
    convention: $('#convention').value,
  };
}

function row(label, value) {
  return el('div', {}, el('dt', {}, label), el('dd', {}, value));
}

function update() {
  result = engine('corrected_age', input());
  if (result.error) {
    showIssues($('#issues'), [{ level: 'error', message: 'Gestational weeks and days must be whole numbers.' }]);
    $('#headline').textContent = 'Check the values';
    $('#note').textContent = '';
    return;
  }

  const r = result;
  const headline = $('#headline');
  if (r.corrected) {
    headline.textContent = r.corrected.text;
  } else if (r.days_to_term_equivalent !== null) {
    headline.textContent = `PMA ${r.postmenstrual} weeks`;
  } else {
    headline.textContent = 'Enter birth details';
  }
  headline.classList.toggle('unknown', !r.chronological);
  $('#subline').textContent = r.corrected && r.preterm ? 'Corrected age' : r.chronological ? 'Chronological age' : '';

  const rows = [];
  if (r.chronological) rows.push(row('Chronological age', r.chronological.text));
  if (r.preterm) {
    rows.push(row('Corrected age', r.corrected ? r.corrected.text : `Not yet: ${r.days_to_term_equivalent} days before 40+0`));
    rows.push(row('Born early by', `${Math.floor(r.days_early / 7)}+${r.days_early % 7} weeks`));
    rows.push(row('Term-equivalent date', r.term_equivalent_date));
  }
  if (r.postmenstrual) rows.push(row('Postmenstrual age', `${r.postmenstrual} weeks`));
  if (r.preterm) {
    const status = r.correct_until ? `${r.correction_applies ? 'Applies until' : 'Ended'} ${r.correct_until}` : 'Applies (no limit)';
    rows.push(row('Correction', status));
  }
  $('#rows').replaceChildren(...rows);
  $('#result-panel').hidden = rows.length === 0;

  $('#schedule').replaceChildren(...r.schedule.map(m => el('tr', { class: m.reached ? 'done' : '' },
    el('td', {}, `${m.months} months`), el('td', {}, m.date), el('td', {}, m.reached ? 'Reached' : ''))));
  $('#schedule-panel').hidden = r.schedule.length === 0;

  showIssues($('#issues'), r.issues);
  markFields($('#form'), r.issues);
  $('#note').textContent = r.note || 'Enter the date of birth and gestational age at birth.';
  sign?.refresh();
}

async function start() {
  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = 'The calculation engine could not load. Open this page through a web server, not as a local file.';
    return;
  }
  $('#on_date').value = today();
  $('#form').addEventListener('input', update);
  $('#form').addEventListener('submit', e => e.preventDefault());
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));
  update();
}

start();
