-- Validação SUPRIR Educação V5.3.1
select
  to_regprocedure('public.delete_school_request_before_approval(uuid)') is not null as funcao_excluir_pedido_ok,
  to_regprocedure('public.save_school_request(uuid,text,text,date,text,text,text,jsonb,boolean)') is not null as funcao_editar_pedido_ok,
  to_regclass('public.request_deletion_audit') is not null as auditoria_exclusao_ok;
