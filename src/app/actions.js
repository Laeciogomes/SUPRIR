import { state, resetSecureState } from './state.js';
import { isSchool, getRequest } from './helpers.js';
import { app, render, navigate, openRequest } from './router.js';
import { openConfirm, setToast } from './notices.js';
import {
  getSupabase,
  loadAuthenticatedData,
  refreshData,
  executeRpc
} from '../services/supabase.js';
import { handleInstallApp } from './pwa.js';
import { printRequest, printCurrentReport } from './print.js';
import {
  downloadSchoolImportTemplate,
  downloadSchoolImportReport,
  exportCurrentReport
} from '../services/downloads.js';
import { createBlankDraft, draftFromRequest } from '../views/requests.js';
import { handleForgotPassword, deleteSchool, resetUserPassword } from './forms.js';

// Mapa de ações do listener de click, substituindo a antiga cadeia if/else
// baseada em data-action. Cada entrada recebe (button, event) e reproduz
// EXATAMENTE o comportamento original de cada ramo. O código foi apenas
// MOVIDO; nenhuma ação foi adicionada nem removida.

export const ACTIONS = {
  'choose-portal': (button) => {
    state.loginPortal = button.dataset.portal;
    localStorage.setItem('materiais_login_portal', state.loginPortal);
    render();
  },
  'toggle-password': (button) => {
    const input = button.closest('.password-wrap')?.querySelector('input');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  },
  'forgot-password': async () => {
    await handleForgotPassword();
  },
  'retry-auth': async () => {
    state.authError = null;
    await loadAuthenticatedData(true);
    render();
  },
  'logout': async () => {
    const supabase = getSupabase();
    state.loading = true;
    render();
    await supabase.auth.signOut();
    state.loading = false;
    state.recoveryMode = false;
    resetSecureState();
    render();
  },
  'navigate': (button) => {
    navigate(button.dataset.view);
  },
  'open-mobile-menu': () => {
    state.mobileMenu = true;
    render();
  },
  'close-mobile-menu': () => {
    state.mobileMenu = false;
    render();
  },
  'new-request': () => {
    state.draft = createBlankDraft();
    state.view = 'newRequest';
    state.mobileMenu = false;
    render();
  },
  'add-draft-item': () => {
    state.draft.items.push({ material_id: '', quantity: '', notes: '' });
    render();
  },
  'remove-draft-item': (button) => {
    const index = Number(button.dataset.index);
    if (state.draft.items.length > 1) state.draft.items.splice(index, 1);
    render();
  },
  'cancel-request-form': () => {
    state.draft = null;
    state.view = 'myRequests';
    render();
  },
  'open-request': async (button) => {
    await openRequest(button.dataset.id);
  },
  'back-from-detail': () => {
    state.view = state.previousView && state.previousView !== 'requestDetail' ? state.previousView : (isSchool() ? 'myRequests' : 'requests');
    state.selectedRequestId = null;
    render();
  },
  'edit-draft': (button) => {
    const request = getRequest(button.dataset.id);
    if (request?.status === 'draft') {
      state.draft = draftFromRequest(request);
      state.view = 'newRequest';
      state.modal = null;
      render();
    }
  },
  'receive-request': (button) => {
    const requestId = button.dataset.id;
    openConfirm({
      title: 'Receber pedido para análise',
      message: 'Confirmar o recebimento deste pedido pela SME? O sistema registrará seu nome como responsável pelo recebimento.',
      confirmLabel: 'Confirmar recebimento',
      tone: 'primary',
      onConfirm: async () => executeRpc('receive_request', { p_request_id: requestId }, 'Pedido recebido para análise.')
    });
    render();
  },
  'open-authorize-request': (button) => {
    state.modal = { type: 'authorize', requestId: button.dataset.id };
    render();
  },
  'open-reject-request': (button) => {
    state.modal = { type: 'reject', requestId: button.dataset.id };
    render();
  },
  'start-preparation': (button) => {
    const requestId = button.dataset.id;
    openConfirm({
      title: 'Iniciar separação',
      message: 'Deseja iniciar a separação dos materiais deste pedido? Essa etapa ficará registrada no histórico.',
      confirmLabel: 'Iniciar separação',
      tone: 'primary',
      onConfirm: async () => executeRpc('start_request_preparation', { p_request_id: requestId }, 'Separação iniciada.')
    });
    render();
  },
  'open-dispatch': (button) => {
    state.modal = { type: 'dispatch', requestId: button.dataset.id };
    render();
  },
  'open-receipt': (button) => {
    state.modal = { type: 'receipt', deliveryId: button.dataset.id };
    render();
  },
  'open-confirm-delivery': (button) => {
    state.modal = { type: 'confirmDelivery', deliveryId: button.dataset.id };
    render();
  },
  'open-cancel-request': (button) => {
    state.modal = { type: 'cancelRequest', requestId: button.dataset.id };
    render();
  },
  'close-modal': () => {
    state.modal = null;
    render();
  },
  'close-notice': () => {
    state.notice = null;
    render();
  },
  'confirm-notice': async () => {
    const onConfirm = state.notice?.onConfirm;
    state.notice = null;
    render();
    if (typeof onConfirm === 'function') await onConfirm();
  },
  'install-app': async () => {
    await handleInstallApp();
  },
  'open-school-form': (button) => {
    state.modal = { type: 'schoolForm', schoolId: button.dataset.id || null };
    render();
  },
  'open-school-delete': (button) => {
    state.modal = { type: 'schoolDelete', schoolId: button.dataset.id };
    render();
  },
  'confirm-delete-school': async (button) => {
    const checkbox = app.querySelector('[data-delete-school-confirm]');
    if (checkbox && !checkbox.checked) throw new Error('Marque a confirmação antes de excluir a escola.');
    await deleteSchool(button.dataset.id);
  },
  'open-material-form': (button) => {
    state.modal = { type: 'materialForm', materialId: button.dataset.id || null };
    render();
  },
  'open-user-create': () => {
    state.modal = { type: 'userCreate' };
    render();
  },
  'open-school-import': () => {
    state.modal = { type: 'schoolImport' };
    render();
  },
  'download-import-template': () => {
    downloadSchoolImportTemplate();
  },
  'download-import-report': () => {
    downloadSchoolImportReport();
  },
  'open-user-edit': (button) => {
    const profile = state.profiles.find((item) => item.id === button.dataset.id);
    state.modal = { type: 'userEdit', profileId: button.dataset.id, accountType: profile?.account_type };
    render();
  },
  'reset-user-password': async (button) => {
    await resetUserPassword(button.dataset.id);
  },
  'copy-password': async (button) => {
    await navigator.clipboard.writeText(button.dataset.password || '');
    setToast('success', 'Senha copiada para a área de transferência.');
    render();
  },
  'open-own-password': () => {
    state.modal = { type: 'ownPassword' };
    render();
  },
  'dismiss-toast': () => {
    state.toast = null;
    render();
  },
  'refresh': async () => {
    await refreshData('Dados atualizados.');
  },
  'filter-status': (button) => {
    state.filters.requestStatus = button.dataset.status;
    state.view = 'requests';
    render();
  },
  'report-type': (button) => {
    state.report.type = button.dataset.type;
    render();
  },
  'export-report': () => {
    exportCurrentReport();
  },
  'print-report': () => {
    printCurrentReport();
  },
  'print-request': (button) => {
    printRequest(getRequest(button.dataset.id));
  }
};
