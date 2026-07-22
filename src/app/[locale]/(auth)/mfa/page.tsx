'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createClient} from '@/lib/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Brand} from '@/components/Brand';
import {dismissMfaPrompt} from './actions';

type Mode = 'loading' | 'enroll' | 'challenge';

export default function MfaPage() {
  const t = useTranslations('Mfa');
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>('loading');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const started = useRef(false);

  const setup = useCallback(async () => {
    const {data: factors} = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === 'verified');

    if (verified) {
      // Já tem TOTP — só falta o desafio para subir a aal2.
      setFactorId(verified.id);
      setMode('challenge');
      return;
    }

    // Sem fator verificado: limpa fatores por-verificar antigos e enrola de novo.
    const stale = factors?.totp?.filter((f) => f.status !== 'verified') ?? [];
    for (const f of stale) {
      await supabase.auth.mfa.unenroll({factorId: f.id});
    }
    const {data: enrolled, error: enrollError} =
      await supabase.auth.mfa.enroll({factorType: 'totp'});
    if (enrollError || !enrolled) {
      setError(true);
      setMode('enroll');
      return;
    }
    setFactorId(enrolled.id);
    setQrCode(enrolled.totp.qr_code);
    setSecret(enrolled.totp.secret);
    setMode('enroll');
  }, [supabase]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void setup();
  }, [setup]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(false);

    const {data: challenge, error: challengeError} =
      await supabase.auth.mfa.challenge({factorId});
    if (challengeError || !challenge) {
      setError(true);
      setBusy(false);
      return;
    }
    const {error: verifyError} = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim()
    });
    setBusy(false);
    if (verifyError) {
      setError(true);
      return;
    }
    // Sessão sobe a aal2 — o middleware deixa passar.
    router.push('/');
    router.refresh();
  }

  // Ignorar a configuração (MFA é opcional). Marca o prompt como visto e refresca
  // a sessão para o claim ficar fresco, senão o middleware reincomodava de imediato.
  async function onSkip() {
    setSkipping(true);
    await dismissMfaPrompt();
    await supabase.auth.refreshSession();
    router.replace('/');
    router.refresh();
  }

  return (
    // Esta página não tem casca (a AppShell só aparece em aal2), por isso a
    // tela de marca é também aqui a única âncora visual.
    <main className="brand-canvas flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-8">
      {/* `relative` põe o conteúdo acima dos ::before/::after decorativos da
          tela de marca — sem isso, as formas pintam por cima do cartão. */}
      <div className="relative flex w-full max-w-md flex-col items-center gap-7">
        <Brand onDark />
        <Card className="w-full max-w-md py-8">
          <CardHeader className="px-6 sm:px-8">
            <CardTitle className="text-xl font-bold tracking-tight text-ink">
              {t('title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 sm:px-8">
            {mode === 'loading' && (
              <p className="text-sm text-ink-muted">{t('loading')}</p>
            )}

            {mode !== 'loading' && (
              <div className="space-y-6">
                {mode === 'enroll' && (
                  <div className="space-y-4">
                    <p className="text-sm text-ink-soft">{t('enrollHint')}</p>
                    {qrCode && (
                      // qr_code é um data URI SVG gerado pelo Supabase.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrCode}
                        alt="QR code"
                        className="mx-auto size-48 rounded-2xl border border-border bg-white p-2"
                      />
                    )}
                    {secret && (
                      // A chave é lida caractere a caractere por uma pessoa:
                      // monoespaçada, contrastada e nada decorativa.
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-ink-muted">
                          {t('secretLabel')}:
                        </p>
                        <code className="block rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-center font-mono text-sm font-semibold tracking-[0.12em] break-all text-ink select-all">
                          {secret}
                        </code>
                      </div>
                    )}
                  </div>
                )}

                {mode === 'challenge' && (
                  <p className="text-sm text-ink-soft">{t('challengeHint')}</p>
                )}

                <form onSubmit={onVerify} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="code" className="text-ink">
                      {t('code')}
                    </Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="font-mono text-base tracking-[0.3em]"
                    />
                  </div>
                  {error && (
                    <p
                      role="alert"
                      className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
                    >
                      {t('error')}
                    </p>
                  )}
                  <Button type="submit" className="w-full" disabled={busy}>
                    {t('verify')}
                  </Button>
                </form>

                {/* MFA opcional: no ecrã de configuração pode-se adiar. No modo
                    de desafio (já tem fator) não há como saltar. */}
                {mode === 'enroll' && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={onSkip}
                    disabled={skipping || busy}
                  >
                    {t('skip')}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
