import { state } from './state.js';

// Helpers de aviso/confirmação/toast e tradução de erros, extraídos do
// monólito application.js. Código apenas MOVIDO, comportamento idêntico.

export function noticeTitle(type) {
  if (type === 'success') return 'Operação concluída';
  if (type === 'warning') return 'Atenção';
  if (type === 'error') return 'Não foi possível continuar';
  return 'Informação';
}

export function openNotice(type, title, message, options = {}) {
  state.toast = null;
  state.notice = {
    type: type || 'info',
    title: title || noticeTitle(type),
    message: String(message || ''),
    confirmLabel: options.confirmLabel || 'Entendi',
    cancelLabel: options.cancelLabel || 'Cancelar',
    onConfirm: options.onConfirm || null,
    showCancel: Boolean(options.showCancel),
    confirmTone: options.confirmTone || type || 'primary'
  };
}

export function openConfirm({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary', onConfirm }) {
  openNotice(tone === 'danger' ? 'error' : 'warning', title, message, {
    showCancel: true,
    confirmLabel,
    cancelLabel,
    confirmTone: tone,
    onConfirm
  });
}

export function setToast(type, message) {
  openNotice(type, noticeTitle(type), message);
}

export function friendlyError(error) {
  const message = String(error?.message || error || 'Ocorreu um erro inesperado.');
  const replacements = [
    ['Invalid login credentials', state.loginPortal === 'school' ? 'Código da escola ou senha incorretos.' : 'E-mail ou senha incorretos.'],
    ['Email not confirmed', 'O acesso ainda não foi confirmado.'],
    ['User already registered', 'Este acesso já está cadastrado.'],
    ['Failed to fetch', 'Não foi possível conectar ao servidor. Verifique sua internet.']
  ];
  const match = replacements.find(([source]) => message.includes(source));
  return match ? match[1] : message.replace(/^Error:\s*/i, '');
}
