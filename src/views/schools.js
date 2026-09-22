// View de cadastro de escolas. Código MOVIDO de application.js sem
// alteração do HTML gerado.
import { icon } from '../ui/icons.js';
import { escapeHtml, truncate } from '../utils/formatters.js';
import { state } from '../app/state.js';
import { isManager, isAdmin } from '../app/helpers.js';
import { statCard } from './shell.js';
import { renderEmptyState } from './requests.js';

export function schoolUsage(schoolId) {
  const requests = state.requests.filter((request) => request.school_id === schoolId).length;
  const users = state.profiles.filter((profile) => profile.school_id === schoolId).length;
  return { requests, users };
}

export function renderSchools() {
  const active = state.schools.filter((school) => school.ativa).length;
  const linkedUsers = new Set(state.profiles.filter((profile) => profile.school_id).map((profile) => profile.school_id)).size;
  return `
    <div class="stack-lg">
      <section class="stats-grid three">
        ${statCard('school', 'Escolas cadastradas', String(state.schools.length), 'unidades no sistema', 'primary')}
        ${statCard('check', 'Escolas ativas', String(active), 'disponíveis para pedidos', 'green')}
        ${statCard('users', 'Com acesso criado', String(linkedUsers), 'vínculos identificados', 'blue')}
      </section>
      <section class="panel">
        <div class="panel-heading inline"><div><h3>Unidades escolares</h3><p>Cadastre os dados institucionais e mantenha os vínculos atualizados.</p></div>${isManager() ? `<button type="button" class="button primary" data-action="open-school-form">${icon('plus', 18)} Nova escola</button>` : ''}</div>
        ${state.schools.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Escola</th><th>Identificação</th><th>Direção / contato</th><th>Endereço</th><th>Situação</th><th class="align-right">Ação</th></tr></thead><tbody>
          ${state.schools.map((school) => `<tr><td data-label="Escola"><strong class="cell-title">${escapeHtml(school.nome)}</strong><small class="cell-sub">${escapeHtml(school.email || '')}</small></td><td data-label="Identificação">${school.inep ? `INEP ${escapeHtml(school.inep)}` : '—'}<small class="cell-sub">Acesso: ${escapeHtml(school.login_code || school.inep || 'não cadastrado')}</small></td><td data-label="Direção / contato"><strong class="cell-title">${escapeHtml(school.diretor || '—')}</strong><small class="cell-sub">${escapeHtml(school.telefone || '')}</small></td><td data-label="Endereço">${escapeHtml(truncate([school.endereco, school.bairro].filter(Boolean).join(' • '), 60) || '—')}</td><td data-label="Situação">${school.ativa ? '<span class="badge badge-green">Ativa</span>' : '<span class="badge badge-slate">Inativa</span>'}</td><td class="align-right" data-label="Ação">${isManager() ? `<div class="table-actions"><button type="button" class="button icon-only secondary" data-action="open-school-form" data-id="${school.id}" title="Editar escola">${icon('edit', 18)}</button>${isAdmin() ? `<button type="button" class="button icon-only danger-outline" data-action="open-school-delete" data-id="${school.id}" title="Excluir escola">${icon('trash', 18)}</button>` : ''}</div>` : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : renderEmptyState('school', 'Nenhuma escola cadastrada', 'Cadastre as unidades que utilizarão o portal.', isManager() ? 'Nova escola' : null, isManager() ? 'open-school-form' : null)}
      </section>
    </div>`;
}
