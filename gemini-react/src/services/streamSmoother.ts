// Suavização de streaming ("efeito máquina de escrever").
//
// A API do Gemini entrega o texto em blocos de várias palavras por evento SSE —
// não dá para pedir um token por vez. Este utilitário desacopla a REVELAÇÃO na
// tela da CHEGADA pela rede: acumulamos o texto recebido como "alvo" e revelamos
// caractere a caractere num ritmo que se AJUSTA à velocidade de chegada, dando a
// sensação de fluxo contínuo (token a token), sem correr nem travar entre blocos.
//
// Como o ritmo se auto-ajusta:
//   velocidade (car/s) = buffer_pendente / LOOKAHEAD
// Em regime, o buffer se estabiliza em (taxa_de_chegada × LOOKAHEAD), então a
// velocidade de revelação passa a IGUALAR a taxa de chegada — o buffer nunca
// zera (não trava) nem cresce sem limite (não fica muito atrás). O texto na tela
// fica ~LOOKAHEAD segundos atrás da geração; ao finalizar, o resto é drenado rápido.
//
// Detalhe crucial: a posição é acumulada em PONTO FLUTUANTE (sem piso de "1 char
// por frame"), então velocidades baixas são reveladas suavemente, e não em saltos.

const LOOKAHEAD_MS = 700;      // "atraso" alvo; janela em que o buffer é revelado
const MIN_CPS = 8;             // trickle mínimo p/ não congelar com buffer minúsculo
const DRAIN_LOOKAHEAD_MS = 250; // ao finalizar: drena o restante mais rápido
const DRAIN_MIN_CPS = 180;      // piso durante a drenagem final
const MIN_EMIT_MS = 24;         // intervalo mínimo entre atualizações de tela (~40fps)

export class StreamSmoother {
  private targetA = '';
  private targetB = '';
  private shownA = 0; // float — posição revelada (caracteres)
  private shownB = 0; // float
  private raf = 0;
  private running = false;
  private draining = false;
  private lastTs = 0;
  private lastEmit = 0;
  private finishResolve: (() => void) | null = null;
  private onFrame: (shownA: string, shownB: string) => void;

  constructor(onFrame: (shownA: string, shownB: string) => void) {
    this.onFrame = onFrame;
  }

  /** Atualiza os textos-alvo (só crescem). Chamado a cada chunk recebido. */
  setTargets(a: string, b: string) {
    this.targetA = a;
    this.targetB = b;
    // Se o alvo encolheu (ex.: um bloco/tag foi removido ao completar), não revela além dele.
    if (this.shownA > a.length) this.shownA = a.length;
    if (this.shownB > b.length) this.shownB = b.length;
    this.ensureRunning();
  }

  private ensureRunning() {
    if (this.running) return;
    this.running = true;
    this.lastTs = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private advance(shown: number, targetLen: number, dt: number): number {
    const buffer = targetLen - shown;
    if (buffer <= 0) return shown;
    const lookahead = this.draining ? DRAIN_LOOKAHEAD_MS : LOOKAHEAD_MS;
    const minCps = this.draining ? DRAIN_MIN_CPS : MIN_CPS;
    // Ritmo proporcional ao buffer → iguala a taxa de chegada em regime.
    let cps = (buffer * 1000) / lookahead;
    if (cps < minCps) cps = minCps;
    const next = shown + (cps * dt) / 1000; // acúmulo fracionário (suave em ritmos baixos)
    return next > targetLen ? targetLen : next;
  }

  private tick = (ts: number) => {
    if (!this.running) return;
    const dt = this.lastTs ? Math.min(100, ts - this.lastTs) : 16;
    this.lastTs = ts;

    this.shownA = this.advance(this.shownA, this.targetA.length, dt);
    this.shownB = this.advance(this.shownB, this.targetB.length, dt);

    const drained = this.shownA >= this.targetA.length && this.shownB >= this.targetB.length;

    // Emite no máximo a cada MIN_EMIT_MS (ou sempre que drenar, p/ garantir o estado final).
    if (drained || ts - this.lastEmit >= MIN_EMIT_MS) {
      this.lastEmit = ts;
      this.onFrame(
        this.targetA.slice(0, Math.floor(this.shownA)),
        this.targetB.slice(0, Math.floor(this.shownB))
      );
    }

    if (drained) {
      // Alcançou o alvo. Se finish() foi pedido, encerra; senão pausa (economiza CPU)
      // e será retomado no próximo setTargets.
      this.running = false;
      if (this.finishResolve) {
        const r = this.finishResolve;
        this.finishResolve = null;
        this.draining = false;
        r();
      }
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Revela todo o restante (mais rápido) e resolve quando terminar. */
  finish(): Promise<void> {
    return new Promise((resolve) => {
      if (this.shownA >= this.targetA.length && this.shownB >= this.targetB.length) {
        this.onFrame(this.targetA, this.targetB);
        resolve();
        return;
      }
      this.finishResolve = resolve;
      this.draining = true;
      this.ensureRunning();
    });
  }

  /** Interrompe imediatamente, revelando o que já chegou (ex.: usuário parou a geração). */
  cancel() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.shownA = this.targetA.length;
    this.shownB = this.targetB.length;
    this.onFrame(this.targetA, this.targetB);
    const r = this.finishResolve;
    this.finishResolve = null;
    if (r) r();
  }
}
