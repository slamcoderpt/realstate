'use client';

import {useState} from 'react';
import {ChevronDownIcon, MenuIcon, XIcon} from 'lucide-react';
import {Link, usePathname} from '@/i18n/navigation';
import {cn} from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

export type NavItem = {href: string; label: string};
export type NavSection = {label?: string; items: NavItem[]};
export type NavMenu = {label: string; sections: NavSection[]};

/**
 * Navegação principal, sobre a barra azul da marca.
 *
 * Cliente por uma razão só: marcar onde o utilizador está (`usePathname`). Sem
 * isso, vários destinos sem estado ativo obrigam a ler o cabeçalho da página
 * para saber em que secção se está.
 *
 * `usePathname` do `@/i18n/navigation` devolve o caminho JÁ sem o prefixo de
 * locale, por isso as comparações são feitas contra os href tal como estão
 * declarados — não é preciso remover /pt nem /en à mão.
 */
export function MainNav({
  flat,
  menus,
  menuLabel
}: {
  flat: NavItem[];
  menus: NavMenu[];
  menuLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // `/` só casa exatamente: com `startsWith` seria pai de tudo e ficaria
  // sempre ativo. Os restantes casam por prefixo, para que uma sub-rota
  // (ex.: /gestao-projetos/<id>/obra) mantenha a secção assinalada.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const menuIsActive = (menu: NavMenu) =>
    menu.sections.some((s) => s.items.some((i) => isActive(i.href)));

  const allItems = [
    ...flat,
    ...menus.flatMap((m) => m.sections.flatMap((s) => s.items))
  ];

  // Cápsula translúcida a agrupar a navegação: separa-a do resto da barra sem
  // precisar de filetes, e o item ativo vira uma pastilha branca sólida.
  const pill =
    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition';
  const pillOn = 'bg-white text-brand-600 shadow-[0_2px_8px_rgba(7,18,53,0.16)]';
  const pillOff = 'text-white/85 hover:bg-white/15 hover:text-white';

  return (
    <>
      <nav
        aria-label="TILWENI"
        className="hidden items-center gap-1 rounded-full bg-white/10 p-1 md:flex"
      >
        {flat.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? 'page' : undefined}
            className={cn(pill, isActive(item.href) ? pillOn : pillOff)}
          >
            {item.label}
          </Link>
        ))}

        {menus.map((menu) => (
          <DropdownMenu key={menu.label}>
            <DropdownMenuTrigger
              className={cn(
                pill,
                'group outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                menuIsActive(menu) ? pillOn : pillOff
              )}
            >
              {menu.label}
              <ChevronDownIcon
                className="size-3.5 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" sideOffset={10} className="w-56">
              {menu.sections.map((section, i) => (
                <div key={section.label ?? i}>
                  {i > 0 && <DropdownMenuSeparator />}
                  {section.label && (
                    <DropdownMenuLabel className="text-[0.6875rem] font-bold tracking-[0.12em] text-ink-muted uppercase">
                      {section.label}
                    </DropdownMenuLabel>
                  )}
                  {section.items.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          'cursor-pointer font-medium',
                          isActive(item.href) && 'bg-brand-50 font-bold text-brand-700'
                        )}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      </nav>

      {/* Telemóvel: um botão só, e a lista completa por baixo — hierarquia
          escondida num ecrã pequeno custa mais do que a lista longa. */}
      <button
        type="button"
        aria-label={menuLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-9 items-center justify-center self-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:hidden"
      >
        {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
      </button>

      {open && (
        <nav
          aria-label={menuLabel}
          className="w-full border-t border-white/15 py-2 md:hidden"
        >
          {allItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'block rounded-xl px-3.5 py-2.5 text-sm font-semibold transition',
                isActive(item.href)
                  ? 'bg-white text-brand-600'
                  : 'text-white/85 hover:bg-white/15 hover:text-white'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
