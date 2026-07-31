/**
 * Primitivos visuais do CRM.
 *
 * Linguagem: a do Twenty (ver o bloco `.crm-surface` em globals.css) — denso,
 * neutro, hierarquia por bordas de 1px em vez de sombras. Vive aqui, e não em
 * `components/ui`, porque é deliberadamente LOCAL: o resto da app fala a língua
 * da marca Altronix e não deve herdar isto sem querer.
 *
 * Sem `'use client'`: são componentes de apresentação, sem estado nem eventos.
 * Assim servem tanto as páginas de servidor como os componentes de cliente.
 */

import type {CrmStage} from '@/lib/crm/constants';

/**
 * Campo de formulário e caixa de seleção.
 *
 * `FIELD_BASE` não fixa largura de propósito: `w-full` e um `w-32` no mesmo
 * elemento são o mesmo tipo de utilidade e quem ganha depende da ordem no CSS
 * gerado, não da ordem em que se escrevem — o `w-full` ganhava sempre e os
 * controlos estreitos saíam à largura toda. Quem quer largura total usa `FIELD`.
 */
export const FIELD_BASE =
  'h-8 rounded border border-[var(--crm-gray6)] bg-white px-2 text-[13px] text-[var(--crm-gray12)] outline-none transition-colors placeholder:text-[var(--crm-gray8)] focus-visible:border-[var(--crm-accent)] disabled:opacity-60';
export const FIELD = `${FIELD_BASE} w-full`;

/**
 * Campo em linha — o padrão da ficha de registo do Twenty.
 *
 * O valor lê-se como TEXTO: sem moldura, sem fundo. Só ao passar o rato ganha
 * um cinzento leve (a dizer «isto edita-se») e ao focar é que vira caixa. Uma
 * ficha com dez campos emoldurados é uma parede de retângulos onde o que
 * interessa — os valores — fica a competir com as bordas.
 *
 * A borda transparente está lá desde o início de propósito: se só aparecesse
 * ao focar, o campo crescia 2px e a ficha inteira estremecia.
 */
export const INLINE =
  'h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-[13px] text-[var(--crm-gray12)] outline-none transition-colors placeholder:text-[var(--crm-gray8)] hover:bg-[var(--crm-gray3)] focus:border-[var(--crm-gray6)] focus:bg-white';

/** Variante para texto multilinha (notas): mesma gramática, altura própria. */
export const INLINE_AREA =
  'w-full resize-y rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] leading-relaxed text-[var(--crm-gray12)] outline-none transition-colors placeholder:text-[var(--crm-gray8)] hover:bg-[var(--crm-gray3)] focus:border-[var(--crm-gray6)] focus:bg-white';

/**
 * Linha da ficha: rótulo à esquerda, valor à direita. Compacta (28px) e
 * alinhada numa grelha fixa, para os valores formarem uma coluna limpa em vez
 * de começarem cada um a sua altura.
 */
export function Row({
  htmlFor,
  label,
  children
}: {
  htmlFor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <label
        htmlFor={htmlFor}
        className="truncate text-[12px] text-[var(--crm-gray9)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/** Marcador de célula/valor ausente. Cinzento claro: é a ausência de dado, não
 *  um dado. */
export function Empty() {
  return <span className="text-[var(--crm-gray8)]">—</span>;
}

/** Controlo da barra de ferramentas (filtros, seletores). */
export const TOOL =
  'h-8 max-w-[11rem] truncate rounded border border-transparent bg-transparent px-2 text-[13px] text-[var(--crm-gray11)] outline-none transition-colors hover:bg-[var(--crm-gray4)] focus-visible:border-[var(--crm-gray6)]';

/** Rótulo de campo: pequeno, cinzento, sem maiúsculas forçadas. */
export const LABEL = 'text-[12px] font-medium text-[var(--crm-gray9)]';

/** Título de secção. */
export const SECTION_TITLE =
  'text-[12px] font-semibold text-[var(--crm-gray11)]';

/** Caixa branca com borda fina — o contentor de tudo no CRM. */
export const PANEL = 'rounded-lg border border-[var(--crm-gray4)] bg-white';

/**
 * Paleta das etiquetas: fundo Radix escala 3, texto Radix escala 11 — o par que
 * o Twenty usa em `TagLight`. Contraste do texto sobre o fundo claro acima de
 * 4.5:1 em todas as combinações.
 */
export type TagTone =
  | 'gray'
  | 'blue'
  | 'purple'
  | 'orange'
  | 'amber'
  | 'green'
  | 'red';

const TONE: Record<TagTone, string> = {
  gray: 'bg-[#f0f0f0] text-[#646464]',
  blue: 'bg-[#e6f4fe] text-[#0d74ce]',
  purple: 'bg-[#f7edfe] text-[#8e4ec6]',
  orange: 'bg-[#ffefd6] text-[#cc4e00]',
  amber: 'bg-[#fff7c2] text-[#ab6400]',
  green: 'bg-[#e9f6e9] text-[#218358]',
  red: 'bg-[#ffefef] text-[#ce2c31]'
};

/**
 * Cor por estado. Segue o percurso do lead: cinzento no início, azul/roxo
 * enquanto se qualifica, âmbar à espera de resposta, verde quando fecha,
 * vermelho quando se perde. Verde e vermelho só nos extremos — se cada coluna
 * tivesse a sua cor forte, nenhuma se destacava.
 */
export const STAGE_TONE: Record<CrmStage, TagTone> = {
  novo: 'gray',
  contactado: 'blue',
  qualificado: 'purple',
  reuniao: 'orange',
  convite_enviado: 'amber',
  convertido: 'green',
  perdido: 'red'
};

/** Etiqueta em pílula. `tone` por omissão cinzenta — a maioria é neutra. */
export function Tag({
  children,
  tone = 'gray',
  title
}: {
  children: React.ReactNode;
  tone?: TagTone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium ${TONE[tone]}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Avatar de iniciais. O Twenty põe um quadrado colorido antes de cada registo —
 * é o que dá à lista o ar de "fichas" e não de folha de cálculo. A cor sai do
 * nome (determinística) para a mesma pessoa ter sempre a mesma.
 */
const AVATAR_TONES = [
  'bg-[#e6f4fe] text-[#0d74ce]',
  'bg-[#f7edfe] text-[#8e4ec6]',
  'bg-[#e9f6e9] text-[#218358]',
  'bg-[#ffefd6] text-[#cc4e00]',
  'bg-[#ffefef] text-[#ce2c31]',
  'bg-[#fff7c2] text-[#ab6400]'
];

export function Avatar({name, size = 20}: {name: string; size?: number}) {
  const letter = name.trim().charAt(0).toUpperCase() || '—';
  // Soma dos códigos: estável entre servidor e cliente (nada de aleatório, que
  // daria hidratação diferente do HTML servido).
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  const tone = AVATAR_TONES[sum % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      style={{width: size, height: size, fontSize: size <= 20 ? 10 : 12}}
      className={`inline-flex shrink-0 items-center justify-center rounded-[4px] font-semibold ${tone}`}
    >
      {letter}
    </span>
  );
}

/** Valor em euros, sem cêntimos — o ticket estimado é sempre redondo. */
export function eur(v: number): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(v);
}
