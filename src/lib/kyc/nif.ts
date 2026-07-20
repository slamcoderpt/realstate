/**
 * Validação do NIF português (Número de Identificação Fiscal).
 * 9 dígitos; o 9.º é dígito de controlo (checksum mod 11 sobre os 8 primeiros).
 * O 1.º dígito identifica o tipo de contribuinte; conjunto válido conhecido.
 */

// Prefixos válidos (1.º dígito): 1,2 singular; 3 reservado; 5 coletiva;
// 6 administração pública; 8 empresário individual; 9 provisório/irregular.
const VALID_FIRST_DIGITS = new Set([1, 2, 3, 5, 6, 8, 9]);

export function normalizeNif(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidNif(input: string): boolean {
  const nif = normalizeNif(input);
  if (!/^\d{9}$/.test(nif)) return false;
  if (!VALID_FIRST_DIGITS.has(Number(nif[0]))) return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(nif[i]) * (9 - i);
  }
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return check === Number(nif[8]);
}
