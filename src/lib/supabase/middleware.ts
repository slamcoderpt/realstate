import {createServerClient} from '@supabase/ssr';
import {NextResponse, type NextRequest} from 'next/server';
import {decodeAccessToken} from '@/lib/auth/claims';

const PUBLIC_PATHS = [
  /^\/(pt|en)\/login$/,
  /^\/(pt|en)\/aceitar-convite\/.+$/,
  /^\/(pt|en)\/recuperar$/,
  /^\/(pt|en)\/nova-palavra-passe$/
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
    // aal + role + kyc + estado de MFA lidos do JWT (local); getUser() já validou.
    const {
      data: {session}
    } = await supabase.auth.getSession();
    const claims = decodeAccessToken(session?.access_token);
    const aal1 = claims.aal === 'aal1';

    // MFA opcional. Em aal1, encaminha para /mfa se:
    //  - já tem um fator verificado (has_mfa) → DESAFIO obrigatório; ou
    //  - ainda não viu o ecrã de configuração (mfa_prompt_seen != true) → PROMPT
    //    de 1ª vez, com opção de ignorar (na própria página /mfa).
    // Quem não tem fator e já dispensou o prompt entra normalmente em aal1.
    if (aal1 && !isMfaPage) {
      const mustResolveMfa =
        claims.has_mfa === true || claims.mfa_prompt_seen !== true;
      if (mustResolveMfa) {
        if (isApi) {
          return withStagedCookies(
            response,
            NextResponse.json({error: 'mfa_required'}, {status: 401})
          );
        }
        return redirectTo('mfa');
      }
    }

    // Gating de KYC: aplica-se a quem já passou a barreira de MFA — aal2 OU aal1
    // que dispensou o prompt (chega aqui sem ter sido redirecionado acima). Um
    // investidor sem KYC aprovado vai para /kyc. Staff/auditor isentos.
    if (!isKycPage && !isMfaPage && !isApi) {
      // Role do claim; fallback à BD só para tokens antigos (sem o claim).
      let role = claims.user_role;
      if (role === undefined) {
        const {data: profile} = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        role = profile?.role ?? 'investor';
      }
      if (role === 'investor') {
        // Gate auto-curável: se o claim não disser "approved", confirma na BD
        // (fresco) antes de bloquear — um investidor já aprovado mas com token
        // stale (claim ainda "pending") NÃO é mandado para /kyc. Em regime
        // estável (claim já "approved") não há query nenhuma.
        let approved = claims.kyc_status === 'approved';
        if (!approved) {
          const {data: profile} = await supabase
            .from('profiles')
            .select('kyc_status')
            .eq('id', user.id)
            .single();
          approved = profile?.kyc_status === 'approved';
        }
        if (!approved) return redirectTo('kyc');
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
