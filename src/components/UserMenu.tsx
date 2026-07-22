'use client';

import {ChevronDownIcon} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

/**
 * Menu da conta. Recolhe o email e o "terminar sessão" — que ocupavam metade da
 * barra — atrás de um só alvo, e aproveita para mostrar o papel: numa
 * plataforma onde a mesma pessoa pode entrar como admin, gestor ou auditor,
 * saber com que chapéu se está posto evita enganos.
 *
 * `signOut` é uma Server Action passada como prop pelo AppShell — o menu não
 * precisa de saber nada sobre sessões.
 */
export function UserMenu({
  email,
  roleLabel,
  signOutLabel,
  accountLabel,
  signOut
}: {
  email: string;
  roleLabel: string;
  signOutLabel: string;
  accountLabel: string;
  signOut: () => Promise<void>;
}) {
  // Iniciais do email: `carlos.almeida@x.pt` -> CA. Quadrado, não círculo — a
  // forma lê-se mais institucional e menos rede social.
  const initials = email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={accountLabel}
        className="group inline-flex items-center gap-1.5 rounded-full bg-white/10 py-1 pr-2 pl-1 outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-white/20 text-[0.6875rem] font-bold tracking-wide text-white">
          {initials || '—'}
        </span>
        <ChevronDownIcon
          className="size-3.5 text-white/70 transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-semibold text-ink">{email}</p>
          <p className="mt-0.5 text-xs font-bold tracking-[0.1em] text-brand-500 uppercase">
            {roleLabel}
          </p>
        </div>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer text-left">
              {signOutLabel}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
