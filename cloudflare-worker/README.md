# 🦆 Nemon DuckDuckGo Search - Cloudflare Worker

Este Worker permite que o **Nemon** realize pesquisas factuais em tempo real no DuckDuckGo e leia o conteúdo de links da web a partir do celular, computador de trabalho, tablet ou qualquer outro dispositivo, **sem precisar rodar `npm run mcp`** ou manter seu computador ligado.

- **Custo:** 100% Gratuito (Cloudflare oferece 100.000 requisições diárias sem cobrar nada).
- **HTTPS & CORS:** Totalmente seguro com certificado SSL e cabeçalhos CORS abertos para o navegador.
- **Protocolos:** Compatível tanto com a API REST direta do Nemon (`/search`, `/fetch`, `/health`) quanto com o padrão JSON-RPC do **MCP (Model Context Protocol)** (`/tools/call`, `/tools/list`).

---

## 🚀 Método 1: Publicar em 1 minuto pelo Navegador (Sem instalar nada)

1. Crie uma conta gratuita ou faça login em [dash.cloudflare.com](https://dash.cloudflare.com/).
2. No menu lateral esquerdo, clique em **Workers & Pages** (ou *Compute (Workers)*).
3. Clique no botão azul **Create application** (ou *Create Worker*).
4. Dê um nome ao seu worker (por exemplo: `nemon-search`) e clique em **Deploy**.
5. Na tela seguinte comemorativa, clique no botão **Edit code** (no canto superior direito).
6. Apague o código padrão que estiver lá e cole todo o conteúdo do arquivo [`worker.js`](./worker.js).
7. Clique em **Deploy** no canto superior direito.
8. Pronto! Copie o link do seu worker, que terá o formato:
   ```
   https://nemon-search.<seu-subdominio>.workers.dev
   ```

---

## 💻 Método 2: Publicar via Terminal (CLI Wrangler)

Se preferir publicar diretamente pela linha de comando:

```bash
# Entre na pasta do worker
cd cloudflare-worker

# Execute o deploy com o wrangler
npx wrangler deploy
```

O terminal solicitará a autenticação com a sua conta Cloudflare e exibirá a URL pública ao final.

---

## ⚙️ Como Ativar no Nemon (Celular e PC)

1. Abra o **Nemon** no celular ou navegador.
2. Abra as **Configurações** (ícone de engrenagem) e vá na aba **API**.
3. No campo **Pesquisa Web (MCP DuckDuckGo)**, substitua `http://localhost:3333` pela URL do seu Cloudflare Worker:
   ```
   https://nemon-search.<seu-subdominio>.workers.dev
   ```
4. Clique em **SALVAR**.
5. O status ficará verde (**MCP ATIVO**) e funcionará continuamente em qualquer lugar!
