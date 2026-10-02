import { json } from '../../_shared/http.js';
import {
  normalizeSchoolCode,
  schoolPasswordForAuth
} from '../../_shared/school-credentials.js';
import { requireSmeAdmin } from '../../_shared/supabase-admin.js';

const CONFIRMATION = 'RESET_ALL_SCHOOL_PASSWORDS';
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 8;

function safeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.trunc(number));
}

async function resetOne(auth, profile, school) {
  const loginCode = normalizeSchoolCode(
    school?.login_code || school?.inep || school?.codigo || ''
  );

  const base = {
    profileId: profile.id,
    schoolId: school?.id || profile.school_id || null,
    name: school?.nome || profile.full_name || 'Escola sem nome',
    loginCode
  };

  if (!school) {
    return { ...base, status: 'error', message: 'Escola vinculada não encontrada.' };
  }

  if (!school.ativa) {
    return { ...base, status: 'skipped', message: 'Escola inativa; senha preservada.' };
  }

  if (!loginCode) {
    return { ...base, status: 'error', message: 'Escola sem código de acesso/INEP válido.' };
  }

  if (loginCode.length < 6) {
    return { ...base, status: 'error', message: 'Código de acesso possui menos de 6 dígitos.' };
  }

  const originalMustChange = Boolean(profile.must_change_password);

  // Primeiro garante a obrigatoriedade de troca. Se a troca no Auth falhar,
  // tentamos restaurar o estado anterior para não alterar a experiência do usuário.
  const { error: flagError } = await auth.admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', profile.id);

  if (flagError) {
    return { ...base, status: 'error', message: `Não foi possível marcar a troca obrigatória: ${flagError.message}` };
  }

  const { error: passwordError } = await auth.admin.auth.admin.updateUserById(profile.id, {
    password: schoolPasswordForAuth(loginCode)
  });

  if (passwordError) {
    if (!originalMustChange) {
      await auth.admin
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', profile.id);
    }
    return { ...base, status: 'error', message: `Senha não redefinida: ${passwordError.message}` };
  }

  return {
    ...base,
    status: 'success',
    message: 'Senha redefinida para o código da escola; troca obrigatória ativada.'
  };
}

export async function onRequestPost(context) {
  try {
    const auth = await requireSmeAdmin(
      context,
      'Somente o administrador do sistema pode redefinir todas as senhas das escolas.'
    );
    if (auth.errorResponse) return auth.errorResponse;

    if (!['system_admin', 'sme_admin'].includes(auth.callerProfile.permission_level)) {
      return json({ error: 'Somente o administrador do sistema pode executar esta operação em massa.' }, 403);
    }

    const body = await context.request.json().catch(() => ({}));
    if (body.confirmation !== CONFIRMATION) {
      return json({ error: 'Confirmação de segurança inválida.' }, 400);
    }

    const offset = safeInteger(body.offset, 0);
    const requestedBatchSize = safeInteger(body.batchSize, DEFAULT_BATCH_SIZE) || DEFAULT_BATCH_SIZE;
    const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, requestedBatchSize));

    // IMPORTANTE: cada requisição processa somente um pequeno lote. A V5.4.0
    // percorria todos os usuários dentro de uma única invocação do Worker e
    // atingia o limite de subrequests do Cloudflare. O navegador chama este
    // endpoint novamente com o próximo offset até concluir todos os acessos.
    const { data: profiles, error: profilesError, count } = await auth.admin
      .from('profiles')
      .select('id, full_name, school_id, active, account_type, permission_level, must_change_password', { count: 'exact' })
      .eq('account_type', 'school')
      .eq('permission_level', 'school_user')
      .eq('active', true)
      .order('full_name')
      .order('id')
      .range(offset, offset + batchSize - 1);

    if (profilesError) return json({ error: profilesError.message }, 400);

    const total = Number(count || 0);
    const schoolIds = [...new Set((profiles || []).map((profile) => profile.school_id).filter(Boolean))];
    let schools = [];

    if (schoolIds.length) {
      const { data, error } = await auth.admin
        .from('schools')
        .select('id, nome, login_code, inep, codigo, ativa')
        .in('id', schoolIds);
      if (error) return json({ error: error.message }, 400);
      schools = data || [];
    }

    const schoolsById = new Map(schools.map((school) => [school.id, school]));
    const results = [];

    // Sequencial dentro do lote para evitar picos simultâneos na API administrativa.
    for (const profile of profiles || []) {
      results.push(await resetOne(auth, profile, schoolsById.get(profile.school_id)));
    }

    const processed = results.length;
    const nextOffset = offset + processed;
    const done = processed === 0 || nextOffset >= total;
    const summary = {
      total,
      processed,
      reset: results.filter((item) => item.status === 'success').length,
      skipped: results.filter((item) => item.status === 'skipped').length,
      errors: results.filter((item) => item.status === 'error').length
    };

    return json({
      summary,
      results,
      pagination: {
        offset,
        batchSize,
        total,
        nextOffset,
        done
      },
      temporaryPasswordRule: 'Código de acesso da própria escola',
      mustChangePassword: true
    });
  } catch (error) {
    return json({ error: error?.message || 'Erro inesperado ao redefinir as senhas das escolas.' }, 500);
  }
}
