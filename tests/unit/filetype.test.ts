import {describe, it, expect} from 'vitest';
import {detectMime} from '@/lib/kyc/filetype';

// Assinaturas (magic-bytes) reais dos tipos permitidos.
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('detectMime', () => {
  it('reconhece PDF por %PDF-', () => {
    expect(detectMime(PDF)).toBe('application/pdf');
  });

  it('reconhece JPEG por FF D8 FF', () => {
    expect(detectMime(JPEG)).toBe('image/jpeg');
  });

  it('reconhece PNG pela assinatura de 8 bytes', () => {
    expect(detectMime(PNG)).toBe('image/png');
  });

  it('devolve null para conteúdo desconhecido', () => {
    expect(detectMime(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it('devolve null para um executável (MZ)', () => {
    expect(detectMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it('devolve null para buffer demasiado curto', () => {
    expect(detectMime(new Uint8Array([0x25, 0x50]))).toBeNull();
  });

  it('não confunde um PNG truncado (7 bytes) com PNG', () => {
    expect(detectMime(PNG.slice(0, 7))).toBeNull();
  });
});
