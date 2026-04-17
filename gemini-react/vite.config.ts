import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const chatFile = path.resolve(__dirname, 'chat-history.json')
const memoryFile = path.resolve(__dirname, 'user-memory.json')
const personalitiesFile = path.resolve(__dirname, 'personalities.json')
const usageFile = path.resolve(__dirname, 'usage-data.json')
const uploadsDir = path.resolve(__dirname, 'public/uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

function chatHistoryApi() {
  return {
    name: 'chat-history-api',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url === '/api/history' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(chatFile)) {
            res.end(fs.readFileSync(chatFile, 'utf-8'))
          } else {
            res.end(JSON.stringify([]))
          }
        } else if (req.url === '/api/history' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            fs.writeFileSync(chatFile, body, 'utf-8')
            res.end(JSON.stringify({ success: true }))
          })
        } else if (req.url === '/api/memory' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(memoryFile)) {
            res.end(fs.readFileSync(memoryFile, 'utf-8'))
          } else {
            res.end(JSON.stringify([]))
          }
        } else if (req.url === '/api/memory' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            fs.writeFileSync(memoryFile, body, 'utf-8')
            res.end(JSON.stringify({ success: true }))
          })
        } else if (req.url === '/api/personalities' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(personalitiesFile)) {
            res.end(fs.readFileSync(personalitiesFile, 'utf-8'))
          } else {
            res.end(JSON.stringify([]))
          }
        } else if (req.url === '/api/personalities' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            fs.writeFileSync(personalitiesFile, body, 'utf-8')
            res.end(JSON.stringify({ success: true }))
          })
        } else if (req.url === '/api/usage' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(usageFile)) {
            res.end(fs.readFileSync(usageFile, 'utf-8'))
          } else {
            res.end(JSON.stringify({}))
          }
        } else if (req.url === '/api/usage' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            fs.writeFileSync(usageFile, body, 'utf-8')
            res.end(JSON.stringify({ success: true }))
          })
        } else if (req.url === '/api/upload' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk: string) => body += chunk)
          req.on('end', () => {
            try {
              const payload = JSON.parse(body)
              const buffer = Buffer.from(payload.data, 'base64')
              fs.writeFileSync(path.join(uploadsDir, payload.filename), buffer)
              res.end(JSON.stringify({ success: true, path: '/uploads/' + payload.filename }))
            } catch (e) {
              res.end(JSON.stringify({ error: true }))
            }
          })
        } else {
          next()
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    chatHistoryApi()
  ],
  server: {
    watch: {
      ignored: ['**/chat-history.json', '**/user-memory.json', '**/personalities.json', '**/usage-data.json']
    }
  }
})
