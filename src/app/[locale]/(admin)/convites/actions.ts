'use server';

import {revalidatePath} from 'next/cache';
import {headers} from 'next/headers';
import {requireStaff} from '@/lib/auth/staff';
import type {Locale} from '@/lib/mail/templates';
import {createInvite, revokeInvite, resendInvite} from '@/lib/invites/service';

function localeFrom(formData: FormData): Locale {
  return formData.get('locale') === 'en' ? 'en' : 'pt';
}

/** Origem absoluta da app para os links dos emails. Env em prod; host em dev. */
async function appUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = (await headers()).get('host') ?? 'localhost:3000';
  const proto =
    host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${host}`;
}

export async function createInviteAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const locale = localeFrom(formData);
  if (!fullName || !email) throw new Error('nome e email são obrigatórios');

  await createInvite({
    fullName,
    email,
    locale,
    actorId: session.userId,
    appUrl: await appUrl()
  });
  revalidatePath(`/${locale}/convites`);
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get('id') ?? '');
  const locale = localeFrom(formData);
  if (id) await revokeInvite(id);
  revalidatePath(`/${locale}/convites`);
}

export async function resendInviteAction(formData: FormData): Promise<void> {
  await requireStaff();
  const id = String(formData.get('id') ?? '');
  const locale = localeFrom(formData);
  if (id) await resendInvite({id, locale, appUrl: await appUrl()});
  revalidatePath(`/${locale}/convites`);
}
