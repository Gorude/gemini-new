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
      <h1>Projeto React</h1>
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
      '/index.tsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}`
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
      '/index.js': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}`
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
    <title>App</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="app">
      <h1>Projeto TypeScript</h1>
    </div>
    <script type="module" src="/index.ts"></script>
  </body>
</html>`,
      '/index.ts': `console.log('App pronto');`,
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
    <title>App</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <div id="app">
      <h1>Projeto Web</h1>
    </div>
    <script src="/index.js"></script>
  </body>
</html>`,
      '/index.js': `console.log('App pronto');`,
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
  </div>
</template>

<style scoped>
.app {
  text-align: center;
  padding: 2rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #c9d1d9;
}
</style>`
    }
  }
};
