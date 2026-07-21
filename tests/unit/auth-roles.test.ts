import {describe, it, expect} from 'vitest';
import {isStaff, canReadStatements} from '@/lib/auth/staff';

/**
 * A spec da Fase A dá ao `auditor` leitura sobre extratos — e mais nada. A
 * tentação é acrescentá-lo a `STAFF_ROLES`, o que o faria passar por
 * `requireStaff()` e abrir-lhe o back-office inteiro (KYC, gestão de projetos,
 * subscrições). Este teste é o que trava essa "simplificação".
 */
describe('papéis: auditor lê extratos mas NÃO é staff', () => {
  it('auditor não é staff', () => {
    expect(isStaff('auditor')).toBe(false);
  });

  it('auditor pode ler extratos', () => {
    expect(canReadStatements('auditor')).toBe(true);
  });

  it('staff continua a poder ler extratos', () => {
    expect(canReadStatements('admin')).toBe(true);
    expect(canReadStatements('project_manager')).toBe(true);
  });

  it('investidor não entra por nenhum dos dois', () => {
    expect(isStaff('investor')).toBe(false);
    expect(canReadStatements('investor')).toBe(false);
  });
});
