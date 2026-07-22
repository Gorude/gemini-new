import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamSmoother } from './streamSmoother';

// O StreamSmoother usa requestAnimationFrame. No ambiente node stubamos RAF como
// no-op (não auto-executa o loop) para testar os caminhos determinísticos
// (cancel imediato e finish já-completo) sem depender de timing de animação.
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('StreamSmoother', () => {
  it('cancel() revela imediatamente todo o texto-alvo', () => {
    const frames: Array<[string, string]> = [];
    const s = new StreamSmoother((a, b) => frames.push([a, b]));
    s.setTargets('Olá mundo', 'raciocínio');
    s.cancel();
    const last = frames[frames.length - 1];
    expect(last).toEqual(['Olá mundo', 'raciocínio']);
  });

  it('finish() resolve de imediato quando os alvos estão vazios', async () => {
    const frames: Array<[string, string]> = [];
    const s = new StreamSmoother((a, b) => frames.push([a, b]));
    await s.finish();
    expect(frames[frames.length - 1]).toEqual(['', '']);
  });

  it('não revela além do alvo se ele encolher', () => {
    const frames: Array<[string, string]> = [];
    const s = new StreamSmoother((a, b) => frames.push([a, b]));
    s.setTargets('texto completo', '');
    s.setTargets('texto', ''); // alvo encolheu
    s.cancel();
    const last = frames[frames.length - 1];
    expect(last[0]).toBe('texto');
  });
});
