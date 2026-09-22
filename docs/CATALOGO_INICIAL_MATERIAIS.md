# Catálogo inicial de materiais

Este pacote inclui o cadastro inicial de 215 materiais organizados por categoria.

## Arquivos

- `supabase/migrations/004_catalogo_inicial_materiais.sql`: script para executar no SQL Editor do Supabase.
- `data/catalogo_inicial_materiais_caninde.csv`: planilha CSV de conferência.

## Como aplicar

1. Acesse o Supabase.
2. Abra **SQL Editor**.
3. Cole e execute o arquivo `supabase/migrations/004_catalogo_inicial_materiais.sql`.
4. Depois acesse o sistema em **Materiais** para conferir o catálogo.

O script pode ser executado mais de uma vez. Ele atualiza itens pelo código e evita duplicidade por nome.
