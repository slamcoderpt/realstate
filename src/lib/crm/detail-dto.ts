import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {getLeadDetail, type CrmActivityType, type LeadRow} from './service';
import type {Locale} from '@/lib/mail/templates';

/**
 * Vista do detalhe de uma lead pronta a atravessar a fronteira servidor→cliente.
 *
 * O detalhe é hoje mostrado em dois sítios — a página `/crm/[id]` e o modal do
 * kanban — e o modal carrega-o por Server Action. Para que os dois mostrem
 * exatamente o mesmo (incluindo datas), a montagem vive aqui: nomes dos autores
 * resolvidos num único fetch e datas JÁ formatadas no servidor. Formatar no
 * cliente daria fusos diferentes entre o HTML do servidor e a hidratação.
 */

export type LeadActivityView = {
  id: string;
  type: CrmActivityType;
  body: string;
  authorName: string;
  createdAtLabel: string;
  dueAtLabel: string | null;
};

export type LeadDetailView = {
  lead: LeadRow;
  activities: LeadActivityView[];
};

export async function getLeadDetailView(
  id: string,
  loc: Locale
): Promise<LeadDetailView | null> {
  const detail = await getLeadDetail(id);
  if (!detail) return null;
  const {lead, activities} = detail;

  // Nomes dos autores das atividades (um fetch para todos).
  const authorIds = [
    ...new Set(activities.map((a) => a.author_id).filter((v): v is string => !!v))
  ];
  const authorName = new Map<string, string>();
  if (authorIds.length > 0) {
    const db = createAdminClient();
    const {data} = await db
      .from('profiles')
      .select('id, full_name')
      .in('id', authorIds);
    for (const p of data ?? [])
      authorName.set(p.id as string, (p.full_name as string) || '');
  }

  const fmt = new Intl.DateTimeFormat(loc === 'en' ? 'en-GB' : 'pt-PT', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  return {
    lead,
    activities: activities.map((a) => ({
      id: a.id,
      type: a.type,
      body: a.body,
      authorName: a.author_id ? (authorName.get(a.author_id) ?? '') : '',
      createdAtLabel: fmt.format(new Date(a.created_at)),
      dueAtLabel: a.due_at ? fmt.format(new Date(a.due_at)) : null
    }))
  };
}
