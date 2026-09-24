export const STATUS = Object.freeze({
  draft: { label: 'Rascunho', school: 'Rascunho', tone: 'slate' },
  submitted: { label: 'Aguardando recebimento', school: 'Enviado à SME', tone: 'blue' },
  under_review: { label: 'Em análise', school: 'Em análise pela SME', tone: 'amber' },
  approved: { label: 'Autorizado', school: 'Pedido autorizado', tone: 'green' },
  rejected: { label: 'Rejeitado', school: 'Pedido rejeitado', tone: 'red' },
  preparing: { label: 'Em separação', school: 'Materiais em separação', tone: 'violet' },
  dispatched: { label: 'Aguardando recebimento', school: 'Materiais enviados', tone: 'cyan' },
  partially_delivered: { label: 'Recebimento parcial', school: 'Recebido parcialmente', tone: 'orange' },
  delivered: { label: 'Concluído', school: 'Pedido recebido', tone: 'emerald' },
  cancelled: { label: 'Cancelado', school: 'Cancelado', tone: 'slate' }
});

export const PRIORITY = Object.freeze({
  low: { label: 'Baixa', tone: 'slate' },
  normal: { label: 'Normal', tone: 'blue' },
  high: { label: 'Alta', tone: 'orange' },
  urgent: { label: 'Urgente', tone: 'red' }
});

export const PERMISSIONS = Object.freeze({
  school_user: 'Usuário da escola',
  sme_authorizer: 'SME • Análise e autorização',
  warehouse_operator: 'Almoxarifado • Separação e expedição',
  system_admin: 'Administrador do sistema',

  // Rótulos de compatibilidade para instalações anteriores.
  sme_operator: 'Operador legado',
  sme_manager: 'Gestor legado',
  sme_admin: 'Administrador legado'
});

export const INTERNAL_ROLES = Object.freeze({
  authorizer: ['sme_authorizer', 'system_admin', 'sme_manager', 'sme_admin'],
  warehouse: ['warehouse_operator', 'system_admin', 'sme_operator', 'sme_admin'],
  admin: ['system_admin', 'sme_admin']
});
