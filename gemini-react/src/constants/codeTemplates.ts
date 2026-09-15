import type { ProjectTemplate } from '../types/codeIde';

export interface TemplateDefinition {
  id: ProjectTemplate;
  name: string;
  description: string;
  icon: string;
  files: Record<string, string>;
  activeFile: string;
}

export const CODE_TEMPLATES: Record<ProjectTemplate, TemplateDefinition> = {
  'react-ts': {
    id: 'react-ts',
    name: 'React + TypeScript',
    description: 'Ambiente React com TypeScript',
    icon: 'Atom',
    activeFile: '/App.tsx',
    files: {
      '/App.tsx': `import React from 'react';
import './styles.css';

export default function App() {
  return (
    <div className="app">
      <h1>Projeto React + TypeScript</h1>
      <p>Edite o arquivo para começar.</p>
    </div>
  );
}`,
      '/styles.css': `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #0d1117;
  color: #c9d1d9;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.app {
  text-align: center;
  padding: 2rem;
}`,
      '/index.tsx': `import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}`,
      '/public/index.html': `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <div id="app"></div>
  </body>
</html>`
    }
  },
  'react': {
    id: 'react',
    name: 'React (JavaScript)',
    description: 'Ambiente React com JavaScript',
    icon: 'Code',
    activeFile: '/App.js',
    files: {
      '/App.js': `import React from 'react';
import './styles.css';

export default function App() {
  return (
    <div className="app">
      <h1>Projeto React</h1>
      <p>Edite o arquivo para começar.</p>
    </div>
  );
}`,
      '/styles.css': `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #0d1117;
  color: #c9d1d9;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.app {
  text-align: center;
  padding: 2rem;
}`,
      '/index.js': `import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}`,
      '/public/index.html': `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <div id="app"></div>
  </body>
</html>`
    }
  },
  'vanilla-ts': {
    id: 'vanilla-ts',
    name: 'Vanilla TypeScript',
    description: 'HTML, CSS e TypeScript sem frameworks',
    icon: 'FileCode',
    activeFile: '/index.ts',
    files: {
      '/index.html': `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Vanilla TS</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="app">
      <h1>Projeto TypeScript</h1>
      <p>Edite o index.ts para começar.</p>
    </div>
    <div id="root"></div>
    <script src="index.ts"></script>
  </body>
</html>`,
      '/index.ts': `import './styles.css';

const app = document.getElementById('app');
if (app) {
  app.innerHTML = \`
    <h1>Projeto TypeScript</h1>
    <p>Edite o index.ts para começar.</p>
  \`;
}`,
      '/styles.css': `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #0d1117;
  color: #c9d1d9;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

#app {
  text-align: center;
  padding: 2rem;
}`
    }
  },
  'vanilla': {
    id: 'vanilla',
    name: 'HTML & JavaScript',
    description: 'HTML5, CSS e JavaScript padrão',
    icon: 'Globe',
    activeFile: '/index.html',
    files: {
      '/index.html': `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>Web App</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <div id="app">
      <h1>Projeto Web</h1>
      <p>Edite o index.js ou index.html para começar.</p>
    </div>
    <div id="root"></div>
    <script src="index.js"></script>
  </body>
</html>`,
      '/index.js': `import './styles.css';

const app = document.getElementById('app');
if (app) {
  app.innerHTML = \`
    <h1>Projeto Web</h1>
    <p>Edite o index.js ou index.html para começar.</p>
  \`;
}`,
      '/styles.css': `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #0d1117;
  color: #c9d1d9;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

#app {
  text-align: center;
  padding: 2rem;
}`
    }
  },
  'vue-ts': {
    id: 'vue-ts',
    name: 'Vue 3 + TypeScript',
    description: 'Vue 3 SFC com TypeScript',
    icon: 'Layers',
    activeFile: '/src/App.vue',
    files: {
      '/src/App.vue': `<script setup lang="ts">
</script>

<template>
  <div class="app">
    <h1>Projeto Vue 3</h1>
    <p>Edite o App.vue para começar.</p>
  </div>
</template>

<style scoped>
.app {
  text-align: center;
  padding: 2rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #c9d1d9;
}
</style>`,
      '/public/index.html': `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vue App</title>
  </head>
  <body>
    <div id="app"></div>
    <div id="root"></div>
  </body>
</html>`
    }
  }
};
