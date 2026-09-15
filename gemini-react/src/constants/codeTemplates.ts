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
    description: 'Ambiente moderno React 18/19 com TypeScript e Tailwind CSS ready',
    icon: 'Atom',
    activeFile: '/App.tsx',
    files: {
      '/App.tsx': `import React, { useState } from 'react';
import './styles.css';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <header className="header">
        <div className="badge">Nemon Code IDE</div>
        <h1>Olá, Desenvolvedor!</h1>
        <p className="subtitle">
          Edite os arquivos ao lado ou peça para o <strong>Agente Harness</strong> criar
          novas funcionalidades para você no chat à direita.
        </p>
      </header>

      <main className="card">
        <h2>Contador Interativo</h2>
        <div className="counter-display">{count}</div>
        <div className="button-group">
          <button className="btn btn-secondary" onClick={() => setCount(c => c - 1)}>
            - Diminuir
          </button>
          <button className="btn btn-outline" onClick={() => setCount(0)}>
            Zerar
          </button>
          <button className="btn btn-primary" onClick={() => setCount(c => c + 1)}>
            + Aumentar
          </button>
        </div>
      </main>
    </div>
  );
}`,
      '/styles.css': `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background-color: #0d1117;
  color: #c9d1d9;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.container {
  max-width: 540px;
  width: 90%;
  margin: 2rem auto;
  text-align: center;
}

.header {
  margin-bottom: 2rem;
}

.badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  background: rgba(255, 85, 0, 0.15);
  color: #ff5500;
  border: 1px solid rgba(255, 85, 0, 0.3);
  margin-bottom: 1rem;
}

h1 {
  font-size: 2rem;
  font-weight: 800;
  color: #ffffff;
  margin-bottom: 0.5rem;
  letter-spacing: -0.02em;
}

.subtitle {
  color: #8b949e;
  font-size: 0.95rem;
  line-height: 1.5;
}

.card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.card h2 {
  font-size: 1.15rem;
  color: #e6edf3;
  margin-bottom: 1.5rem;
}

.counter-display {
  font-size: 4rem;
  font-weight: 900;
  color: #58a6ff;
  font-family: monospace;
  margin-bottom: 1.5rem;
}

.button-group {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.btn {
  padding: 0.6rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary {
  background: #238636;
  border: 1px solid rgba(240, 246, 252, 0.1);
  color: #ffffff;
}

.btn-primary:hover {
  background: #2ea043;
}

.btn-secondary {
  background: #21262d;
  border: 1px solid #30363d;
  color: #c9d1d9;
}

.btn-secondary:hover {
  background: #30363d;
}

.btn-outline {
  background: transparent;
  border: 1px solid #30363d;
  color: #8b949e;
}

.btn-outline:hover {
  border-color: #8b949e;
  color: #c9d1d9;
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
    description: 'React padrão com JSX simples',
    icon: 'Code',
    activeFile: '/App.js',
    files: {
      '/App.js': `import React, { useState } from 'react';
import './styles.css';

export default function App() {
  const [items, setItems] = useState(['Estudar React', 'Construir com Nemon']);
  const [text, setText] = useState('');

  const addItem = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setItems([...items, text.trim()]);
    setText('');
  };

  return (
    <div className="todo-app">
      <h1>Lista de Tarefas</h1>
      <form onSubmit={addItem}>
        <input 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          placeholder="Nova tarefa..." 
        />
        <button type="submit">Adicionar</button>
      </form>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}`,
      '/styles.css': `body {
  font-family: sans-serif;
  background: #121212;
  color: #fff;
  padding: 2rem;
  display: flex;
  justify-content: center;
}
.todo-app {
  width: 100%;
  max-width: 400px;
}
input {
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid #333;
  color: #fff;
  border-radius: 6px;
  width: calc(100% - 90px);
  margin-right: 8px;
}
button {
  padding: 8px 12px;
  background: #3b82f6;
  border: none;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
}
ul {
  list-style: none;
  padding: 0;
  margin-top: 1rem;
}
li {
  padding: 10px;
  background: #1e1e1e;
  margin-bottom: 6px;
  border-radius: 6px;
}`
    }
  },
  'vanilla-ts': {
    id: 'vanilla-ts',
    name: 'Vanilla TypeScript',
    description: 'HTML5, CSS e TypeScript moderno sem frameworks',
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
      <h1>Vanilla TypeScript</h1>
      <div id="clock">00:00:00</div>
    </div>
    <script type="module" src="/index.ts"></script>
  </body>
</html>`,
      '/index.ts': `function updateClock() {
  const el = document.getElementById('clock');
  if (el) {
    el.textContent = new Date().toLocaleTimeString();
  }
}

setInterval(updateClock, 1000);
updateClock();`,
      '/styles.css': `body {
  background: #0f172a;
  color: #f8fafc;
  font-family: system-ui;
  display: grid;
  place-content: center;
  height: 100vh;
  margin: 0;
}
#clock {
  font-size: 3rem;
  font-family: monospace;
  color: #38bdf8;
  margin-top: 1rem;
}`
    }
  },
  'vanilla': {
    id: 'vanilla',
    name: 'HTML & JavaScript',
    description: 'Página web clássica com HTML, CSS e JavaScript',
    icon: 'Globe',
    activeFile: '/index.html',
    files: {
      '/index.html': `<!DOCTYPE html>
<html>
  <head>
    <title>Web App</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <h1>Minha Aplicação Web</h1>
    <p id="msg">Clique no botão para interagir</p>
    <button onclick="document.getElementById('msg').textContent = 'Funcionando perfeitamente!'">Clique Aqui</button>
  </body>
</html>`,
      '/styles.css': `body {
  background: #18181b;
  color: #fafafa;
  font-family: system-ui;
  padding: 3rem;
  text-align: center;
}
button {
  background: #ff5500;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}`
    }
  },
  'vue-ts': {
    id: 'vue-ts',
    name: 'Vue 3 + TypeScript',
    description: 'Vue Single File Components (.vue) com script setup',
    icon: 'Layers',
    activeFile: '/src/App.vue',
    files: {
      '/src/App.vue': `<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <div class="vue-box">
    <h1>Vue 3 + Vite</h1>
    <button @click="count++">Contador: {{ count }}</button>
  </div>
</template>

<style scoped>
.vue-box {
  text-align: center;
  padding: 2rem;
  font-family: sans-serif;
  color: #fff;
  background: #1e1e1e;
  border-radius: 12px;
}
button {
  background: #42b883;
  color: #fff;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
}
</style>`
    }
  }
};
