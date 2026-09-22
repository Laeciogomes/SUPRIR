import { CONFIG } from '../config/app-config.js';
import { state } from './state.js';
import { isSchool } from './helpers.js';
import { loadRequestEvents } from '../services/supabase.js';
import {
  renderConfigMissing,
  renderLoadingScreen,
  renderAuthError,
  renderLogin,
  renderPasswordChange
} from '../views/auth.js';
import { renderShell } from '../views/shell.js';
import { createBlankDraft } from '../views/requests.js';

// Roteador da SPA extraído do monólito application.js. O código foi apenas
// MOVIDO: a ordem das checagens de fase (config -> login -> loading/authError
// -> troca de senha -> shell), o foco e o scroll permanecem idênticos.

// Elemento raiz onde toda a interface é renderizada.
export const app = document.querySelector('#app');

export function hasConfig() {
  return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && CONFIG.supabaseUrl.includes('supabase'));
}

export function render() {
  if (!hasConfig()) {
    app.innerHTML = renderConfigMissing();
    return;
  }

  if (!state.session) {
    app.innerHTML = renderLogin();
    return;
  }

  if (!state.profile) {
    app.innerHTML = state.authError ? renderAuthError() : renderLoadingScreen();
    return;
  }

  if (state.recoveryMode || state.profile.must_change_password) {
    app.innerHTML = renderPasswordChange();
    return;
  }

  app.innerHTML = renderShell();
}

export function navigate(view) {
  state.view = view;
  state.mobileMenu = false;
  state.modal = null;
  if (view === 'newRequest' && !state.draft) state.draft = createBlankDraft();
  if (view !== 'newRequest') state.draft = null;
  if (view !== 'requestDetail') state.selectedRequestId = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export async function openRequest(requestId) {
  state.loading = true;
  render();
  try {
    if (!state.events[requestId]) await loadRequestEvents(requestId);
    if (state.view !== 'requestDetail') state.previousView = state.view;
    state.selectedRequestId = requestId;
    state.view = 'requestDetail';
  } finally {
    state.loading = false;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
