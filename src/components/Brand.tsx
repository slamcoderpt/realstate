import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

/**
 * A marca, num sítio só.
 *
 * Estava repetida em cinco ficheiros (a casca e as quatro páginas de entrada),
 * o que significa que uma mudança de identidade obrigava a cinco edições e a
 * primeira esquecida passava despercebida.
 *
 * A segunda linha é texto fixo e NÃO passa pelo i18n de propósito: é parte do
 * nome comercial, como "Altronix Prémios", não uma etiqueta de interface. Um
 * nome de marca traduzido deixaria de ser o mesmo nome em /en.
 */
export function Brand({
  onDark = false,
  href,
  className
}: {
  /** Sobre a barra azul ou a tela de marca. Fora disto, tinta sobre claro. */
  onDark?: boolean;
  /** Com href fica clicável (casca); sem ele é só identidade (páginas de entrada). */
  href?: string;
  className?: string;
}) {
  const inner = (
    <>
      <span
        className={cn(
          'grid size-9 place-items-center rounded-xl text-sm font-bold',
          onDark ? 'bg-white/15 text-white' : 'bg-brand-500 text-white'
        )}
      >
        T
      </span>
      <span className="leading-tight">
        <span
          className={cn(
            'block text-sm font-extrabold tracking-[0.18em]',
            onDark ? 'text-white' : 'text-ink'
          )}
        >
          TILWENI
        </span>
        <span
          className={cn(
            'block text-[10px] font-bold tracking-[0.18em] uppercase',
            onDark ? 'text-white/70' : 'text-brand-500'
          )}
        >
          Investimento
        </span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn('inline-flex items-center gap-2.5', className)}
      >
        {inner}
      </Link>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {inner}
    </span>
  );
}
