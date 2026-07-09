import { floatToPcm16, pcm16ToFloat } from './audioUtils';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface LiveSessionHandlers {
  onAudioData: (float32Array: Float32Array) => void;
  onTranscript: (role: 'user' | 'ai', text: string) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'error' | 'disconnected') => void;
  onStream: (stream: MediaStream | null) => void;
  onError: (error: string) => void;
  onInterrupt?: () => void;
  // Executor de ferramentas customizadas (memória, controle do app, histórico, tempo, alarmes).
  // Recebe o nome da função e seus argumentos e devolve o objeto de resposta.
  onToolCall?: (name: string, args: any) => Promise<any>;
  // Notificação de que o modelo acionou uma ferramenta (para feedback visual/sonoro na UI).
  onToolUsed?: (name: string, args: any) => void;
}

// Declarações das ferramentas customizadas expostas ao modelo no modo LIVE.
// As nativas (googleSearch, codeExecution) são adicionadas separadamente no setup.
export const LIVE_TOOL_DECLARATIONS = [
  {
    name: "get_current_time",
    description: "Retorna a data e hora atual do sistema do usuário para precisão temporal (relógio em tempo real).",
    parameters: { type: "OBJECT", properties: {} }
  },
  // ---- Memória / DNA ----
  {
    name: "save_memory",
    description: "Salva um NOVO fato atômico e específico sobre o usuário na memória de longo prazo (DNA). Use um fato por chamada. NÃO use para atualizar fatos existentes.",
    parameters: {
      type: "OBJECT",
      properties: {
        text: { type: "STRING", description: "O fato atômico. Ex: 'O usuário se chama José Gabriel'." },
        category: { type: "STRING", description: "Categoria curta do fato. Ex: 'Identidade', 'Preferências', 'Trabalho'." }
      },
      required: ["text"]
    }
  },
  {
    name: "update_memory",
    description: "Atualiza um fato existente na memória APENAS quando a informação antiga daquele ID for diretamente contradita/substituída (ex.: mudou de cidade ou idade).",
    parameters: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING", description: "O ID do fato a atualizar." },
        text: { type: "STRING", description: "O novo texto do fato." }
      },
      required: ["id", "text"]
    }
  },
  {
    name: "delete_memory",
    description: "Remove um fato da memória de longo prazo pelo seu ID.",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING", description: "O ID do fato a remover." } },
      required: ["id"]
    }
  },
  {
    name: "recall_memory",
    description: "Busca fatos salvos na memória de longo prazo (DNA) por palavra-chave ou categoria. Use para lembrar detalhes sobre o usuário.",
    parameters: {
      type: "OBJECT",
      properties: { query: { type: "STRING", description: "Termo de busca. Vazio retorna todos os fatos." } }
    }
  },
  // ---- Controle do app por voz ----
  {
    name: "set_voice",
    description: "Troca a voz da IA no modo LIVE.",
    parameters: {
      type: "OBJECT",
      properties: { voice: { type: "STRING", description: "Uma de: Puck, Charon, Kore, Fenrir, Aoede." } },
      required: ["voice"]
    }
  },
  {
    name: "toggle_camera",
    description: "Liga ou desliga a câmera (webcam) para o modo de visão.",
    parameters: {
      type: "OBJECT",
      properties: { enable: { type: "BOOLEAN", description: "true liga, false desliga. Omitido alterna." } }
    }
  },
  {
    name: "toggle_screen_share",
    description: "Liga ou desliga o compartilhamento de tela para o modo de visão.",
    parameters: {
      type: "OBJECT",
      properties: { enable: { type: "BOOLEAN", description: "true liga, false desliga. Omitido alterna." } }
    }
  },
  {
    name: "toggle_proactivity",
    description: "Ativa ou desativa o modo proativo (a IA puxa assunto durante silêncios).",
    parameters: {
      type: "OBJECT",
      properties: { enable: { type: "BOOLEAN", description: "true ativa, false desativa." } },
      required: ["enable"]
    }
  },
  {
    name: "open_settings",
    description: "Abre a tela de configurações do app numa aba específica.",
    parameters: {
      type: "OBJECT",
      properties: { tab: { type: "STRING", description: "Uma de: geral, modelos, api, personalidades, dna." } }
    }
  },
  {
    name: "set_theme",
    description: "Troca o tema de cores da interface. Escolhe o mais próximo do que o usuário pedir.",
    parameters: {
      type: "OBJECT",
      properties: { name: { type: "STRING", description: "Tema desejado: Escuro, Claro, Areia, Galáxia ou Claude." } },
      required: ["name"]
    }
  },
  {
    name: "end_session",
    description: "Encerra a sessão do modo LIVE. Use apenas quando o usuário pedir explicitamente para encerrar/desligar.",
    parameters: { type: "OBJECT", properties: {} }
  },
  // ---- Histórico / conversas ----
  {
    name: "search_history",
    description: "Procura em conversas anteriores do usuário por um termo e retorna os títulos e trechos relevantes.",
    parameters: {
      type: "OBJECT",
      properties: { query: { type: "STRING", description: "Termo a procurar no histórico de conversas." } },
      required: ["query"]
    }
  },
  {
    name: "create_new_chat",
    description: "Cria uma nova conversa em branco e a torna ativa.",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "list_personalities",
    description: "Lista as personalidades disponíveis no sistema (e qual está ativa). Use quando o usuário perguntar quais personalidades existem, ou antes de trocar se não tiver certeza dos nomes.",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "switch_personality",
    description: "Troca a personalidade ativa, que muda COMO você fala (tom, voz, vocabulário). Não exige nome exato: escolhe a mais próxima do que o usuário pediu. Se não houver correspondência, retorna a lista para o usuário escolher. Após trocar, incorpore imediatamente a persona indicada no resultado.",
    parameters: {
      type: "OBJECT",
      properties: { name: { type: "STRING", description: "Nome (ou aproximação) da personalidade desejada." } },
      required: ["name"]
    }
  },
  {
    name: "create_personality",
    description: "Cria uma NOVA personalidade (perfil de comportamento) no sistema, com nome e prompt de estilo. Use quando o usuário pedir para criar/adicionar uma personalidade. Se o usuário descrever o estilo de forma vaga, elabore um prompt claro e detalhado. Para ativá-la em seguida, use switch_personality.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "Nome curto e único da personalidade. Ex: 'Professor', 'Pirata', 'Coach'." },
        prompt: { type: "STRING", description: "Instruções de comportamento e estilo de fala (system prompt) que definem a personalidade." }
      },
      required: ["name", "prompt"]
    }
  },
  {
    name: "delete_personality",
    description: "Exclui uma personalidade personalizada do sistema pelo nome (aproximado). Não é possível excluir a padrão 'Normal'.",
    parameters: {
      type: "OBJECT",
      properties: { name: { type: "STRING", description: "Nome (ou aproximação) da personalidade a excluir." } },
      required: ["name"]
    }
  },
  // ---- Verificação de fatos ----
  {
    name: "fact_check",
    description: "Verifica se uma afirmação é verdadeira, pesquisando fontes reais na web. Use quando o usuário pedir para checar/confirmar um fato ou perguntar 'isso é verdade?'.",
    parameters: {
      type: "OBJECT",
      properties: { claim: { type: "STRING", description: "A afirmação/fato a ser verificado." } },
      required: ["claim"]
    }
  },
  // ---- Tempo estendido ----
  {
    name: "set_timer",
    description: "Inicia um cronômetro. Quando o tempo acabar, o sistema acorda a IA para avisar o usuário.",
    parameters: {
      type: "OBJECT",
      properties: {
        seconds: { type: "NUMBER", description: "Duração total em segundos." },
        label: { type: "STRING", description: "Rótulo opcional do cronômetro. Ex: 'macarrão'." }
      },
      required: ["seconds"]
    }
  },
  {
    name: "set_reminder",
    description: "Agenda um lembrete relativo (daqui a X minutos). Quando chegar a hora, o sistema acorda a IA para avisar.",
    parameters: {
      type: "OBJECT",
      properties: {
        minutes: { type: "NUMBER", description: "Em quantos minutos a partir de agora." },
        message: { type: "STRING", description: "O que lembrar o usuário." }
      },
      required: ["minutes", "message"]
    }
  },
  // ---- Alarme ----
  {
    name: "set_alarm",
    description: "Agenda um alarme para um HORÁRIO específico do dia. Quando der a hora, o programa acorda a IA e ela avisa o usuário em voz alta sobre o alarme.",
    parameters: {
      type: "OBJECT",
      properties: {
        time: { type: "STRING", description: "Horário no formato 24h HH:MM. Ex: '14:30'. Se já passou hoje, será agendado para amanhã." },
        message: { type: "STRING", description: "Mensagem/assunto do alarme. Ex: 'reunião com a equipe'." }
      },
      required: ["time", "message"]
    }
  },
  {
    name: "list_alarms",
    description: "Lista os alarmes, cronômetros e lembretes atualmente agendados, com seus IDs.",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "cancel_alarm",
    description: "Cancela um alarme, cronômetro ou lembrete agendado pelo seu ID (obtido via list_alarms).",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING", description: "ID do agendamento a cancelar." } },
      required: ["id"]
    }
  },
  // ---- Cálculo ----
  {
    name: "calculate",
    description: "Calcula o resultado exato de uma expressão matemática. Use SEMPRE para qualquer conta em vez de calcular de cabeça. Converta porcentagens você mesmo (ex.: '18% de 4350' → '4350*0.18'). Use operadores padrão + - * / e ** para potência; funções: sqrt, abs, round, floor, ceil, min, max, log, ln, sin, cos, tan; constantes: pi, e.",
    parameters: {
      type: "OBJECT",
      properties: {
        expression: { type: "STRING", description: "Expressão matemática limpa. Ex: '(3+5)*2', '4350*0.18', 'sqrt(144)', '2**10'." }
      },
      required: ["expression"]
    }
  },
  // ---- Clima ----
  {
    name: "get_weather",
    description: "Consulta o clima atual e a previsão do dia (temperatura, sensação, umidade, vento, chance de chuva) de uma cidade, via API Open-Meteo. Se nenhuma cidade for informada, tenta usar a localização atual do dispositivo.",
    parameters: {
      type: "OBJECT",
      properties: {
        location: { type: "STRING", description: "Cidade/local. Ex: 'Naviraí, MS' ou 'São Paulo'. Vazio = localização atual do dispositivo." }
      }
    }
  }
];

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private micStream: MediaStream | null = null;
  private videoStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private frameInterval: number | null = null;
  // Último frame capturado (base64 JPEG), anexado aos turnos de texto para que o
  // modelo "veja" a câmera/tela ao ser perguntado por texto (mic desligado).
  private lastVideoFrame: string | null = null;
  // Token de geração para evitar dois loops de captura em corrida.
  private videoToken = 0;
  private handlers: LiveSessionHandlers;
  private personalityPrompt: string;
  private voice: string;

  private apiKey: string;
  private modelName: string;
  private micEnabled = true;

  private active = false;
  private reconnectTimeout: any = null;
  private attemptCount = 0;
  // Reconexão contida: poucas tentativas e mais espaçadas, para não reenviar o
  // setup muitas vezes por minuto (cada setup consome tokens da cota de 65K/min).
  private maxAttempts = 2;
  // Debounce da notificação de uso do Google Search (grounding vem em vários chunks).
  private lastSearchNotifyMs = 0;

  constructor(
    handlers: LiveSessionHandlers,
    personalityPrompt: string = "",
    voice: string = "Charon",
    apiKey: string = "",
    modelName: string = "models/gemini-3.1-flash-live-preview"
  ) {
    this.handlers = handlers;
    this.personalityPrompt = personalityPrompt;
    this.voice = voice;
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  async start() {
    this.active = true;
    this.attemptCount = 0;
    this.connect();
  }

  private async connect() {
    if (!this.active) return;
    this.handlers.onStatusChange('connecting');
    let key = this.apiKey || import.meta.env.VITE_GEMINI_FREE_API_KEY;
    try {
      if (!key && auth.currentUser) {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          if (data.paidApiKey) {
            key = data.paidApiKey;
          } else if (data.defaultApiKey) {
            key = data.defaultApiKey;
          }
        }
      }
    } catch (e) {
      // Fallback
    }

    if (!key) {
      this.handlers.onError("API Key não configurada.");
      return;
    }

    const modelName = this.modelName; 
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // O handshake do WebSocket sempre abre; o sucesso REAL é o setupComplete.
        // Por isso NÃO zeramos attemptCount aqui (senão o cap de reconexão nunca acumula
        // quando o servidor fecha logo após o setup, ex.: cota excedida).
        console.log(`[LIVE] WebSocket aberto (tentativa ${this.attemptCount + 1}). Enviando setup...`);
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
      };

      this.ws.onclose = (event) => {
        // event.reason costuma trazer a mensagem exata do servidor (ex.: schema inválido).
        const reason = event.reason || '(sem motivo informado)';
        console.log(`[LIVE] Conexão fechada. Código: ${event.code}. Motivo: "${reason}". Ativo: ${this.active}`);
        this.handlers.onStatusChange('disconnected');
        this.cleanupConnection();

        if (this.active) {
          const lowerReason = reason.toLowerCase();

          // Cota/billing excedidos: reconectar não resolve e só consome mais cota. Encerra.
          if (lowerReason.includes('quota') || lowerReason.includes('exceeded') || lowerReason.includes('billing')) {
            console.error(`[LIVE] Cota da API excedida. Motivo: ${reason}`);
            this.handlers.onError("Cota da API do Gemini excedida (limite do plano). Aguarde a renovação da cota ou configure uma chave de API paga nas Configurações.");
            this.stop();
            return;
          }

          if (event.code === 1008) {
            console.error(`[LIVE] Conexão rejeitada (1008 Policy Violation). Motivo: ${reason}`);
            this.handlers.onError(`Conexão rejeitada pelo servidor (1008): ${reason}. Verifique a chave de API e o modelo.`);
            this.stop();
            return;
          }

          this.attemptCount++;
          // Cap de tentativas: evita loop infinito quando o setup é inválido (ex.: 1011).
          if (this.attemptCount > this.maxAttempts) {
            console.error(`[LIVE] Falha persistente após ${this.maxAttempts} tentativas. Código ${event.code}. Motivo: ${reason}`);
            this.handlers.onError(`Não foi possível manter a conexão LIVE (código ${event.code}): ${reason}`);
            this.stop();
            return;
          }

          const delay = Math.min(1000 * Math.pow(1.5, this.attemptCount), 8000);
          console.log(`[LIVE] Reconectando em ${delay}ms... (Tentativa ${this.attemptCount}/${this.maxAttempts})`);
          this.reconnectTimeout = window.setTimeout(() => {
            this.connect();
          }, delay);
        }
      };

      await this.initAudio();
    } catch (err: any) {
      console.error("[LIVE] Falha ao iniciar WebSocket:", err);
      if (this.active) {
        this.attemptCount++;
        const delay = Math.min(1000 * Math.pow(1.5, this.attemptCount), 8000);
        this.reconnectTimeout = window.setTimeout(() => {
          this.connect();
        }, delay);
      } else {
        this.handlers.onError(err.message);
        this.stop();
      }
    }
  }

  private sendSetup(model: string) {
    if (!this.ws) return;
    const setup = {
      setup: {
        model: model,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voice
              }
            }
          }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // NOTA: Code Execution NÃO é suportado pela Live API (causa rejeição 1008).
        // Apenas Google Search + function calling podem ser combinados aqui.
        tools: [
          { functionDeclarations: LIVE_TOOL_DECLARATIONS },
          { googleSearch: {} }
        ],
        systemInstruction: {
          role: "system",
          parts: [{ text: `Você é o Nemon no modo LIVE. ${this.personalityPrompt}.
            HORA ATUAL: ${new Date().toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
            REGRAS OBRIGATÓRIAS:
            1. Responda SEMPRE ao usuário de forma audível. NUNCA fique em silêncio.
            2. Use as ferramentas disponíveis quando fizer sentido: 'get_current_time' para a hora; 'google_search' para fatos atuais/reais; 'calculate' para QUALQUER conta matemática; 'get_weather' para clima/previsão; ferramentas de memória para lembrar do usuário; controle do app e alarmes/lembretes/cronômetros.
            3. Ao salvar memória, use 'save_memory' para fatos novos e 'update_memory' apenas quando um fato antigo for contradito. Um fato atômico por chamada.
            4. Quando um alarme, cronômetro ou lembrete disparar, você receberá uma mensagem de [SISTEMA]. Avise o usuário em voz alta imediatamente, de forma natural.
            5. Seja direto, natural e amigável. Se não entender algo, peça para repetir, mas responda.` }]
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
      
      // Aplicar o estado atual do microfone imediatamente
      this.micStream.getAudioTracks().forEach(track => {
        track.enabled = this.micEnabled;
      });

      const source = this.audioContext.createMediaStreamSource(this.micStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');

      this.workletNode.port.onmessage = (event) => {
        if (this.ws?.readyState === WebSocket.OPEN && this.micEnabled) {
          const pcm64 = floatToPcm16(event.data);
          // Formato atual da Live API: realtimeInput.audio (objeto único).
          // O formato legado realtimeInput.mediaChunks é rejeitado pelos modelos
          // live 3.x com fechamento 1007 (Invalid Frame Payload Data).
          this.ws.send(JSON.stringify({
            realtimeInput: {
              audio: {
                mimeType: "audio/pcm;rate=16000",
                data: pcm64
              }
            }
          }));
        }
      };

      source.connect(this.workletNode);
    } catch (err) {
      console.warn("Nenhum microfone detectado ou permissão negada. Modo Live funcionará apenas via texto.");
    }
  }

  setMicEnabled(enabled: boolean) {
    this.micEnabled = enabled;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
    console.log(`[LIVE] Estado do microfone alterado para: ${enabled ? 'ativado' : 'desativado'}`);
  }

  sendText(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Entrada de texto por turno completo, que dispara a resposta do modelo de forma confiável.
      // Se houver câmera/tela ativa, anexa o frame mais recente para o modelo "ver"
      // o que está sendo perguntado (o canal realtimeInput não entra no turno de texto).
      const parts: any[] = [];
      if (this.lastVideoFrame) {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: this.lastVideoFrame } });
      }
      parts.push({ text });
      this.ws.send(JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts }],
          turnComplete: true
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
    const token = ++this.videoToken;
    try {
      const stream = isScreen
        ? await navigator.mediaDevices.getDisplayMedia({ video: true })
        : await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });

      // Se outra chamada de start/stop ocorreu enquanto aguardávamos, aborta esta.
      if (token !== this.videoToken) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      this.videoStream = stream;

      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.videoStream;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      // Anexa ao DOM fora da tela: muitos navegadores suspendem a DECODIFICAÇÃO de
      // um <video> desconectado do DOM (ou com display:none), então ele nunca chega
      // a readyState>=2 e nenhum frame é capturado. Off-screen (não display:none)
      // mantém a decodificação ativa para o drawImage funcionar.
      this.videoElement.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;';
      document.body.appendChild(this.videoElement);
      // play() pode rejeitar; ignoramos pois é stream de câmera em fluxo iniciado pelo usuário.
      this.videoElement.play().catch(() => {});

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let framesSent = 0;

      this.frameInterval = window.setInterval(() => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.videoElement || !ctx) return;

        // Só captura quando o vídeo já tem um frame decodificado; caso contrário
        // desenharíamos um quadro preto e o modelo não conseguiria "ver" nada.
        const vw = this.videoElement.videoWidth;
        const vh = this.videoElement.videoHeight;
        if (this.videoElement.readyState < 2 || vw === 0 || vh === 0) return;

        // Capturar frame a cada ~1 segundo (1 FPS é o ideal para Gemini Live Vision no momento),
        // preservando a proporção real do vídeo (evita distorção).
        canvas.width = vw;
        canvas.height = vh;
        ctx.drawImage(this.videoElement, 0, 0, vw, vh);

        const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        this.lastVideoFrame = base64;

        // Frames de imagem seguem pelo campo realtimeInput.video no formato atual da API.
        this.ws.send(JSON.stringify({
          realtimeInput: {
            video: {
              mimeType: "image/jpeg",
              data: base64
            }
          }
        }));

        framesSent++;
        if (framesSent === 1 || framesSent % 10 === 0) {
          console.log(`[LIVE] 📹 Frame de vídeo enviado (#${framesSent}, ${vw}x${vh}, ${base64.length} bytes b64).`);
        }
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
    // Invalida qualquer startVideo em andamento (corrida de duplo loop).
    this.videoToken++;
    if (this.frameInterval) clearInterval(this.frameInterval);
    this.videoStream?.getTracks().forEach(t => t.stop());
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement.remove();
    }
    this.videoStream = null;
    this.videoElement = null;
    this.frameInterval = null;
    this.lastVideoFrame = null;
    this.handlers.onStream(null);
  }

  private handleServerMessage(msg: any) {
    if (!msg) return;
    
    // Log completo das mensagens do servidor — silencioso por padrão para não
    // poluir os logs. Ative com `window.__LIVE_DEBUG = true` no console quando precisar.
    if ((window as any).__LIVE_DEBUG) {
      console.log("[LIVE] RAW MSG:", JSON.stringify(msg));
    }

    // Sucesso REAL da sessão: só aqui zeramos o contador de tentativas.
    if (msg.setupComplete || msg.setup_complete) {
      console.log("[LIVE] ✅ Setup concluído. Sessão pronta.");
      this.attemptCount = 0;
      return;
    }

    // Normalizar chaves (Suporte a camelCase e snake_case recebidos)
    const serverContent = msg.serverContent || msg.server_content;
    const modelTurn = serverContent?.modelTurn || serverContent?.model_turn;

    // Tratar áudio de saída da IA (inlineData ou inline_data) e thoughts
    if (modelTurn?.parts) {
      modelTurn.parts.forEach((part: any) => {
        // Logging de Thoughts (Raciocínio interno da IA)
        if (part.thought) {
          console.log("[LIVE] 🧠 IA está pensando:", part.text);
        }

        const inlineData = part.inlineData || part.inline_data;
        if (inlineData?.data) {
          const float32 = pcm16ToFloat(inlineData.data);
          this.handlers.onAudioData(float32);
        }
      });
    }

    // Detectar uso do Google Search (ferramenta nativa): chega como grounding
    // metadata, não como function call. Debounce para não notificar em cada chunk.
    const grounding =
      serverContent?.groundingMetadata || serverContent?.grounding_metadata ||
      modelTurn?.groundingMetadata || modelTurn?.grounding_metadata ||
      serverContent?.candidates?.[0]?.groundingMetadata || serverContent?.candidates?.[0]?.grounding_metadata;
    if (grounding) {
      const queries = grounding.webSearchQueries || grounding.web_search_queries;
      const chunks = grounding.groundingChunks || grounding.grounding_chunks;
      const entry = grounding.searchEntryPoint || grounding.search_entry_point;
      if ((queries && queries.length) || (chunks && chunks.length) || entry) {
        const nowMs = Date.now();
        if (nowMs - this.lastSearchNotifyMs > 4000) {
          this.lastSearchNotifyMs = nowMs;
          console.log("[LIVE] 🔍 Google Search usado.", queries || '');
          this.handlers.onToolUsed?.('google_search', { queries });
        }
      }
    }

    // Tratar Transcrições
    if (serverContent?.inputTranscription?.text || serverContent?.input_transcription?.text) {
      this.handlers.onTranscript('user', serverContent.inputTranscription?.text || serverContent.input_transcription?.text);
    }
    if (serverContent?.outputTranscription?.text || serverContent?.output_transcription?.text) {
      this.handlers.onTranscript('ai', serverContent.outputTranscription?.text || serverContent.output_transcription?.text);
    }

    // Tratar Tool Calls
    // 1. Verificar no nível superior (como visto nos logs do modelo preview)
    // 2. Verificar dentro de modelTurn.parts (como no padrão documentado)
    const toolCall = msg.toolCall || msg.tool_call || (modelTurn?.parts?.find((p: any) => p.toolCall || p.tool_call)?.toolCall || modelTurn?.parts?.find((p: any) => p.toolCall || p.tool_call)?.tool_call);

    if (toolCall) {
      console.log("[LIVE] 🛠️ Tool Call detectado:", toolCall);
      const functionCalls = toolCall.functionCalls || toolCall.function_calls;
      if (functionCalls && functionCalls.length > 0) {
        // Resolve as chamadas de função (algumas são assíncronas) e responde ao modelo.
        this.resolveFunctionCalls(functionCalls);
      }
    }

    // (Tool calls tratados por resolveFunctionCalls.)

    // Tratar interrupção (barge-in): o usuário falou por cima da IA.
    // O servidor sinaliza que devemos descartar o áudio já enfileirado/tocando.
    if (serverContent?.interrupted || serverContent?.interrupted === true) {
      console.log("[LIVE] ✋ Interrupção detectada pelo servidor. Limpando fila de áudio.");
      this.handlers.onInterrupt?.();
    }
  }

  private async resolveFunctionCalls(functionCalls: any[]) {
    const functionResponses: any[] = [];

    for (const fc of functionCalls) {
      const fcId = fc.id || fc.call_id;
      const args = fc.args || fc.arguments || {};
      let responsePayload: any;

      // Feedback para a UI: o modelo acionou esta ferramenta.
      this.handlers.onToolUsed?.(fc.name, args);

      try {
        if (fc.name === 'get_current_time') {
          // Resolvido localmente para evitar round-trip.
          const now = new Date();
          responsePayload = {
            result: now.toLocaleString('pt-BR', {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })
          };
        } else if (this.handlers.onToolCall) {
          const result = await this.handlers.onToolCall(fc.name, args);
          // Garante que a resposta seja sempre um objeto (exigência da API).
          responsePayload = (result && typeof result === 'object') ? result : { result: String(result ?? 'ok') };
        } else {
          responsePayload = { result: `Ferramenta '${fc.name}' indisponível.` };
        }
      } catch (err: any) {
        console.error(`[LIVE] ❌ Erro ao executar ferramenta ${fc.name}:`, err);
        responsePayload = { result: `Erro ao executar '${fc.name}': ${err?.message || 'desconhecido'}` };
      }

      functionResponses.push({ name: fc.name, id: fcId, response: responsePayload });
      console.log(`[LIVE] ✅ Respondendo ${fc.name} (ID: ${fcId})`, responsePayload);
    }

    if (functionResponses.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const toolResponseMessage = { toolResponse: { functionResponses } };
      try {
        this.ws.send(JSON.stringify(toolResponseMessage));
      } catch (err) {
        console.error("[LIVE] ❌ Erro ao enviar Tool Response:", err);
      }
    }
  }

  stop() {
    this.active = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.attemptCount = 0;
    this.cleanupConnection();
  }

  private cleanupConnection() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.micStream?.getTracks().forEach(t => t.stop());
    this.stopVideo();
    this.audioContext?.close();
    this.audioContext = null;
  }
}
