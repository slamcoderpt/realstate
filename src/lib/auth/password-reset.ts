import 'server-only';
import {randomBytes} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createAdminClient} from '@/lib/supabase/admin';
import {sendEmail, type SendEmailDeps} from '@/lib/mail/outbox';
import {MIN_PASSWORD_LENGTH} from '@/lib/invites/accept';
import {hashToken} from '@/lib/invites/token';
import type {Locale} from '@/lib/mail/templates';

/**
 * Reposição de palavra-passe pelo pipeline da própria plataforma (token +
 * `email_outbox`), e não pelo `recovery` do Supabase Auth: só assim o SMTP fica
 * configurado num sítio, o email segue o `preferred_locale` do investidor e o
 * back-office vê (e pode reenviar) todo o correio que sai.
 *
 * A postura de segurança é a dos convites: só sha256(token) é persistido, a
 * validade é curta e o uso é único. Nota de âmbito: repor a palavra-passe NÃO
 * dá acesso — o MFA (TOTP) é obrigatório e imposto pelo middleware, pelo que
 * quem tenha o link ainda enfrenta o segundo fator.
 */

/** Validade do link. Curta de propósito: é uma credencial em trânsito. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Tetos de emails de reposição por endereço, por hora.
 *
 * PORQUÊ: o formulário é público e aceita QUALQUER email. Sem teto, é um
 * amplificador de spam apontado à caixa de correio de quem o atacante escolher
 * — e o custo do envio é nosso. O limite é por destinatário (não por sessão nem
 * por IP) porque é o destinatário que sofre o abuso.
 */
export const RESET_REQUESTS_PER_HOUR = 3;

export type RequestPasswordResetInput = {
  email: string;
  /** Locale do pedido; só usado se o perfil não tiver preferência gravada. */
  locale: Locale;
  /** Origem absoluta da app, ex.: https://app.tilweni.pt */
  appUrl: string;
  /** IP do pedido, para registo em password_resets.requested_ip. */
  ip?: string | null;
};

/**
 * Resposta deliberadamente OCA e sempre igual.
 *
 * Conta existente, conta inexistente, limite atingido ou falha interna: tudo
 * devolve `{ok: true}`. Qualquer campo adicional — um `sent`, um `reason`, até
 * um erro lançado — transformaria este formulário público num oráculo de "este
 * email tem conta na TILWENI", que num portal privado de investimento é
 * exactamente o facto que não queremos confirmar a estranhos.
 */
export type RequestPasswordResetResult = {ok: true};

export type CompletePasswordResetInput = {
  token: string;
  password: string;
};

export type CompleteResetReason = 'invalid' | 'weak_password' | 'error';
export type CompletePasswordResetResult =
  | {ok: true}
  | {ok: false; reason: CompleteResetReason};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Token de reposição. Mesmo idioma dos convites — 32 bytes aleatórios em
 * base64url — e o MESMO `hashToken`, para não existirem duas implementações de
 * hashing que possam divergir.
 */
function generateResetToken(): {token: string; hash: string} {
  const token = randomBytes(32).toString('base64url');
  return {token, hash: hashToken(token)};
}

const USERS_PER_PAGE = 1000;

/**
 * Procura o utilizador pelo email percorrendo TODAS as páginas de
 * `auth.admin.listUsers`.
 *
 * Duas armadilhas fechadas aqui:
 *  (i)  a API é paginada e devolve 50 por omissão. Uma leitura de uma página só
 *       truncava silenciosamente a lista — bug que este repo já teve — e o
 *       sintoma seria "o link nunca chega" para os investidores mais antigos.
 *  (ii) não há `break` ao encontrar. Sair mais cedo faria o custo do pedido
 *       depender da posição (e da existência) da conta, dando ao formulário
 *       público um canal lateral de tempo para a mesma pergunta que a resposta
 *       oca recusa responder.
 */
async function findUserByEmail(
  db: SupabaseClient,
  email: string
): Promise<{id: string} | null> {
  let found: {id: string} | null = null;
  for (let page = 1; ; page++) {
    const {data, error} = await db.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE
    });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const user of users) {
      if (user.email && normalizeEmail(user.email) === email) {
        found = {id: user.id};
      }
    }
    if (users.length < USERS_PER_PAGE) return found;
  }
}

/**
 * Emails de reposição já enviados para este endereço na última hora. Conta-se
 * na `email_outbox` — que é o registo do que EFECTIVAMENTE saiu — e não em
 * `password_resets`, que nem sequer tem linha quando o email é desconhecido.
 */
async function resetEmailsLastHour(
  db: SupabaseClient,
  email: string
): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const {count, error} = await db
    .from('email_outbox')
    .select('id', {count: 'exact', head: true})
    .eq('to_email', email)
    .eq('template', 'password_reset')
    .gte('created_at', since);
  // Fail-closed: se a contagem falha, não se envia. Um teto que se desliga
  // sozinho ao primeiro erro de rede não é um teto.
  if (error) throw error;
  return count ?? 0;
}

/** Locale do email: a preferência gravada do investidor manda sobre a do pedido. */
async function localeForUser(
  db: SupabaseClient,
  userId: string,
  fallback: Locale
): Promise<Locale> {
  const {data} = await db
    .from('profiles')
    .select('preferred_locale')
    .eq('id', userId)
    .maybeSingle();
  return data?.preferred_locale === 'en' || data?.preferred_locale === 'pt'
    ? data.preferred_locale
    : fallback;
}

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
  deps: SendEmailDeps = {}
): Promise<RequestPasswordResetResult> {
  const db = deps.db ?? createAdminClient();
  const email = normalizeEmail(input.email);

  try {
    // O teto é avaliado ANTES da procura, para que exista e custe o mesmo quer
    // a conta exista quer não.
    if ((await resetEmailsLastHour(db, email)) >= RESET_REQUESTS_PER_HOUR) {
      return {ok: true};
    }

    const user = await findUserByEmail(db, email);
    if (!user) return {ok: true};

    // Um pedido novo reforma os anteriores: quem pede o link duas vezes espera
    // que o segundo email seja o que vale, e um link antigo a apanhar boleia na
    // caixa de correio é superfície gratuita.
    const now = new Date().toISOString();
    const {error: retireError} = await db
      .from('password_resets')
      .update({used_at: now})
      .eq('user_id', user.id)
      .is('used_at', null);
    if (retireError) throw retireError;

    const {token, hash} = generateResetToken();
    const {error: insertError} = await db.from('password_resets').insert({
      user_id: user.id,
      token_hash: hash,
      expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
      requested_ip: input.ip ?? null
    });
    if (insertError) throw insertError;

    const locale = await localeForUser(db, user.id, input.locale);
    await sendEmail(
      {
        toEmail: email,
        locale,
        template: 'password_reset',
        payload: {
          url: `${input.appUrl}/${locale}/nova-palavra-passe?token=${encodeURIComponent(token)}`
        }
      },
      {db, transport: deps.transport}
    );
  } catch (err) {
    // Uma falha interna também não pode distinguir-se do caso "email
    // desconhecido": propagar o erro daria ao atacante o oráculo pela porta das
    // traseiras. Fica registada no servidor, onde tem de ser vista.
    console.error('requestPasswordReset falhou', err);
  }

  return {ok: true};
}

export async function completePasswordReset(
  input: CompletePasswordResetInput,
  deps: {db?: SupabaseClient} = {}
): Promise<CompletePasswordResetResult> {
  const db = deps.db ?? createAdminClient();

  const {data: row, error: readError} = await db
    .from('password_resets')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', hashToken(input.token))
    .maybeSingle();
  if (readError) return {ok: false, reason: 'error'};

  // UMA razão só para token desconhecido, já usado e expirado. Distingui-los
  // diria a quem tem o link antigo se ele alguma vez foi válido — e a diferença
  // entre "expirou" e "não existe" é, ela própria, informação.
  const usable =
    row && !row.used_at && new Date(row.expires_at).getTime() > Date.now();
  if (!usable) return {ok: false, reason: 'invalid'};

  // A validação da password vem DEPOIS da do token e ANTES de o queimar: uma
  // password curta não deve custar ao utilizador o link que ainda tem.
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {ok: false, reason: 'weak_password'};
  }

  // Uso único a sério: a marcação é condicional a `used_at is null` e o
  // Postgres reavalia o predicado depois de esperar pela transação vizinha, pelo
  // que num duplo submit em paralelo o segundo UPDATE atinge 0 linhas. Quem não
  // recebe linha de volta não ganhou a corrida e não muda a password.
  const {data: claimed, error: claimError} = await db
    .from('password_resets')
    .update({used_at: new Date().toISOString()})
    .eq('id', row.id)
    .is('used_at', null)
    .select('id');
  if (claimError) return {ok: false, reason: 'error'};
  if ((claimed ?? []).length === 0) return {ok: false, reason: 'invalid'};

  const {error: updateError} = await db.auth.admin.updateUserById(row.user_id, {
    password: input.password
  });
  if (updateError) {
    // O token fica queimado mesmo assim. Falha-se para o lado seguro: o
    // utilizador pede outro link, em vez de ficar com um token vivo depois de
    // uma escrita de credencial que ninguém sabe se passou.
    return {ok: false, reason: 'error'};
  }

  // Password mudada → nenhum outro link pendente deste utilizador deve servir.
  await db
    .from('password_resets')
    .update({used_at: new Date().toISOString()})
    .eq('user_id', row.user_id)
    .is('used_at', null);

  return {ok: true};
}
