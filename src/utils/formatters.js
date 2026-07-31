export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function attr(value) {
  return escapeHtml(value);
}

export function formatDate(value) {
  if (!value) return '—';
  const text = String(value).slice(0, 10);
  const parts = text.split('-');
  if (parts.length !== 3) return escapeHtml(value);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return escapeHtml(value);
  }
}

export function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function firstDayOfYearISO() {
  return `${new Date().getFullYear()}-01-01`;
}

export function truncate(value, length = 90) {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function initials(value) {
  const text = String(value || 'U').trim();
  if (text.includes('@')) return text.slice(0, 2).toUpperCase();
  return text.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
}

export function selected(condition) {
  return condition ? 'selected' : '';
}

export function checked(condition) {
  return condition ? 'checked' : '';
}
