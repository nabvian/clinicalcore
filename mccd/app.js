import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, num, showIssues, copy, toast } from '../shared/ui.js';

const LINES = [
  ['a', 'Disease or condition directly leading to death'],
  ['b', 'due to'],
  ['c', 'due to'],
  ['d', 'due to'],
];
const LEVEL = { error: 'Error', warning: 'Warning', info: 'Note' };
let engine;
let result;
let audit;
let sign;

function yesNo(id) {
  const v = $(`#${id}`).value;
  return v === '' ? null : v === 'yes';
}

function input() {
  const female = $('#sex').value === 'female';
  return {
    part1: LINES.map(([line]) => ({ cause: $(`#cause-${line}`).value, interval: $(`#interval-${line}`).value })),
    part2: $('#part2').value,
    sex: $('#sex').value || null,
    age: num($('#age').value),
    age_unit: $('#age_unit').value,
    manner: $('#manner').value || null,
    injury_how: $('#injury_how').value,
    pregnancy: female ? yesNo('pregnancy') : null,
    delivery: female && yesNo('pregnancy') ? yesNo('delivery') : null,
  };
}

function update() {
  $('#pregnancy-fields').hidden = $('#sex').value !== 'female';
  $('#delivery-field').hidden = $('#pregnancy').value !== 'yes';
  result = engine('mccd', input());
  if (result.error) {
    $('#note').textContent = 'Check the age: whole numbers only.';
    return;
  }
  const errors = result.issues.filter(i => i.level === 'error').length;
  const warnings = result.issues.filter(i => i.level === 'warning').length;
  const empty = !result.starting_cause;
  const headline = $('#headline');
  headline.textContent = empty ? 'Start with line (a)' : errors ? `${errors} to fix` : warnings ? `${warnings} to review` : 'No problems found';
  headline.classList.toggle('unknown', empty || errors > 0);
  $('#subline').textContent = empty ? '' : `${errors} errors · ${warnings} warnings`;

  $('#start-panel').hidden = empty;
  $('#starting').textContent = result.starting_cause ?? '';

  const bad = new Set(result.issues.filter(i => i.level !== 'info' && i.field).map(i => i.field));
  for (const [line] of LINES) $(`#cause-${line}`).setAttribute('aria-invalid', String(bad.has(line) && $(`#cause-${line}`).value !== ''));
  for (const id of ['age', 'manner', 'injury_how', 'pregnancy', 'delivery']) $(`#${id}`).setAttribute('aria-invalid', String(bad.has(id)));
  showIssues($('#issues'), result.issues);
  $('#note').textContent = result.note;
  sign?.refresh();
}

function save(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pct(n, d) {
  return d ? `${Math.round((100 * n) / d)}%` : '–';
}

function runAudit() {
  const text = $('#audit-csv').value;
  audit = engine('mccd_audit', { csv: text });
  const problems = (audit.problems ?? []).map(message => ({ level: 'warning', message }));
  $('#audit-problems').replaceChildren(...problems.map(p => el('li', { class: 'issue warning' }, p.message)));
  const s = audit.summary;
  const has = s && s.certificates > 0;
  $('#audit-results').hidden = !has;
  $('#audit-download').disabled = !has;
  if (!has) return;

  const row = (dt, dd) => el('div', {}, el('dt', {}, dt), el('dd', {}, dd));
  $('#audit-summary').replaceChildren(
    row('Certificates', String(s.certificates)),
    row('With at least one error', `${s.with_errors} (${pct(s.with_errors, s.certificates)})`),
    row('Warnings only', `${s.warnings_only} (${pct(s.warnings_only, s.certificates)})`),
    row('No errors or warnings', `${s.clean} (${pct(s.clean, s.certificates)})`),
  );
  const labels = Object.fromEntries(s.checks.map(c => [c.check, c.label]));
  $('#audit-checks').replaceChildren(...s.checks.map(c => el('tr', {},
    el('td', {}, c.label),
    el('td', {}, el('span', { class: `status ${c.level === 'error' ? 'missed' : c.level === 'warning' ? 'due' : 'upcoming'}` }, LEVEL[c.level])),
    el('td', {}, String(c.certificates)),
    el('td', {}, pct(c.certificates, s.certificates)))));
  $('#audit-rows').replaceChildren(...audit.rows.map(r => el('tr', {},
    el('td', {}, String(r.row)),
    el('td', {}, r.id),
    el('td', {}, r.underlying || '–'),
    el('td', {}, String(r.errors)),
    el('td', {}, String(r.warnings)),
    el('td', {}, [...r.checks.map(c => labels[c] ?? c), ...r.problems].join('; ')))));
}

async function start() {
  const rows = LINES.map(([line, hint]) => el('div', { class: 'rowline' },
    el('span', { class: 'tag' }, `(${line})`),
    el('input', { class: 'input', id: `cause-${line}`, placeholder: hint, autocomplete: 'off', 'aria-label': `Line ${line} cause` }),
    el('input', { class: 'input short', id: `interval-${line}`, placeholder: 'interval', autocomplete: 'off', 'aria-label': `Line ${line} interval` })));
  $('#part1').replaceChildren(...rows);

  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = 'The calculation engine could not load. Open this page through a web server, not as a local file.';
    return;
  }
  const form = document.querySelector('main');
  form.addEventListener('input', e => { if (!e.target.closest('#audit')) update(); });
  form.addEventListener('change', e => { if (!e.target.closest('#audit')) update(); });
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));

  $('#audit-csv').addEventListener('input', runAudit);
  $('#audit-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    $('#audit-csv').value = await file.text();
    e.target.value = '';
    runAudit();
    toast(`Read ${file.name}`);
  });
  $('#audit-template').addEventListener('click', () => save('mccd-audit-template.csv', engine('mccd_audit', { csv: '' }).template));
  $('#audit-download').addEventListener('click', () => save('mccd-audit-results.csv', audit.csv));
  update();
}

start();
