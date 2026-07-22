'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createClient} from '@/lib/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent} from '@/components/ui/card';
import {Brand} from '@/components/Brand';

export default function LoginPage() {
  const t = useTranslations('Login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // O atributo `disabled` só se aplica após re-render; guarda contra um
    // duplo-submit rápido que dispararia o pedido duas vezes.
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const supabase = createClient();
      const {error: signInError} = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signInError) {
        setError(true);
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      // signInWithPassword pode lançar (ex.: falha de rede) em vez de resolver
      // com {error}. Sem isto, `loading` ficaria preso a true para sempre.
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    // Entrada partida: a tela de marca à esquerda, o formulário à direita.
    // No telemóvel a tela encolhe para uma faixa fina no topo — decoração
    // nenhuma pode empurrar o formulário para baixo da dobra.
    <main className="brand-canvas flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-8">
      {/* `relative` põe o conteúdo acima dos ::before/::after decorativos da
          tela de marca — sem isso, as formas pintam por cima do cartão. */}
      <div className="relative flex w-full max-w-md flex-col items-center gap-7">
        <Brand onDark />
        <Card className="w-full max-w-md py-8">
          <CardContent className="px-6 sm:px-8">
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-ink">
                  {t('email')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-ink">
                  {t('password')}
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <Button type="submit" className="w-full" disabled={loading}>
                {t('submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
