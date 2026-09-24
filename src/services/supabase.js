import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config/app-config.js';
import { state, render } from '../app/state.js';

// Camada de acesso ao Supabase extraída do monólito application.js.
// O código foi apenas MOVIDO: o comportamento, as queries e o fluxo de dados
// permanecem idênticos. As dependências que continuam vivendo em
// application.js (helpers de UI e regras de negócio) são injetadas via
// initSupabase(deps) para evitar dependência circular entre módulos.

let supabase = null;

// Dependências injetadas por application.js.
let deps = {
  setToast: () => {},
  friendlyError: (error) => String(error?.message || error || ''),
  isSchool: () => false,
  getAllDeliveries: () => []
};

export function initSupabase(injected = {}) {
  deps = { ...deps, ...injected };
}

export function createSupabaseClient() {
  supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return supabase;
}

// Acessor do client Supabase compartilhado. Permite que os módulos de ações e
// de handlers de formulário (extraídos do monólito) usem a mesma instância
// criada por createSupabaseClient(), sem manter uma variável local própria.
export function getSupabase() {
  return supabase;
}

export async function loadAuthenticatedData(showLoading = true) {
  if (!state.session) return;
  if (showLoading) {
    state.loading = true;
    render();
  }

  try {
    state.authError = null;
    const userId = state.session.user.id;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) throw new Error('Perfil do usuário não encontrado. Execute o SQL da versão 5 no Supabase.');
    if (!profile.active) {
      await supabase.auth.signOut();
      throw new Error('Este acesso foi desativado pelo administrador.');
    }

    state.profile = profile;

    const isAdmin = profile.account_type === 'sme' && ['system_admin', 'sme_admin'].includes(profile.permission_level);

    const [settingsResult, schoolsResult, materialsResult, requestsResult] = await Promise.all([
      supabase.from('system_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('schools').select('*').order('nome', { ascending: true }),
      supabase.from('materials').select('*').order('nome', { ascending: true }),
      fetchRequests()
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (schoolsResult.error) throw schoolsResult.error;
    if (materialsResult.error) throw materialsResult.error;
    if (requestsResult.error) throw requestsResult.error;

    state.settings = settingsResult.data || null;
    state.schools = schoolsResult.data || [];
    state.materials = materialsResult.data || [];
    state.requests = normalizeRequests(requestsResult.data || []);

    if (isAdmin) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });
      if (profilesError) throw profilesError;
      state.profiles = profiles || [];
    } else {
      state.profiles = [];
    }


    if (deps.isSchool() && !profile.school_id) {
      deps.setToast('warning', 'Seu usuário ainda não está vinculado a uma escola. Solicite o ajuste ao administrador do sistema.');
    }
  } catch (error) {
    console.error(error);
    state.authError = deps.friendlyError(error);
    deps.setToast('error', state.authError);
  } finally {
    state.loading = false;
  }
}

export function fetchRequests() {
  return supabase
    .from('requests')
    .select(`
      *,
      schools (id, nome, inep, codigo, diretor, telefone, email, endereco, bairro),
      request_items (
        *,
        materials (id, nome, unidade, categoria, codigo)
      ),
      deliveries (
        *,
        delivery_items (
          *,
          materials (id, nome, unidade, categoria, codigo)
        )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(1000);
}

export function normalizeRequests(requests) {
  return requests.map((request) => ({
    ...request,
    request_items: [...(request.request_items || [])].sort((a, b) =>
      String(a.material_name_snapshot || a.materials?.nome || '').localeCompare(String(b.material_name_snapshot || b.materials?.nome || ''), 'pt-BR')
    ),
    deliveries: [...(request.deliveries || [])]
      .map((delivery) => ({ ...delivery, delivery_items: delivery.delivery_items || [] }))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  }));
}

export async function refreshData(message = null) {
  await loadAuthenticatedData(true);
  if (message) deps.setToast('success', message);
  render();
}

export async function loadRequestEvents(requestId) {
  const { data, error } = await supabase
    .from('request_events')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  state.events[requestId] = data || [];
}

export async function executeRpc(functionName, params, successMessage) {
  state.loading = true;
  render();
  const requestId = params.p_request_id || deps.getAllDeliveries().find((delivery) => delivery.id === params.p_delivery_id)?.request?.id || null;
  const { error } = await supabase.rpc(functionName, params);
  if (error) throw error;
  state.modal = null;
  await loadAuthenticatedData(false);
  if (requestId) {
    delete state.events[requestId];
    await loadRequestEvents(requestId);
    state.selectedRequestId = requestId;
  }
  state.loading = false;
  deps.setToast('success', successMessage);
  render();
}
