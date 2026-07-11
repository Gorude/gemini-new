import { pcm16ToFloat } from './audioUtils';

export interface DictationHandlers {
  // Sessão pronta para receber texto (setup concluído). Também dispara após reconexão,
  // caso em que o App reenvia o chunk atual (descartando áudio parcial dele).
  onReady: () => void;
  // Chunk de áudio (Float32 @ 24kHz) narrado pelo modelo.
  onAudio: (chunk: Float32Array) => void;
  // Fim do turno = o chunk atual terminou de ser lido.
  onTurnComplete: () => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'error' | 'disconnected') => void;
  onError: (message: string) => void;
}

/**
 * Sessão dedicada de DITADO (TTS) sobre a Live API do Gemini.
 * Diferente do modo conversacional: sem microfone, sem vídeo, sem ferramentas.
 * O modelo recebe um system prompt de "motor de narração" e lê em voz alta,
 * verbatim, cada chunk de texto enviado. O áudio é capturado pelo App e montado
 * num único arquivo ao final.
 */
export class GeminiDictationSession {
  private ws: WebSocket | null = null;
  private handlers: DictationHandlers;
  private voice: string;
  private apiKey: string;
  private modelName: string;

  private active = false;
  private sessionHandle: string | null = null;
  private attemptCount = 0;
  private maxAttempts = 3;
  private reconnectTimeout: any = null;

  constructor(
    handlers: DictationHandlers,
    voice: string = "Charon",
    apiKey: string = "",
    modelName: string = "models/gemini-2.5-flash-native-audio-preview-12-2025"
  ) {
    this.handlers = handlers;
    this.voice = voice;
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async start() {
    this.active = true;
    this.attemptCount = 0;
    this.connect();
  }

  private connect() {
    if (!this.active) return;
    if (!this.apiKey) {
      this.handlers.onError("API Key não configurada.");
      return;
    }
    this.handlers.onStatusChange('connecting');

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.handlers.onStatusChange('connected');
        this.sendSetup();
      };

      this.ws.onmessage = async (event) => {
        try {
          let data = event.data;
          if (data instanceof Blob) data = await data.text();
          this.handleServerMessage(JSON.parse(data));
        } catch {
          // Ignora mensagens não-JSON.
        }
      };

      this.ws.onerror = (err) => console.error("[DITADO] WebSocket Error:", err);

      this.ws.onclose = (event) => {
        const reason = event.reason || '(sem motivo)';
        console.log(`[DITADO] Conexão fechada. Código: ${event.code}. Motivo: "${reason}".`);
        this.handlers.onStatusChange('disconnected');
        this.cleanupWs();
        if (!this.active) return;

        const lower = reason.toLowerCase();
        if (lower.includes('quota') || lower.includes('exceeded') || lower.includes('billing')) {
          this.handlers.onError("Cota da API do Gemini excedida. Aguarde a renovação ou configure uma chave paga.");
          this.stop();
          return;
        }
        if (event.code === 1008) {
          this.handlers.onError(`Conexão rejeitada pelo servidor (1008): ${reason}.`);
          this.stop();
          return;
        }

        this.attemptCount++;
        if (this.attemptCount > this.maxAttempts) {
          this.handlers.onError(`Não foi possível manter a conexão do ditado (código ${event.code}): ${reason}`);
          this.stop();
          return;
        }
        // Reconecta retomando a sessão; o App reenviará o chunk atual no onReady.
        const delay = Math.min(1000 * Math.pow(1.5, this.attemptCount), 8000);
        this.reconnectTimeout = window.setTimeout(() => this.connect(), delay);
      };
    } catch (err: any) {
      this.handlers.onError(err?.message || "Falha ao abrir a conexão do ditado.");
      this.stop();
    }
  }

  private sendSetup() {
    if (!this.ws) return;
    const setup = {
      setup: {
        model: this.modelName,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } }
          }
        },
        // Retomada de sessão + compressão de contexto: essenciais para textos longos,
        // que podem ultrapassar o limite de duração de uma única conexão.
        sessionResumption: this.sessionHandle ? { handle: this.sessionHandle } : {},
        contextWindowCompression: { slidingWindow: {} },
        systemInstruction: {
          role: "system",
          parts: [{
            text: "Você é um MOTOR DE NARRAÇÃO (text-to-speech). Sua ÚNICA função é ler em voz alta, " +
              "em português, EXATAMENTE o texto que o usuário enviar — palavra por palavra, na íntegra, " +
              "com entonação natural, clara e ritmo agradável. NUNCA resuma, comente, responda, cumprimente, " +
              "explique, traduza ou adicione qualquer palavra que não esteja no texto. Não diga coisas como " +
              "'aqui está' ou 'claro'. Apenas leia o conteúdo enviado."
          }]
        }
      }
    };
    this.ws.send(JSON.stringify(setup));
  }

  private handleServerMessage(msg: any) {
    if (!msg) return;

    if (msg.setupComplete || msg.setup_complete) {
      this.attemptCount = 0;
      this.handlers.onReady();
      return;
    }

    const resumption = msg.sessionResumptionUpdate || msg.session_resumption_update;
    if (resumption) {
      const newHandle = resumption.newHandle || resumption.new_handle;
      if ((resumption.resumable || resumption.resumable === undefined) && newHandle) {
        this.sessionHandle = newHandle;
      }
      return;
    }

    const serverContent = msg.serverContent || msg.server_content;
    const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;

    if (modelTurn?.parts) {
      modelTurn.parts.forEach((part: any) => {
        const inlineData = part.inlineData || part.inline_data;
        if (inlineData?.data) {
          this.handlers.onAudio(pcm16ToFloat(inlineData.data));
        }
      });
    }

    if (serverContent?.turnComplete || serverContent?.turn_complete) {
      this.handlers.onTurnComplete();
    }
  }

  /** Envia um chunk de texto para ser lido em voz alta. */
  sendChunk(text: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true
      }
    }));
  }

  private cleanupWs() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  stop() {
    this.active = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.sessionHandle = null;
    this.attemptCount = 0;
    this.cleanupWs();
  }
}
