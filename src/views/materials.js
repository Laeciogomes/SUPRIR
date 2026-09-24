import { icon } from '../ui/icons.js';
import { escapeHtml, truncate, formatNumber, formatDateTime, attr } from '../utils/formatters.js';
import { state } from '../app/state.js';
import { canManageMaterials } from '../app/helpers.js';
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

function stockStatus(material) {
  const stock = Number(material.stock_quantity || 0);
  const minimum = Number(material.quantidade_minima || 0);
  if (!material.ativo) return '<span class="badge badge-slate">Inativo</span>';
  if (stock <= 0) return '<span class="badge badge-red">Sem estoque</span>';
  if (minimum > 0 && stock <= minimum) return '<span class="badge badge-amber">Estoque baixo</span>';
  return '<span class="badge badge-green">Disponível</span>';
}

function stockClass(material) {
  const stock = Number(material.stock_quantity || 0);
  const minimum = Number(material.quantidade_minima || 0);
  if (stock <= 0) return 'stock-zero';
  if (minimum > 0 && stock <= minimum) return 'stock-low';
  return 'stock-ok';
}

export function renderMaterials() {
  const active = state.materials.filter((material) => material.ativo);
  const withStock = active.filter((material) => Number(material.stock_quantity || 0) > 0);
  const outOfStock = active.filter((material) => Number(material.stock_quantity || 0) <= 0);
  const lowStock = active.filter((material) => {
    const minimum = Number(material.quantidade_minima || 0);
    const stock = Number(material.stock_quantity || 0);
    return minimum > 0 && stock > 0 && stock <= minimum;
  });
  const movements = state.inventoryMovements || [];
  const canManage = canManageMaterials();
  const search = normalizeSearch(state.filters.materialSearch);
  const filteredMaterials = state.materials.filter((material) => !search || normalizeSearch(material.nome).includes(search));
  const pageData = paginate(filteredMaterials, state.pagination.materialsPage, state.pagination.pageSize);
  state.pagination.materialsPage = pageData.currentPage;

  return `
    <div class="stack-lg stock-page">
      <section class="stats-grid four">
        ${statCard('box', 'Materiais ativos', String(active.length), 'itens cadastrados no catálogo', 'primary')}
        ${statCard('check', 'Com estoque', String(withStock.length), 'visíveis para solicitação', 'green')}
        ${statCard('alert', 'Sem estoque', String(outOfStock.length), 'ocultos para as escolas', 'slate')}
        ${statCard('clock', 'Estoque baixo', String(lowStock.length), 'no mínimo ou abaixo dele', 'amber')}
      </section>

      <section class="panel filter-panel">
        <div class="filter-grid two">
          <label class="field search-field"><span>Pesquisar material</span><div class="input-with-icon">${icon('search', 18)}<input type="search" value="${attr(state.filters.materialSearch)}" data-filter="materialSearch" placeholder="Digite o nome do material" /></div></label>
          <div class="filter-summary"><span>Resultados</span><strong>${filteredMaterials.length}</strong><small>de ${state.materials.length} materiais</small></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-heading inline">
          <div>
            <h3>Estoque de materiais</h3>
            <p>O saldo é atualizado pelas entradas do almoxarifado e baixado automaticamente quando uma remessa é expedida. A lista exibe ${state.pagination.pageSize} materiais por página.</p>
          </div>
          ${canManage ? `<div class="button-row"><button type="button" class="button secondary" data-action="open-stock-entry">${icon('plus', 18)} Registrar entrada</button><button type="button" class="button primary" data-action="open-material-form">${icon('box', 18)} Novo material</button></div>` : ''}
        </div>

        ${filteredMaterials.length ? `<div class="table-wrap"><table class="data-table stock-table"><thead><tr><th>Material</th><th>Código</th><th>Categoria</th><th>Unidade</th><th class="align-right">Estoque atual</th><th class="align-right">Estoque mínimo</th><th>Situação</th><th class="align-right">Ação</th></tr></thead><tbody>
          ${pageData.rows.map((material) => `<tr>
            <td data-label="Material"><strong class="cell-title">${escapeHtml(material.nome)}</strong><small class="cell-sub">${escapeHtml(truncate(material.descricao || '', 65))}</small></td>
            <td data-label="Código">${escapeHtml(material.codigo || '—')}</td>
            <td data-label="Categoria">${escapeHtml(material.categoria || '—')}</td>
            <td data-label="Unidade"><span class="unit-pill">${escapeHtml(material.unidade)}</span></td>
            <td class="align-right" data-label="Estoque atual"><strong class="stock-value ${stockClass(material)}">${formatNumber(material.stock_quantity || 0)}</strong><small class="cell-sub">${escapeHtml(material.unidade)}</small></td>
            <td class="align-right" data-label="Estoque mínimo">${material.quantidade_minima === null || material.quantidade_minima === undefined ? '—' : formatNumber(material.quantidade_minima)}</td>
            <td data-label="Situação">${stockStatus(material)}</td>
            <td class="align-right" data-label="Ação">${canManage ? `<div class="table-actions"><button type="button" class="button small success" data-action="open-stock-entry" data-id="${material.id}" title="Adicionar ao estoque">${icon('plus', 16)} Entrada</button><button type="button" class="button icon-only secondary" data-action="open-material-form" data-id="${material.id}" title="Editar material">${icon('edit', 18)}</button></div>` : '—'}</td>
          </tr>`).join('')}
        </tbody></table></div>${renderPagination('materials', pageData)}` : renderEmptyState('search', 'Nenhum material encontrado', 'Tente pesquisar outro nome ou limpe o campo de pesquisa.')}
      </section>

      <section class="panel">
        <div class="panel-heading inline"><div><h3>Movimentações recentes</h3><p>Histórico auditável das últimas entradas e saídas físicas do estoque.</p></div><span class="count-pill">${movements.length}</span></div>
        ${movements.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Material</th><th>Movimento</th><th class="align-right">Quantidade</th><th class="align-right">Saldo após</th><th>Documento</th><th>Responsável</th></tr></thead><tbody>
          ${movements.slice(0, 80).map((movement) => {
            const entry = movement.movement_type === 'entry';
            return `<tr><td data-label="Data">${formatDateTime(movement.created_at)}</td><td data-label="Material"><strong class="cell-title">${escapeHtml(movement.materials?.nome || 'Material')}</strong><small class="cell-sub">${escapeHtml(movement.materials?.unidade || '')}</small></td><td data-label="Movimento"><span class="badge ${entry ? 'badge-green' : 'badge-amber'}">${entry ? 'Entrada' : 'Saída'}</span></td><td class="align-right" data-label="Quantidade"><strong class="${entry ? 'movement-in' : 'movement-out'}">${entry ? '+' : '−'}${formatNumber(movement.quantity)}</strong></td><td class="align-right" data-label="Saldo após">${formatNumber(movement.balance_after)}</td><td data-label="Documento">${escapeHtml(movement.document_number || '—')}</td><td data-label="Responsável">${escapeHtml(movement.actor_name || movement.actor_email || '—')}</td></tr>`;
          }).join('')}
        </tbody></table></div>` : renderEmptyState('archive', 'Nenhuma movimentação registrada', 'As entradas e saídas realizadas a partir da V5.2.0 aparecerão aqui.')}
      </section>
    </div>`;
}
