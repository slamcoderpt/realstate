# TILWENI — Restauro de backup

Procedimento manual para recuperar `tilweni-prod` (ref `yhyyivzcugfjwjhazbto`,
plano **Pro**, região `eu-central-1`).

> **Estado: procedimento escrito, NÃO executado.** A Fatia 6 documentou-o mas
> não o correu contra produção — decisão de 2026-07-22. Enquanto não for
> executado uma vez, isto é um plano credível, não uma capacidade provada. Ver
> "Ensaio" no fim.

---

## O que está coberto pelo backup

O plano Pro faz **backups diários** com retenção de 7 dias, e permite
**Point-in-Time Recovery** (PITR) se estiver ativado no projeto.

| Componente | Coberto? | Notas |
| --- | --- | --- |
| Schema + dados de `public` | Sim | 16 tabelas, incluindo `audit_log` |
| `auth.users` (contas, MFA) | Sim | faz parte da base de dados |
| Migrações aplicadas (`supabase_migrations`) | Sim | idem |
| Objetos de Storage (ficheiros nos buckets) | **A CONFIRMAR** | ver aviso abaixo |
| Variáveis de ambiente do Vercel | Não | reconfigurar à mão |
| Configuração de Auth (signups, MFA) | Não | reconfigurar no dashboard |

> ⚠️ **Não assumir que os ficheiros de Storage vêm no backup da base de dados.**
> A tabela `storage.objects` (os *metadados*) está na BD e vem; os **bytes**
> vivem noutro sistema. Um restauro que traga as linhas sem os ficheiros deixa
> a app a emitir URLs assinadas para objetos inexistentes — o pior dos mundos,
> porque falha em runtime e não no restauro. Confirmar isto no ensaio, e se não
> estiver coberto, montar cópia própria dos buckets `kyc`, `project-docs`,
> `project-photos`, `contracts`, `work-media`, `statements`.

---

## Procedimento

1. **Parar a escrita.** No Vercel, pôr o projeto em manutenção ou remover o
   deployment de produção. Restaurar com a app a escrever produz divergência
   entre o que foi restaurado e o que entrou depois.

2. **Escolher o ponto de restauro.** Supabase Dashboard → Database → Backups.
   Backup diário (data) ou PITR (timestamp ao segundo). Anotar o instante
   escolhido — vai ser preciso para reconciliar o que se perdeu.

3. **Restaurar.** O Supabase restaura **para o mesmo projeto**, sobrepondo o
   estado atual. Se o objetivo for inspecionar sem destruir, restaurar antes
   para um projeto novo e comparar.

4. **Reconfigurar o que não vem no backup:**
   - Auth: signups desativados, MFA (TOTP) ativo;
   - variáveis de ambiente no Vercel (Supabase URL/keys, `SMTP_*`,
     `NEXT_PUBLIC_APP_URL`);
   - se o ref do projeto mudou, atualizar `NEXT_PUBLIC_SUPABASE_URL` e as chaves.

5. **Validar antes de reabrir** (ver secção seguinte).

6. **Reabrir a escrita** e registar o incidente: instante do restauro, o que se
   perdeu, quem decidiu.

---

## Validação pós-restauro

Correr no SQL Editor do projeto restaurado. Comparar com o que se espera, não só
"não deu erro".

```sql
-- 1. Contagens por tabela (comparar com o último retrato conhecido)
select 'profiles', count(*) from public.profiles
union all select 'invites', count(*) from public.invites
union all select 'kyc_submissions', count(*) from public.kyc_submissions
union all select 'projects', count(*) from public.projects
union all select 'subscriptions', count(*) from public.subscriptions
union all select 'account_statements', count(*) from public.account_statements
union all select 'audit_log', count(*) from public.audit_log
union all select 'notifications', count(*) from public.notifications;

-- 2. O audit_log é a fita do tempo: a última linha diz até onde o restauro foi.
select id, action, entity_type, created_at
from public.audit_log order by id desc limit 5;

-- 3. Segurança intacta? Ambos TÊM de dar 0.
select count(*) as politicas_fora_de_authenticated
from pg_policies where schemaname='public' and roles <> '{authenticated}';

select count(*) as grants_ao_anon
from information_schema.role_table_grants
where table_schema='public' and grantee='anon'
  and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');

-- 4. Buckets: 6, todos privados.
select id, public, file_size_limit from storage.buckets order by id;

-- 5. Migrações: a última tem de bater certo com supabase/migrations/ no repo.
select version, name from supabase_migrations.schema_migrations
order by version desc limit 5;
```

**Verificação de ficheiros (a que mais provavelmente falha).** Escolher um
extrato real e confirmar que o objeto existe mesmo, não só a linha:

```sql
select s.id, s.storage_path,
       (select count(*) from storage.objects o
         where o.bucket_id = 'statements' and o.name = s.storage_path) as objeto_existe
from public.account_statements s limit 5;
```
`objeto_existe = 0` com a linha presente significa metadados sem bytes — parar e
tratar do Storage antes de reabrir.

**Verificação funcional**, depois das queries: entrar como um investidor real,
abrir um extrato e confirmar que o PDF descarrega. É o único teste que exercita
BD + Storage + URLs assinadas + auditoria ao mesmo tempo.

---

## Ensaio (por fazer)

Antes de depender disto, executar uma vez **contra um projeto de ensaio**, nunca
contra produção:

1. Criar um projeto Supabase temporário e aplicar as migrações do repo.
2. Semear dados representativos, incluindo um ficheiro em cada bucket.
3. Esperar por um backup diário (ou usar PITR).
4. Apagar dados deliberadamente.
5. Restaurar e correr a validação acima **incluindo a verificação de ficheiros**.
6. Registar aqui: quanto tempo demorou, e se os objetos de Storage voltaram.

Sem o passo 5 confirmado, tratar o Storage como **não coberto** e manter cópia
própria dos buckets.
