/**
 * Templates de email bilingues (pt/en). Puros: recebem locale + payload e
 * devolvem {subject, html}. Sem I/O — testáveis isoladamente.
 *
 * Nota (Fatia 1): o rodapé legal é propositadamente mínimo. Os textos completos
 * de risco/iliquidez/termos ficam para quando forem definidos; aqui vai apenas
 * um aviso curto. Ver `platform_settings.terms_version`.
 */

export type Locale = 'pt' | 'en';

export type TemplateName =
  | 'invite'
  | 'welcome'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_rejected';

export type InvitePayload = {
  fullName: string;
  /** Link absoluto de aceitação, ex.: https://app/pt/aceitar-convite/<token> */
  url: string;
  /** Data-limite legível (já formatada pela aplicação). */
  expiresAt: string;
};

export type WelcomePayload = {
  fullName: string;
  loginUrl: string;
};

export type KycSubmittedPayload = {fullName: string};
export type KycApprovedPayload = {fullName: string};
export type KycRejectedPayload = {fullName: string; reason: string};

export type TemplatePayloadMap = {
  invite: InvitePayload;
  welcome: WelcomePayload;
  kyc_submitted: KycSubmittedPayload;
  kyc_approved: KycApprovedPayload;
  kyc_rejected: KycRejectedPayload;
};

export type RenderedEmail = {subject: string; html: string};

/** Escapa texto para interpolação segura em HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FOOTER: Record<Locale, string> = {
  pt: 'Investir envolve risco, incluindo a perda de capital e a iliquidez do investimento. Se não reconhece este email, ignore-o.',
  en: 'Investing involves risk, including loss of capital and illiquidity. If you did not expect this email, please ignore it.'
};

/** Envelope HTML sóbrio partilhado por todos os templates. */
function layout(locale: Locale, bodyHtml: string): string {
  return [
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">`,
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;background:#f5f5f5;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">',
    '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:8px;overflow:hidden">',
    '<tr><td style="background:#111;padding:20px 24px"><span style="color:#fff;font-size:18px;letter-spacing:1px">TILWENI</span></td></tr>',
    `<tr><td style="padding:24px">${bodyHtml}</td></tr>`,
    `<tr><td style="padding:16px 24px;border-top:1px solid #eee;color:#888;font-size:12px;line-height:1.5">${esc(
      FOOTER[locale]
    )}</td></tr>`,
    '</table></td></tr></table></body></html>'
  ].join('');
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${esc(
    url
  )}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px">${esc(
    label
  )}</a></p>`;
}

function renderInvite(locale: Locale, p: InvitePayload): RenderedEmail {
  if (locale === 'en') {
    return {
      subject: 'Your TILWENI invitation',
      html: layout(
        'en',
        `<p style="font-size:15px;line-height:1.6">Hello ${esc(p.fullName)},</p>` +
          `<p style="font-size:15px;line-height:1.6">You have been invited to join the TILWENI private investor area. Use the button below to set up your account.</p>` +
          button(p.url, 'Accept invitation') +
          `<p style="font-size:13px;color:#666;line-height:1.6">This invitation is valid until ${esc(
            p.expiresAt
          )}. It can only be used once.</p>`
      )
    };
  }
  return {
    subject: 'O seu convite TILWENI',
    html: layout(
      'pt',
      `<p style="font-size:15px;line-height:1.6">Olá ${esc(p.fullName)},</p>` +
        `<p style="font-size:15px;line-height:1.6">Foi convidado para a área privada de investidores da TILWENI. Utilize o botão abaixo para configurar a sua conta.</p>` +
        button(p.url, 'Aceitar convite') +
        `<p style="font-size:13px;color:#666;line-height:1.6">Este convite é válido até ${esc(
          p.expiresAt
        )} e só pode ser usado uma vez.</p>`
    )
  };
}

function renderWelcome(locale: Locale, p: WelcomePayload): RenderedEmail {
  if (locale === 'en') {
    return {
      subject: 'Welcome to TILWENI',
      html: layout(
        'en',
        `<p style="font-size:15px;line-height:1.6">Hello ${esc(p.fullName)},</p>` +
          `<p style="font-size:15px;line-height:1.6">Your TILWENI account is ready. You can sign in at any time using the button below.</p>` +
          button(p.loginUrl, 'Sign in')
      )
    };
  }
  return {
    subject: 'Bem-vindo à TILWENI',
    html: layout(
      'pt',
      `<p style="font-size:15px;line-height:1.6">Olá ${esc(p.fullName)},</p>` +
        `<p style="font-size:15px;line-height:1.6">A sua conta TILWENI está pronta. Pode iniciar sessão a qualquer momento no botão abaixo.</p>` +
        button(p.loginUrl, 'Iniciar sessão')
    )
  };
}

function renderKycSubmitted(locale: Locale, p: KycSubmittedPayload): RenderedEmail {
  if (locale === 'en') {
    return {
      subject: 'TILWENI — Identity verification received',
      html: layout(
        'en',
        `<p style="font-size:15px;line-height:1.6">Hello ${esc(p.fullName)},</p>` +
          `<p style="font-size:15px;line-height:1.6">We have received your identity verification documents. We will notify you by email as soon as the review is complete.</p>`
      )
    };
  }
  return {
    subject: 'TILWENI — Verificação de identidade recebida',
    html: layout(
      'pt',
      `<p style="font-size:15px;line-height:1.6">Olá ${esc(p.fullName)},</p>` +
        `<p style="font-size:15px;line-height:1.6">Recebemos os seus documentos de verificação de identidade (KYC). Iremos notificá-lo por email assim que a análise estiver concluída.</p>`
    )
  };
}

function renderKycApproved(locale: Locale, p: KycApprovedPayload): RenderedEmail {
  if (locale === 'en') {
    return {
      subject: 'TILWENI — Identity verification approved',
      html: layout(
        'en',
        `<p style="font-size:15px;line-height:1.6">Hello ${esc(p.fullName)},</p>` +
          `<p style="font-size:15px;line-height:1.6">Your identity verification has been approved. You now have access to the TILWENI private investor area.</p>`
      )
    };
  }
  return {
    subject: 'TILWENI — Verificação de identidade aprovada',
    html: layout(
      'pt',
      `<p style="font-size:15px;line-height:1.6">Olá ${esc(p.fullName)},</p>` +
        `<p style="font-size:15px;line-height:1.6">A sua verificação de identidade foi aprovada. Já tem acesso à área privada de investidores da TILWENI.</p>`
    )
  };
}

function renderKycRejected(locale: Locale, p: KycRejectedPayload): RenderedEmail {
  if (locale === 'en') {
    return {
      subject: 'TILWENI — Identity verification — action needed',
      html: layout(
        'en',
        `<p style="font-size:15px;line-height:1.6">Hello ${esc(p.fullName)},</p>` +
          `<p style="font-size:15px;line-height:1.6">We could not complete your identity verification for the following reason:</p>` +
          `<p style="font-size:15px;line-height:1.6;font-weight:bold">${esc(p.reason)}</p>` +
          `<p style="font-size:15px;line-height:1.6">Please resubmit the corrected documents so we can continue the review.</p>`
      )
    };
  }
  return {
    subject: 'TILWENI — Verificação de identidade — ação necessária',
    html: layout(
      'pt',
      `<p style="font-size:15px;line-height:1.6">Olá ${esc(p.fullName)},</p>` +
        `<p style="font-size:15px;line-height:1.6">Não foi possível concluir a sua verificação de identidade pelo seguinte motivo:</p>` +
        `<p style="font-size:15px;line-height:1.6;font-weight:bold">${esc(p.reason)}</p>` +
        `<p style="font-size:15px;line-height:1.6">Por favor, submeta novamente os documentos corrigidos para prosseguirmos com a análise.</p>`
    )
  };
}

/** Renderiza um template pelo nome, com o payload correspondente. */
export function renderTemplate<T extends TemplateName>(
  template: T,
  locale: Locale,
  payload: TemplatePayloadMap[T]
): RenderedEmail {
  switch (template) {
    case 'invite':
      return renderInvite(locale, payload as InvitePayload);
    case 'welcome':
      return renderWelcome(locale, payload as WelcomePayload);
    case 'kyc_submitted':
      return renderKycSubmitted(locale, payload as KycSubmittedPayload);
    case 'kyc_approved':
      return renderKycApproved(locale, payload as KycApprovedPayload);
    case 'kyc_rejected':
      return renderKycRejected(locale, payload as KycRejectedPayload);
    default:
      throw new Error(`template desconhecido: ${template}`);
  }
}
