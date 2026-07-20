import {createServerClient} from '@supabase/ssr';
import {NextResponse, type NextRequest} from 'next/server';

const PUBLIC_PATHS = [
  /^\/(pt|en)\/login$/,
  /^\/(pt|en)\/aceitar-convite\/.+$/
];

export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({name, value, options}) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // Nunca remover: revalida o token e mantém a sessão viva.
  const {
    data: {user}
  } = await supabase.auth.getUser();

  const {pathname} = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((re) => re.test(pathname));
  const isMfaPage = /^\/(pt|en)\/mfa$/.test(pathname);
  const isKycPage = /^\/(pt|en)\/kyc$/.test(pathname);
  const isApi = /^\/api(?:\/|$)/.test(pathname);
  const locale = pathname.split('/')[1] === 'en' ? 'en' : 'pt';

  // Redirect que preserva os cookies encenados (NEXT_LOCALE + refresh Supabase).
  function redirectTo(page: string) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/${page}`;
    url.search = '';
    return withStagedCookies(response, NextResponse.redirect(url));
  }

  if (!user && !isPublic) {
    // Um cliente `fetch()` não deve seguir um redirect HTML de login: /api
    // sem sessão responde 401 JSON.
    if (isApi) {
      return withStagedCookies(
        response,
        NextResponse.json({error: 'unauthorized'}, {status: 401})
      );
    }
    return redirectTo('login');
  }

  if (user) {
    const {data: aal} =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa = aal?.currentLevel === 'aal1';

    // MFA obrigatória: aal1 tem de completar o enrolment/challenge TOTP antes de
    // aceder ao resto da app. A própria /mfa é a exceção (senão haveria loop).
    if (needsMfa && !isMfaPage) {
      if (isApi) {
        return withStagedCookies(
          response,
          NextResponse.json({error: 'mfa_required'}, {status: 401})
        );
      }
      return redirectTo('mfa');
    }

    // Gating de KYC: um investidor JÁ em aal2 (MFA resolvida) que ainda não
    // tenha KYC aprovado é encaminhado para /kyc. Staff/auditor isentos. A
    // própria /kyc é a exceção (senão haveria loop). Não se aplica a aal1 (o
    // bloco acima trata disso primeiro) nem a /api (clientes fetch).
    if (!needsMfa && !isKycPage && !isApi) {
      const {data: profile} = await supabase
        .from('profiles')
        .select('role, kyc_status')
        .eq('id', user.id)
        .single();
      const isInvestor = (profile?.role ?? 'investor') === 'investor';
      const approved = profile?.kyc_status === 'approved';
      if (isInvestor && !approved) {
        return redirectTo('kyc');
      }
    }
  }

  return response;
}

// Preserva os cookies já encenados em `staged` (pelo intlMiddleware, ex.:
// NEXT_LOCALE, e pelo refresh do Supabase, ex.: limpeza/rotação de token) ao
// devolver uma resposta nova. Uma NextResponse.redirect/json criada de raiz
// descarta silenciosamente esses cookies — o footgun clássico do Supabase SSR,
// aqui presente tanto no redirect de login como no de /mfa.
function withStagedCookies(staged: NextResponse, out: NextResponse) {
  staged.cookies.getAll().forEach((cookie) => out.cookies.set(cookie));
  return out;
}
