import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, num, showIssues, markFields, copy, round } from '../shared/ui.js';

let engine;
let result;
let sign;

const FIELDS = ['weight_kg', 'mg_per_kg', 'doses_per_day', 'max_single_mg', 'max_daily_mg', 'strength_mg', 'strength_ml'];

function input() {
  const values = Object.fromEntries(FIELDS.map(f => [f, num($(`#${f}`).value)]));
  return { ...values, round_ml: num($('#round_ml').value) };
}

function update() {
  result = engine('dose', input());
  if (result.error) {
    showIssues($('#issues'), [{ level: 'error', message: 'Doses per day must be a whole number.' }]);
    $('#headline').textContent = 'Check the values';
    $('#note').textContent = '';
    return;
  }

  const r = result;
  const headline = $('#headline');
  if (r.give_ml !== null && r.complete) {
    headline.textContent = `Give ${round(r.give_ml, 2)} mL`;
    $('#subline').textContent = `${round(r.given_mg, 2)} mg per dose`;
  } else if (r.give_ml !== null) {
    headline.textContent = 'Not checked: see review';
    $('#subline').textContent = `Calculated ${round(r.volume_ml, 3)} mL (${round(r.dose_mg, 2)} mg)`;
  } else {
    headline.textContent = 'Enter weight, dose and strength';
    $('#subline').textContent = '';
  }
  headline.classList.toggle('unknown', r.give_ml === null || !r.complete);

  $('#working').replaceChildren(...r.working.map(step => el('li', {}, step)));
  $('#working-panel').hidden = r.working.length === 0;

  showIssues($('#issues'), r.issues);
  markFields($('#form'), r.issues);
  $('#note').textContent = r.note || 'Enter the weight, dose in mg/kg and the strength.';
  sign?.refresh();
}

async function start() {
  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = 'The calculation engine could not load. Open this page through a web server, not as a local file.';
    return;
  }
  const weight = $('#weight_kg');
  const slider = $('#weight_slider');
  slider.addEventListener('input', () => { weight.value = slider.value; });
  weight.addEventListener('input', () => { if (weight.value !== '') slider.value = weight.value; });

  $('#form').addEventListener('input', update);
  $('#form').addEventListener('submit', e => e.preventDefault());
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete));
  update();
}

start();
