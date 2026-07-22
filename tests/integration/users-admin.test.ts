import {describe, it, expect, beforeAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {admin, createTestUser} from '../rls/helpers';
import {changeUserRole, listUsers} from '@/lib/users/service';

const run = randomUUID().slice(0, 8);
let adminId: string;

async function freshInvestor(): Promise<string> {
  const u = await createTestUser(`users-adm-${randomUUID().slice(0, 8)}@test.local`);
  return u.id;
}

async function roleOf(id: string): Promise<string> {
  const {data, error} = await admin
    .from('profiles')
    .select('role')
    .eq('id', id)
    .single();
  expect(error).toBeNull();
  return data!.role;
}

beforeAll(async () => {
  adminId = (await createTestUser(`users-adm-actor-${run}@test.local`, 'admin')).id;
});

describe('changeUserRole', () => {
  it('um admin promove um investidor a project_manager', async () => {
    const targetId = await freshInvestor();
    expect(await roleOf(targetId)).toBe('investor');

    await changeUserRole({actorId: adminId, targetId, role: 'project_manager'});

    expect(await roleOf(targetId)).toBe('project_manager');
  });

  it('um admin NÃO se pode despromover a si próprio', async () => {
    // O guard que impede a plataforma de ficar sem administrador. Sem ele, o
    // último admin tira-se o papel e a única saída é SQL cru em produção.
    const selfId = (
      await createTestUser(`users-adm-self-${randomUUID().slice(0, 8)}@test.local`, 'admin')
    ).id;

    await expect(
      changeUserRole({actorId: selfId, targetId: selfId, role: 'investor'})
    ).rejects.toThrow(/próprio|proprio|self/i);

    // E a linha ficou intacta — rejeitar depois de escrever não valia de nada.
    expect(await roleOf(selfId)).toBe('admin');
  });

  it('um admin PODE reafirmar o próprio papel de admin (no-op, não é despromoção)', async () => {
    // Escolha deliberada: só o *rebaixamento* é bloqueado. `admin → admin` não
    // reduz privilégio nenhum, e rejeitá-lo obrigaria a UI a tratar a própria
    // linha como um caso especial só para não mostrar um erro por nada feito.
    const selfId = (
      await createTestUser(`users-adm-noop-${randomUUID().slice(0, 8)}@test.local`, 'admin')
    ).id;

    await expect(
      changeUserRole({actorId: selfId, targetId: selfId, role: 'admin'})
    ).resolves.toBeDefined();

    expect(await roleOf(selfId)).toBe('admin');
  });

  it('rejeita um papel inválido sem escrever', async () => {
    const targetId = await freshInvestor();

    await expect(
      changeUserRole({
        actorId: adminId,
        targetId,
        role: 'superadmin' as unknown as 'admin'
      })
    ).rejects.toThrow(/papel|role/i);

    expect(await roleOf(targetId)).toBe('investor');
  });

  it('a alteração aparece no audit_log (trigger em profiles)', async () => {
    const targetId = await freshInvestor();

    await changeUserRole({actorId: adminId, targetId, role: 'auditor'});

    const {data, error} = await admin
      .from('audit_log')
      .select('action, entity_type, payload')
      .eq('entity_type', 'profiles')
      .eq('entity_id', targetId)
      .eq('action', 'update');
    expect(error).toBeNull();
    expect(data ?? []).not.toHaveLength(0);

    const withRole = (data ?? []).filter(
      (r) =>
        (r.payload as {new?: {role?: string}} | null)?.new?.role === 'auditor'
    );
    expect(withRole).toHaveLength(1);
    expect(
      (withRole[0].payload as {old?: {role?: string}}).old?.role
    ).toBe('investor');
  });
});

describe('listUsers', () => {
  it('devolve todos os perfis com email, sem truncar na 1.ª página', async () => {
    const targetId = await freshInvestor();

    const {count, error: countError} = await admin
      .from('profiles')
      .select('id', {count: 'exact', head: true});
    expect(countError).toBeNull();
    expect(count ?? 0).toBeGreaterThan(50); // o default do GoTrue é 50/página

    const rows = await listUsers();
    expect(rows).toHaveLength(count!);

    // O que torna a paginação load-bearing: as linhas vêm de `profiles`, logo o
    // total não muda se o `auth.admin.listUsers()` truncar. O que trunca é o
    // email — sem paginar, tudo a partir do 51.º ficaria em branco.
    const semEmail = rows.filter((r) => r.email === '');
    expect(semEmail).toHaveLength(0);

    const mine = rows.find((r) => r.id === targetId);
    expect(mine).toBeDefined();
    expect(mine!.email).toMatch(/^users-adm-.*@test\.local$/);
    expect(mine!.role).toBe('investor');
    expect(mine!.kyc_status).toBeTruthy();
    expect(mine!.created_at).toBeTruthy();
  });
});
