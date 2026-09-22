// View do perfil do usuário. Código MOVIDO de application.js sem
// alteração do HTML gerado.
import { PERMISSIONS } from '../constants/workflow.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, attr, formatDate, initials } from '../utils/formatters.js';
import { state } from '../app/state.js';
import { institution, getSchoolLoginCode } from '../app/helpers.js';
import { profileLoginLabel } from './users.js';

export function renderProfile() {
  const school = state.schools.find((item) => item.id === state.profile.school_id);
  return `
    <div class="profile-layout">
      <section class="profile-card panel">
        <div class="profile-cover"></div>
        <div class="profile-avatar">${escapeHtml(initials(state.profile.full_name || state.profile.email))}</div>
        <h2>${escapeHtml(state.profile.full_name || 'Usuário')}</h2>
        <p>${escapeHtml(profileLoginLabel(state.profile))}</p>
        <div class="profile-tags">${state.profile.account_type === 'school' ? '<span class="badge badge-blue">Portal Escola</span>' : '<span class="badge badge-green">Portal SME</span>'}<span class="badge badge-slate">${escapeHtml(PERMISSIONS[state.profile.permission_level] || '')}</span></div>
        <dl class="profile-facts"><div><dt>Vínculo</dt><dd>${escapeHtml(school?.nome || state.profile.position || institution().departmentName)}</dd></div><div><dt>Situação</dt><dd>Ativo</dd></div><div><dt>Usuário desde</dt><dd>${formatDate(state.profile.created_at)}</dd></div></dl>
      </section>
      <form id="profile-form" class="panel form-section">
        <div class="section-title"><span>${icon('user', 21)}</span><div><h3>Dados pessoais</h3><p>Atualize as informações usadas nos registros de auditoria.</p></div></div>
        <div class="form-grid two">
          <label class="field span-2"><span>Nome completo *</span><input type="text" name="full_name" value="${attr(state.profile.full_name || '')}" required /></label>
          <label class="field"><span>Telefone</span><input type="text" name="phone" value="${attr(state.profile.phone || '')}" /></label>
          <label class="field"><span>Cargo / função</span><input type="text" name="position" value="${attr(state.profile.position || '')}" /></label>
          <label class="field span-2"><span>${state.profile.account_type === 'school' ? 'Código de acesso' : 'E-mail de acesso'}</span><input type="text" value="${attr(state.profile.account_type === 'school' ? getSchoolLoginCode(state.profile.school_id) : (state.profile.email || ''))}" disabled /><small>${state.profile.account_type === 'school' ? 'O código é definido no cadastro da escola.' : 'A alteração de e-mail deve ser feita pelo administrador.'}</small></label>
        </div>
        <div class="profile-form-actions"><button type="submit" class="button primary">${icon('save', 18)} Salvar meu perfil</button><button type="button" class="button secondary" data-action="open-own-password">${icon('key', 18)} Alterar senha</button></div>
      </form>
    </div>`;
}
