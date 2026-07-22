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
 * Navegação principal. Cliente por uma razão só: marcar onde o utilizador está
 * (`usePathname`). Sem isso, oito destinos sem estado ativo obrigam a ler o
 * cabeçalho da página para saber em que secção se está.
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

  const allItems = [...flat, ...menus.flatMap((m) => m.sections.flatMap((s) => s.items))];

  return (
    <>
      {/* Escritório: tudo visível, os grupos em dropdown. */}
      <nav aria-label="TILWENI" className="hidden items-center gap-1 md:flex">
        {flat.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {menus.map((menu) => (
          <DropdownMenu key={menu.label}>
            <DropdownMenuTrigger
              className={cn(
                'group relative inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-neutral-900/10',
                menuIsActive(menu)
                  ? 'text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-900'
              )}
            >
              {menu.label}
              <ChevronDownIcon
                className="size-3.5 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180"
                aria-hidden
              />
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-x-3 -bottom-px h-px bg-neutral-900 transition-opacity',
                  menuIsActive(menu) ? 'opacity-100' : 'opacity-0'
                )}
              />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-56">
              {menu.sections.map((section, i) => (
                <div key={section.label ?? i}>
                  {i > 0 && <DropdownMenuSeparator />}
                  {section.label && (
                    <DropdownMenuLabel className="text-[0.6875rem] font-medium tracking-wide text-neutral-400 uppercase">
                      {section.label}
                    </DropdownMenuLabel>
                  )}
                  {section.items.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          'cursor-pointer',
                          isActive(item.href) && 'font-medium text-neutral-900'
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

      {/* Telemóvel: um botão só, e a lista completa por baixo — sem hierarquia
          escondida, que num ecrã pequeno custa mais do que a lista longa. */}
      <button
        type="button"
        aria-label={menuLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-9 items-center justify-center self-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 md:hidden"
      >
        {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
      </button>

      {open && (
        <nav
          aria-label={menuLabel}
          className="w-full border-t border-neutral-200 pt-2 pb-1 md:hidden"
        >
          {allItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                'block rounded-md px-3 py-2 text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-neutral-100 font-medium text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
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

function NavLink({item, active}: {item: NavItem; active: boolean}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative rounded-md px-3 py-2 text-sm transition-colors',
        active ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'
      )}
    >
      {item.label}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-3 -bottom-px h-px bg-neutral-900 transition-opacity',
          active ? 'opacity-100' : 'opacity-0'
        )}
      />
    </Link>
  );
}
