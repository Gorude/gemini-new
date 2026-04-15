import { floatToPcm16, pcm16ToFloat } from './audioUtils';

export interface LiveSessionHandlers {
  onAudioData: (float32Array: Float32Array) => void;
  onTranscript: (role: 'user' | 'ai', text: string) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'error' | 'disconnected') => void;
  onStream: (stream: MediaStream | null) => void;
  onError: (error: string) => void;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private micStream: MediaStream | null = null;
  private videoStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private frameInterval: number | null = null;
  private handlers: LiveSessionHandlers;
  private personalityPrompt: string;
  private voice: string;

  constructor(handlers: LiveSessionHandlers, personalityPrompt: string = "", voice: string = "Charon") {
    this.handlers = handlers;
    this.personalityPrompt = personalityPrompt;
    this.voice = voice;
  }

  async start() {
    this.handlers.onStatusChange('connecting');
    const key = import.meta.env.VITE_GEMINI_FREE_API_KEY;
    if (!key) {
      this.handlers.onError("API Key não configurada.");
      return;
    }

    const modelName = "models/gemini-2.5-flash-native-audio-preview-12-2025"; 
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.handlers.onStatusChange('connected');
        this.sendSetup(modelName);
      };

      this.ws.onmessage = async (event) => {
        try {
          let data = event.data;
          if (data instanceof Blob) {
            data = await data.text();
          }
          const response = JSON.parse(data);
          this.handleServerMessage(response);
        } catch (err) {
          // Se não for JSON, pode ser binário de áudio direto (dependendo da versão do modelo)
          // mas por enquanto apenas ignoramos erros de parse para evitar crash
          console.warn("Mensagem não-JSON recebida ou erro no parse:", err);
        }
      };

      this.ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        this.handlers.onStatusChange('error');
        this.handlers.onError("Erro na conexão WebSocket.");
      };

      this.ws.onclose = () => {
        this.handlers.onStatusChange('disconnected');
        this.stop();
      };

      await this.initAudio();
    } catch (err: any) {
      this.handlers.onError(err.message);
      this.stop();
    }
  }

  private sendSetup(model: string) {
    if (!this.ws) return;
    const setup = {
      setup: {
        model: model,
        generation_config: {
          response_modalities: ["AUDIO"],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: this.voice
              }
            }
          }
        },
        system_instruction: {
          role: "system",
          parts: [{ text: `Você é o Gemoro no modo LIVE. ${this.personalityPrompt}. Responda SEMPRE em áudio de forma natural e conversacional.` }]
        }
      }
    };
    this.ws.send(JSON.stringify(setup));
  }

  private async initAudio() {
    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');

      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioContext.createMediaStreamSource(this.micStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

      this.workletNode.port.onmessage = (event) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          const pcm64 = floatToPcm16(event.data);
          this.ws.send(JSON.stringify({
            realtime_input: {
              media_chunks: [{
                mime_type: "audio/pcm;rate=16000",
                data: pcm64
              }]
            }
          }));
        }
      };

      source.connect(this.workletNode);
    } catch (err) {
      console.warn("Nenhum microfone detectado ou permissão negada. Modo Live funcionará apenas via texto.");
    }
  }

  sendText(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        realtime_input: {
          text: text
        }
      }));
    }
  }

  async startCamera() {
    await this.startVideo(false);
  }

  async startScreen() {
    await this.startVideo(true);
  }

  private async startVideo(isScreen: boolean) {
    this.stopVideo();
    try {
      this.videoStream = isScreen 
        ? await navigator.mediaDevices.getDisplayMedia({ video: true })
        : await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.videoStream;
      this.videoElement.play();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      this.frameInterval = window.setInterval(() => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.videoElement || !ctx) return;
        
        // Capturar frame a cada ~1 segundo (1 FPS é o ideal para Gemini Live Vision no momento)
        canvas.width = 640;
        canvas.height = 480;
        ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
        
        const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        
        this.ws.send(JSON.stringify({
          realtime_input: {
            media_chunks: [{
              mime_type: "image/jpeg",
              data: base64
            }]
          }
        }));
      }, 1000);

      this.videoStream.getTracks()[0].onended = () => this.stopVideo();
      
      this.handlers.onStream(this.videoStream);
      return this.videoStream;
    } catch (err) {
      console.error("Erro ao iniciar vídeo:", err);
      throw err;
    }
  }

  stopVideo() {
    if (this.frameInterval) clearInterval(this.frameInterval);
    this.videoStream?.getTracks().forEach(t => t.stop());
    this.videoStream = null;
    this.videoElement = null;
    this.frameInterval = null;
    this.handlers.onStream(null);
  }

  private handleServerMessage(msg: any) {
    // Tratar áudio de saída da IA
    if (msg.serverContent?.modelTurn?.parts) {
      msg.serverContent.modelTurn.parts.forEach((part: any) => {
        if (part.inlineData?.data) {
          const float32 = pcm16ToFloat(part.inlineData.data);
          this.handlers.onAudioData(float32);
        }
      });
    }

    // Tratar Transcrições (Entrada e Saída)
    if (msg.serverContent?.inputTranscription?.text) {
      this.handlers.onTranscript('user', msg.serverContent.inputTranscription.text);
    }
    if (msg.serverContent?.outputTranscription?.text) {
      this.handlers.onTranscript('ai', msg.serverContent.outputTranscription.text);
    }

    // Tratar interrupção (Barge-in)
    if (msg.serverContent?.interrupted) {
      // Opcional: Limpar fila de áudio atual no App.tsx se necessário
    }
  }

  stop() {
    this.ws?.close();
    this.micStream?.getTracks().forEach(t => t.stop());
    this.stopVideo();
    this.audioContext?.close();
    this.ws = null;
    this.audioContext = null;
  }
}
