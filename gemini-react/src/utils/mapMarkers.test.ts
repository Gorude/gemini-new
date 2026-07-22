import { describe, it, expect } from 'vitest';
import { extractMapMarkers, stripMapMarkers, mapEmbedUrl, mapLinkUrl } from './mapMarkers';

describe('extractMapMarkers', () => {
  it('extrai o local e remove o marcador do texto', () => {
    const { text, maps } = extractMapMarkers('Fica no centro. [MAP: Praça da Sé, São Paulo]');
    expect(maps).toEqual([{ query: 'Praça da Sé, São Paulo' }]);
    expect(text).toBe('Fica no centro.');
  });

  it('dedup e preserva ordem de múltiplos marcadores', () => {
    const { maps } = extractMapMarkers('[MAP: A] texto [MAP: B] mais [MAP: a]');
    expect(maps).toEqual([{ query: 'A' }, { query: 'B' }]);
  });

  it('sem marcador retorna texto intacto e lista vazia', () => {
    const { text, maps } = extractMapMarkers('Só um texto normal.');
    expect(text).toBe('Só um texto normal.');
    expect(maps).toEqual([]);
  });
});

describe('stripMapMarkers', () => {
  it('remove marcador completo', () => {
    expect(stripMapMarkers('oi [MAP: X] tchau')).toBe('oi  tchau');
  });
  it('remove fragmento final não fechado (streaming)', () => {
    expect(stripMapMarkers('carregando [MAP: Praça da S')).toBe('carregando ');
  });
});

describe('URLs', () => {
  it('embed e link codificam a query', () => {
    expect(mapEmbedUrl('Praça da Sé')).toContain('output=embed');
    expect(mapEmbedUrl('Praça da Sé')).toContain(encodeURIComponent('Praça da Sé'));
    expect(mapLinkUrl('Praça da Sé')).toContain('google.com/maps/search');
  });
});
