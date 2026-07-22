'use client';

import {useEffect, useRef, useState} from 'react';
import {usePathname} from 'next/navigation';

/**
 * Barra de progresso de navegação (topo, cor da marca).
 *
 * O App Router não expõe um evento de "início de navegação", por isso o arranque
 * é detetado a partir de cliques em links internos; o fim vem da mudança real de
 * `pathname`. É feedback de perceção — o `loading.tsx` trata do conteúdo em si.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const active = useRef(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  function clearTimers() {
    if (trickle.current) clearInterval(trickle.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    trickle.current = null;
    hideTimer.current = null;
  }

  function start() {
    clearTimers();
    active.current = true;
    setVisible(true);
    setWidth(8);
    // Aproxima-se de 90% em passos decrescentes — nunca "completa" sozinha; só a
    // chegada à nova rota a leva aos 100%.
    trickle.current = setInterval(() => {
      setWidth((w) => (w >= 90 ? w : w + Math.max(0.5, (90 - w) * 0.1)));
    }, 250);
  }

  function finish() {
    if (!active.current) return; // não pisca se nunca arrancou
    clearTimers();
    setWidth(100);
    hideTimer.current = setTimeout(() => {
      active.current = false;
      setVisible(false);
      setWidth(0);
    }, 300);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (
        !href ||
        href.startsWith('#') ||
        anchor.getAttribute('target') === '_blank' ||
        anchor.hasAttribute('download')
      ) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // externo
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return; // mesma página
      }
      start();
    }

    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clearTimers();
    };
    // Listener registado uma só vez; `start` só usa refs/setState estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fim: o pathname mudou de facto (inclui back/forward do browser).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity duration-200"
      style={{opacity: visible ? 1 : 0}}
    >
      <div
        className="h-full rounded-r-full bg-gradient-to-r from-brand-400 to-brand-500 transition-[width] duration-200 ease-out"
        style={{width: `${width}%`, boxShadow: '0 0 8px rgba(0,107,255,0.7)'}}
      />
    </div>
  );
}
