// View de usuários e acessos. Código MOVIDO de application.js sem
// alteração do HTML gerado.
import { PERMISSIONS } from '../constants/workflow.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, initials } from '../utils/formatters.js';
import { state } from '../app/state.js';
import { getSchoolName, getSchoolLoginCode } from '../app/helpers.js';
import { statCard } from './shell.js';
import { renderEmptyState } from './requests.js';

export function profileLoginLabel(profile) {
  return profile?.account_type === 'school'
    ? `Código ${getSchoolLoginCode(profile.school_id)}`
    : (profile?.email || '');
}

export function renderUsers() {
  const schoolUsers = state.profiles.filter((profile) => profile.account_type === 'school').length;
  const smeUsers = state.profiles.filter((profile) => profile.account_type === 'sme').length;
  const active = state.profiles.filter((profile) => profile.active).length;
  return `
    <div class="stack-lg">
      <section class="security-banner"><span>${icon('shield', 28)}</span><div><strong>Gestão segura de acessos</strong><p>As contas são criadas por funções protegidas do Cloudflare. A chave administrativa do Supabase nunca é enviada ao navegador.</p></div></section>
      <section class="stats-grid three">
        ${statCard('school', 'Usuários de escola', String(schoolUsers), 'acessos vinculados', 'blue')}
        ${statCard('building', 'Equipe da SME', String(smeUsers), 'perfis internos ativos', 'primary')}
        ${statCard('check', 'Acessos ativos', String(active), 'usuários liberados', 'green')}
      </section>
      <section class="panel">
        <div class="panel-heading inline"><div><h3>Usuários cadastrados</h3><p>Crie contas individuais ou importe escolas e senhas iniciais por arquivo CSV.</p></div><div class="panel-heading-actions"><button type="button" class="button secondary" data-action="open-school-import">${icon('download', 18)} Importar escolas</button><button type="button" class="button primary" data-action="open-user-create">${icon('plus', 18)} Criar usuário</button></div></div>
        ${state.profiles.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Usuário</th><th>Portal</th><th>Permissão</th><th>Vínculo / cargo</th><th>Situação</th><th class="align-right">Ações</th></tr></thead><tbody>
          ${state.profiles.map((profile) => `<tr><td data-label="Usuário"><div class="user-cell"><span class="avatar small">${escapeHtml(initials(profile.full_name || profile.email))}</span><div><strong>${escapeHtml(profile.full_name || 'Sem nome')}</strong><small>${escapeHtml(profileLoginLabel(profile))}</small></div></div></td><td data-label="Portal">${profile.account_type === 'school' ? '<span class="badge badge-blue">Escola</span>' : '<span class="badge badge-green">Equipe SME</span>'}</td><td data-label="Permissão">${escapeHtml(PERMISSIONS[profile.permission_level] || profile.permission_level)}</td><td data-label="Vínculo / cargo"><strong class="cell-title">${profile.account_type === 'school' ? escapeHtml(getSchoolName(profile.school_id)) : escapeHtml(profile.position || 'Secretaria Municipal de Educação')}</strong><small class="cell-sub">${escapeHtml(profile.phone || '')}</small></td><td data-label="Situação">${profile.active ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-red">Desativado</span>'}${profile.must_change_password ? '<small class="cell-sub">Senha temporária</small>' : ''}</td><td class="align-right" data-label="Ações"><div class="table-actions"><button type="button" class="button icon-only secondary" data-action="open-user-edit" data-id="${profile.id}" title="Editar acesso">${icon('edit', 18)}</button><button type="button" class="button icon-only secondary" data-action="reset-user-password" data-id="${profile.id}" title="Gerar nova senha temporária">${icon('key', 18)}</button></div></td></tr>`).join('')}
        </tbody></table></div>` : renderEmptyState('users', 'Nenhum usuário encontrado', 'Importe as escolas ou crie o primeiro acesso para a equipe da SME.', 'Importar escolas', 'open-school-import')}
      </section>
    </div>`;
}
