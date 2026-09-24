# Validação técnica — SUPRIR Educação V5.1

Validações executadas no pacote:

- sintaxe de todos os arquivos JavaScript com `node --check`;
- integridade dos arquivos JSON principais;
- existência dos imports relativos;
- conferência dos imports/exports nomeados entre módulos internos;
- busca por referências funcionais antigas (`delivery_agent`, atribuição de entregador, fila exclusiva de entrega e RPC de recebimento por entregador);
- conferência estática das novas assinaturas `register_dispatch` e `confirm_delivery_by_school`;
- pacote final sem `node_modules`.

O `npm ci`/build não pôde ser concluído neste ambiente porque o registro npm não resolveu DNS (`EAI_AGAIN`). Antes da publicação em produção, execute localmente:

```powershell
npm.cmd install
npm.cmd run build
```
