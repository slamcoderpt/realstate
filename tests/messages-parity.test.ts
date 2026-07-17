import {describe, it, expect} from 'vitest';
import pt from '../messages/pt.json';
import en from '../messages/en.json';

function keyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}

describe('paridade de mensagens PT/EN', () => {
  it('en.json tem exatamente as mesmas chaves que pt.json', () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(pt).sort());
  });
});
