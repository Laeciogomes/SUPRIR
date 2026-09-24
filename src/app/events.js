import { state } from './state.js';
import { app, render } from './router.js';
import { setToast, friendlyError } from './notices.js';
import { ACTIONS } from './actions.js';
import { SUBMIT_HANDLERS } from './forms.js';

// Registro dos quatro listeners delegados no elemento #app (click, input,
// change, submit). O comportamento foi apenas MOVIDO do monólito
// application.js: os early-returns de backdrop, o try/catch de tratamento de
// erro, o debounce de 250ms com preservação de cursor no filtro e os toggles
// de formulário permanecem idênticos. O despacho passou a usar os mapas
// ACTIONS e SUBMIT_HANDLERS em vez das antigas cadeias if/else.

export function registerEventListeners() {
  app.addEventListener('click', async (event) => {
    if (event.target.matches('[data-modal-backdrop]')) {
      state.modal = null;
      render();
      return;
    }
    if (event.target.matches('[data-notice-backdrop]')) {
      state.notice = null;
      render();
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    try {
      const handler = ACTIONS[action];
      if (handler) await handler(button, event);
    } catch (error) {
      console.error(error);
      state.loading = false;
      setToast('error', friendlyError(error));
      render();
    }
  });

  app.addEventListener('input', (event) => {
    const target = event.target;

    if (target.dataset.draftField && state.draft) {
      state.draft[target.dataset.draftField] = target.value;
    }
    if (target.dataset.draftItem && state.draft) {
      const index = Number(target.dataset.index);
      if (state.draft.items[index]) state.draft.items[index][target.dataset.draftItem] = target.value;
    }
    if (target.dataset.filter && target.matches('input')) {
      state.filters[target.dataset.filter] = target.value;
      const filterName = target.dataset.filter;
      if (filterName === 'userSearch') state.pagination.usersPage = 1;
      if (filterName === 'materialSearch') state.pagination.materialsPage = 1;
      window.clearTimeout(state.filterTimer);
      const cursor = target.selectionStart;
      state.filterTimer = window.setTimeout(() => {
        render();
        const refreshed = app.querySelector(`[data-filter="${filterName}"]`);
        if (refreshed) {
          refreshed.focus();
          if (typeof refreshed.setSelectionRange === 'function') refreshed.setSelectionRange(cursor, cursor);
        }
      }, 250);
    }
  });

  app.addEventListener('change', (event) => {
    const target = event.target;

    if (target.dataset.draftField && state.draft) state.draft[target.dataset.draftField] = target.value;
    if (target.dataset.draftItem && state.draft) {
      const index = Number(target.dataset.index);
      if (state.draft.items[index]) state.draft.items[index][target.dataset.draftItem] = target.value;
      if (target.dataset.draftItem === 'material_id') render();
    }
    if (target.dataset.filter) {
      state.filters[target.dataset.filter] = target.value;
      if (target.dataset.filter === 'userSearch') state.pagination.usersPage = 1;
      if (target.dataset.filter === 'materialSearch') state.pagination.materialsPage = 1;
      render();
    }
    if (target.dataset.reportFilter) {
      state.report[target.dataset.reportFilter] = target.value;
      render();
    }
    if (target.matches('[data-user-account-type]')) {
      const form = target.closest('form');
      const isSchoolAccount = target.value === 'school';
      const schoolField = form.querySelector('.user-school-field');
      const emailField = form.querySelector('.user-email-field');
      schoolField?.classList.toggle('hidden', !isSchoolAccount);
      emailField?.classList.toggle('hidden', isSchoolAccount);
      form.querySelector('.user-permission-field')?.classList.toggle('hidden', isSchoolAccount);
      const schoolSelect = schoolField?.querySelector('select');
      const emailInput = emailField?.querySelector('input');
      if (schoolSelect) schoolSelect.required = isSchoolAccount;
      if (emailInput) emailInput.required = !isSchoolAccount;
    }
    if (target.matches('[data-user-edit-account-type]')) {
      const form = target.closest('form');
      form.querySelector('[data-user-edit-school]')?.classList.toggle('hidden', target.value !== 'school');
      form.querySelector('[data-user-edit-permission]')?.classList.toggle('hidden', target.value !== 'sme');
    }
  });

  app.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;

    try {
      const handler = SUBMIT_HANDLERS[form.id];
      if (handler) await handler(form, event);
    } catch (error) {
      console.error(error);
      state.loading = false;
      setToast('error', friendlyError(error));
      render();
    }
  });
}
