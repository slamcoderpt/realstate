import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {detectMime} from '@/lib/kyc/filetype';
import type {SendEmailDeps} from '@/lib/mail/outbox';
import type {Locale} from '@/lib/mail/templates';
import {notifyConfirmedInvestors} from '@/lib/notify/investors';
import {removeStatement, statementPath, uploadStatement} from './storage';

/**
 * Extratos da conta dedicada (server-only, service role). Publicar o mesmo
 * período cria uma NOVA versão — o histórico é permanente e nada é substituído
 * em silêncio (spec 3.6).
 */

export type StatementRow = {
  id: string;
  project_id: string;
  period: string;
  version: number;
  storage_path: string;
  original_filename: string;
  published_at: string;
};

// Mês 01-12: o CHECK na BD aceita `\d{2}` (aceitaria 2026-00 ou 2026-99), o
// serviço é que fecha a porta — um período impossível corrompe o histórico.
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALLOWED_MIME = ['application/pdf'];

export type PublishStatementInput = {
  projectId: string;
  period: string;
  file: File;
  publishedBy: string;
  locale: Locale;
};

export async function publishStatement(
  input: PublishStatementInput,
  deps: SendEmailDeps = {}
): Promise<{id: string; version: number}> {
  const db = deps.db ?? createAdminClient();

  if (!PERIOD_RE.test(input.period)) {
    throw new Error('período inválido (usar AAAA-MM)');
  }
  if (!ALLOWED_MIME.includes(input.file.type)) {
    throw new Error(`tipo de ficheiro não permitido: ${input.file.type}`);
  }
  // Conteúdo REAL (magic-bytes), não só o tipo declarado pelo cliente — que é
  // forjável. Ao contrário da media de obra (upload direto para o Storage), o
  // extrato sobe por Server Action, logo os bytes passam por aqui e dá para
  // verificar. São registos financeiros da conta que detém o dinheiro dos
  // investidores: o tipo declarado não chega.
  const head = new Uint8Array(await input.file.slice(0, 8).arrayBuffer());
  if (detectMime(head) !== 'application/pdf') {
    throw new Error('conteúdo do ficheiro não é um PDF válido');
  }

  const {data: project} = await db
    .from('projects')
    .select('name')
    .eq('id', input.projectId)
    .single();
  if (!project) throw new Error('projeto não encontrado');

  // Nova versão = max(version) + 1 para o período.
  // NOTA: é read-then-write, logo racy sob publicações concorrentes do mesmo
  // período. O unique (project_id, period, version) garante que o perdedor
  // apanha uma violação de constraint em vez de sobrepor em silêncio — aceite
  // para uma ação de staff, de baixa frequência.
  const {data: existing} = await db
    .from('account_statements')
    .select('version')
    .eq('project_id', input.projectId)
    .eq('period', input.period)
    .order('version', {ascending: false})
    .limit(1);
  const version = ((existing?.[0]?.version as number | undefined) ?? 0) + 1;

  const path = statementPath(
    input.projectId,
    input.period,
    version,
    input.file.name
  );
  await uploadStatement(path, input.file, db);

  const {data, error} = await db
    .from('account_statements')
    .insert({
      project_id: input.projectId,
      period: input.period,
      version,
      storage_path: path,
      original_filename: input.file.name,
      mime_type: input.file.type,
      size_bytes: input.file.size,
      published_by: input.publishedBy
    })
    .select('id')
    .single();
  if (error || !data) {
    // O PDF já subiu. Sem esta limpeza, um insert falhado (tipicamente o
    // perdedor da corrida no unique (project_id, period, version)) deixava o
    // ficheiro no bucket sem linha na BD: invisível para a app e para o
    // auditor, mas presente no armazenamento. Um documento financeiro órfão é
    // pior do que documento nenhum. Best-effort — se a remoção falhar,
    // prevalece o erro original (removeStatement não lança).
    await removeStatement(path, db);
    throw new Error(`publicar extrato falhou: ${error?.message ?? 'sem linha'}`);
  }

  await notifyConfirmedInvestors(
    db,
    input.projectId,
    'statement_published',
    {projectName: project.name, period: input.period},
    input.locale,
    {transport: deps.transport}
  );

  return {id: data.id, version};
}

export async function listStatements(
  projectId: string,
  db: SupabaseClient = createAdminClient()
): Promise<StatementRow[]> {
  const {data, error} = await db
    .from('account_statements')
    .select('*')
    .eq('project_id', projectId)
    .order('period', {ascending: false})
    .order('version', {ascending: false});
  if (error) throw new Error(`listar extratos falhou: ${error.message}`);
  return (data ?? []) as StatementRow[];
}
