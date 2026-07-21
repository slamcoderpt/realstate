/**
 * IP do cliente a partir dos cabeçalhos do pedido.
 *
 * PORQUÊ existir: a spec da Fase A (§4) exige IP entre os campos de auditoria
 * ("ator, ação, entidade, payload JSONB, IP, timestamp") e o repo já tinha três
 * extrações ad-hoc ligeiramente diferentes (convites, KYC, manifestação de
 * interesse). Uma só implementação evita que a auditoria e o registo probatório
 * de `invites.accepted_ip` divirjam sobre o que é "o IP".
 *
 * CONVENÇÃO (a que o fluxo de aceitação de convite já usava, e que fica agora
 * a valer para todos): primeira entrada de `x-forwarded-for` (o cliente
 * original; as seguintes são os proxies pelo caminho), com fallback para
 * `x-real-ip`. Sem qualquer dos dois, `null` — a coluna é nullable e um IP
 * ausente regista-se como ausente, nunca como uma string inventada.
 *
 * LIMITE: `x-forwarded-for` é forjável por quem fala diretamente com a app. Em
 * produção o valor de confiança é o que o proxy à frente reescreve. Este campo
 * é indício corroborante do rasto de auditoria, não prova isolada — quem prova
 * a identidade é `actor_id`, que vem da sessão.
 *
 * Não é `server-only`: é pura leitura de cabeçalhos e é testada em vitest.
 */

/** Só o que precisamos de `Headers` — serve `Request.headers` e `headers()`. */
type HeaderReader = {get(name: string): string | null};

export function clientIpFromHeaders(headers: HeaderReader): string | null {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;
  const real = headers.get('x-real-ip')?.trim();
  return real || null;
}

/** Atalho para route handlers, que recebem o `Request` diretamente. */
export function clientIp(req: Request): string | null {
  return clientIpFromHeaders(req.headers);
}
