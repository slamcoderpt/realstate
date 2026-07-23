'use server';

import {requireStaff} from '@/lib/auth/staff';
import {
  createProject,
  updateProject,
  transitionProject,
  addBudgetLine
} from '@/lib/projects/service';
import {
  uploadProjectFile,
  projectObjectPath,
  PHOTOS_BUCKET,
  DOCS_BUCKET
} from '@/lib/projects/storage';
import {createAdminClient} from '@/lib/supabase/admin';
import type {ProjectStatus} from '@/lib/projects/states';
import type {Locale} from '@/lib/mail/templates';
import {revalidatePath} from 'next/cache';

// A UI recebe a partilha em PERCENTAGEM (0–100, mais legível para o staff); a BD
// guarda uma fração [0,1]. Converte e trava fora do intervalo.
function parseSharePct(raw: FormDataEntryValue | null): number {
  const pct = Number(raw ?? 50);
  const clamped = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 50));
  return clamped / 100;
}

export async function createProjectAction(
  locale: Locale,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await createProject({
    name: String(formData.get('name') ?? ''),
    location: String(formData.get('location') ?? ''),
    description: String(formData.get('description') ?? ''),
    acquisitionCost: Number(formData.get('acquisition_cost') ?? 0),
    worksBudget: Number(formData.get('works_budget') ?? 0),
    arv: Number(formData.get('arv') ?? 0),
    totalAmount: Number(formData.get('total_amount') ?? 0),
    estimatedIrr: Number(formData.get('estimated_irr') ?? 0),
    termMonths: Number(formData.get('term_months') ?? 0),
    tilweniProfitSharePct: parseSharePct(formData.get('profit_share_pct'))
  });
  revalidatePath(`/${locale}/gestao-projetos`);
}

export async function updateProjectAction(
  locale: Locale,
  id: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await updateProject(id, {
    name: String(formData.get('name') ?? ''),
    location: String(formData.get('location') ?? ''),
    description: String(formData.get('description') ?? ''),
    acquisitionCost: Number(formData.get('acquisition_cost') ?? 0),
    worksBudget: Number(formData.get('works_budget') ?? 0),
    arv: Number(formData.get('arv') ?? 0),
    totalAmount: Number(formData.get('total_amount') ?? 0),
    estimatedIrr: Number(formData.get('estimated_irr') ?? 0),
    termMonths: Number(formData.get('term_months') ?? 0),
    tilweniProfitSharePct: parseSharePct(formData.get('profit_share_pct'))
  });
  revalidatePath(`/${locale}/gestao-projetos/${id}`);
}

export async function transitionProjectAction(
  locale: Locale,
  id: string,
  to: ProjectStatus
): Promise<void> {
  await requireStaff();
  await transitionProject(id, to);
  revalidatePath(`/${locale}/gestao-projetos/${id}`);
}

export async function addBudgetLineAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await addBudgetLine(projectId, {
    name: String(formData.get('line_name') ?? ''),
    phase: String(formData.get('line_phase') ?? ''),
    budgetAmount: Number(formData.get('line_amount') ?? 0)
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}`);
}

export async function uploadPhotoAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) return;
  const db = createAdminClient();
  const path = projectObjectPath(projectId, 'photo', file.name);
  await uploadProjectFile(PHOTOS_BUCKET, path, file, db);
  const {count} = await db
    .from('project_photos')
    .select('*', {count: 'exact', head: true})
    .eq('project_id', projectId);
  await db.from('project_photos').insert({
    project_id: projectId,
    storage_path: path,
    sort_order: (count ?? 0) + 1
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}`);
}

/**
 * Capa do projeto — a imagem que o investidor vê no catálogo e no topo da
 * ficha. Vive no mesmo bucket das restantes imagens (`project-photos`), mas o
 * caminho é guardado em `projects.cover_path` e não numa linha de
 * `project_photos`: a capa é UMA por projeto e é um atributo do projeto.
 */
export async function uploadCoverAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const file = formData.get('cover');
  if (!(file instanceof File) || file.size === 0) return;
  const db = createAdminClient();
  const path = projectObjectPath(projectId, 'cover', file.name);
  await uploadProjectFile(PHOTOS_BUCKET, path, file, db);
  // Substituir a capa só troca o valor de `cover_path`: o objeto antigo fica no
  // bucket, órfão. Não se apaga porque `storage.remove()` não funciona na stack
  // local (desvio documentado em docs/desvios-fase-a.md, ponto 2) — a limpeza
  // fica para quando a stack alinhar.
  const {error} = await db
    .from('projects')
    .update({cover_path: path, updated_at: new Date().toISOString()})
    .eq('id', projectId);
  if (error) throw new Error(`guardar capa falhou: ${error.message}`);
  revalidatePath(`/${locale}/gestao-projetos/${projectId}`);
}

export async function uploadDocAction(
  locale: Locale,
  projectId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const file = formData.get('document');
  const docType = String(formData.get('doc_type') ?? 'outro');
  if (!(file instanceof File) || file.size === 0) return;
  const db = createAdminClient();
  const path = projectObjectPath(projectId, docType, file.name);
  await uploadProjectFile(DOCS_BUCKET, path, file, db);
  await db.from('project_documents').insert({
    project_id: projectId,
    doc_type: docType,
    storage_path: path,
    original_filename: file.name,
    mime_type: file.type,
    size_bytes: file.size
  });
  revalidatePath(`/${locale}/gestao-projetos/${projectId}`);
}
