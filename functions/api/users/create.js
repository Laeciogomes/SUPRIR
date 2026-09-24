import { json } from '../../_shared/http.js';
import { generateTemporaryPassword } from '../../_shared/passwords.js';
import {
  generateSchoolPin,
  isSchoolPin,
  schoolLoginEmail,
  schoolPasswordForAuth
} from '../../_shared/school-credentials.js';
import { requireSmeAdmin } from '../../_shared/supabase-admin.js';

export async function onRequestPost(context) {
  try {
    const auth = await requireSmeAdmin(context, 'Somente administradores do sistema podem criar usuários.');
    if (auth.errorResponse) return auth.errorResponse;

    const body = await context.request.json();
    let fullName = String(body.fullName || '').trim();
    let email = String(body.email || '').trim().toLowerCase();
    const accountType = body.accountType === 'sme' ? 'sme' : 'school';
    const permissionLevel = accountType === 'school'
      ? 'school_user'
      : String(body.permissionLevel || 'sme_authorizer');
    const schoolId = accountType === 'school' ? String(body.schoolId || '').trim() : null;
    const position = String(body.position || '').trim() || null;
    const phone = String(body.phone || '').trim() || null;
    const suppliedPassword = String(body.password || '');
    let school = null;
    let loginCode = null;

    if (accountType === 'school') {
      if (!schoolId) return json({ error: 'Selecione a escola do usuário.' }, 400);
      const { data, error } = await auth.admin
        .from('schools')
        .select('id, nome, login_code, inep, ativa')
        .eq('id', schoolId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      if (!data || !data.ativa) return json({ error: 'A escola selecionada não existe ou está inativa.' }, 400);

      school = data;
      loginCode = String(school.login_code || school.inep || '').replace(/\D/g, '');
      if (!loginCode) {
        return json({ error: 'Cadastre o código de acesso/INEP desta escola antes de criar o usuário.' }, 400);
      }
      email = schoolLoginEmail(loginCode, context.env);
      if (!fullName) fullName = school.nome;
    }

    if (fullName.length < 3) return json({ error: 'Informe o nome completo.' }, 400);
    if (accountType === 'sme' && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Informe um e-mail válido.' }, 400);
    if (accountType === 'sme' && !['sme_authorizer', 'warehouse_operator', 'system_admin'].includes(permissionLevel)) {
      return json({ error: 'Nível de permissão inválido.' }, 400);
    }

    const temporaryPassword = accountType === 'school'
      ? (suppliedPassword || generateSchoolPin())
      : (suppliedPassword || generateTemporaryPassword('A7!'));

    if (accountType === 'school' && !(isSchoolPin(temporaryPassword) || temporaryPassword.length >= 8)) {
      return json({ error: 'Para escolas, informe um PIN de 6 dígitos ou uma senha com ao menos 8 caracteres.' }, 400);
    }
    if (accountType === 'sme' && temporaryPassword.length < 8) {
      return json({ error: 'A senha temporária da equipe interna deve ter ao menos 8 caracteres.' }, 400);
    }

    const passwordForAuth = accountType === 'school'
      ? schoolPasswordForAuth(temporaryPassword)
      : temporaryPassword;

    const { data, error } = await auth.admin.auth.admin.createUser({
      email,
      password: passwordForAuth,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        account_type: accountType,
        permission_level: permissionLevel,
        school_id: schoolId,
        school_login_code: loginCode,
        must_change_password: true,
        provisioned_by_sme: true
      }
    });

    if (error) {
      const duplicate = /already|registered|exists/i.test(error.message || '');
      const duplicateMessage = accountType === 'school'
        ? 'Esta escola já possui um acesso com esse código.'
        : 'Já existe um usuário com este e-mail.';
      return json({ error: duplicate ? duplicateMessage : error.message }, duplicate ? 409 : 400);
    }

    const { error: profileError } = await auth.admin
      .from('profiles')
      .update({
        full_name: fullName,
        email,
        account_type: accountType,
        permission_level: permissionLevel,
        school_id: schoolId,
        active: true,
        position: accountType === 'school' ? (position || 'Unidade escolar') : position,
        phone,
        must_change_password: true,
        created_by: auth.caller.id
      })
      .eq('id', data.user.id);

    if (profileError) {
      await auth.admin.auth.admin.deleteUser(data.user.id);
      return json({ error: `O acesso não pôde ser finalizado: ${profileError.message}` }, 400);
    }

    return json({
      user: { id: data.user.id, email, fullName, accountType, permissionLevel, schoolId, loginCode },
      temporaryPassword
    }, 201);
  } catch (error) {
    return json({ error: error?.message || 'Erro inesperado ao criar o usuário.' }, 500);
  }
}
