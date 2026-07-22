'use server';

import {headers} from 'next/headers';
import {requestPasswordReset} from '@/lib/auth/password-reset';
import {clientIpFromHeaders} from '@/lib/auth/request';
import type {Locale} from '@/lib/mail/templates';

/**
 * `sent` é o único desfecho de sucesso e não diz se a conta existe — ver a nota
 * em requestPasswordReset. `error` só aparece se a própria ação rebentar
 * (rede/configuração), nunca por causa do email escrito no formulário.
 */
export type ResetState = {status: 'idle' | 'sent' | 'error'};

async function appUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = (await headers()).get('host') ?? 'localhost:3000';
  const proto =
    host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  return `${proto}://${host}`;
}

export async function requestPasswordResetAction(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const email = String(formData.get('email') ?? '').trim();
  const locale: Locale = formData.get('locale') === 'en' ? 'en' : 'pt';

  // Um campo vazio devolve a mesma mensagem oca: validar "existe email?" aqui
  // seria a única forma de o formulário responder diferente conforme o que se
  // escreve, que é justamente o que este fluxo evita.
  if (!email) return {status: 'sent'};

  try {
    await requestPasswordReset({
      email,
      locale,
      appUrl: await appUrl(),
      ip: clientIpFromHeaders(await headers())
    });
    return {status: 'sent'};
  } catch {
    return {status: 'error'};
  }
}
