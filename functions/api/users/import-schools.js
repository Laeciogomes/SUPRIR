import { json } from '../../_shared/http.js';
import { requireSmeAdmin } from '../../_shared/supabase-admin.js';
import {
  normalizeSchoolCode,
  schoolLoginEmail,
  isSchoolPin,
  schoolPasswordForAuth
} from '../../_shared/school-credentials.js';

const MAX_ROWS_PER_REQUEST = 20;

async function listAllUsers(admin) {
  const users = [];
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }

  return users;
}

function normalizeRows(input) {
  if (!Array.isArray(input)) throw new Error('A lista de escolas não foi informada.');
  if (!input.length) throw new Error('O arquivo não possui escolas para importar.');
  if (input.length > MAX_ROWS_PER_REQUEST) {
    throw new Error(`Envie no máximo ${MAX_ROWS_PER_REQUEST} escolas por lote.`);
  }

  const seen = new Set();
  return input.map((item, index) => {
    const name = String(item?.name || '').trim().replace(/\s+/g, ' ');
    const loginCode = normalizeSchoolCode(item?.loginCode);
    const password = String(item?.password || '');

    if (name.length < 3) throw new Error(`Linha ${index + 1}: nome da escola inválido.`);
    if (!/^\d{4,20}$/.test(loginCode)) throw new Error(`Linha ${index + 1}: código de acesso inválido.`);
    if (!(isSchoolPin(password) || password.length >= 8)) {
      throw new Error(`Linha ${index + 1}: a senha deve ter 6 dígitos ou pelo menos 8 caracteres.`);
    }
    if (seen.has(loginCode)) throw new Error(`O código ${loginCode} está repetido neste lote.`);

    seen.add(loginCode);
    return { name, loginCode, password };
  });
}

async function prepareSchools(admin, callerId, rows) {
  const codes = rows.map((row) => row.loginCode);
  const { data: byLogin, error: loginError } = await admin
    .from('schools')
    .select('id, nome, inep, login_code, codigo, ativa, created_by')
    .in('login_code', codes);

  if (loginError) {
    if (/login_code|column/i.test(loginError.message || '')) {
      throw new Error('Execute a migração 003_acessos_escolas_por_codigo.sql antes de importar os acessos.');
    }
    throw loginError;
  }

  const existingMap = new Map((byLogin || []).map((school) => [String(school.login_code), school]));
  const missingCodes = codes.filter((code) => !existingMap.has(code));

  if (missingCodes.length) {
    const { data: byInep, error: inepError } = await admin
      .from('schools')
      .select('id, nome, inep, login_code, codigo, ativa, created_by')
      .in('inep', missingCodes);
    if (inepError) throw inepError;
    for (const school of byInep || []) existingMap.set(String(school.inep), school);
  }

  const updates = [];
  const inserts = [];
  const wasCreated = new Map();

  for (const row of rows) {
    const existing = existingMap.get(row.loginCode);
    if (existing) {
      updates.push({
        id: existing.id,
        nome: row.name,
        inep: row.loginCode,
        login_code: row.loginCode,
        codigo: existing.codigo || row.loginCode,
        ativa: true
      });
      wasCreated.set(row.loginCode, false);
    } else {
      inserts.push({
        nome: row.name,
        inep: row.loginCode,
        login_code: row.loginCode,
        codigo: row.loginCode,
        ativa: true,
        created_by: callerId
      });
      wasCreated.set(row.loginCode, true);
    }
  }

  const saved = [];
  if (updates.length) {
    const { data, error } = await admin
      .from('schools')
      .upsert(updates, { onConflict: 'id' })
      .select('id, nome, inep, login_code, codigo, ativa');
    if (error) throw error;
    saved.push(...(data || []));
  }

  if (inserts.length) {
    const { data, error } = await admin
      .from('schools')
      .insert(inserts)
      .select('id, nome, inep, login_code, codigo, ativa');
    if (error) throw error;
    saved.push(...(data || []));
  }

  return {
    schoolsByCode: new Map(saved.map((school) => [String(school.login_code || school.inep), school])),
    wasCreated
  };
}

export async function onRequestPost(context) {
  try {
    const auth = await requireSmeAdmin(context, 'Somente administradores do sistema podem importar escolas e acessos.');
    if (auth.errorResponse) return auth.errorResponse;

    const body = await context.request.json();
    const rows = normalizeRows(body.rows);
    const overwritePasswords = Boolean(body.overwritePasswords);
    const { schoolsByCode, wasCreated } = await prepareSchools(auth.admin, auth.caller.id, rows);
    const schoolIds = [...schoolsByCode.values()].map((school) => school.id);

    const [allUsers, linkedProfilesResult] = await Promise.all([
      listAllUsers(auth.admin),
      auth.admin
        .from('profiles')
        .select('id, email, school_id, must_change_password, created_by')
        .eq('account_type', 'school')
        .in('school_id', schoolIds)
    ]);

    if (linkedProfilesResult.error) throw linkedProfilesResult.error;

    const usersByEmail = new Map(allUsers.map((user) => [String(user.email || '').toLowerCase(), user]));
    const usersById = new Map(allUsers.map((user) => [user.id, user]));
    const profilesBySchool = new Map();
    for (const profile of linkedProfilesResult.data || []) {
      if (!profilesBySchool.has(profile.school_id)) profilesBySchool.set(profile.school_id, []);
      profilesBySchool.get(profile.school_id).push(profile);
    }

    const successful = [];
    const results = [];

    for (const row of rows) {
      const school = schoolsByCode.get(row.loginCode);
      if (!school) {
        results.push({ status: 'error', name: row.name, loginCode: row.loginCode, message: 'A escola não pôde ser gravada.' });
        continue;
      }

      const email = schoolLoginEmail(row.loginCode, context.env);
      const expectedUser = usersByEmail.get(email.toLowerCase());
      const linkedProfiles = profilesBySchool.get(school.id) || [];

      if (linkedProfiles.length > 1) {
        results.push({
          status: 'error',
          name: row.name,
          loginCode: row.loginCode,
          message: 'Há mais de um usuário vinculado a esta escola. Revise os acessos antes de importar.'
        });
        continue;
      }

      const linkedProfile = linkedProfiles[0] || null;
      const linkedUser = linkedProfile ? usersById.get(linkedProfile.id) : null;
      if (linkedProfile && !linkedUser) {
        results.push({
          status: 'error',
          name: row.name,
          loginCode: row.loginCode,
          message: 'O perfil vinculado não possui usuário correspondente no Supabase Auth.'
        });
        continue;
      }

      if (expectedUser && linkedUser && expectedUser.id !== linkedUser.id) {
        results.push({
          status: 'error',
          name: row.name,
          loginCode: row.loginCode,
          message: 'O código já pertence a outro usuário. Revise o vínculo desta escola.'
        });
        continue;
      }

      let user = expectedUser || linkedUser;
      const createdUser = !user;
      const metadata = {
        full_name: row.name,
        account_type: 'school',
        permission_level: 'school_user',
        school_id: school.id,
        school_login_code: row.loginCode,
        must_change_password: true,
        provisioned_by_sme: true
      };

      try {
        if (user) {
          const attributes = {
            email,
            email_confirm: true,
            user_metadata: metadata
          };
          if (overwritePasswords) attributes.password = schoolPasswordForAuth(row.password);

          const { data, error } = await auth.admin.auth.admin.updateUserById(user.id, attributes);
          if (error) throw error;
          user = data.user;
        } else {
          const { data, error } = await auth.admin.auth.admin.createUser({
            email,
            password: schoolPasswordForAuth(row.password),
            email_confirm: true,
            user_metadata: metadata
          });
          if (error) throw error;
          user = data.user;
          usersByEmail.set(email.toLowerCase(), user);
          usersById.set(user.id, user);
        }

        successful.push({ row, school, email, user, createdUser, linkedProfile });
      } catch (error) {
        results.push({
          status: 'error',
          name: row.name,
          loginCode: row.loginCode,
          message: error?.message || 'Não foi possível criar o usuário.'
        });
      }
    }

    if (successful.length) {
      const ids = successful.map((entry) => entry.user.id);
      const { data: currentProfiles, error: profilesError } = await auth.admin
        .from('profiles')
        .select('id, must_change_password, created_by')
        .in('id', ids);
      if (profilesError) throw profilesError;

      const currentMap = new Map((currentProfiles || []).map((profile) => [profile.id, profile]));
      const profilePayloads = successful.map((entry) => {
        const current = currentMap.get(entry.user.id);
        return {
          id: entry.user.id,
          email: entry.email,
          full_name: entry.row.name,
          role: 'operador',
          account_type: 'school',
          permission_level: 'school_user',
          school_id: entry.school.id,
          active: true,
          position: 'Unidade escolar',
          must_change_password: entry.createdUser || overwritePasswords
            ? true
            : (current?.must_change_password ?? true),
          created_by: current?.created_by || auth.caller.id
        };
      });

      const { error: upsertError } = await auth.admin
        .from('profiles')
        .upsert(profilePayloads, { onConflict: 'id' });
      if (upsertError) throw upsertError;

      for (const entry of successful) {
        results.push({
          status: entry.createdUser ? 'created' : (overwritePasswords ? 'updated' : 'linked'),
          name: entry.row.name,
          loginCode: entry.row.loginCode,
          schoolCreated: Boolean(wasCreated.get(entry.row.loginCode)),
          passwordUpdated: entry.createdUser || overwritePasswords,
          message: entry.createdUser
            ? 'Escola e acesso preparados.'
            : overwritePasswords
              ? 'Cadastro atualizado e senha temporária redefinida.'
              : 'Cadastro atualizado; a senha existente foi preservada.'
        });
      }
    }

    results.sort((a, b) => rows.findIndex((row) => row.loginCode === a.loginCode) - rows.findIndex((row) => row.loginCode === b.loginCode));

    const summary = {
      total: rows.length,
      createdUsers: results.filter((item) => item.status === 'created').length,
      updatedUsers: results.filter((item) => item.status === 'updated').length,
      linkedUsers: results.filter((item) => item.status === 'linked').length,
      createdSchools: results.filter((item) => item.schoolCreated).length,
      errors: results.filter((item) => item.status === 'error').length
    };

    return json({ summary, results });
  } catch (error) {
    return json({ error: error?.message || 'Erro inesperado ao importar escolas e acessos.' }, 500);
  }
}
