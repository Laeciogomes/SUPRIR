const DEFAULT_DOMAIN = 'escolas.caninde.ce.gov.br';
const PIN_PATTERN = /^\d{6}$/;

export function normalizeSchoolCode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 20);
}

export function schoolLoginDomain(env = {}) {
  const value = String(env.SCHOOL_LOGIN_DOMAIN || env.VITE_SCHOOL_LOGIN_DOMAIN || DEFAULT_DOMAIN)
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
    throw new Error('SCHOOL_LOGIN_DOMAIN está inválido.');
  }
  return value;
}

export function schoolLoginEmail(code, env = {}) {
  const normalized = normalizeSchoolCode(code);
  if (!normalized) throw new Error('Código de acesso da escola não informado.');
  return `${normalized}@${schoolLoginDomain(env)}`;
}

export function isSchoolPin(value) {
  return PIN_PATTERN.test(String(value ?? '').trim());
}

export function schoolPasswordForAuth(value) {
  const password = String(value ?? '');
  return isSchoolPin(password) ? `Cn!${password}` : password;
}

export function generateSchoolPin() {
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String(byte % 10)).join('');
}
