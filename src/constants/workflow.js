export const STATUS = Object.freeze({
  draft: { label: 'Rascunho', school: 'Rascunho', tone: 'slate' },
  submitted: { label: 'Aguardando recebimento', school: 'Enviado à SME', tone: 'blue' },
  under_review: { label: 'Em análise', school: 'Em análise pela SME', tone: 'amber' },
  approved: { label: 'Autorizado', school: 'Pedido autorizado', tone: 'green' },
  rejected: { label: 'Rejeitado', school: 'Pedido rejeitado', tone: 'red' },
  preparing: { label: 'Em separação', school: 'Materiais em separação', tone: 'violet' },
  dispatched: { label: 'Em transporte', school: 'Materiais enviados', tone: 'cyan' },
  partially_delivered: { label: 'Entrega parcial', school: 'Recebido parcialmente', tone: 'orange' },
  delivered: { label: 'Concluído', school: 'Pedido entregue', tone: 'emerald' },
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
  sme_operator: 'Operador da SME',
  sme_manager: 'Gestor / autorizador',
  sme_admin: 'Administrador da SME'
});
