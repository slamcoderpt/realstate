/**
 * Envelope do CRM. A única razão de existir é vestir a subárvore com
 * `crm-surface` — a linguagem visual densa e neutra do módulo (ver globals.css).
 *
 * Ao ser um layout, cobre `/crm` e `/crm/[id]` sem cada página ter de se
 * lembrar. Os diálogos ficam de fora (saem por portal para o `body`) e levam a
 * classe eles próprios.
 */
export default function CrmLayout({children}: {children: React.ReactNode}) {
  return <div className="crm-surface min-h-[calc(100vh-56px)]">{children}</div>;
}
