import { createClient } from '@supabase/supabase-js';
import { json } from './http.js';

export async function requireSmeAdmin(context, forbiddenMessage = 'Somente administradores do sistema podem executar esta operação.') {
  const supabaseUrl = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const serviceRoleKey = context.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { errorResponse: json({ error: 'As variáveis secretas do servidor não foram configuradas no Cloudflare.' }, 500) };
  }

  if (String(serviceRoleKey).startsWith('sb_publishable_')) {
    return { errorResponse: json({ error: 'A variável SUPABASE_SERVICE_ROLE_KEY está usando a chave pública sb_publishable. Use a chave secreta do Supabase, normalmente sb_secret_..., ou a service_role legacy.' }, 500) };
  }

  const authorization = context.request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return { errorResponse: json({ error: 'Sessão não informada.' }, 401) };

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { errorResponse: json({ error: 'Sessão inválida ou expirada.' }, 401) };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, active, account_type, permission_level')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.active || profile.account_type !== 'sme' || !['system_admin', 'sme_admin'].includes(profile.permission_level)) {
    return { errorResponse: json({ error: forbiddenMessage }, 403) };
  }

  return { admin, caller: userData.user, callerProfile: profile };
}
