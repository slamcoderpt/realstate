import {createClient} from '@supabase/supabase-js';
import {config} from 'dotenv';

config({path: '.env.test'});

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const {data, error} = await admin.auth.admin.createUser({
  email: 'demo@tilweni.local',
  password: 'demo-password-1!',
  email_confirm: true
});

console.log(error ?? `criado: ${data.user.email}`);
