import {Spinner} from '@/components/ui/spinner';

/**
 * Fronteira de carregamento partilhada por todas as rotas sob `[locale]`. O Next
 * mostra-a no instante do clique (via Suspense), enquanto o servidor prepara a
 * página — dá feedback imediato sem congelar a UI. A casca (cabeçalho/navegação)
 * mantém-se; só a área de conteúdo é substituída por este spinner.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="size-8 text-brand-500" />
    </div>
  );
}
