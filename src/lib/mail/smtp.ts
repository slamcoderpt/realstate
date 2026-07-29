import 'server-only';
import nodemailer from 'nodemailer';

/**
 * Transporte SMTP (Microsoft 365). Envio síncrono: as Server Actions chamam o
 * envio dentro do próprio pedido (sem fila/poller). A `email_outbox` guarda o
 * registo de cada envio e serve de ponto de reenvio manual em caso de falha.
 *
 * Credenciais em variáveis de ambiente (nunca no código):
 *   SMTP_HOST (default smtp.office365.com), SMTP_PORT (default 587, STARTTLS),
 *   SMTP_USER, SMTP_PASS, SMTP_FROM (remetente; default = SMTP_USER).
 */

/** Superfície mínima que o outbox precisa — permite injetar um mock nos testes. */
export type MailTransport = {
  sendMail(opts: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
};

let cached: MailTransport | null = null;

export function getTransport(): MailTransport {
  if (cached) return cached;
  const host = process.env.SMTP_HOST ?? 'smtp.office365.com';
  const port = Number(process.env.SMTP_PORT ?? 587);
  cached = nodemailer.createTransport({
    host,
    port,
    // 587 usa STARTTLS (secure=false + upgrade); 465 seria secure=true.
    secure: port === 465,
    requireTLS: port !== 465,
    // Timeouts explícitos: o envio é SÍNCRONO dentro da Server Action, por isso
    // um SMTP que aceite a ligação e não responda pendurava o pedido do
    // utilizador até a função morrer — e nesse caso a ação fica a meio (já se
    // observou um convite criado sem o lead do CRM ficar ligado). Com timeout,
    // `sendEmail` apanha o erro, marca a entrada como `failed` e o fluxo segue;
    // o reenvio manual do back-office trata do resto.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return cached;
}

/** Endereço remetente. Cai no utilizador SMTP se SMTP_FROM não estiver definido. */
export function smtpFrom(): string {
  return (
    process.env.SMTP_FROM ??
    process.env.SMTP_USER ??
    'no-reply@tilweni.pt'
  );
}
