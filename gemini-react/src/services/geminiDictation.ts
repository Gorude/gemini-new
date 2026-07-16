import { pcm16ToFloat, concatFloat32 } from './audioUtils';

export interface DictationHandlers {
  // Progresso: quantos trechos já foram concluídos de um total.
  onProgress: (done: number, total: number) => void;
  // Todos os trechos processados. O resultado vem ORDENADO pelo índice do chunk;
  // uma entrada `null` = trecho que falhou nas duas tentativas (vira lacuna no App).
  onComplete: (orderedAudio: (Float32Array | null)[]) => void;
  // Erro "duro" (cota/rejeição do servidor) que aborta todo o lote.
  onError: (message: string) => void;
}

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const NARRATION_SYSTEM_PROMPT =
  'Você é um MOTOR DE NARRAÇÃO (text-to-speech). Sua ÚNICA função é ler em voz alta, ' +
  'em português, EXATAMENTE o texto que o usuário enviar — palavra por palavra, na íntegra, ' +
  'com entonação natural, clara e ritmo agradável. NUNCA resuma, comente, responda, cumprimente, ' +
  'explique, traduza ou adicione qualquer palavra que não esteja no texto. Não diga coisas como ' +
  "'aqui está' ou 'claro'. Apenas leia o conteúdo enviado.";

/**
 * Sessão de DITADO (TTS) em PARALELO sobre a Live API do Gemini.
 *
 * Diferente da versão sequencial anterior: cada trecho de texto abre a SUA PRÓPRIA
 * conexão WebSocket (uma requisição independente ao modelo) e todas são disparadas
 * de uma vez, limitadas apenas por um pool de concorrência para não estourar o
 * limite de sessões simultâneas da Live API. O tempo total passa a ser ~o do trecho
 * mais lento, e não a soma de todos.
 *
 * O áudio de cada trecho é entregue no callback `onComplete` já ORDENADO pelo índice
 * original do chunk, para o App concatenar num único arquivo.
 */
export class GeminiDictationSession {
  private chunks: string[];
  private handlers: DictationHandlers;
  private voice: string;
  private apiKey: string;
  private modelName: string;
  private concurrency: number;
  // Nº de novas tentativas após a primeira falha (1 = tenta 2 vezes no total).
  private maxRetries = 1;

  private active = false;
  private settled = false;
  private nextIndex = 0;
  private doneCount = 0;
  private results: (Float32Array | null)[] = [];
  private sockets = new Set<WebSocket>();

  constructor(
    chunks: string[],
    handlers: DictationHandlers,
    voice: string = 'Charon',
    apiKey: string = '',
    modelName: string = 'models/gemini-2.5-flash-native-audio-preview-12-2025',
    concurrency: number = 4
  ) {
    this.chunks = chunks;
    this.handlers = handlers;
    this.voice = voice;
    this.apiKey = apiKey;
    this.modelName = modelName;
    // Trava a concorrência entre 1 e o nº de trechos (nunca mais workers que trabalho).
    this.concurrency = Math.max(1, Math.min(concurrency, Math.max(1, chunks.length)));
  }

  start() {
    if (!this.apiKey) {
      this.handlers.onError('API Key não configurada.');
      return;
    }
    if (this.chunks.length === 0) {
      this.handlers.onError('Nenhum texto para narrar.');
      return;
    }
    this.active = true;
    this.settled = false;
    this.nextIndex = 0;
    this.doneCount = 0;
    this.results = new Array(this.chunks.length).fill(null);

    const workers: Promise<void>[] = [];
    for (let i = 0; i < this.concurrency; i++) workers.push(this.worker());

    Promise.all(workers).then(() => {
      if (!this.active || this.settled) return;
      this.settled = true;
      this.handlers.onComplete(this.results);
    });
  }

  /** Consome trechos da fila até acabar (ou até um erro "duro"/cancelamento). */
  private async worker(): Promise<void> {
    while (this.active) {
      const index = this.nextIndex++;
      if (index >= this.chunks.length) return;
      try {
        // `audio` pode ser null: trecho que falhou nas duas tentativas (falha suave).
        const audio = await this.dictateChunk(index, 0);
        if (!this.active) return;
        this.results[index] = audio;
        this.doneCount++;
        this.handlers.onProgress(this.doneCount, this.chunks.length);
      } catch (err: any) {
        if (!this.active) return;
        // Só erros "duros" (cota/1008) chegam aqui e abortam o lote inteiro.
        this.fail(err?.message || 'Falha ao gerar a narração.');
        return;
      }
    }
  }

  /**
   * Gera o áudio de UM trecho numa conexão própria.
   * Resolve com o Float32Array em caso de sucesso, ou com `null` se o trecho
   * falhar mesmo após o retry (falha suave — vira lacuna). Rejeita apenas em
   * erros "duros" (cota/1008) que não vale a pena tentar de novo.
   */
  private dictateChunk(index: number, attempt: number): Promise<Float32Array | null> {
    return new Promise<Float32Array | null>((resolve, reject) => {
      if (!this.active) return reject(new Error('cancelado'));

      const text = this.chunks[index];
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${WS_URL}?key=${this.apiKey}`);
      } catch (err: any) {
        return reject(new Error(err?.message || 'Falha ao abrir a conexão do ditado.'));
      }
      this.sockets.add(ws);

      const audioParts: Float32Array[] = [];
      let gotTurnComplete = false;

      const cleanup = () => {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        this.sockets.delete(ws);
        try { ws.close(); } catch { /* ignore */ }
      };

      ws.onopen = () => {
        ws.send(JSON.stringify(this.buildSetup()));
      };

      ws.onmessage = async (event) => {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();
        let msg: any;
        try { msg = JSON.parse(data); } catch { return; }
        if (!msg) return;

        if (msg.setupComplete || msg.setup_complete) {
          ws.send(JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text }] }],
              turnComplete: true,
            },
          }));
          return;
        }

        const serverContent = msg.serverContent || msg.server_content;
        const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            const inlineData = part.inlineData || part.inline_data;
            if (inlineData?.data) audioParts.push(pcm16ToFloat(inlineData.data));
          }
        }

        if (serverContent?.turnComplete || serverContent?.turn_complete) {
          gotTurnComplete = true;
          cleanup();
          resolve(concatFloat32(audioParts));
        }
      };

      // O tratamento real fica no onclose (o erro sempre é seguido de close).
      ws.onerror = () => { /* noop */ };

      ws.onclose = (event) => {
        cleanup();
        if (gotTurnComplete || this.settled || !this.active) return;

        const reason = (event.reason || '').toLowerCase();
        if (reason.includes('quota') || reason.includes('exceeded') || reason.includes('billing')) {
          return reject(new Error('Cota da API do Gemini excedida. Aguarde a renovação ou configure uma chave paga.'));
        }
        if (event.code === 1008) {
          return reject(new Error(`Conexão rejeitada pelo servidor (1008): ${event.reason || 'sem motivo'}.`));
        }

        // Fechou antes de terminar o trecho → uma única nova tentativa, do zero.
        if (attempt < this.maxRetries) {
          window.setTimeout(() => {
            if (!this.active) return resolve(null);
            this.dictateChunk(index, attempt + 1).then(resolve, reject);
          }, 800);
        } else {
          // Falhou nas duas tentativas → falha suave: vira lacuna (null), sem
          // abortar os demais trechos.
          console.warn(`[DITADO] Trecho ${index + 1} falhou (código ${event.code}); marcado como lacuna.`);
          resolve(null);
        }
      };
    });
  }

  private buildSetup() {
    return {
      setup: {
        model: this.modelName,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } },
          },
        },
        systemInstruction: {
          role: 'system',
          parts: [{ text: NARRATION_SYSTEM_PROMPT }],
        },
      },
    };
  }

  private fail(message: string) {
    if (this.settled) return;
    this.settled = true;
    this.stop();
    this.handlers.onError(message);
  }

  /** Cancela tudo e fecha todas as conexões abertas. */
  stop() {
    this.active = false;
    for (const ws of this.sockets) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try { ws.close(); } catch { /* ignore */ }
    }
    this.sockets.clear();
  }
}
