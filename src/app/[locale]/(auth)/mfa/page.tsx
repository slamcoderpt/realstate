'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createClient} from '@/lib/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-xl tracking-tight">
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mode === 'loading' && (
            <p className="text-center text-sm text-neutral-500">{t('loading')}</p>
          )}

          {mode !== 'loading' && (
            <div className="space-y-4">
              {mode === 'enroll' && (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-600">{t('enrollHint')}</p>
                  {qrCode && (
                    // qr_code é um data URI SVG gerado pelo Supabase.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrCode}
                      alt="QR code"
                      className="mx-auto h-44 w-44"
                    />
                  )}
                  {secret && (
                    <p className="text-center text-xs text-neutral-500">
                      {t('secretLabel')}:{' '}
                      <code className="break-all">{secret}</code>
                    </p>
                  )}
                </div>
              )}

              {mode === 'challenge' && (
                <p className="text-sm text-neutral-600">{t('challengeHint')}</p>
              )}

              <form onSubmit={onVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">{t('code')}</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-red-600">
                    {t('error')}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {t('verify')}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
