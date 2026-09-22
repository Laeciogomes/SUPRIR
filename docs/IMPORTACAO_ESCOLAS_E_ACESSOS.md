# Importação de escolas e acessos

## O que a versão 4 faz

O administrador da SME pode cadastrar escolas e usuários em lote com um arquivo CSV contendo:

```text
NM_ESCOLA;DC_LOGIN;SENHA
```

- `NM_ESCOLA`: nome da unidade escolar;
- `DC_LOGIN`: código numérico usado pela escola na tela de login;
- `SENHA`: PIN temporário de 6 dígitos ou senha com pelo menos 8 caracteres.

O pacote já contém o arquivo preparado com as 59 escolas em:

```text
private/importacao/escolas_caninde_credenciais.csv
```

## Antes de importar

1. Execute `supabase/migrations/003_acessos_escolas_por_codigo.sql` no SQL Editor.
2. Publique a versão 4 no Cloudflare Pages.
3. Confira as variáveis protegidas das Pages Functions:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SECRETA
SCHOOL_LOGIN_DOMAIN=escolas.caninde.ce.gov.br
```

4. Entre no portal SME com um usuário `sme_admin`.

## Importar

1. Abra **Usuários**.
2. Clique em **Importar escolas**.
3. Selecione `private/importacao/escolas_caninde_credenciais.csv`.
4. Na primeira importação, deixe **Redefinir senhas de acessos já existentes** desmarcado.
5. Clique em **Importar arquivo**.
6. Confira o resumo e baixe o relatório de resultado.

## Repetir a importação

A importação é preparada para ser repetida sem duplicar os acessos.

- Com a opção de redefinir senhas **desmarcada**, nomes e vínculos são atualizados, mas a senha que a escola já trocou é preservada.
- Com a opção **marcada**, o PIN do CSV volta a ser a senha temporária do acesso existente.

Use a redefinição somente quando a SME realmente quiser substituir as senhas atuais.

## Como a escola entra

Na tela inicial:

1. escolha **Escola**;
2. informe `DC_LOGIN` no campo **Código da escola**;
3. informe o PIN de 6 dígitos;
4. no primeiro acesso, cadastre uma senha pessoal com pelo menos 8 caracteres.

O e-mail técnico criado internamente pelo sistema não é exibido nem precisa ser informado pela escola.

## Segurança

- A chave `service_role` permanece somente na função de servidor do Cloudflare.
- As senhas não são gravadas em tabelas públicas; o Supabase Auth armazena somente o mecanismo seguro de autenticação.
- O relatório de importação não repete os PINs.
- O CSV com credenciais deve ser apagado do computador após a carga e não deve ser enviado para repositório público.
