// Helpers de negócio/UI compartilhados entre as views e os modais.
// O código foi apenas MOVIDO de application.js, preservando o comportamento
// e o HTML gerado. Estes helpers dependem apenas de `state`, da configuração,
// das constantes de workflow e dos formatters — sem dependência circular com
// application.js.
import { CONFIG } from '../config/app-config.js';
import { STATUS, PRIORITY, INTERNAL_ROLES } from '../constants/workflow.js';
import { schoolLoginLabel } from '../auth/school-credentials.js';
import { escapeHtml, attr } from '../utils/formatters.js';
import { state } from './state.js';

export function isSchool() {
  return state.profile?.account_type === 'school';
}

export function isSme() {
  return state.profile?.account_type === 'sme';
}

export function hasInternalRole(roles = []) {
  return isSme() && roles.includes(state.profile?.permission_level);
}

export function canAuthorizeRequests() {
  return hasInternalRole(INTERNAL_ROLES.authorizer);
}

export function canOperateWarehouse() {
  return hasInternalRole(INTERNAL_ROLES.warehouse);
}


export function canManageMasterData() {
  return isAdmin();
}

// Compatibilidade semântica com os módulos antigos: "manager" agora é a
// função de análise/autorização, e não um papel genérico com acesso a todas as etapas.
export function isManager() {
  return canAuthorizeRequests();
}

export function isAdmin() {
  return hasInternalRole(INTERNAL_ROLES.admin);
}

export function internalRoleKey() {
  if (isAdmin()) return 'admin';
  if (canAuthorizeRequests()) return 'authorizer';
  if (canOperateWarehouse()) return 'warehouse';
  return 'staff';
}

export function imageTag(src, alt, className = '', fallbackSrc = CONFIG.logoFallbackUrl || CONFIG.compactLogoUrl) {
  const primary = src || fallbackSrc || '';
  const fallback = fallbackSrc || CONFIG.logoFallbackUrl || CONFIG.compactLogoUrl || '';
  const classAttr = className ? ` class="${attr(className)}"` : '';
  const errorAttr = fallback && fallback !== primary ? ` onerror="this.onerror=null;this.src='${attr(fallback)}';"` : '';
  return `<img src="${attr(primary)}" alt="${attr(alt)}"${classAttr}${errorAttr} />`;
}

export function institution() {
  return {
    municipalityName: state.settings?.municipality_name || CONFIG.municipalityName,
    departmentName: state.settings?.department_name || CONFIG.departmentName,
    logoUrl: state.settings?.logo_url || CONFIG.logoUrl,
    compactLogoUrl: state.settings?.compact_logo_url || CONFIG.compactLogoUrl,
    planningLogoUrl: state.settings?.planning_logo_url || CONFIG.planningLogoUrl,
    reportTitle: state.settings?.report_title || CONFIG.reportTitle,
    address: state.settings?.address || '',
    phone: state.settings?.phone || '',
    email: state.settings?.email || '',
    footerText: state.settings?.footer_text || ''
  };
}

export function statusBadge(status, context = 'default') {
  const config = STATUS[status] || { label: status || '—', tone: 'slate' };
  const label = context === 'school' ? config.school : config.label;
  return `<span class="badge badge-${config.tone}"><span class="badge-dot"></span>${escapeHtml(label)}</span>`;
}

export function priorityBadge(priority) {
  const config = PRIORITY[priority] || PRIORITY.normal;
  return `<span class="badge badge-${config.tone}">${escapeHtml(config.label)}</span>`;
}

export function getRequest(requestId = state.selectedRequestId) {
  return state.requests.find((request) => request.id === requestId) || null;
}

export function getSchool(schoolId) {
  return state.schools.find((school) => school.id === schoolId) || null;
}

export function getSchoolName(schoolId) {
  return getSchool(schoolId)?.nome || 'Escola não identificada';
}

export function getSchoolLoginCode(schoolId) {
  return schoolLoginLabel(getSchool(schoolId)) || 'Não cadastrado';
}

export function deliveredQuantityForItem(request, requestItemId, includeDispatched = false) {
  return (request.deliveries || []).reduce((total, delivery) => {
    const allowed = includeDispatched
      ? ['dispatched', 'delivered'].includes(delivery.status)
      : delivery.status === 'delivered';
    if (!allowed) return total;
    return total + (delivery.delivery_items || [])
      .filter((item) => item.request_item_id === requestItemId)
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, 0);
}

export function requestTotals(request) {
  const requested = (request.request_items || []).reduce((sum, item) => sum + Number(item.requested_quantity || 0), 0);
  const approved = (request.request_items || []).reduce((sum, item) => sum + Number(item.approved_quantity || 0), 0);
  const delivered = (request.request_items || []).reduce((sum, item) => sum + deliveredQuantityForItem(request, item.id), 0);
  return { requested, approved, delivered };
}

export function getAllDeliveries() {
  return state.requests.flatMap((request) => (request.deliveries || []).map((delivery) => ({
    ...delivery,
    request,
    school: request.schools || state.schools.find((school) => school.id === request.school_id)
  })));
}
