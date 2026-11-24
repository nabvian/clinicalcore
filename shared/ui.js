export const $ = sel => document.querySelector(sel);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function chips(options, value, onPick, extraClass = '') {
  const wrap = el('div', { class: 'chips' });
  for (const [val, label] of options) {
    const chip = el('button', { type: 'button', class: `chip ${extraClass}`.trim(), 'aria-pressed': String(value === val) }, label);
    chip.addEventListener('click', () => onPick(value === val ? null : val));
    wrap.append(chip);
  }
  return wrap;
}

export function field(label, ...content) {
  return el('div', { class: 'field' }, el('span', { class: 'label' }, label), ...content);
}

export function issueItem(issue) {
  return el('li', { class: `issue ${issue.level}` }, issue.message);
}

export function showIssues(list, issues) {
  list.replaceChildren(...issues.map(issueItem));
  list.closest('.panel')?.toggleAttribute('hidden', issues.length === 0);
}

export function markFields(root, issues) {
  const bad = new Set(issues.filter(i => i.level === 'error' && i.field).map(i => i.field));
  root.querySelectorAll('[data-field]').forEach(node => {
    const filled = node.value === undefined || node.value !== '';
    node.setAttribute('aria-invalid', String(bad.has(node.dataset.field) && filled));
  });
}

export function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 1800);
}

export async function copy(text, complete, labels = ['Copied', 'Copied, but some entries need review']) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = el('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast(complete ? labels[0] : labels[1]);
}

export function today() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${today()}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function round(value, decimals) {
  if (value === null || value === undefined) return '–';
  return Number(value.toFixed(decimals)).toLocaleString('en', { maximumFractionDigits: decimals });
}
