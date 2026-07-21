'use server';

import {headers} from 'next/headers';
import {redirect} from '@/i18n/navigation';
import {acceptInvite, MIN_PASSWORD_LENGTH} from '@/lib/invites/accept';
import {clientIpFromHeaders} from '@/lib/auth/request';
import type {Locale} from '@/lib/mail/templates';

export type AcceptError =
  | 'terms'
  | 'weak_password'
  | 'invalid'
  | 'email_taken'
  | 'error';
export type AcceptState = {error: AcceptError | null};

async function appUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = (await headers()).get('host') ?? 'localhost:3000';
  const proto =
    host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${host}`;
}

export async function acceptInviteAction(
  _prev: AcceptState,
  formData: FormData
): Promise<AcceptState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const acceptedTerms = formData.get('accept') === 'on';
  const locale: Locale = formData.get('locale') === 'en' ? 'en' : 'pt';

  if (!acceptedTerms) return {error: 'terms'};
  if (password.length < MIN_PASSWORD_LENGTH) return {error: 'weak_password'};

  const result = await acceptInvite({
    token,
    password,
    locale,
    acceptedIp: clientIpFromHeaders(await headers()),
    appUrl: await appUrl()
  });

  if (!result.ok) return {error: result.reason};

  // Conta criada — segue para o login (com aviso de sucesso). `redirect` lança
  // NEXT_REDIRECT; o return seguinte é inalcançável mas satisfaz o tipo.
  redirect({href: '/login?accepted=1', locale});
  return {error: null};
}
