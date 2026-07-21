'use server';

import {requireStaff} from '@/lib/auth/staff';
import {publishStatement} from '@/lib/statements/service';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

/**
 * Server Action de publicação de extratos. `requireStaff()` é obrigatório
 * mesmo com o layout `(admin)` a proteger a página: uma Server Action é um
 * endpoint independente e alcançável por si só.
 *
 * Publicar o mesmo período NÃO substitui nada — `publishStatement` cria uma
 * nova versão e o histórico fica permanente (spec 3.6).
 */
export async function publishStatementAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  const s = await requireStaff();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return;
  await publishStatement({
    projectId,
    period: String(formData.get('period') ?? ''),
    file,
    publishedBy: s.userId,
    locale
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}/extratos`);
}
