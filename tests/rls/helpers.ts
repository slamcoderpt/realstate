import {createClient, type SupabaseClient} from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

export const TEST_PASSWORD = 'test-password-123!';

/** Cliente com service role — bypassa RLS. Só para preparar dados de teste. */
export const admin = createClient(url, serviceKey, {
  auth: {persistSession: false, autoRefreshToken: false}
});

/** Cliente anónimo, sem sessão. */
export function anonClient(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {persistSession: false, autoRefreshToken: false}
  });
}

export async function createTestUser(
  email: string,
  role: 'investor' | 'project_manager' | 'admin' | 'auditor' = 'investor'
) {
  const {data, error} = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true
  });
  if (error) throw error;
  if (role !== 'investor') {
    const {error: updateError} = await admin
      .from('profiles')
      .update({role})
      .eq('id', data.user.id);
    if (updateError) throw updateError;
  }
  return data.user;
}

export async function signInAs(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const {error} = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD
  });
  if (error) throw error;
  return client;
}
