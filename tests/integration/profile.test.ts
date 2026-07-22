import {describe, it, expect, vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {admin, createTestUser, TEST_PASSWORD} from '../rls/helpers';

/**
 * As Server Actions do `/perfil` correm a sério: service role, GoTrue e
 * Postgres locais são os verdadeiros. A ÚNICA coisa substituída é
 * `getSession()`, que depende dos cookies do Next e não existe fora de um
 * pedido HTTP — exatamente a mesma fronteira que `audit-ip.test.ts` traça.
 *
 * Substituir a sessão (e não o id do utilizador) é o que dá valor ao teste do
 * "não posso editar o perfil de outro": o id que a ação usa é o que sai daqui,
 * e o formulário leva um `userId` diferente a tentar sobrepor-se.
 */
let session: {userId: string; email: string; role: string} | null = null;

vi.mock('@/lib/auth/staff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/staff')>();
  return {...actual, getSession: async () => session};
});

// `revalidatePath` exige o store de renderização do Next e lança fora de um
// pedido. Não é o que está sob teste — o que interessa é o que foi escrito.
vi.mock('next/cache', () => ({revalidatePath: () => {}}));

// `.env.test` só traz `SUPABASE_ANON_KEY`; a ação usa o nome público (o que
// existe em runtime na app). Mesma chave demo, outro nome.
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= process.env.SUPABASE_ANON_KEY;

const {updateProfileAction, changePasswordAction} = await import(
  '@/app/[locale]/perfil/actions'
);

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

async function freshUser(prefix: string) {
  const email = `${prefix}-${randomUUID().slice(0, 8)}@test.local`;
  const user = await createTestUser(email);
  return {id: user.id, email};
}

function asSession(user: {id: string; email: string}) {
  session = {userId: user.id, email: user.email, role: 'investor'};
}

async function profileRow(id: string) {
  const {data, error} = await admin
    .from('profiles')
    .select('full_name, preferred_locale')
    .eq('id', id)
    .single();
  expect(error).toBeNull();
  return data!;
}

/** Tenta autenticar-se com `password`; devolve true se o GoTrue aceitou. */
async function canSignIn(email: string, password: string): Promise<boolean> {
  const client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {auth: {persistSession: false, autoRefreshToken: false}}
  );
  const {data, error} = await client.auth.signInWithPassword({email, password});
  if (!error && data.session) {
    await client.auth.signOut({scope: 'local'});
    return true;
  }
  return false;
}

describe('updateProfileAction', () => {
  it('grava nome e idioma preferido do próprio', async () => {
    const user = await freshUser('perfil-upd');
    asSession(user);

    const result = await updateProfileAction(
      {ok: false},
      form({fullName: 'Maria Antunes', language: 'en'})
    );
    expect(result.ok).toBe(true);

    const row = await profileRow(user.id);
    expect(row.full_name).toBe('Maria Antunes');
    // `preferred_locale` é a coluna que decide a língua dos emails do
    // investidor; guardá-la mal é uma regressão silenciosa.
    expect(row.preferred_locale).toBe('en');
  });

  it('normaliza um idioma que não existe para pt (o check da BD rejeitaria)', async () => {
    const user = await freshUser('perfil-loc');
    asSession(user);

    const result = await updateProfileAction(
      {ok: false},
      form({fullName: 'João Dias', language: 'de'})
    );
    expect(result.ok).toBe(true);
    expect((await profileRow(user.id)).preferred_locale).toBe('pt');
  });

  it('NÃO escreve no perfil de outro utilizador: o id vem da sessão, não do formulário', async () => {
    const atacante = await freshUser('perfil-atacante');
    const vitima = await freshUser('perfil-vitima');

    await admin
      .from('profiles')
      .update({full_name: 'Vítima Intacta', preferred_locale: 'pt'})
      .eq('id', vitima.id);

    asSession(atacante);
    const result = await updateProfileAction(
      {ok: false},
      // O `userId` forjado é o ataque: se a ação o lesse, a vítima ficava com
      // o nome escolhido por outra pessoa.
      form({userId: vitima.id, fullName: 'Sequestrado', language: 'en'})
    );
    expect(result.ok).toBe(true);

    const daVitima = await profileRow(vitima.id);
    expect(daVitima.full_name).toBe('Vítima Intacta');
    expect(daVitima.preferred_locale).toBe('pt');

    // Controlo positivo: a escrita aconteceu mesmo — no perfil de quem a pediu.
    const doAtacante = await profileRow(atacante.id);
    expect(doAtacante.full_name).toBe('Sequestrado');
    expect(doAtacante.preferred_locale).toBe('en');
  });

  it('sem sessão não escreve nada', async () => {
    const user = await freshUser('perfil-sem-sessao');
    await admin
      .from('profiles')
      .update({full_name: 'Antes'})
      .eq('id', user.id);

    session = null;
    const result = await updateProfileAction(
      {ok: false},
      form({userId: user.id, fullName: 'Depois', language: 'en'})
    );
    expect(result.ok).toBe(false);
    expect((await profileRow(user.id)).full_name).toBe('Antes');
  });

  it('rejeita nome vazio sem apagar o que lá estava', async () => {
    const user = await freshUser('perfil-vazio');
    asSession(user);
    await updateProfileAction({ok: false}, form({fullName: 'Ana Lopes', language: 'pt'}));

    const result = await updateProfileAction({ok: false}, form({fullName: '   ', language: 'pt'}));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('saveError');
    expect((await profileRow(user.id)).full_name).toBe('Ana Lopes');
  });
});

describe('changePasswordAction', () => {
  const NOVA = 'nova-palavra-passe-9!';

  it('rejeita a palavra-passe atual errada e a antiga continua a funcionar', async () => {
    const user = await freshUser('perfil-pw-errada');
    asSession(user);

    const result = await changePasswordAction(
      {ok: false},
      form({
        currentPassword: 'palavra-passe-errada-1!',
        newPassword: NOVA,
        confirmPassword: NOVA
      })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('wrongPassword');

    // O que prova que nada mudou: a antiga ainda autentica e a nova não.
    expect(await canSignIn(user.email, TEST_PASSWORD)).toBe(true);
    expect(await canSignIn(user.email, NOVA)).toBe(false);
  });

  it('troca a palavra-passe e a NOVA autentica', async () => {
    const user = await freshUser('perfil-pw-ok');
    asSession(user);

    const result = await changePasswordAction(
      {ok: false},
      form({
        currentPassword: TEST_PASSWORD,
        newPassword: NOVA,
        confirmPassword: NOVA
      })
    );
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);

    expect(await canSignIn(user.email, NOVA)).toBe(true);
    expect(await canSignIn(user.email, TEST_PASSWORD)).toBe(false);
  });

  it('rejeita uma nova palavra-passe curta (mínimo do resto da app)', async () => {
    const user = await freshUser('perfil-pw-curta');
    asSession(user);

    const result = await changePasswordAction(
      {ok: false},
      form({
        currentPassword: TEST_PASSWORD,
        newPassword: 'abc123',
        confirmPassword: 'abc123'
      })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('saveError');
    expect(await canSignIn(user.email, TEST_PASSWORD)).toBe(true);
  });

  it('rejeita confirmação que não coincide', async () => {
    const user = await freshUser('perfil-pw-conf');
    asSession(user);

    const result = await changePasswordAction(
      {ok: false},
      form({
        currentPassword: TEST_PASSWORD,
        newPassword: NOVA,
        confirmPassword: `${NOVA}x`
      })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('saveError');
    expect(await canSignIn(user.email, NOVA)).toBe(false);
    expect(await canSignIn(user.email, TEST_PASSWORD)).toBe(true);
  });

  it('sem sessão não troca nada', async () => {
    const user = await freshUser('perfil-pw-sem-sessao');
    session = null;

    const result = await changePasswordAction(
      {ok: false},
      form({
        currentPassword: TEST_PASSWORD,
        newPassword: NOVA,
        confirmPassword: NOVA
      })
    );
    expect(result.ok).toBe(false);
    expect(await canSignIn(user.email, TEST_PASSWORD)).toBe(true);
  });
});
