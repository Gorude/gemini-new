import { describe, it, expect } from 'vitest';
import { compileProjectToHtml } from './previewCompiler';

describe('compileProjectToHtml', () => {
  it('compiles single-file HTML and injects telemetry script', () => {
    const files = {
      '/index.html': '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>',
    };
    const html = compileProjectToHtml(files);
    expect(html).toContain('nemon-runtime-telemetry');
    expect(html).toContain('<h1>Hello</h1>');
  });

  it('inlines external css and js files referenced by link and script tags', () => {
    const files = {
      '/index.html': `<!DOCTYPE html><html><head>
        <link rel="stylesheet" href="style.css">
      </head><body>
        <script src="app.js"></script>
      </body></html>`,
      '/style.css': 'body { background: red; }',
      '/app.js': 'console.log("ready");',
    };
    const html = compileProjectToHtml(files);
    expect(html).toContain('body { background: red; }');
    expect(html).toContain('console.log("ready");');
    expect(html).toContain('data-source="/style.css"');
    expect(html).toContain('data-source="/app.js"');
  });

  it('creates clean HTML5 skeleton when only javascript is present', () => {
    const files = {
      '/index.js': 'document.body.innerHTML = "<div>Dynamic</div>";',
    };
    const html = compileProjectToHtml(files);
    expect(html).toContain('document.body.innerHTML = "<div>Dynamic</div>";');
  });

  it('injects in-memory storage polyfill for safe sandboxing without allow-same-origin', () => {
    const files = {
      '/index.html': '<!DOCTYPE html><html><body>Test</body></html>',
    };
    const html = compileProjectToHtml(files);
    expect(html).toContain('createMemoryStorage');
  });
});
