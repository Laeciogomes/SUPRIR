import { json } from '../../_shared/http.js';
import { generateTemporaryPassword } from '../../_shared/passwords.js';
import {
  generateSchoolPin,
  isSchoolPin,
  schoolPasswordForAuth
} from '../../_shared/school-credentials.js';
import { requireSmeAdmin } from '../../_shared/supabase-admin.js';

export async function onRequestPost(context) {
  try {
    const auth = await requireSmeAdmin(context, 'Somente administradores da SME podem redefinir senhas.');
    if (auth.errorResponse) return auth.errorResponse;

    const body = await context.request.json();
    const profileId = String(body.profileId || '').trim();
    const suppliedPassword = String(body.password || '');
    if (!profileId) return json({ error: 'Usuário não informado.' }, 400);

    const { data: profile, error: profileLookupError } = await auth.admin
      .from('profiles')
      .select('id, account_type')
      .eq('id', profileId)
      .maybeSingle();
    if (profileLookupError) return json({ error: profileLookupError.message }, 400);
    if (!profile) return json({ error: 'Usuário não encontrado.' }, 404);

    const isSchool = profile.account_type === 'school';
    const temporaryPassword = suppliedPassword || (isSchool ? generateSchoolPin() : generateTemporaryPassword('R8!'));

    if (isSchool && !(isSchoolPin(temporaryPassword) || temporaryPassword.length >= 8)) {
      return json({ error: 'A senha da escola deve ter 6 dígitos ou ao menos 8 caracteres.' }, 400);
    }
    if (!isSchool && temporaryPassword.length < 8) {
      return json({ error: 'A senha deve ter ao menos 8 caracteres.' }, 400);
    }

    const passwordForAuth = isSchool ? schoolPasswordForAuth(temporaryPassword) : temporaryPassword;
    const { error: updateError } = await auth.admin.auth.admin.updateUserById(profileId, { password: passwordForAuth });
    if (updateError) return json({ error: updateError.message }, 400);

    const { error: profileError } = await auth.admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', profileId);
    if (profileError) return json({ error: profileError.message }, 400);

    return json({ temporaryPassword });
  } catch (error) {
    return json({ error: error?.message || 'Erro inesperado ao redefinir a senha.' }, 500);
  }
}
