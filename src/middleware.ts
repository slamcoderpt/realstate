import createMiddleware from 'next-intl/middleware';
import {NextResponse, type NextRequest} from 'next/server';
import {routing} from './i18n/routing';
import {updateSession} from '@/lib/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const isApi = /^\/api(?:\/|$)/.test(request.nextUrl.pathname);
  const response = isApi ? NextResponse.next() : intlMiddleware(request);
  return await updateSession(request, response);
}

export const config = {
  // Inclui /api (necessário para o refresh de sessão); exclui apenas assets
  // internos do Next e ficheiros estáticos.
  matcher: ['/((?!_next|_vercel|.*\\..*).*)']
};
