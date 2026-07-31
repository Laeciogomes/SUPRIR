import { CONFIG } from '../config/app-config.js';

const INITIAL_PIN_PATTERN = /^\d{6}$/;

export function normalizeSchoolLogin(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 20);
}

export function isInitialSchoolPin(value) {
  return INITIAL_PIN_PATTERN.test(String(value ?? '').trim());
}

export function buildSchoolLoginEmail(loginCode, domain = CONFIG.schoolLoginDomain) {
  const code = normalizeSchoolLogin(loginCode);
  const cleanDomain = String(domain || '').trim().toLowerCase().replace(/^@+/, '');
  if (!code) throw new Error('Informe o código de acesso da escola.');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanDomain)) {
    throw new Error('O domínio interno de acesso das escolas não está configurado corretamente.');
  }
  return `${code}@${cleanDomain}`;
}

export function toSupabaseSchoolPassword(password) {
  const value = String(password ?? '');
  return isInitialSchoolPin(value) ? `Cn!${value}` : value;
}

export function schoolLoginLabel(school) {
  return String(school?.login_code || school?.inep || school?.codigo || '').trim();
}
