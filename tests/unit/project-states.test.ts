import {describe, it, expect} from 'vitest';
import {canTransition, nextStates, type ProjectStatus} from '@/lib/projects/states';

describe('máquina de estados de projeto', () => {
  it('permite avançar sequencialmente', () => {
    expect(canTransition('preparacao', 'subscricao')).toBe(true);
    expect(canTransition('subscricao', 'subscrito')).toBe(true);
    expect(canTransition('subscrito', 'em_curso')).toBe(true);
    expect(canTransition('em_curso', 'concluido')).toBe(true);
    expect(canTransition('concluido', 'liquidado')).toBe(true);
  });

  it('não permite saltar estados', () => {
    expect(canTransition('preparacao', 'em_curso')).toBe(false);
    expect(canTransition('subscricao', 'liquidado')).toBe(false);
  });

  it('não permite recuar', () => {
    expect(canTransition('subscricao', 'preparacao')).toBe(false);
    expect(canTransition('liquidado', 'concluido')).toBe(false);
  });

  it('liquidado é terminal', () => {
    expect(nextStates('liquidado')).toEqual([]);
  });

  it('nextStates devolve os estados seguintes válidos', () => {
    expect(nextStates('preparacao')).toEqual<ProjectStatus[]>(['subscricao']);
    expect(nextStates('em_curso')).toEqual<ProjectStatus[]>(['concluido']);
  });
});
