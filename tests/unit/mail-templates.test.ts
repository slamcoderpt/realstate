import {describe, it, expect} from 'vitest';
import {renderTemplate} from '@/lib/mail/templates';

describe('templates de email', () => {
  const invite = {
    fullName: 'Ana Silva',
    url: 'https://app.tilweni.pt/pt/aceitar-convite/tok123',
    expiresAt: '31/07/2026'
  };

  it('convite pt: assunto e conteúdo em português', () => {
    const {subject, html} = renderTemplate('invite', 'pt', invite);
    expect(subject).toBe('O seu convite TILWENI');
    expect(html).toContain('Aceitar convite');
    expect(html).toContain('Ana Silva');
    expect(html).toContain(invite.url);
    expect(html).toContain('31/07/2026');
  });

  it('convite en: assunto e conteúdo em inglês', () => {
    const {subject, html} = renderTemplate('invite', 'en', invite);
    expect(subject).toBe('Your TILWENI invitation');
    expect(html).toContain('Accept invitation');
    expect(html).not.toContain('Aceitar convite');
  });

  it('boas-vindas pt/en distintos', () => {
    const pt = renderTemplate('welcome', 'pt', {
      fullName: 'Rui',
      loginUrl: 'https://app/pt/login'
    });
    const en = renderTemplate('welcome', 'en', {
      fullName: 'Rui',
      loginUrl: 'https://app/en/login'
    });
    expect(pt.subject).toBe('Bem-vindo à TILWENI');
    expect(en.subject).toBe('Welcome to TILWENI');
  });

  it('rodapé de risco presente em ambos os locales', () => {
    expect(renderTemplate('invite', 'pt', invite).html).toContain('risco');
    expect(renderTemplate('invite', 'en', invite).html).toContain('risk');
  });

  it('escapa HTML no nome (sem injeção)', () => {
    const {html} = renderTemplate('invite', 'pt', {
      ...invite,
      fullName: '<script>alert(1)</script>'
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('templates KYC', () => {
  it('kyc_submitted rende em pt e en', () => {
    const pt = renderTemplate('kyc_submitted', 'pt', {fullName: 'Ana'});
    expect(pt.subject).toMatch(/KYC|verifica/i);
    expect(pt.html).toContain('Ana');
    const en = renderTemplate('kyc_submitted', 'en', {fullName: 'Ana'});
    expect(en.html).toContain('Ana');
  });

  it('kyc_approved rende', () => {
    const r = renderTemplate('kyc_approved', 'pt', {fullName: 'Ana'});
    expect(r.html).toContain('Ana');
  });

  it('kyc_rejected inclui o motivo', () => {
    const r = renderTemplate('kyc_rejected', 'pt', {
      fullName: 'Ana',
      reason: 'Documento ilegível'
    });
    expect(r.html).toContain('Documento ilegível');
  });
});
