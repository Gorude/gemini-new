import { describe, it, expect } from 'vitest';
import worker, { formatDuckDuckGoSummary, directFetchUrl } from '../../../cloudflare-worker/worker.js';

describe('Cloudflare Worker - DuckDuckGo Bridge', () => {
  it('responde requisições OPTIONS com cabeçalhos CORS completos e status 204', async () => {
    const request = new Request('https://worker.test/search', { method: 'OPTIONS' });
    const response = await worker.fetch(request);

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('responde GET /health com status 200 e informações do serviço', async () => {
    const request = new Request('https://worker.test/health', { method: 'GET' });
    const response = await worker.fetch(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('duckduckgo-cloudflare-worker');
  });

  it('formata o resumo e as fontes do DuckDuckGo corretamente', () => {
    const mockResults = [
      { title: 'TypeScript Official', uri: 'https://www.typescriptlang.org', snippet: 'TypeScript is typed JavaScript' },
      { title: 'MDN Web Docs', uri: 'https://developer.mozilla.org', snippet: 'Resources for developers' }
    ];

    const { summary, sources } = formatDuckDuckGoSummary(mockResults);

    expect(summary).toContain('Resultados da pesquisa no DuckDuckGo:');
    expect(summary).toContain('TypeScript Official');
    expect(sources.length).toBe(2);
    expect(sources[0].uri).toBe('https://www.typescriptlang.org');
  });

  it('retorna erro 400 se a rota /search for chamada sem o parâmetro de busca', async () => {
    const request = new Request('https://worker.test/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const response = await worker.fetch(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('responde GET /tools/list com especificações de ferramentas do MCP', async () => {
    const request = new Request('https://worker.test/tools/list', { method: 'GET' });
    const response = await worker.fetch(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result?.tools).toBeDefined();
    expect(data.result.tools.some((t: any) => t.name === 'search')).toBe(true);
    expect(data.result.tools.some((t: any) => t.name === 'fetch')).toBe(true);
  });

  it('bloqueia tentativas de SSRF para endereços IP locais, privados e metadados de nuvem', async () => {
    const unsafeUrls = [
      'http://localhost:8080/admin',
      'http://127.0.0.1:3000',
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.1.1/secret',
      'http://10.0.0.1/',
      'http://172.20.0.1/',
      'http://[::1]/',
      'http://metadata.google.internal/computeMetadata/v1/'
    ];

    for (const url of unsafeUrls) {
      const result = await directFetchUrl(url);
      expect(result).toContain('URL inválida ou não autorizada');
    }
  });

  it('retorna erro 400 se a rota /fetch for chamada sem o campo url', async () => {
    const request = new Request('https://worker.test/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const response = await worker.fetch(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('url');
  });
});
