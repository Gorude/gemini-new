import { describe, it, expect } from 'vitest';
import { floatToPcm16, pcm16ToFloat, concatFloat32 } from './audioUtils';

describe('audioUtils', () => {
  it('converte buffers grandes (>65536 elementos) sem estourar a call stack', () => {
    // 100.000 amostras Float32 (estouraria String.fromCharCode(...) com spread)
    const largeBuffer = new Float32Array(100_000);
    for (let i = 0; i < largeBuffer.length; i++) {
      largeBuffer[i] = Math.sin(i * 0.05);
    }

    expect(() => {
      const b64 = floatToPcm16(largeBuffer);
      expect(b64).toBeTruthy();
      expect(typeof b64).toBe('string');
      // Reconverte e valida a integridade
      const decoded = pcm16ToFloat(b64);
      expect(decoded.length).toBe(100_000);
      expect(decoded[0]).toBeCloseTo(largeBuffer[0], 2);
    }).not.toThrow();
  });

  it('pcm16ToFloat lida com strings vazias e alinhamento de bytes ímpares', () => {
    expect(pcm16ToFloat('').length).toBe(0);

    // Gera um base64 com 3 bytes (ímpar) para testar robustez contra buffer ímpar
    const oddBase64 = btoa('abc');
    expect(() => {
      const floatArr = pcm16ToFloat(oddBase64);
      // Deve descartar o byte extra e criar 1 amostra Int16 (2 bytes)
      expect(floatArr.length).toBe(1);
    }).not.toThrow();
  });

  it('concatFloat32 concatena múltiplos blocos corretamente', () => {
    const b1 = new Float32Array([1, 2]);
    const b2 = new Float32Array([3, 4, 5]);
    const merged = concatFloat32([b1, b2]);

    expect(merged.length).toBe(5);
    expect(Array.from(merged)).toEqual([1, 2, 3, 4, 5]);
  });
});
