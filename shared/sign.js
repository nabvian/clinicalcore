import { $, el, toast } from './ui.js';

const KEY = 'clinicalcore.signer';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

function save(who) {
  try {
    if (who) localStorage.setItem(KEY, JSON.stringify(who));
    else localStorage.removeItem(KEY);
  } catch {}
}

function stamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function block(who, when) {
  const lines = ['', '---', `Signed by: ${who.name}${who.qualification ? `, ${who.qualification}` : ''}`];
  if (who.registration) lines.push(`Registration: ${who.registration}`);
  lines.push(`Signed on: ${when}`);
  return lines.join('\n');
}

function input(id, label, hint) {
  return el('label', { class: 'field' },
    el('span', { class: 'label' }, label),
    el('input', { class: 'input', id, autocomplete: 'off', ...(hint ? { placeholder: hint } : {}) }));
}

export function signer({ note, complete }) {
  let signed = null;

  const button = el('button', { class: 'btn', type: 'button', id: 'sign-note' }, 'Sign');
  $('#copy-note').before(button);

  const remember = el('input', { type: 'checkbox', id: 'sign-remember' });
  const form = el('form', { method: 'dialog' },
    el('h2', {}, 'Sign this note'),
    el('p', { class: 'hint' }, 'Your name is added to the end of the note to show you have checked it. The tool itself is not clinically validated.'),
    input('sign-name', 'Name', 'Dr A. Sen'),
    input('sign-qualification', 'Qualification', 'MBBS, MD'),
    input('sign-registration', 'Registration number', 'State council and number'),
    el('label', { class: 'check' }, remember, ' Remember on this device'),
    el('div', { class: 'dialog-actions' },
      el('button', { class: 'btn', type: 'button', value: 'cancel', id: 'sign-cancel' }, 'Cancel'),
      el('button', { class: 'btn ghost', type: 'button', id: 'sign-remove', hidden: '' }, 'Remove signature'),
      el('button', { class: 'btn primary', type: 'submit', value: 'sign' }, 'Sign note')));
  const dialog = el('dialog', { class: 'sign-dialog', 'aria-labelledby': 'sign-title' }, form);
  form.querySelector('h2').id = 'sign-title';
  document.body.append(dialog);

  const fields = { name: '#sign-name', qualification: '#sign-qualification', registration: '#sign-registration' };

  function paint() {
    const text = note();
    if (signed && signed.text !== text) {
      signed = null;
      toast('Note changed. Sign again.');
    }
    if (signed) $('#note').textContent = text + signed.block;
    button.textContent = signed ? `Signed ${signed.when.slice(11)}` : 'Sign';
    button.classList.toggle('signed', Boolean(signed));
    $('#sign-remove').hidden = !signed;
  }

  button.addEventListener('click', () => {
    if (!note() || !complete()) {
      toast('Resolve the errors before signing.');
      return;
    }
    const who = signed?.who ?? load();
    for (const [k, sel] of Object.entries(fields)) $(sel).value = who[k] ?? '';
    remember.checked = Boolean(load().name);
    dialog.showModal();
    $('#sign-name').focus();
  });

  $('#sign-cancel').addEventListener('click', () => dialog.close());

  $('#sign-remove').addEventListener('click', () => {
    signed = null;
    dialog.close();
    $('#note').textContent = note();
    paint();
    toast('Signature removed');
  });

  form.addEventListener('submit', event => {
    const who = Object.fromEntries(Object.entries(fields).map(([k, sel]) => [k, $(sel).value.trim()]));
    if (!who.name) {
      event.preventDefault();
      $('#sign-name').setAttribute('aria-invalid', 'true');
      $('#sign-name').focus();
      return;
    }
    $('#sign-name').removeAttribute('aria-invalid');
    save(remember.checked ? who : null);
    const when = stamp();
    signed = { text: note(), who, when, block: block(who, when) };
    paint();
    toast('Signed');
  });

  return {
    refresh: paint,
    text: value => (signed && signed.text === value ? value + signed.block : value),
  };
}
