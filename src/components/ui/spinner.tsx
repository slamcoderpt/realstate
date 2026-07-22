import {cn} from '@/lib/utils';

/**
 * Indicador de carregamento minimalista: um anel a girar em `currentColor`,
 * sem dependências de ícones. Usado nos botões e nas fronteiras `loading.tsx`.
 */
export function Spinner({
  className,
  label = 'A carregar'
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em]',
        className
      )}
    />
  );
}
