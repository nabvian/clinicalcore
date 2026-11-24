import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, showIssues, copy } from '../shared/ui.js';

const LINES = [
  ['a', 'Disease or condition directly leading to death'],
  ['b', 'due to'],
  ['c', 'due to'],
  ['d', 'due to'],
];
let engine;
let result;
let sign;

function input() {
  return {
    part1: LINES.map(([line]) => ({ cause: $(`#cause-${line}`).value, interval: $(`#interval-${line}`).value })),
    part2: $('#part2').value,
    sex: $('#sex').value || null,
  };
}

function update() {
  result = engine('mccd', input());
  if (result.error) {
    $('#note').textContent = result.error;
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

  for (const [line] of LINES) {
    const bad = result.issues.some(i => i.level === 'error' && i.field === line);
    $(`#cause-${line}`).setAttribute('aria-invalid', String(bad && $(`#cause-${line}`).value !== ''));
  }
  showIssues($('#issues'), result.issues);
  $('#note').textContent = result.note;
  sign?.refresh();
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
  document.querySelector('main').addEventListener('input', update);
  $('#sex').addEventListener('change', update);
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));
  update();
}

start();
