/**
 * Deteção do tipo real de um ficheiro pelos magic-bytes (assinatura de
 * conteúdo), independente do Content-Type declarado pelo cliente — que é
 * falsificável. Cobre exatamente os tipos aceites no KYC (PDF, JPEG, PNG).
 *
 * Puro e sem dependências: para 3 tipos, a verificação manual das assinaturas
 * é mais simples e com menos superfície de supply-chain do que uma lib.
 *
 * ATENÇÃO — manter em sincronia com `platform_settings.kyc_allowed_mime`: se
 * essa allow-list ganhar um tipo novo (ex.: image/gif), é preciso acrescentar
 * aqui a respetiva assinatura, senão o submitKyc rejeita 100% desses ficheiros
 * (o sniff não reconhece → "tipo de ficheiro não permitido"). Falha fechada,
 * mas seria uma armadilha funcional se os dois divergirem.
 */

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

/** Devolve o MIME real detetado, ou null se não corresponder a um tipo conhecido. */
export function detectMime(bytes: Uint8Array): string | null {
  // PDF: "%PDF-"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf';
  }
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  return null;
}
