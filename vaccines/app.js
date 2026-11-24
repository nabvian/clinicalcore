import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, showIssues, markFields, copy, today } from '../shared/ui.js';

const STATUS = { given: 'Given', due_now: 'Due now', upcoming: 'Upcoming', waiting: 'After previous dose', too_late: 'Past max age', not_called: 'Not called' };
const given = {};
let engine;
let result;
let sign;
let shown = '';

function input() {
  return {
    dob: $('#dob').value || null,
    on_date: $('#on_date').value || null,
    given,
    rotavirus: $('#rotavirus').checked,
    pcv: $('#pcv').checked,
    je: $('#je').checked,
    sex: $('#sex').value || null,
  };
}

function buildRows(rows) {
  $('#rows').replaceChildren(...rows.map(r => {
    const box = el('input', { class: 'input', type: 'date', 'aria-label': `${r.label} date given` });
    box.value = given[r.code] ?? '';
    box.addEventListener('input', () => {
      if (box.value) given[r.code] = box.value;
      else delete given[r.code];
      update();
    });
    return el('tr', { 'data-code': r.code },
      el('td', { class: 'name' }), el('td', { class: 'state' }), el('td', {}, box), el('td', { class: 'earliest' }), el('td', { class: 'last' }));
  }));
  shown = rows.map(r => r.code).join();
}

function update() {
  result = engine('immunization', input());
  if (result.error) {
    $('#note').textContent = result.error;
    return;
  }
  const r = result;
  const ready = r.rows.length > 0;
  const headline = $('#headline');
  headline.textContent = !ready ? 'Enter date of birth' : r.due_now.length ? `${r.due_now.length} due today` : 'Nothing due today';
  headline.classList.toggle('unknown', !ready);
  $('#subline').textContent = ready ? `Age ${r.age}${r.next_date ? ` · next from ${r.next_date}` : ''}` : '';

  $('#today-panel').hidden = !ready;
  $('#today').textContent = r.due_now.length ? r.due_now.join(' · ') : 'Nothing due today.';
  $('#table-panel').hidden = !ready;
  if (r.rows.map(x => x.code).join() !== shown) buildRows(r.rows);
  for (const row of r.rows) {
    const tr = document.querySelector(`tr[data-code="${row.code}"]`);
    tr.querySelector('.name').textContent = row.label;
    const state = el('span', { class: `status ${row.status}` }, STATUS[row.status] + (row.late ? ' · late' : ''));
    tr.querySelector('.state').replaceChildren(state);
    tr.querySelector('.earliest').textContent = row.status === 'given' ? '' : row.earliest ?? '–';
    tr.querySelector('.last').textContent = row.last_day;
  }

  showIssues($('#issues'), r.issues);
  markFields($('#form'), r.issues);
  $('#note').textContent = r.note || 'Enter the date of birth.';
  sign?.refresh();
}

async function start() {
  $('#on_date').value = today();
  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = 'The calculation engine could not load. Open this page through a web server, not as a local file.';
    return;
  }
  for (const id of ['dob', 'on_date']) $(`#${id}`).addEventListener('input', update);
  for (const id of ['rotavirus', 'pcv', 'je', 'sex']) $(`#${id}`).addEventListener('change', update);
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));
  update();
}

start();
