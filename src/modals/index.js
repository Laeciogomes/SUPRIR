// Registry de modais. Converte o antigo if/else gigante de renderModal em um
// mapa `type -> função` que devolve { content, size }. Cada função de modal
// produz exatamente o mesmo HTML (data-action, ids de formulário e classes)
// que o if-chain original de application.js. A função renderModal(state)
// resolve o conteúdo e o tamanho pelo registry e devolve o MESMO wrapper
// `<div class="modal-backdrop" ...><section class="modal modal-${size}" ...>`.
import { icon } from '../ui/icons.js';
import { escapeHtml, attr, formatDate, formatNumber, todayISO, selected, checked } from '../utils/formatters.js';
import { state } from '../app/state.js';
import {
  isAdmin,
  getRequest,
  getAllDeliveries,
  deliveredQuantityForItem
} from '../app/helpers.js';
import { schoolUsage } from '../views/schools.js';
import { profileLoginLabel } from '../views/users.js';

function renderAuthorizeModal(modal) {
  const request = getRequest(modal.requestId);
  const content = `
      <div class="modal-heading"><span class="modal-icon success">${icon('shield', 24)}</span><div><h2>Autorizar pedido</h2><p>${escapeHtml(request?.protocol_number || '')} • ${escapeHtml(request?.schools?.nome || '')}</p></div></div>
      <form id="authorization-form" class="modal-body stack-lg">
        <div class="callout info">${icon('info', 19)}<p>Informe a quantidade autorizada de cada item. O nome do usuário logado será salvo como responsável pela autorização.</p></div>
        <div class="authorization-items">
          <div class="editor-head auth"><span>Material</span><span>Solicitado</span><span>Autorizado</span><span>Observação da SME</span></div>
          ${(request?.request_items || []).map((item) => `<div class="editor-row auth"><div><strong>${escapeHtml(item.material_name_snapshot)}</strong><small>${escapeHtml(item.unit_snapshot)}</small></div><div class="requested-qty">${formatNumber(item.requested_quantity)}</div><label class="field mobile-label"><span>Autorizado</span><input type="number" name="approved_${item.id}" min="0" max="${attr(item.requested_quantity)}" step="0.01" value="${attr(Number(item.approved_quantity) || Number(item.requested_quantity))}" required /></label><label class="field mobile-label"><span>Observação</span><input type="text" name="notes_${item.id}" value="${attr(item.sme_notes || '')}" placeholder="Ajuste ou justificativa" /></label></div>`).join('')}
        </div>
        <label class="field"><span>Observação geral da autorização</span><textarea name="authorizationNotes" rows="3" placeholder="Condições, orientações ou justificativas">${escapeHtml(request?.authorization_notes || '')}</textarea></label>
        <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button success">${icon('shield', 18)} Confirmar autorização</button></div>
      </form>`;
  return { content, size: 'large' };
}

function renderRejectModal(modal) {
  const request = getRequest(modal.requestId);
  const content = `
      <div class="modal-heading"><span class="modal-icon danger">${icon('x', 24)}</span><div><h2>Rejeitar pedido</h2><p>${escapeHtml(request?.protocol_number || '')}</p></div></div>
      <form id="reject-form" class="modal-body form-stack"><div class="callout warning">${icon('alert', 19)}<p>O motivo ficará visível para a escola e será gravado na auditoria.</p></div><label class="field"><span>Motivo da rejeição *</span><textarea name="reason" rows="5" maxlength="1000" required placeholder="Explique de forma clara por que o pedido não foi autorizado"></textarea></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Voltar</button><button type="submit" class="button danger">${icon('x', 18)} Confirmar rejeição</button></div></form>`;
  return { content };
}

function renderDispatchModal(modal) {
  const request = getRequest(modal.requestId);
  const remaining = (request?.request_items || []).map((item) => ({ item, remaining: Math.max(0, Number(item.approved_quantity || 0) - deliveredQuantityForItem(request, item.id, true)) })).filter((entry) => entry.remaining > 0.00001);
  const content = `
      <div class="modal-heading"><span class="modal-icon primary">${icon('truck', 24)}</span><div><h2>Registrar saída / remessa</h2><p>${escapeHtml(request?.protocol_number || '')} • ${escapeHtml(request?.schools?.nome || '')}</p></div></div>
      <form id="dispatch-form" class="modal-body stack-lg">
        <div class="form-grid two"><label class="field"><span>Data da saída *</span><input type="date" name="dispatchDate" value="${todayISO()}" max="${todayISO()}" required /></label><label class="field"><span>Número da guia / documento</span><input type="text" name="documentNumber" placeholder="Ex.: GUIA-2026-00125" /></label><label class="field"><span>Quem fará a entrega *</span><input type="text" name="deliveredByName" required placeholder="Nome completo" /></label><label class="field"><span>Setor / vínculo</span><input type="text" name="deliveredByDepartment" value="SME / Almoxarifado" /></label></div>
        <div><h3 class="mini-title">Itens da remessa</h3><p class="muted">Informe somente o que está saindo nesta remessa. É possível fazer entregas parciais.</p></div>
        <div class="dispatch-items"><div class="editor-head dispatch"><span>Material</span><span>Autorizado</span><span>Já expedido</span><span>Saldo</span><span>Enviar agora</span></div>${remaining.map(({ item, remaining: balance }) => {
          const already = deliveredQuantityForItem(request, item.id, true);
          return `<div class="editor-row dispatch"><div><strong>${escapeHtml(item.material_name_snapshot)}</strong><small>${escapeHtml(item.unit_snapshot)}</small></div><span>${formatNumber(item.approved_quantity)}</span><span>${formatNumber(already)}</span><strong>${formatNumber(balance)}</strong><label class="field mobile-label"><span>Enviar agora</span><input type="number" name="dispatch_${item.id}" min="0" max="${attr(balance)}" step="0.01" value="${attr(balance)}" /></label></div>`;
        }).join('')}</div>
        <label class="field"><span>Observações da remessa</span><textarea name="observations" rows="3" placeholder="Rota, veículo, volumes ou outras informações"></textarea></label>
        <div class="callout info">${icon('user', 19)}<p>O sistema salvará automaticamente <strong>${escapeHtml(state.profile.full_name)}</strong> como responsável pelo registro desta saída.</p></div>
        <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('truck', 18)} Registrar remessa</button></div>
      </form>`;
  return { content, size: 'large' };
}

function renderReceiptModal(modal) {
  const delivery = getAllDeliveries().find((item) => item.id === modal.deliveryId);
  const content = `
      <div class="modal-heading"><span class="modal-icon success">${icon('check', 24)}</span><div><h2>Registrar recebimento</h2><p>${escapeHtml(delivery?.delivery_number || '')} • ${escapeHtml(delivery?.school?.nome || '')}</p></div></div>
      <form id="receipt-form" class="modal-body form-stack">
        <div class="callout info">${icon('shield', 19)}<p>Este registro identifica quem recebeu na escola e quem lançou o recebimento no sistema.</p></div>
        <div class="form-grid two"><label class="field"><span>Data do recebimento *</span><input type="date" name="receiptDate" value="${todayISO()}" min="${attr(delivery?.dispatch_date || delivery?.delivery_date || '')}" max="${todayISO()}" required /></label><label class="field"><span>Nome de quem recebeu *</span><input type="text" name="receivedByName" required placeholder="Responsável na escola" /></label><label class="field"><span>Cargo / função</span><input type="text" name="receivedByPosition" placeholder="Diretor(a), secretário(a), servidor(a)..." /></label><label class="field"><span>Documento / matrícula</span><input type="text" name="receivedByDocument" placeholder="Opcional" /></label></div>
        <label class="field"><span>Observações do recebimento</span><textarea name="receiptNotes" rows="3" placeholder="Conferência, ressalvas ou informação complementar"></textarea></label>
        <div class="audit-preview"><span>${icon('user', 18)}</span><div><small>Registro realizado por</small><strong>${escapeHtml(state.profile.full_name)}</strong><p>${escapeHtml(state.profile.email || '')}</p></div></div>
        <div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button success">${icon('check', 18)} Confirmar recebimento</button></div>
      </form>`;
  return { content };
}

function renderConfirmDeliveryModal(modal) {
  const delivery = getAllDeliveries().find((item) => item.id === modal.deliveryId);
  const content = `
      <div class="modal-heading"><span class="modal-icon success">${icon('check', 24)}</span><div><h2>Confirmar entrega</h2><p>${escapeHtml(delivery?.delivery_number || '')}</p></div></div>
      <form id="confirm-delivery-form" class="modal-body form-stack"><div class="receipt-summary"><strong>Recebimento registrado pela SME</strong><p>${formatDate(delivery?.receipt_date || delivery?.delivery_date)} • Recebedor: ${escapeHtml(delivery?.received_by_name || '—')}</p></div><label class="field"><span>Observação da escola</span><textarea name="notes" rows="4" placeholder="Informe alguma ressalva ou deixe em branco para confirmar sem observações"></textarea></label><label class="confirmation-check"><input type="checkbox" name="confirmed" required /><span>Confirmo que os materiais desta remessa foram recebidos pela unidade escolar.</span></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Voltar</button><button type="submit" class="button success">${icon('check', 18)} Confirmar no sistema</button></div></form>`;
  return { content };
}

function renderCancelRequestModal(modal) {
  const request = getRequest(modal.requestId);
  const content = `<div class="modal-heading"><span class="modal-icon danger">${icon('alert', 24)}</span><div><h2>Cancelar pedido</h2><p>${escapeHtml(request?.protocol_number || '')}</p></div></div><form id="cancel-request-form" class="modal-body form-stack"><div class="callout warning">${icon('alert', 19)}<p>O cancelamento fica registrado no histórico e não pode ser desfeito pela tela.</p></div><label class="field"><span>Motivo do cancelamento *</span><textarea name="reason" rows="5" required placeholder="Informe a justificativa"></textarea></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Voltar</button><button type="submit" class="button danger">${icon('x', 18)} Cancelar pedido</button></div></form>`;
  return { content };
}

function renderForgotPasswordModal(modal) {
  const content = `<div class="modal-heading"><span class="modal-icon primary">${icon('key', 24)}</span><div><h2>Recuperar senha</h2><p>Acesso da equipe da SME</p></div></div><form id="forgot-password-form" class="modal-body form-stack"><div class="callout info">${icon('info', 19)}<p>Informe o e-mail cadastrado. Se ele existir no sistema, o Supabase enviará as instruções de recuperação.</p></div><label class="field"><span>E-mail do acesso *</span><input type="email" name="email" value="${attr(modal.email || '')}" placeholder="nome@caninde.ce.gov.br" required /></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('mail', 18)} Enviar instruções</button></div></form>`;
  return { content };
}

function renderSchoolFormModal(modal) {
  const school = state.schools.find((item) => item.id === modal.schoolId) || {};
  const content = `<div class="modal-heading"><span class="modal-icon primary">${icon('school', 24)}</span><div><h2>${school.id ? 'Editar escola' : 'Cadastrar escola'}</h2><p>Dados da unidade escolar</p></div></div><form id="school-form" class="modal-body stack-lg"><div class="form-grid two"><label class="field span-2"><span>Nome da escola *</span><input type="text" name="nome" value="${attr(school.nome || '')}" required /></label><label class="field"><span>Código interno</span><input type="text" name="codigo" value="${attr(school.codigo || '')}" /></label><label class="field"><span>Código INEP</span><input type="text" name="inep" inputmode="numeric" value="${attr(school.inep || '')}" /></label><label class="field"><span>Código de acesso</span><input type="text" name="login_code" inputmode="numeric" value="${attr(school.login_code || school.inep || '')}" /><small>Usado pela escola na tela de login.</small></label><label class="field"><span>Diretor(a)</span><input type="text" name="diretor" value="${attr(school.diretor || '')}" /></label><label class="field"><span>Telefone</span><input type="text" name="telefone" value="${attr(school.telefone || '')}" /></label><label class="field"><span>E-mail</span><input type="email" name="email" value="${attr(school.email || '')}" /></label><label class="field"><span>Bairro</span><input type="text" name="bairro" value="${attr(school.bairro || '')}" /></label><label class="field span-2"><span>Endereço</span><input type="text" name="endereco" value="${attr(school.endereco || '')}" /></label><label class="field span-2"><span>Observações</span><textarea name="observacoes" rows="3">${escapeHtml(school.observacoes || '')}</textarea></label><label class="toggle-field span-2"><input type="checkbox" name="ativa" ${checked(school.id ? school.ativa : true)} /><span><strong>Escola ativa</strong><small>Permite vincular usuários e registrar novos pedidos.</small></span></label></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button>${school.id && isAdmin() ? `<button type="button" class="button danger-outline" data-action="open-school-delete" data-id="${school.id}">${icon('trash', 18)} Excluir escola</button>` : ''}<button type="submit" class="button primary">${icon('save', 18)} Salvar escola</button></div></form>`;
  return { content, size: 'large' };
}

function renderSchoolDeleteModal(modal) {
  const school = state.schools.find((item) => item.id === modal.schoolId);
  const usage = schoolUsage(modal.schoolId);
  const blocked = usage.requests > 0;
  const content = `<div class="modal-heading"><span class="modal-icon danger">${icon('trash', 24)}</span><div><h2>Excluir escola</h2><p>${escapeHtml(school?.nome || 'Unidade escolar')}</p></div></div><div class="modal-body form-stack"><div class="school-delete-summary"><article><span>Pedidos vinculados</span><strong>${usage.requests}</strong></article><article><span>Usuários vinculados</span><strong>${usage.users}</strong></article></div>${blocked ? `<div class="callout warning">${icon('alert', 19)}<p>Esta escola possui pedidos ou movimentações registrados. Para preservar o histórico e os relatórios, ela não pode ser excluída. Desative a escola no cadastro para impedir novos pedidos.</p></div>` : `<div class="callout warning">${icon('alert', 19)}<p>Esta ação remove a escola do cadastro. Se existirem usuários vinculados, eles ficarão sem escola e precisarão ser revisados na tela de usuários.</p></div><label class="confirmation-check"><input type="checkbox" required data-delete-school-confirm /><span>Confirmo que desejo excluir definitivamente esta escola do cadastro.</span></label>`}<div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Fechar</button>${!blocked ? `<button type="button" class="button danger" data-action="confirm-delete-school" data-id="${modal.schoolId}">${icon('trash', 18)} Excluir definitivamente</button>` : ''}</div></div>`;
  return { content };
}

function renderInstallAppModal(modal) {
  const reasonText = modal.reason === 'ios'
    ? 'No iPhone, a Apple não libera instalação automática por botão. Use o Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.'
    : modal.reason === 'insecure'
      ? 'Para o botão instalar abrir automaticamente, acesse pelo endereço publicado no Cloudflare com HTTPS ou por http://127.0.0.1 durante os testes.'
      : modal.reason === 'cancelled'
        ? 'A instalação foi cancelada. Você pode tentar novamente pelo botão abaixo ou usar o menu do navegador.'
        : 'Quando o navegador permitir, este botão abre a janela nativa de instalação do aplicativo.';
  const content = `<div class="modal-heading"><span class="modal-icon primary">${icon('smartphone', 24)}</span><div><h2>Instalar como aplicativo</h2><p>Use o sistema como app no celular, tablet ou computador.</p></div></div><div class="modal-body stack-lg"><div class="callout info">${icon('info', 19)}<p>${escapeHtml(reasonText)}</p></div><div class="install-steps"><article><strong>Android / Chrome</strong><span>Toque em “Instalar agora”. Se o navegador não abrir a instalação, abra o menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.</span></article><article><strong>iPhone / Safari</strong><span>Toque no botão de compartilhar e depois em “Adicionar à Tela de Início”. Esse é o método exigido pelo iOS.</span></article><article><strong>Computador / Edge ou Chrome</strong><span>Clique no ícone de instalação na barra de endereço ou use o botão “Instalar agora”.</span></article></div><div class="callout warning">${icon('shield', 19)}<p>O instalador automático só aparece em ambiente seguro: Cloudflare Pages com HTTPS ou teste local em 127.0.0.1.</p></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Fechar</button>${modal.reason !== 'ios' ? `<button type="button" class="button primary" data-action="install-app">${icon('smartphone', 18)} Instalar agora</button>` : ''}</div></div>`;
  return { content };
}

function renderMaterialFormModal(modal) {
  const material = state.materials.find((item) => item.id === modal.materialId) || {};
  const content = `<div class="modal-heading"><span class="modal-icon primary">${icon('box', 24)}</span><div><h2>${material.id ? 'Editar material' : 'Cadastrar material'}</h2><p>Item disponível no catálogo</p></div></div><form id="material-form" class="modal-body form-stack"><div class="form-grid two"><label class="field span-2"><span>Nome do material *</span><input type="text" name="nome" value="${attr(material.nome || '')}" required /></label><label class="field"><span>Código</span><input type="text" name="codigo" value="${attr(material.codigo || '')}" /></label><label class="field"><span>Categoria</span><input type="text" name="categoria" value="${attr(material.categoria || '')}" placeholder="Ex.: Papelaria" /></label><label class="field"><span>Unidade de medida *</span><input type="text" name="unidade" value="${attr(material.unidade || 'un')}" required placeholder="un, cx, pct, resma..." /></label><label class="field"><span>Quantidade mínima</span><input type="number" name="quantidade_minima" value="${attr(material.quantidade_minima || '')}" min="0" step="0.01" /></label><label class="field span-2"><span>Descrição / especificação</span><textarea name="descricao" rows="4">${escapeHtml(material.descricao || '')}</textarea></label><label class="toggle-field span-2"><input type="checkbox" name="ativo" ${checked(material.id ? material.ativo : true)} /><span><strong>Material ativo</strong><small>Fica disponível para solicitação pelas escolas.</small></span></label></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('save', 18)} Salvar material</button></div></form>`;
  return { content };
}

function renderUserCreateModal() {
  const content = `<div class="modal-heading"><span class="modal-icon primary">${icon('users', 24)}</span><div><h2>Criar novo usuário</h2><p>Para escolas, o login será o código cadastrado na unidade.</p></div></div><form id="user-create-form" class="modal-body stack-lg"><div class="form-grid two"><label class="field span-2"><span>Nome completo *</span><input type="text" name="fullName" required /></label><label class="field"><span>Tipo de portal *</span><select name="accountType" data-user-account-type><option value="school">Escola</option><option value="sme">SME</option></select></label><label class="field"><span>Telefone</span><input type="text" name="phone" /></label><label class="field user-email-field hidden"><span>E-mail institucional *</span><input type="email" name="email" placeholder="nome@caninde.ce.gov.br" /></label><label class="field user-school-field"><span>Escola vinculada *</span><select name="schoolId" required><option value="">Selecione</option>${state.schools.filter((school) => school.ativa).map((school) => `<option value="${school.id}">${escapeHtml(school.nome)} • ${escapeHtml(school.login_code || school.inep || 'sem código')}</option>`).join('')}</select><small>O código da escola será usado como login.</small></label><label class="field user-permission-field hidden"><span>Permissão na SME *</span><select name="permissionLevel"><option value="sme_operator">Operador</option><option value="sme_manager">Gestor / autorizador</option><option value="sme_admin">Administrador</option></select></label><label class="field"><span>Cargo / função</span><input type="text" name="position" /></label><label class="field"><span>Senha temporária</span><input type="text" name="password" minlength="6" placeholder="Escola: PIN de 6 dígitos; SME: 8+ caracteres" /></label></div><div class="callout warning">${icon('key', 19)}<p>Para escolas, um PIN de 6 dígitos pode ser usado no primeiro acesso. Depois do login, o sistema exige a troca por uma senha pessoal com pelo menos 8 caracteres.</p></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('plus', 18)} Criar acesso</button></div></form>`;
  return { content, size: 'large' };
}

function renderSchoolImportModal() {
  const content = `<div class="modal-heading"><span class="modal-icon primary">${icon('download', 24)}</span><div><h2>Importar escolas e acessos</h2><p>Cadastre várias unidades e seus PINs temporários em uma única operação.</p></div></div><form id="school-import-form" class="modal-body stack-lg"><div class="import-file-zone"><span class="import-file-icon">${icon('filecheck', 30)}</span><div><strong>Selecione o arquivo CSV</strong><p>Colunas obrigatórias: NM_ESCOLA, DC_LOGIN e SENHA.</p></div><input type="file" name="csvFile" accept=".csv,.txt,text/csv,text/plain" required /></div><div class="import-help-grid"><article><strong>NM_ESCOLA</strong><span>Nome completo da unidade</span></article><article><strong>DC_LOGIN</strong><span>Código numérico usado no login</span></article><article><strong>SENHA</strong><span>PIN inicial de 6 dígitos</span></article></div><label class="toggle-field"><input type="checkbox" name="overwritePasswords" /><span><strong>Redefinir senhas de acessos já existentes</strong><small>Deixe desmarcado ao repetir a importação para preservar senhas que já foram alteradas pelas escolas.</small></span></label><div class="callout warning">${icon('alert', 19)}<p>O arquivo contém credenciais temporárias. Faça a importação em computador seguro e apague o arquivo após confirmar o resultado.</p></div><div class="modal-actions split"><button type="button" class="button secondary" data-action="download-import-template">${icon('download', 18)} Baixar modelo</button><div class="button-row"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('check', 18)} Importar arquivo</button></div></div></form>`;
  return { content, size: 'large' };
}

function renderSchoolImportResultModal(modal) {
  const summary = modal.summary || {};
  const results = modal.results || [];
  const content = `<div class="modal-heading"><span class="modal-icon ${summary.errors ? 'warning' : 'success'}">${icon(summary.errors ? 'alert' : 'check', 24)}</span><div><h2>Resultado da importação</h2><p>${summary.errors ? 'A importação terminou com itens que precisam de revisão.' : 'Todas as linhas foram processadas.'}</p></div></div><div class="modal-body stack-lg"><div class="import-result-summary"><article><span>Linhas</span><strong>${Number(summary.total || 0)}</strong></article><article><span>Novos acessos</span><strong>${Number(summary.createdUsers || 0)}</strong></article><article><span>Atualizados</span><strong>${Number(summary.updatedUsers || 0) + Number(summary.linkedUsers || 0)}</strong></article><article class="${summary.errors ? 'has-error' : ''}"><span>Erros</span><strong>${Number(summary.errors || 0)}</strong></article></div><div class="table-wrap import-result-table"><table class="data-table"><thead><tr><th>Código</th><th>Escola</th><th>Resultado</th><th>Observação</th></tr></thead><tbody>${results.map((item) => `<tr><td data-label="Código"><span class="login-code-badge">${escapeHtml(item.loginCode || '—')}</span></td><td data-label="Escola"><strong class="cell-title">${escapeHtml(item.name || '—')}</strong></td><td data-label="Resultado">${item.status === 'error' ? '<span class="badge badge-red">Erro</span>' : item.status === 'created' ? '<span class="badge badge-green">Criado</span>' : '<span class="badge badge-blue">Atualizado</span>'}</td><td data-label="Observação">${escapeHtml(item.message || '')}</td></tr>`).join('')}</tbody></table></div><div class="modal-actions split"><button type="button" class="button secondary" data-action="download-import-report">${icon('download', 18)} Baixar relatório CSV</button><button type="button" class="button primary" data-action="close-modal">Concluído</button></div></div>`;
  return { content, size: 'large' };
}

function renderUserEditModal(modal) {
  const profile = state.profiles.find((item) => item.id === modal.profileId);
  const accountType = modal.accountType || profile?.account_type || 'school';
  const content = `<div class="modal-heading"><span class="modal-icon primary">${icon('user', 24)}</span><div><h2>Editar usuário</h2><p>${escapeHtml(profileLoginLabel(profile))}</p></div></div><form id="user-edit-form" class="modal-body stack-lg"><div class="form-grid two"><label class="field span-2"><span>Nome completo *</span><input type="text" name="fullName" value="${attr(profile?.full_name || '')}" required /></label><label class="field"><span>Tipo de portal *</span><select name="accountType" data-user-edit-account-type><option value="school" ${selected(accountType === 'school')}>Escola</option><option value="sme" ${selected(accountType === 'sme')}>SME</option></select></label><label class="field"><span>Telefone</span><input type="text" name="phone" value="${attr(profile?.phone || '')}" /></label><label class="field ${accountType === 'school' ? '' : 'hidden'}" data-user-edit-school><span>Escola vinculada *</span><select name="schoolId"><option value="">Selecione</option>${state.schools.map((school) => `<option value="${school.id}" ${selected(profile?.school_id === school.id)}>${escapeHtml(school.nome)}</option>`).join('')}</select></label><label class="field ${accountType === 'sme' ? '' : 'hidden'}" data-user-edit-permission><span>Permissão na SME *</span><select name="permissionLevel"><option value="sme_operator" ${selected(profile?.permission_level === 'sme_operator')}>Operador</option><option value="sme_manager" ${selected(profile?.permission_level === 'sme_manager')}>Gestor / autorizador</option><option value="sme_admin" ${selected(profile?.permission_level === 'sme_admin')}>Administrador</option></select></label><label class="field span-2"><span>Cargo / função</span><input type="text" name="position" value="${attr(profile?.position || '')}" /></label><label class="toggle-field span-2"><input type="checkbox" name="active" ${checked(profile?.active)} /><span><strong>Acesso ativo</strong><small>Usuários desativados não conseguem consultar nem alterar dados.</small></span></label></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('save', 18)} Salvar acesso</button></div></form>`;
  return { content, size: 'large' };
}

function renderPasswordResultModal(modal) {
  const content = `<div class="modal-heading"><span class="modal-icon success">${icon('key', 24)}</span><div><h2>Senha temporária gerada</h2><p>Copie e entregue ao usuário por um canal seguro.</p></div></div><div class="modal-body form-stack"><div class="temporary-password"><code>${escapeHtml(modal.password)}</code><button type="button" class="button secondary small" data-action="copy-password" data-password="${attr(modal.password)}">Copiar</button></div><div class="callout warning">${icon('alert', 19)}<p>Esta senha não será exibida novamente. No primeiro acesso, o sistema exigirá a troca.</p></div><div class="modal-actions"><button type="button" class="button primary" data-action="close-modal">Concluído</button></div></div>`;
  return { content };
}

function renderOwnPasswordModal() {
  const content = `<div class="modal-heading"><span class="modal-icon primary">${icon('key', 24)}</span><div><h2>Alterar minha senha</h2><p>Cadastre uma nova senha de acesso.</p></div></div><form id="own-password-form" class="modal-body form-stack"><label class="field"><span>Nova senha *</span><input type="password" name="password" minlength="8" required /></label><label class="field"><span>Confirmar senha *</span><input type="password" name="confirmPassword" minlength="8" required /></label><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button type="submit" class="button primary">${icon('key', 18)} Alterar senha</button></div></form>`;
  return { content };
}

// Mapa type -> função de render do modal.
export const MODAL_REGISTRY = {
  authorize: renderAuthorizeModal,
  reject: renderRejectModal,
  dispatch: renderDispatchModal,
  receipt: renderReceiptModal,
  confirmDelivery: renderConfirmDeliveryModal,
  cancelRequest: renderCancelRequestModal,
  forgotPassword: renderForgotPasswordModal,
  schoolForm: renderSchoolFormModal,
  schoolDelete: renderSchoolDeleteModal,
  installApp: renderInstallAppModal,
  materialForm: renderMaterialFormModal,
  userCreate: renderUserCreateModal,
  schoolImport: renderSchoolImportModal,
  schoolImportResult: renderSchoolImportResultModal,
  userEdit: renderUserEditModal,
  passwordResult: renderPasswordResultModal,
  ownPassword: renderOwnPasswordModal
};

export function renderModal() {
  const modal = state.modal;
  if (!modal) return '';
  const renderer = MODAL_REGISTRY[modal.type];
  let content = '';
  let size = modal.size || 'medium';
  if (renderer) {
    const result = renderer(modal) || {};
    content = result.content || '';
    size = result.size || modal.size || 'medium';
  }

  return `<div class="modal-backdrop" data-modal-backdrop><section class="modal modal-${size}" role="dialog" aria-modal="true"><button type="button" class="icon-button modal-close" data-action="close-modal" aria-label="Fechar janela">${icon('x', 20)}</button>${content}</section></div>`;
}
