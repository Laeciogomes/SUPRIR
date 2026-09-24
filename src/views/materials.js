// View do catálogo de materiais. Código MOVIDO de application.js sem
// alteração do HTML gerado.
import { icon } from '../ui/icons.js';
import { escapeHtml, truncate } from '../utils/formatters.js';
import { state } from '../app/state.js';
import { canManageMasterData } from '../app/helpers.js';
import { statCard } from './shell.js';
import { renderEmptyState } from './requests.js';

export function renderMaterials() {
  const active = state.materials.filter((material) => material.ativo).length;
  const categories = new Set(state.materials.map((material) => material.categoria).filter(Boolean)).size;
  return `
    <div class="stack-lg">
      <section class="stats-grid three">
        ${statCard('box', 'Materiais cadastrados', String(state.materials.length), 'itens no catálogo', 'primary')}
        ${statCard('check', 'Materiais ativos', String(active), 'disponíveis às escolas', 'green')}
        ${statCard('archive', 'Categorias', String(categories), 'grupos de materiais', 'violet')}
      </section>
      <section class="panel">
        <div class="panel-heading inline"><div><h3>Catálogo de materiais</h3><p>Somente itens ativos aparecem na tela de pedidos das escolas.</p></div>${canManageMasterData() ? `<button type="button" class="button primary" data-action="open-material-form">${icon('plus', 18)} Novo material</button>` : ''}</div>
        ${state.materials.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Material</th><th>Código</th><th>Categoria</th><th>Unidade</th><th>Descrição</th><th>Situação</th><th class="align-right">Ação</th></tr></thead><tbody>
          ${state.materials.map((material) => `<tr><td data-label="Material"><strong class="cell-title">${escapeHtml(material.nome)}</strong></td><td data-label="Código">${escapeHtml(material.codigo || '—')}</td><td data-label="Categoria">${escapeHtml(material.categoria || '—')}</td><td data-label="Unidade"><span class="unit-pill">${escapeHtml(material.unidade)}</span></td><td data-label="Descrição">${escapeHtml(truncate(material.descricao || '—', 72))}</td><td data-label="Situação">${material.ativo ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-slate">Inativo</span>'}</td><td class="align-right" data-label="Ação">${canManageMasterData() ? `<button type="button" class="button icon-only secondary" data-action="open-material-form" data-id="${material.id}" title="Editar">${icon('edit', 18)}</button>` : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : renderEmptyState('box', 'Nenhum material cadastrado', 'Cadastre o catálogo que será utilizado pelas escolas.', canManageMasterData() ? 'Novo material' : null, canManageMasterData() ? 'open-material-form' : null)}
      </section>
    </div>`;
}
