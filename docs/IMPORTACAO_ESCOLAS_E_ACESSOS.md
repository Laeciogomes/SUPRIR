# Importação de escolas e acessos — SUPRIR Educação V5.1

O **Administrador do sistema** pode cadastrar escolas e usuários em lote com CSV no formato:

```text
NM_ESCOLA;DC_LOGIN;SENHA
```

- `NM_ESCOLA`: nome da unidade escolar;
- `DC_LOGIN`: código usado pela escola no login;
- `SENHA`: PIN temporário de 6 dígitos ou senha com pelo menos 8 caracteres.

Arquivo preparado no projeto:

```text
private/importacao/escolas_caninde_credenciais.csv
```

## Antes de importar

1. Instale/atualize o banco para a V5.1.
2. Publique a V5.1 no Cloudflare Pages.
3. Confira:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SECRETA
SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
```

4. Entre com `system_admin`.

## Importar

1. Abra **Usuários**.
2. Clique em **Importar escolas**.
3. Selecione `private/importacao/escolas_caninde_credenciais.csv`.
4. Na primeira importação, mantenha **Redefinir senhas de acessos já existentes** desmarcado.
5. Execute e confira o relatório de resultado.

A reimportação foi projetada para atualizar nomes/vínculos sem substituir a senha pessoal da escola quando a redefinição estiver desmarcada.

## Segurança

- `SUPABASE_SERVICE_ROLE_KEY` permanece somente na Function de servidor.
- Senhas não são gravadas em tabelas públicas.
- O relatório não repete PINs.
- O CSV de credenciais não deve ser enviado para repositório público.
