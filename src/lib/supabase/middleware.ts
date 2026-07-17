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

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    const locale = pathname.split('/')[1] === 'en' ? 'en' : 'pt';
    url.pathname = `/${locale}/login`;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
