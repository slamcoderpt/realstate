-- ============================================================
-- TILWENI — auditoria: registar QUEM faz cada escrita
--
-- A limitação (i) anotada em 20260717141427_foundations.sql: `audit_row_change`
-- usa `auth.uid()`, que é NULL nos pedidos com service_role. Como TODAS as
-- escritas da app passam por service_role (é assim que contornam a RLS), o
-- audit_log guardava o quê e o quando, nunca o quem.
--
-- Resolução (a hipótese "GUC de sessão" da nota original, na forma que o
-- PostgREST oferece): o cliente admin passa a enviar o utilizador autenticado
-- no cabeçalho `x-actor-id`, e o PostgREST expõe os cabeçalhos do pedido em
-- `current_setting('request.headers')`. O trigger usa-o como recurso quando
-- `auth.uid()` é nulo.
--
-- Porque é de confiar: só quem tem a service_role key chega a este caminho, e
-- essa chave nunca sai do servidor. O cabeçalho é preenchido a partir da sessão
-- já validada por `getUser()`, não de dados do cliente.
--
-- Porque não pode partir nada: a leitura do cabeçalho está dentro de um bloco
-- com EXCEPTION. Cabeçalho ausente (migrações, psql, triggers em cascata),
-- JSON inválido ou uuid mal formado deixam `actor` a null — que é exatamente o
-- comportamento de hoje — em vez de rebentarem a escrita que estão a auditar.
-- `audit_log.actor_id` não tem FK, por isso um id de um utilizador entretanto
-- apagado também não bloqueia nada.
-- ============================================================

create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  rec jsonb;
  actor uuid;
  headers text;
begin
  if tg_op = 'DELETE' then
    rec := to_jsonb(old);
  else
    rec := to_jsonb(new);
  end if;

  -- Quem: o JWT do pedido quando existe; senão, o cabeçalho do cliente admin.
  actor := auth.uid();
  if actor is null then
    begin
      headers := current_setting('request.headers', true);
      if headers is not null then
        actor := nullif(headers::json ->> 'x-actor-id', '')::uuid;
      end if;
    exception when others then
      actor := null;
    end;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload)
  values (
    actor,
    lower(tg_op),
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'key'),
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
