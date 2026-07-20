import {describe, it, expect} from 'vitest';
import {isValidNif, normalizeNif} from '@/lib/kyc/nif';

describe('normalizeNif', () => {
  it('remove espaços e não-dígitos', () => {
    expect(normalizeNif(' 123 456 789 ')).toBe('123456789');
    expect(normalizeNif('PT123456789')).toBe('123456789');
  });
});

describe('isValidNif', () => {
  it('aceita NIFs válidos (checksum correto)', () => {
    // NIFs com dígito de controlo válido
    expect(isValidNif('123456789')).toBe(true);
    expect(isValidNif('287024059')).toBe(true); // primeiro dígito 2 (singular)
    expect(isValidNif('501442600')).toBe(true); // 5 (pessoa coletiva)
  });

  it('rejeita comprimento errado', () => {
    expect(isValidNif('12345678')).toBe(false);
    expect(isValidNif('1234567890')).toBe(false);
  });

  it('rejeita não-numérico', () => {
    expect(isValidNif('12345678X')).toBe(false);
  });

  it('rejeita dígito de controlo errado', () => {
    expect(isValidNif('123456788')).toBe(false);
  });

  it('rejeita primeiro dígito inválido', () => {
    // 0 e 4 e 7 não são prefixos válidos de NIF
    expect(isValidNif('012345678')).toBe(false);
  });
});
