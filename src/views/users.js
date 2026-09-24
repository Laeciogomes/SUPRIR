// View de usuários e acessos.
import { PERMISSIONS } from '../constants/workflow.js';
import { icon } from '../ui/icons.js';
import { escapeHtml, initials, attr } from '../utils/formatters.js';
import { state } from '../app/state.js';
import { getSchoolName, getSchoolLoginCode } from '../app/helpers.js';
import { statCard } from './shell.js';
import { renderEmptyState } from './requests.js';

const normalizeSearch = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

function paginate(items, page, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  const offset = (currentPage - 1) * pageSize;
  return {
    rows: items.slice(offset, offset + pageSize),
    currentPage,
    totalPages,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + pageSize, total)
  };
}

function renderPagination(scope, pageData) {
  if (!pageData.total) return '';
  return `
    <div class="list-pagination">
      <span class="list-pagination-summary">Mostrando <strong>${pageData.start}–${pageData.end}</strong> de <strong>${pageData.total}</strong></span>
      <div class="list-pagination-controls">
        <button type="button" class="button secondary small" data-action="set-list-page" data-scope="${scope}" data-page="${pageData.currentPage - 1}" ${pageData.currentPage <= 1 ? 'disabled' : ''}>${icon('back', 16)} Anterior</button>
        <span class="page-indicator">Página <strong>${pageData.currentPage}</strong> de ${pageData.totalPages}</span>
        <button type="button" class="button secondary small" data-action="set-list-page" data-scope="${scope}" data-page="${pageData.currentPage + 1}" ${pageData.currentPage >= pageData.totalPages ? 'disabled' : ''}>Próxima ${icon('chevron', 16)}</button>
      </div>
    </div>`;
}

export function profileLoginLabel(profile) {
  return profile?.account_type === 'school'
    ? `Código ${getSchoolLoginCode(profile.school_id)}`
    : (profile?.email || '');
}

export function renderUsers() {
  const schoolUsers = state.profiles.filter((profile) => profile.account_type === 'school').length;
  const smeUsers = state.profiles.filter((profile) => profile.account_type === 'sme').length;
  const active = state.profiles.filter((profile) => profile.active).length;
  const search = normalizeSearch(state.filters.userSearch);
  const filteredProfiles = state.profiles.filter((profile) => {
    if (!search) return true;
    const userName = normalizeSearch(profile.full_name || '');
    const schoolName = profile.account_type === 'school' ? normalizeSearch(getSchoolName(profile.school_id)) : '';
    return userName.includes(search) || schoolName.includes(search);
  });
  const pageData = paginate(filteredProfiles, state.pagination.usersPage, state.pagination.pageSize);
  state.pagination.usersPage = pageData.currentPage;

  return `
    <div class="stack-lg">
      <section class="security-banner"><span>${icon('shield', 28)}</span><div><strong>Gestão segura de acessos</strong><p>As contas são criadas por funções protegidas do Cloudflare. A chave administrativa do Supabase nunca é enviada ao navegador.</p></div></section>
      <section class="stats-grid three">
        ${statCard('school', 'Usuários de escola', String(schoolUsers), 'acessos vinculados', 'blue')}
        ${statCard('building', 'Equipe da SME', String(smeUsers), 'perfis internos ativos', 'primary')}
        ${statCard('check', 'Acessos ativos', String(active), 'usuários liberados', 'green')}
      </section>

      <section class="panel filter-panel">
        <div class="filter-grid two">
          <label class="field search-field"><span>Pesquisar usuário</span><div class="input-with-icon">${icon('search', 18)}<input type="search" value="${attr(state.filters.userSearch)}" data-filter="userSearch" placeholder="Digite o nome do usuário ou da escola" /></div></label>
          <div class="filter-summary"><span>Resultados</span><strong>${filteredProfiles.length}</strong><small>de ${state.profiles.length} usuários</small></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-heading inline"><div><h3>Usuários cadastrados</h3><p>Crie contas individuais ou importe escolas e senhas iniciais por arquivo CSV. A lista exibe ${state.pagination.pageSize} registros por página.</p></div><div class="panel-heading-actions"><button type="button" class="button secondary" data-action="open-school-import">${icon('download', 18)} Importar escolas</button><button type="button" class="button primary" data-action="open-user-create">${icon('plus', 18)} Criar usuário</button></div></div>
        ${filteredProfiles.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Usuário</th><th>Portal</th><th>Permissão</th><th>Vínculo / cargo</th><th>Situação</th><th class="align-right">Ações</th></tr></thead><tbody>
          ${pageData.rows.map((profile) => `<tr><td data-label="Usuário"><div class="user-cell"><span class="avatar small">${escapeHtml(initials(profile.full_name || profile.email))}</span><div><strong>${escapeHtml(profile.full_name || 'Sem nome')}</strong><small>${escapeHtml(profileLoginLabel(profile))}</small></div></div></td><td data-label="Portal">${profile.account_type === 'school' ? '<span class="badge badge-blue">Escola</span>' : '<span class="badge badge-green">Equipe SME</span>'}</td><td data-label="Permissão">${escapeHtml(PERMISSIONS[profile.permission_level] || profile.permission_level)}</td><td data-label="Vínculo / cargo"><strong class="cell-title">${profile.account_type === 'school' ? escapeHtml(getSchoolName(profile.school_id)) : escapeHtml(profile.position || 'Secretaria Municipal de Educação')}</strong><small class="cell-sub">${escapeHtml(profile.phone || '')}</small></td><td data-label="Situação">${profile.active ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-red">Desativado</span>'}${profile.must_change_password ? '<small class="cell-sub">Senha temporária</small>' : ''}</td><td class="align-right" data-label="Ações"><div class="table-actions"><button type="button" class="button icon-only secondary" data-action="open-user-edit" data-id="${profile.id}" title="Editar acesso">${icon('edit', 18)}</button><button type="button" class="button icon-only secondary" data-action="reset-user-password" data-id="${profile.id}" title="Gerar nova senha temporária">${icon('key', 18)}</button></div></td></tr>`).join('')}
        </tbody></table></div>${renderPagination('users', pageData)}` : renderEmptyState('search', 'Nenhum usuário encontrado', 'Tente pesquisar outro nome ou limpe o campo de pesquisa.')}
      </section>
    </div>`;
}
