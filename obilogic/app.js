import { loadEngine } from '../shared/engine.js';
import { signer } from '../shared/sign.js';
import { $, el, chips, field, copy, toast } from '../shared/ui.js';
import { LANGUAGES, setLanguage, language, t, message, flagText, applyStatic } from './i18n.js';

const KEYS = { lang: 'clinicalcore.lang', order: 'clinicalcore.obilogic.order', viability: 'clinicalcore.obilogic.viability', audit: 'clinicalcore.obilogic.audit' };
const state = { viability: 28, order: 'gpla', card: '', pregnancies: [] };
let engine;
let result;
let sign;

const ENDINGS = ['birth', 'miscarriage', 'termination', 'ectopic', 'molar'];
const TILES = ['g', 't', 'p', 'a', 'l'];

function load(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function whole(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function pick(options, value, set, extraClass) {
  return chips(options, value, val => { set(val); render(); }, extraClass);
}

function newPregnancy() {
  return { current: false, year: '', ending: null, weeks: '', days: '', band: null, mode: null, onset: null, babies: [] };
}

function pregnanciesForEngine() {
  return state.pregnancies.map(p => {
    if (p.current) return { current: true, year: whole(p.year) };
    const weeks = whole(p.weeks);
    const birth = p.ending === 'birth';
    return {
      year: whole(p.year),
      ending: p.ending,
      ga: weeks === null ? null : { weeks, days: whole(p.days) ?? 0 },
      ga_band: p.band,
      mode: birth ? p.mode : null,
      onset: birth ? p.onset : null,
      babies: birth ? p.babies : [],
    };
  });
}

function toEngine() {
  return { viability_weeks: state.viability, card: state.card, pregnancies: pregnanciesForEngine() };
}

function gestationField(p) {
  const v = state.viability;
  const bands = pick(
    [['early', t('band.early', v)], ['preterm', t('band.preterm', v)], ['term', t('band.term')]],
    p.band,
    val => { p.band = val; },
    p.weeks === '' ? '' : 'dim',
  );
  const input = (key, label, max) => {
    const box = el('input', { type: 'number', inputmode: 'numeric', min: 0, max, placeholder: label, 'aria-label': label });
    box.value = p[key];
    box.addEventListener('input', () => {
      p[key] = box.value;
      bands.querySelectorAll('.chip').forEach(c => c.classList.toggle('dim', p.weeks !== ''));
      update();
    });
    return box;
  };
  return field(
    t('preg.ga'),
    el('div', { class: 'ga' }, input('weeks', t('preg.weeks'), 45), '+', input('days', t('preg.days'), 6), el('span', { class: 'or' }, t('preg.approx')), bands),
  );
}

function babyBlock(p, baby, i) {
  const born = [['alive', t('baby.alive')], ['stillborn', t('baby.stillborn')]];
  if (p.babies.length > 1) born.push(['lost_early', t('baby.lost_early')]);
  const block = el('div', { class: 'baby' });
  if (p.babies.length > 1) block.append(el('span', { class: 'label' }, t('baby.title', i + 1)));
  block.append(pick(born, baby.born, val => {
    baby.born = val;
    if (val !== 'alive') { baby.living = null; baby.death = null; }
  }));
  if (baby.born === 'alive') {
    block.append(pick([[true, t('baby.living')], [false, t('baby.died')]], baby.living, val => {
      baby.living = val;
      if (val !== false) baby.death = null;
    }));
  }
  if (baby.born === 'alive' && baby.living === false) {
    block.append(pick([['neonatal', t('baby.neonatal')], ['later', t('baby.later')]], baby.death, val => { baby.death = val; }));
  }
  return block;
}

function card(p, index) {
  const node = $('#pregnancy-card').content.firstElementChild.cloneNode(true);
  node.dataset.index = index;
  node.querySelector('h3').textContent = t('preg.title', index + 1);

  const year = node.querySelector('.year');
  year.value = p.year;
  year.placeholder = t('preg.year');
  year.setAttribute('aria-label', t('preg.year'));
  year.addEventListener('input', () => { p.year = year.value; update(); });

  const remove = node.querySelector('.remove');
  remove.setAttribute('aria-label', t('preg.remove'));
  remove.addEventListener('click', () => {
    state.pregnancies.splice(index, 1);
    render();
  });

  const body = node.querySelector('.card-body');
  body.append(pick([[false, t('preg.past')], [true, t('preg.current')]], p.current, val => { p.current = val === true; }));
  if (p.current) return node;

  body.append(field(t('preg.ended'), pick(ENDINGS.map(e => [e, t(`end.${e}`)]), p.ending, val => {
    p.ending = val;
    if (val === 'birth' && p.babies.length === 0) p.babies = [{}];
  })));
  body.append(gestationField(p));

  if (p.ending === 'birth') {
    body.append(field(t('preg.delivery'), pick([['vaginal', t('mode.vaginal')], ['caesarean', t('mode.caesarean')]], p.mode, val => { p.mode = val; })));
    const onset = field(t('preg.onset'), pick([['spontaneous', t('onset.spontaneous')], ['indicated', t('onset.indicated')]], p.onset, val => { p.onset = val; }));
    onset.classList.add('onset');
    onset.hidden = true;
    body.append(onset);
    body.append(field(t('preg.babies'), pick([1, 2, 3, 4].map(n => [n, t(`mult.${n}`)]), p.babies.length, val => {
      const n = val ?? 1;
      p.babies = Array.from({ length: n }, (_, i) => p.babies[i] ?? {});
    })));
    p.babies.forEach((baby, i) => body.append(babyBlock(p, baby, i)));
  }
  return node;
}

function render() {
  const list = $('#pregnancies');
  list.replaceChildren();
  if (state.pregnancies.length === 0) {
    list.append(el('div', { class: 'empty' }, t('preg.empty')));
  }
  state.pregnancies.forEach((p, i) => list.append(card(p, i)));
  update();
}

function issueItem(issue) {
  return el('li', { class: `issue ${issue.level}` }, message(issue));
}

function formulaText(r) {
  return { gpla: r.gpla, gpal: r.gpal, gtpal: r.gtpal }[state.order];
}

function renderCard(reading) {
  $('#card-reading').hidden = !reading;
  if (!reading) return;

  const pills = [];
  const f = reading.formula;
  if (f) {
    const value = { G: f.g, T: f.t, P: f.notation === 'gtpal' ? f.p : f.para, A: f.a, L: f.l };
    const letters = f.notation === 'gtpal' ? 'GTPAL' : state.order === 'gpal' ? 'GPAL' : 'GPLA';
    const parts = [...letters].map(k => [k, value[k]])
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${k}${v}`)
      .join(' ');
    pills.push(el('span', { class: 'pill formula' }, el('small', {}, t('card.formula')), parts));
  }
  if (reading.current) {
    const weeks = reading.current_weeks === null ? '' : ` · ${t('card.weeks', reading.current_weeks)}`;
    pills.push(el('span', { class: 'pill' }, t('card.current') + weeks));
  }
  for (const fact of reading.facts) {
    const years = fact.years.length ? ` · ${fact.years.join(', ')}` : '';
    pills.push(el('span', { class: 'pill' }, `${t(`fact.${fact.code}`)} ×${fact.count}${years}`));
  }
  for (const text of reading.unread) {
    pills.push(el('span', { class: 'pill unread', title: t('card.unread') }, `${t('card.unread')}: ${text}`));
  }
  $('#reading').replaceChildren(...pills);
  $('#card-issues').replaceChildren(...reading.issues.map(issueItem));

  const table = $('#compare');
  table.hidden = reading.comparison.length === 0;
  table.querySelector('tbody').replaceChildren(...reading.comparison.map(c => {
    const agrees = c.agrees === null ? ['', t('unknown')] : c.agrees ? ['yes', t('yes')] : ['no', t('no')];
    return el('tr', {},
      el('td', {}, t(c.item)),
      el('td', {}, c.card ?? t('unknown')),
      el('td', {}, c.history ?? t('unknown')),
      el('td', { class: agrees[0] }, agrees[1]));
  }));
}

function update() {
  result = engine('obilogic', toEngine());
  if (result.error) {
    $('#note').textContent = result.error;
    return;
  }

  $('#tiles').replaceChildren(...TILES.map(k => {
    const value = result[k];
    return el('div', { class: `tile ${k}${value === null ? ' unknown' : ''}`, title: t(`tile.${k}`) },
      el('b', {}, `${k.toUpperCase()}${value ?? '?'}`), el('small', {}, t(`tile.${k}`)));
  }));
  $('#formula').textContent = formulaText(result);
  $('#gtpal').textContent = state.order === 'gtpal' ? result.gp : result.gtpal;
  $('#note').textContent = result.note;
  sign?.refresh();

  document.querySelectorAll('.card').forEach(node => {
    const i = Number(node.dataset.index);
    const outcome = result.outcomes[i];
    const badge = node.querySelector('.badge');
    const counted = outcome?.counted_as;
    badge.className = `badge ${counted ?? ''}`;
    badge.textContent = t(`badge.${counted ?? 'none'}`) + (outcome?.ga_estimated ? ` · ${t('badge.approx')}` : '');
    const onset = node.querySelector('.onset');
    if (onset) onset.hidden = outcome?.band !== 'preterm';
    node.querySelector('.card-issues').replaceChildren(
      ...result.issues.filter(issue => issue.pregnancy === i + 1).map(issueItem),
    );
  });

  const general = result.issues.filter(issue => issue.pregnancy === null);
  $('#issues-panel').hidden = general.length === 0;
  $('#issues').replaceChildren(...general.map(issueItem));

  renderCard(result.card);

  $('#flags-panel').hidden = result.flags.length === 0;
  $('#flags').replaceChildren(...result.flags.map(flag => {
    const text = flagText(flag);
    const title = el('b', {}, text.title);
    if (flag.from_card) title.append(el('span', { class: 'origin' }, t('flags.card')));
    const item = el('li', { class: `flag${flag.from_card ? ' card-source' : ''}` }, title, el('p', {}, text.detail));
    if (flag.pregnancies.length) item.append(el('small', {}, t('flags.pregnancy', flag.pregnancies.join(', '))));
    if (flag.source) {
      item.append(el('p', {}, el('a', { href: flag.source.url, target: '_blank', rel: 'noopener' }, flag.source.label)));
    }
    return item;
  }));

  renderAudit();
}

function auditRecords() {
  return load(KEYS.audit, []);
}

function renderAudit() {
  const records = auditRecords();
  const audit = engine('obilogic_audit', { viability_weeks: state.viability, records });
  const s = audit.summary;
  const pct = (n, d) => (d ? `${n} (${Math.round((n / d) * 100)}%)` : `${n}`);
  const row = (label, value) => el('div', {}, el('dt', {}, label), el('dd', {}, value));
  $('#audit-summary').replaceChildren(
    row(t('audit.records'), String(s.records)),
    row(t('audit.with_formula'), pct(s.with_formula, s.records)),
    row(t('audit.compared'), pct(s.compared, s.records)),
    row(t('audit.mismatch'), pct(s.any_mismatch, s.compared)),
    row(t('audit.card_errors'), pct(s.card_errors, s.with_formula)),
  );
  const table = $('#audit-items');
  table.hidden = s.items.length === 0;
  table.querySelector('tbody').replaceChildren(...s.items.map(i => el('tr', {},
    el('td', {}, t(i.item)), el('td', {}, String(i.compared)), el('td', {}, String(i.mismatched)),
    el('td', {}, `${Math.round((i.mismatched / i.compared) * 100)}%`))));
  $('#audit-download').disabled = s.records === 0;
  $('#audit-clear').disabled = s.records === 0;
  return audit;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function applyLanguage() {
  setLanguage(state.lang);
  applyStatic();
  render();
}

async function start() {
  state.lang = load(KEYS.lang, 'en');
  state.order = load(KEYS.order, 'gpla');
  state.viability = load(KEYS.viability, 28);
  setLanguage(state.lang);
  applyStatic();

  try {
    engine = await loadEngine();
  } catch {
    $('#note').textContent = t('engine.error');
    return;
  }

  const lang = $('#lang');
  lang.replaceChildren(...LANGUAGES.map(([code, name]) => el('option', { value: code }, name)));
  lang.value = language();
  lang.addEventListener('change', () => {
    state.lang = lang.value;
    save(KEYS.lang, state.lang);
    applyLanguage();
  });

  $('#viability').value = String(state.viability);
  $('#viability').addEventListener('change', e => {
    state.viability = Number(e.target.value);
    save(KEYS.viability, state.viability);
    render();
  });
  $('#order').value = state.order;
  $('#order').addEventListener('change', e => {
    state.order = e.target.value;
    save(KEYS.order, state.order);
    update();
  });

  $('#card').addEventListener('input', e => {
    state.card = e.target.value;
    update();
  });
  $('#add').addEventListener('click', () => {
    state.pregnancies.push(newPregnancy());
    render();
    document.querySelector('.card:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#reset').addEventListener('click', () => {
    if ((state.pregnancies.length || state.card) && confirm(t('confirm.clear'))) {
      state.pregnancies = [];
      state.card = '';
      $('#card').value = '';
      render();
    }
  });

  const labels = () => [t('toast.copied'), t('toast.review')];
  $('#copy-score').addEventListener('click', () => copy(formulaText(result), result.complete, labels()));
  sign = signer({ note: () => result?.note, complete: () => Boolean(result?.complete) });
  $('#copy-note').addEventListener('click', () => copy(sign.text(result.note), result.complete, labels()));

  $('#audit-add').addEventListener('click', () => {
    const records = auditRecords();
    records.push({ card: state.card, pregnancies: pregnanciesForEngine() });
    save(KEYS.audit, records);
    renderAudit();
    toast(t('audit.added', records.length));
  });
  $('#audit-download').addEventListener('click', () => {
    const audit = renderAudit();
    download(`obilogic-audit-${new Date().toISOString().slice(0, 10)}.csv`, audit.csv);
  });
  $('#audit-clear').addEventListener('click', () => {
    if (confirm(t('audit.confirm'))) {
      save(KEYS.audit, []);
      renderAudit();
    }
  });

  render();
}

start();
