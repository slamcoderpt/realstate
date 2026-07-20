-- ============================================================
-- TILWENI · Fatia 4 — Confirmação de fundos ATÓMICA
--
-- Substitui o count-then-update do serviço (transitionSubscription) por uma
-- função que serializa as confirmações do MESMO projeto com um advisory lock
-- (pg_advisory_xact_lock) e verifica o limite max_investors_per_project dentro
-- da mesma transação. Sem isto, duas confirmações concorrentes do último lugar
-- podem ambas ler count=max-1 e ambas passar, levando o projeto a max+1.
--
-- Só o service_role executa (o serviço chama por RPC); anon/authenticated não.
-- ============================================================

create or replace function public.confirm_subscription_funds(
  p_id uuid,
  p_reviewer uuid,
  p_ref text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_status public.subscription_status;
  v_max int;
  v_count int;
begin
  -- Descobrir o projeto (sem lock ainda) para calcular a chave do advisory lock.
  select project_id into v_project
  from public.subscriptions
  where id = p_id;
  if not found then
    raise exception 'subscrição % não encontrada', p_id;
  end if;

  -- Serializa TODAS as confirmações deste projeto. Mantido até ao fim da
  -- transação (cada RPC do PostgREST é a sua própria transação).
  perform pg_advisory_xact_lock(hashtextextended(v_project::text, 0));

  -- Sob o lock: validar estado, limite e escrever.
  select status into v_status
  from public.subscriptions
  where id = p_id;
  if v_status <> 'contrato_assinado' then
    raise exception 'transição inválida: % -> fundos_confirmados', v_status;
  end if;

  -- max_investors_per_project é jsonb: número, ou JSON null (= sem limite).
  select (value #>> '{}')::int into v_max
  from public.platform_settings
  where key = 'max_investors_per_project';

  if v_max is not null then
    select count(*) into v_count
    from public.subscriptions
    where project_id = v_project and status = 'fundos_confirmados';
    if v_count >= v_max then
      raise exception 'limite de investidores atingido (max %)', v_max;
    end if;
  end if;

  update public.subscriptions
  set status = 'fundos_confirmados',
      reviewed_by = p_reviewer,
      confirmed_at = now(),
      confirmed_ref = p_ref,
      updated_at = now()
  where id = p_id;
end;
$$;

-- CRÍTICO: as funções recebem EXECUTE por (a) grant default a PUBLIC e (b)
-- default privileges do Supabase que concedem EXECUTE explícito a anon/
-- authenticated. Como esta função é SECURITY DEFINER (bypassa RLS), deixá-la
-- executável por authenticated seria escalada de privilégios — um investidor
-- confirmaria fundos via RPC. Revogar dos TRÊS (public + anon + authenticated);
-- revogar só de PUBLIC não remove os grants explícitos do Supabase.
revoke execute on function public.confirm_subscription_funds(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_subscription_funds(uuid, uuid, text)
  to service_role;
