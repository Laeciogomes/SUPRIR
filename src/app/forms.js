import {
  buildSchoolLoginEmail,
  normalizeSchoolLogin,
  toSupabaseSchoolPassword
} from '../auth/school-credentials.js';
import { parseSchoolAccessCsv } from '../utils/csv.js';
import { state } from './state.js';
import { isAdmin, getRequest } from './helpers.js';
import { app, render } from './router.js';
import { openConfirm, setToast } from './notices.js';
import {
  getSupabase,
  loadAuthenticatedData,
  refreshData,
  loadRequestEvents,
  executeRpc
} from '../services/supabase.js';
import { schoolUsage } from '../views/schools.js';

// Handlers de formulário (submitX) e ações relacionadas (deleteSchool,
// resetUserPassword, handleForgotPassword) extraídos do monólito
// application.js. Código apenas MOVIDO: validações, payloads, RPCs e mensagens
// permanecem idênticos. O client Supabase compartilhado é obtido via
// getSupabase() (mesma instância criada por createSupabaseClient()).

export async function submitLogin(form) {
  const supabase = getSupabase();
  const data = new FormData(form);
  const login = String(data.get('login') || '').trim();
  const enteredPassword = String(data.get('password') || '');
  const email = state.loginPortal === 'school'
    ? buildSchoolLoginEmail(normalizeSchoolLogin(login))
    : login.toLowerCase();
  const password = state.loginPortal === 'school'
    ? toSupabaseSchoolPassword(enteredPassword)
    : enteredPassword;
  state.loading = true;
  render();

  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    await supabase.auth.signOut();
    throw new Error('O perfil deste usuário não foi criado. Execute o SQL da versão 4 no Supabase.');
  }
  if (!profile.active) {
    await supabase.auth.signOut();
    throw new Error('Este acesso está desativado. Procure o administrador da SME.');
  }
  if (profile.account_type !== state.loginPortal) {
    await supabase.auth.signOut();
    const correct = profile.account_type === 'school' ? 'Escola' : 'SME';
    throw new Error(`Este usuário pertence ao portal ${correct}. Selecione o ambiente correto na tela de login.`);
  }

  state.session = authData.session;
  state.profile = profile;
  state.view = 'dashboard';
  await loadAuthenticatedData(false);
  state.loading = false;
  setToast('success', `Acesso realizado como ${profile.account_type === 'school' ? 'Escola' : 'SME'}.`);
  render();
}

export async function handleForgotPassword() {
  if (state.loginPortal === 'school') {
    setToast('warning', 'A escola deve solicitar uma nova senha temporária ao administrador da SME.');
    render();
    return;
  }

  const field = app.querySelector('#login-form input[name="login"]');
  const email = field?.value?.trim() || '';
  state.modal = { type: 'forgotPassword', email };
  render();
}

export async function submitForgotPassword(form) {
  const supabase = getSupabase();
  const data = new FormData(form);
  const email = String(data.get('email') || '').trim().toLowerCase();
  if (!email) throw new Error('Informe o e-mail do seu acesso.');
  state.loading = true;
  render();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  state.loading = false;
  state.modal = null;
  if (error) throw error;
  setToast('success', 'As instruções de recuperação foram enviadas, caso o e-mail esteja cadastrado.');
  render();
}

export async function submitPasswordChange(form) {
  const supabase = getSupabase();
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const confirmation = String(data.get('confirmPassword') || '');
  if (password.length < 8) throw new Error('A nova senha deve ter ao menos 8 caracteres.');
  if (password !== confirmation) throw new Error('As senhas informadas não são iguais.');

  state.loading = true;
  render();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  const { error: profileError } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', state.session.user.id);
  if (profileError) throw profileError;
  state.profile.must_change_password = false;
  state.recoveryMode = false;
  state.loading = false;
  setToast('success', 'Senha atualizada com segurança.');
  render();
}

export async function submitSchoolRequest(event) {
  const supabase = getSupabase();
  const mode = event.submitter?.dataset.mode || 'draft';
  const draft = state.draft;
  if (!draft) throw new Error('O formulário do pedido não está disponível.');

  const validItems = draft.items
    .map((item) => ({ material_id: item.material_id, quantity: Number(String(item.quantity).replace(',', '.')), notes: item.notes || null }))
    .filter((item) => item.material_id && Number.isFinite(item.quantity) && item.quantity > 0);

  if (!draft.purpose.trim()) throw new Error('Informe a finalidade do pedido.');
  if (!validItems.length) throw new Error('Adicione pelo menos um material com quantidade válida.');
  const materialIds = validItems.map((item) => item.material_id);
  if (new Set(materialIds).size !== materialIds.length) throw new Error('O mesmo material foi adicionado mais de uma vez. Agrupe a quantidade em uma única linha.');

  state.loading = true;
  render();
  const { data: requestId, error } = await supabase.rpc('save_school_request', {
    p_request_id: draft.id || null,
    p_priority: draft.priority,
    p_purpose: draft.purpose.trim(),
    p_requested_delivery_date: draft.requestedDeliveryDate || null,
    p_notes: draft.notes || null,
    p_school_contact_name: draft.schoolContactName || null,
    p_school_contact_phone: draft.schoolContactPhone || null,
    p_items: validItems,
    p_submit: mode === 'submit'
  });
  if (error) throw error;

  state.draft = null;
  await loadAuthenticatedData(false);
  delete state.events[requestId];
  await loadRequestEvents(requestId);
  state.selectedRequestId = requestId;
  state.previousView = 'myRequests';
  state.view = 'requestDetail';
  state.loading = false;
  setToast('success', mode === 'submit' ? 'Pedido enviado à SME e protocolo gerado.' : 'Rascunho salvo com sucesso.');
  render();
}

export async function submitAuthorization(form) {
  const request = getRequest(state.modal.requestId);
  const data = new FormData(form);
  const items = (request.request_items || []).map((item) => ({
    request_item_id: item.id,
    approved_quantity: Number(String(data.get(`approved_${item.id}`) || 0).replace(',', '.')),
    notes: String(data.get(`notes_${item.id}`) || '').trim() || null
  }));
  if (!items.some((item) => item.approved_quantity > 0)) throw new Error('Autorize ao menos um item ou rejeite o pedido.');
  await executeRpc('authorize_request', {
    p_request_id: request.id,
    p_items: items,
    p_authorization_notes: String(data.get('authorizationNotes') || '').trim() || null
  }, 'Pedido autorizado e quantidades registradas.');
}

export async function submitRejection(form) {
  const data = new FormData(form);
  await executeRpc('reject_request', {
    p_request_id: state.modal.requestId,
    p_reason: String(data.get('reason') || '').trim()
  }, 'Pedido rejeitado. A escola já pode consultar o motivo.');
}

export async function submitDispatch(form) {
  const request = getRequest(state.modal.requestId);
  const data = new FormData(form);
  const items = (request.request_items || []).map((item) => ({
    request_item_id: item.id,
    quantity: Number(String(data.get(`dispatch_${item.id}`) || 0).replace(',', '.')),
    notes: null
  })).filter((item) => item.quantity > 0);
  if (!items.length) throw new Error('Informe ao menos uma quantidade para a remessa.');

  await executeRpc('register_dispatch', {
    p_request_id: request.id,
    p_dispatch_date: String(data.get('dispatchDate') || ''),
    p_document_number: String(data.get('documentNumber') || '').trim() || null,
    p_delivered_by_name: String(data.get('deliveredByName') || '').trim(),
    p_delivered_by_department: String(data.get('deliveredByDepartment') || '').trim() || null,
    p_observations: String(data.get('observations') || '').trim() || null,
    p_items: items
  }, 'Remessa registrada. O pedido está em transporte.');
}

export async function submitReceipt(form) {
  const data = new FormData(form);
  await executeRpc('register_delivery_receipt', {
    p_delivery_id: state.modal.deliveryId,
    p_receipt_date: String(data.get('receiptDate') || ''),
    p_received_by_name: String(data.get('receivedByName') || '').trim(),
    p_received_by_position: String(data.get('receivedByPosition') || '').trim() || null,
    p_received_by_document: String(data.get('receivedByDocument') || '').trim() || null,
    p_receipt_notes: String(data.get('receiptNotes') || '').trim() || null
  }, 'Recebimento registrado com sucesso.');
}

export async function submitSchoolConfirmation(form) {
  const data = new FormData(form);
  if (!data.get('confirmed')) throw new Error('Marque a confirmação de recebimento.');
  await executeRpc('confirm_delivery_by_school', {
    p_delivery_id: state.modal.deliveryId,
    p_notes: String(data.get('notes') || '').trim() || null
  }, 'Recebimento confirmado pela escola.');
}

export async function submitCancellation(form) {
  const data = new FormData(form);
  await executeRpc('cancel_request', {
    p_request_id: state.modal.requestId,
    p_reason: String(data.get('reason') || '').trim()
  }, 'Pedido cancelado e histórico atualizado.');
}

export async function submitSchool(form) {
  const supabase = getSupabase();
  const data = new FormData(form);
  const inep = normalizeSchoolLogin(data.get('inep')) || null;
  const loginCode = normalizeSchoolLogin(data.get('login_code')) || inep;
  const payload = {
    nome: String(data.get('nome') || '').trim(),
    codigo: String(data.get('codigo') || '').trim() || null,
    inep,
    login_code: loginCode,
    diretor: String(data.get('diretor') || '').trim() || null,
    telefone: String(data.get('telefone') || '').trim() || null,
    email: String(data.get('email') || '').trim() || null,
    bairro: String(data.get('bairro') || '').trim() || null,
    endereco: String(data.get('endereco') || '').trim() || null,
    observacoes: String(data.get('observacoes') || '').trim() || null,
    ativa: Boolean(data.get('ativa'))
  };
  state.loading = true;
  render();
  const isEdit = Boolean(state.modal.schoolId);
  const query = isEdit
    ? supabase.from('schools').update(payload).eq('id', state.modal.schoolId)
    : supabase.from('schools').insert(payload);
  const { error } = await query;
  if (error) throw error;
  state.modal = null;
  await refreshData(isEdit ? 'Escola atualizada.' : 'Escola cadastrada.');
}

export async function deleteSchool(schoolId) {
  const supabase = getSupabase();
  if (!isAdmin()) throw new Error('Somente administradores da SME podem excluir escolas.');
  const school = state.schools.find((item) => item.id === schoolId);
  if (!school) throw new Error('Escola não encontrada.');
  const usage = schoolUsage(schoolId);
  if (usage.requests > 0) {
    throw new Error('Esta escola possui pedidos ou movimentações. Para manter o histórico dos relatórios, desative a escola em vez de excluir.');
  }

  state.loading = true;
  render();
  const { error } = await supabase.from('schools').delete().eq('id', schoolId);
  if (error) {
    const message = String(error.message || '');
    if (message.includes('foreign key') || message.includes('violates')) {
      throw new Error('Não foi possível excluir porque há registros vinculados a esta escola. Desative a escola para preservar o histórico.');
    }
    throw error;
  }
  state.modal = null;
  await refreshData('Escola excluída com sucesso.');
}

export async function submitMaterial(form) {
  const supabase = getSupabase();
  const data = new FormData(form);
  const minimum = String(data.get('quantidade_minima') || '').trim();
  const payload = {
    nome: String(data.get('nome') || '').trim(),
    codigo: String(data.get('codigo') || '').trim() || null,
    categoria: String(data.get('categoria') || '').trim() || null,
    unidade: String(data.get('unidade') || '').trim(),
    quantidade_minima: minimum ? Number(minimum.replace(',', '.')) : null,
    descricao: String(data.get('descricao') || '').trim() || null,
    ativo: Boolean(data.get('ativo'))
  };
  state.loading = true;
  render();
  const isEdit = Boolean(state.modal.materialId);
  const query = isEdit
    ? supabase.from('materials').update(payload).eq('id', state.modal.materialId)
    : supabase.from('materials').insert(payload);
  const { error } = await query;
  if (error) throw error;
  state.modal = null;
  await refreshData(isEdit ? 'Material atualizado.' : 'Material cadastrado.');
}

export async function submitUserCreate(form) {
  const data = new FormData(form);
  const accountType = String(data.get('accountType') || 'school');
  const body = {
    fullName: String(data.get('fullName') || '').trim(),
    email: String(data.get('email') || '').trim(),
    phone: String(data.get('phone') || '').trim(),
    position: String(data.get('position') || '').trim(),
    accountType,
    schoolId: accountType === 'school' ? String(data.get('schoolId') || '') : null,
    permissionLevel: accountType === 'sme' ? String(data.get('permissionLevel') || 'sme_operator') : 'school_user',
    password: String(data.get('password') || '')
  };
  state.loading = true;
  render();
  const response = await fetch('/api/users/create', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${state.session.access_token}`
    },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível criar o usuário. Em teste local, use npm run pages:dev para carregar a função do Cloudflare.');
  await loadAuthenticatedData(false);
  state.loading = false;
  state.modal = { type: 'passwordResult', password: result.temporaryPassword };
  setToast('success', 'Usuário criado com sucesso.');
  render();
}

export async function submitSchoolImport(form) {
  const data = new FormData(form);
  const file = data.get('csvFile');
  if (!(file instanceof File) || !file.size) throw new Error('Selecione o arquivo CSV com as escolas.');
  if (file.size > 2 * 1024 * 1024) throw new Error('O arquivo é muito grande. O limite é 2 MB.');

  const parsed = parseSchoolAccessCsv(await file.text());
  if (parsed.errors.length) {
    const details = parsed.errors.slice(0, 8).join(' ');
    const remaining = parsed.errors.length > 8 ? ` Há mais ${parsed.errors.length - 8} erro(s).` : '';
    throw new Error(`Corrija o arquivo antes de importar. ${details}${remaining}`);
  }
  if (!parsed.rows.length) throw new Error('Nenhuma escola válida foi encontrada no arquivo.');

  const overwritePasswords = Boolean(data.get('overwritePasswords'));
  const chunks = [];
  for (let index = 0; index < parsed.rows.length; index += 20) chunks.push(parsed.rows.slice(index, index + 20));

  const summary = {
    total: parsed.rows.length,
    createdUsers: 0,
    updatedUsers: 0,
    linkedUsers: 0,
    createdSchools: 0,
    errors: 0
  };
  const results = [];

  state.loading = true;
  render();

  for (let index = 0; index < chunks.length; index += 1) {
    const response = await fetch('/api/users/import-schools', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${state.session.access_token}`
      },
      body: JSON.stringify({ rows: chunks[index], overwritePasswords })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('A API de importação não foi encontrada. Para importar escolas localmente, abra o sistema com npm.cmd run dev ou npm.cmd run pages:dev, não use o servidor Vite puro na porta 5173.');
      }
      throw new Error(result.error || `Não foi possível processar o lote ${index + 1}. Código HTTP: ${response.status}.`);
    }

    summary.createdUsers += Number(result.summary?.createdUsers || 0);
    summary.updatedUsers += Number(result.summary?.updatedUsers || 0);
    summary.linkedUsers += Number(result.summary?.linkedUsers || 0);
    summary.createdSchools += Number(result.summary?.createdSchools || 0);
    summary.errors += Number(result.summary?.errors || 0);
    results.push(...(result.results || []));
  }

  await loadAuthenticatedData(false);
  state.loading = false;
  state.modal = { type: 'schoolImportResult', summary, results, sourceFile: file.name };
  setToast(summary.errors ? 'warning' : 'success', summary.errors
    ? `Importação concluída com ${summary.errors} item(ns) para revisar.`
    : `${summary.createdUsers} acesso(s) criado(s) com sucesso.`);
  render();
}

export async function submitUserEdit(form) {
  const profile = state.profiles.find((item) => item.id === state.modal.profileId);
  const data = new FormData(form);
  const accountType = String(data.get('accountType') || 'school');
  await executeRpc('admin_update_profile', {
    p_profile_id: profile.id,
    p_full_name: String(data.get('fullName') || '').trim(),
    p_account_type: accountType,
    p_permission_level: accountType === 'school' ? 'school_user' : String(data.get('permissionLevel') || 'sme_operator'),
    p_school_id: accountType === 'school' ? String(data.get('schoolId') || '') || null : null,
    p_active: Boolean(data.get('active')),
    p_position: String(data.get('position') || '').trim() || null,
    p_phone: String(data.get('phone') || '').trim() || null
  }, 'Acesso do usuário atualizado.');
}

export async function resetUserPassword(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  openConfirm({
    title: 'Redefinir senha temporária',
    message: `Gerar uma nova senha temporária para ${profile?.full_name || profile?.email || 'este usuário'}? A senha atual deixará de funcionar.`,
    confirmLabel: 'Gerar senha temporária',
    tone: 'danger',
    onConfirm: async () => {
      state.loading = true;
      render();
      const response = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${state.session.access_token}`
        },
        body: JSON.stringify({ profileId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível redefinir a senha.');
      await loadAuthenticatedData(false);
      state.loading = false;
      state.modal = { type: 'passwordResult', password: result.temporaryPassword };
      render();
    }
  });
  render();
}

export async function submitSettings(form) {
  const supabase = getSupabase();
  const data = new FormData(form);
  const payload = {
    municipality_name: String(data.get('municipality_name') || '').trim(),
    department_name: String(data.get('department_name') || '').trim(),
    report_title: String(data.get('report_title') || '').trim(),
    logo_url: String(data.get('logo_url') || '').trim(),
    compact_logo_url: String(data.get('compact_logo_url') || '').trim(),
    planning_logo_url: String(data.get('planning_logo_url') || '').trim(),
    address: String(data.get('address') || '').trim() || null,
    phone: String(data.get('phone') || '').trim() || null,
    email: String(data.get('email') || '').trim() || null,
    footer_text: String(data.get('footer_text') || '').trim() || null,
    updated_by: state.session.user.id
  };
  state.loading = true;
  render();
  const { error } = await supabase.from('system_settings').update(payload).eq('id', 1);
  if (error) throw error;
  await refreshData('Configurações institucionais atualizadas.');
}

export async function submitProfile(form) {
  const supabase = getSupabase();
  const data = new FormData(form);
  state.loading = true;
  render();
  const { error } = await supabase.from('profiles').update({
    full_name: String(data.get('full_name') || '').trim(),
    phone: String(data.get('phone') || '').trim() || null,
    position: String(data.get('position') || '').trim() || null
  }).eq('id', state.profile.id);
  if (error) throw error;
  await refreshData('Perfil atualizado.');
}

export async function submitOwnPassword(form) {
  const supabase = getSupabase();
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const confirmation = String(data.get('confirmPassword') || '');
  if (password.length < 8) throw new Error('A senha deve ter ao menos 8 caracteres.');
  if (password !== confirmation) throw new Error('As senhas não são iguais.');
  state.loading = true;
  render();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  state.loading = false;
  state.modal = null;
  setToast('success', 'Senha alterada com sucesso.');
  render();
}

// Mapa de despacho por form.id, substituindo o if/else do listener submit.
export const SUBMIT_HANDLERS = {
  'login-form': (form) => submitLogin(form),
  'password-change-form': (form) => submitPasswordChange(form),
  'forgot-password-form': (form) => submitForgotPassword(form),
  'request-form': (form, event) => submitSchoolRequest(event),
  'authorization-form': (form) => submitAuthorization(form),
  'reject-form': (form) => submitRejection(form),
  'dispatch-form': (form) => submitDispatch(form),
  'receipt-form': (form) => submitReceipt(form),
  'confirm-delivery-form': (form) => submitSchoolConfirmation(form),
  'cancel-request-form': (form) => submitCancellation(form),
  'school-form': (form) => submitSchool(form),
  'material-form': (form) => submitMaterial(form),
  'user-create-form': (form) => submitUserCreate(form),
  'school-import-form': (form) => submitSchoolImport(form),
  'user-edit-form': (form) => submitUserEdit(form),
  'settings-form': (form) => submitSettings(form),
  'profile-form': (form) => submitProfile(form),
  'own-password-form': (form) => submitOwnPassword(form)
};
