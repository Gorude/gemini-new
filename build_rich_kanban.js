const fs = require('fs');
const path = require('path');

const waves = [];
for (let i = 1; i <= 9; i++) {
  const file = path.join('review_data', `wave${i}.json`);
  waves.push(JSON.parse(fs.readFileSync(file, 'utf8')));
}

const totalCards = waves.reduce((sum, w) => sum + w.cards.length, 0);
const approvedCards = waves.reduce((sum, w) => sum + w.cards.filter(c => c.status === "approved").length, 0);
const reviewingCards = waves.reduce((sum, w) => sum + w.cards.filter(c => c.status === "reviewing").length, 0);
const issuesCards = waves.reduce((sum, w) => sum + w.cards.filter(c => c.status === "issues").length, 0);
const pendingCards = waves.reduce((sum, w) => sum + w.cards.filter(c => !c.status || c.status === "pending").length, 0);
const pctApproved = totalCards > 0 ? Math.round((approvedCards / totalCards) * 100) : 0;
const pctIssues = totalCards > 0 ? (issuesCards / totalCards) * 100 : 0;
const pctReviewing = totalCards > 0 ? (reviewingCards / totalCards) * 100 : 0;
const pctApprovedWidth = totalCards > 0 ? (approvedCards / totalCards) * 100 : 0;

const edges = [
  { from: "w1-c1", to: "w1-c9", type: "builds" },
  { from: "w1-c2", to: "w2-c1", type: "types" },
  { from: "w1-c2", to: "w2-c2", type: "types" },
  { from: "w1-c2", to: "w2-c3", type: "types" },
  { from: "w1-c4", to: "w3-c12", type: "config" },
  { from: "w1-c5", to: "w3-c11", type: "mcp" },
  { from: "w1-c6", to: "w3-c6", type: "audio-worklet" },
  { from: "w1-c9", to: "w9-c1", type: "mounts" },
  { from: "w1-c10", to: "w9-c1", type: "governance" },

  { from: "w2-c1", to: "w3-c1", type: "schema" },
  { from: "w2-c1", to: "w6-c1", type: "model" },
  { from: "w2-c1", to: "w7-c1", type: "session" },
  { from: "w2-c1", to: "w9-c1", type: "state" },
  { from: "w2-c2", to: "w5-c1", type: "dna" },
  { from: "w2-c2", to: "w5-c4", type: "persona" },
  { from: "w2-c2", to: "w3-c6", type: "live-context" },
  { from: "w2-c3", to: "w4-c1", type: "harness-model" },
  { from: "w2-c3", to: "w4-c4", type: "ide-model" },
  { from: "w2-c4", to: "w3-c1", type: "limits" },
  { from: "w2-c4", to: "w6-c5", type: "context-tokens" },
  { from: "w2-c4", to: "w7-c4", type: "settings" },
  { from: "w2-c4", to: "w7-c5", type: "compare" },
  { from: "w2-c5", to: "w3-c6", type: "voices" },
  { from: "w2-c5", to: "w7-c4", type: "themes" },

  { from: "w3-c1", to: "w9-c2", type: "streaming" },
  { from: "w3-c1", to: "w7-c5", type: "llm-call" },
  { from: "w3-c2", to: "w3-c1", type: "openai-provider" },
  { from: "w3-c3", to: "w3-c1", type: "imagen" },
  { from: "w3-c4", to: "w6-c2", type: "render-md" },
  { from: "w3-c4", to: "w4-c9", type: "render-preview" },
  { from: "w3-c6", to: "w9-c5", type: "live-session" },
  { from: "w3-c6", to: "w3-c7", type: "live-tools" },
  { from: "w3-c6", to: "w3-c10", type: "pcm-stream" },
  { from: "w3-c8", to: "w9-c5", type: "dictation" },
  { from: "w3-c8", to: "w6-c4", type: "transcription" },
  { from: "w3-c9", to: "w9-c2", type: "smooth-stream" },
  { from: "w3-c10", to: "w3-c6", type: "audio-buffer" },
  { from: "w3-c11", to: "w9-c3", type: "search-tool" },
  { from: "w3-c11", to: "w3-c7", type: "search-provider" },
  { from: "w3-c12", to: "w7-c7", type: "auth" },
  { from: "w3-c12", to: "w9-c4", type: "firestore" },
  { from: "w3-c13", to: "w7-c8", type: "log-bus" },

  { from: "w4-c1", to: "w4-c4", type: "engine" },
  { from: "w4-c1", to: "w4-c8", type: "diffs" },
  { from: "w4-c2", to: "w4-c1", type: "auto-fix" },
  { from: "w4-c4", to: "w9-c5", type: "ide-mode" },
  { from: "w4-c5", to: "w4-c4", type: "editor" },
  { from: "w4-c6", to: "w4-c4", type: "preview-runner" },
  { from: "w4-c6", to: "w4-c7", type: "console-capture" },
  { from: "w4-c7", to: "w4-c4", type: "console-view" },
  { from: "w4-c8", to: "w4-c4", type: "diff-view" },
  { from: "w4-c9", to: "w6-c2", type: "standalone-preview" },

  { from: "w5-c1", to: "w9-c1", type: "dna-state" },
  { from: "w5-c1", to: "w5-c2", type: "graph-render" },
  { from: "w5-c3", to: "w9-c2", type: "prompt-rules" },
  { from: "w5-c3", to: "w3-c6", type: "live-memory" },
  { from: "w5-c4", to: "w9-c1", type: "persona-state" },
  { from: "w5-c4", to: "w3-c6", type: "persona-voice" },
  { from: "w5-c5", to: "w6-c4", type: "slash-commands" },
  { from: "w5-c5", to: "w9-c3", type: "chat-tools" },

  { from: "w6-c1", to: "w9-c1", type: "chat-viewport" },
  { from: "w6-c2", to: "w6-c1", type: "bubble" },
  { from: "w6-c3", to: "w6-c1", type: "timeline" },
  { from: "w6-c4", to: "w9-c2", type: "input-dispatch" },
  { from: "w6-c5", to: "w6-c4", type: "context-gauge" },
  { from: "w6-c6", to: "w6-c4", type: "attachments" },
  { from: "w6-c7", to: "w6-c1", type: "selection" },

  { from: "w7-c1", to: "w9-c1", type: "sessions-sidebar" },
  { from: "w7-c2", to: "w7-c1", type: "folders" },
  { from: "w7-c3", to: "w9-c1", type: "global-search" },
  { from: "w7-c4", to: "w9-c1", type: "config-state" },
  { from: "w7-c5", to: "w9-c1", type: "eval-modal" },
  { from: "w7-c6", to: "w9-c1", type: "toast-feedback" },
  { from: "w7-c7", to: "w9-c1", type: "login-gate" },
  { from: "w7-c8", to: "w9-c1", type: "diagnostics" },
  { from: "w7-c9", to: "w1-c9", type: "error-barrier" },

  { from: "w8-c1", to: "w4-c1", type: "code-parser" },
  { from: "w8-c2", to: "w6-c6", type: "pdf-text" },
  { from: "w8-c3", to: "w3-c1", type: "latency-telemetry" },
  { from: "w8-c4", to: "w7-c1", type: "chat-export" },
  { from: "w8-c5", to: "w6-c7", type: "markers" },
  { from: "w8-c6", to: "w9-c1", type: "css-tokens" },
  { from: "w8-c7", to: "w9-c1", type: "branding" },
  { from: "w8-c8", to: "w1-c1", type: "asset-hygiene" },

  { from: "w9-c1", to: "w9-c2", type: "dispatch" },
  { from: "w9-c2", to: "w9-c3", type: "tool-loop" },
  { from: "w9-c1", to: "w9-c4", type: "sync-loop" },
  { from: "w9-c1", to: "w9-c5", type: "mode-switcher" }
];

const dataJson = JSON.stringify(waves);
const edgesJson = JSON.stringify(edges);

const template = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nemon · Plano Completo de Code-Review Especializado</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-canvas: #09090b;
      --bg-surface: #111114;
      --bg-card: #18181b;
      --bg-card-hover: #222227;
      --border-subtle: #27272a;
      --border-strong: #3f3f46;
      --text-main: #f4f4f5;
      --text-muted: #a1a1aa;
      --text-faint: #71717a;
      --accent: #ff5500;
      --accent-glow: rgba(255, 85, 0, 0.15);
      --status-pending: #71717a;
      --status-reviewing: #eab308;
      --status-approved: #22c55e;
      --status-issues: #f97316;
      --prio-critical: #ef4444;
      --prio-high: #f97316;
      --prio-medium: #eab308;
      --prio-low: #3b82f6;
      --radius-sm: 4px;
      --radius-md: 8px;
      --radius-lg: 12px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      width: 100%;
      height: 100vh;
      max-height: 100vh;
      overflow: hidden;
      background-color: var(--bg-canvas);
      color: var(--text-main);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      display: flex;
      flex-direction: column;
    }

    header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      padding: 0.75rem 1.5rem;
      flex-shrink: 0;
      z-index: 50;
    }

    .header-content {
      max-width: 1920px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      flex-wrap: wrap;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 0.875rem;
    }

    .nemon-logo {
      width: 34px;
      height: 34px;
      display: inline-block;
      flex-shrink: 0;
    }

    .brand-title {
      font-size: 1.125rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .brand-badge {
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.15rem 0.5rem;
      background: rgba(255, 85, 0, 0.12);
      border: 1px solid rgba(255, 85, 0, 0.35);
      color: #ff7733;
      border-radius: var(--radius-sm);
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
    }

    .header-metrics {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      flex-wrap: wrap;
    }

    .stat-pill {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .stat-label {
      font-size: 0.6875rem;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .stat-value {
      font-size: 0.9375rem;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-main);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card);
      color: var(--text-main);
      transition: all 0.15s ease;
      font-family: inherit;
      user-select: none;
    }

    .btn:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-strong);
    }

    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #000000;
      font-weight: 600;
    }

    .btn-primary:hover {
      background: #ff6a1a;
      border-color: #ff6a1a;
    }

    .progress-strip {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      padding: 0.45rem 1.5rem;
      flex-shrink: 0;
    }

    .progress-wrapper {
      max-width: 1920px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .progress-bar-container {
      flex: 1;
      height: 6px;
      background: #27272a;
      border-radius: 999px;
      overflow: hidden;
      display: flex;
    }

    .progress-segment {
      height: 100%;
      transition: width 0.3s ease;
    }

    .seg-approved { background: var(--status-approved); }
    .seg-issues { background: var(--status-issues); }
    .seg-reviewing { background: var(--status-reviewing); }

    .progress-text {
      font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-muted);
      min-width: 240px;
      text-align: right;
    }

    .toolbar {
      padding: 0.65rem 1.5rem;
      background: var(--bg-canvas);
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .toolbar-container {
      max-width: 1920px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .search-box {
      position: relative;
      flex: 1;
      max-width: 380px;
    }

    .search-input {
      width: 100%;
      padding: 0.45rem 0.75rem 0.45rem 2rem;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-main);
      font-size: 0.8125rem;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }

    .search-input:focus {
      border-color: var(--accent);
    }

    .search-icon {
      position: absolute;
      left: 0.65rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-faint);
      pointer-events: none;
      font-size: 0.8125rem;
    }

    .filter-pills {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .filter-pill {
      font-size: 0.75rem;
      padding: 0.3rem 0.65rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
      background: var(--bg-surface);
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }

    .filter-pill:hover {
      background: var(--bg-card);
      color: var(--text-main);
    }

    .filter-pill.active {
      background: var(--bg-card-hover);
      border-color: var(--border-strong);
      color: #ffffff;
      font-weight: 600;
    }

    .view-toggle {
      display: flex;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 2px;
    }

    .toggle-btn {
      padding: 0.3rem 0.75rem;
      font-size: 0.75rem;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: calc(var(--radius-sm) - 2px);
      cursor: pointer;
      font-weight: 500;
    }

    .toggle-btn.active {
      background: var(--bg-card);
      color: var(--text-main);
      font-weight: 600;
    }

    main {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    /* Kanban View */
    .kanban-board {
      flex: 1;
      min-height: 0;
      height: 100%;
      display: flex;
      gap: 1rem;
      padding: 1rem 1.5rem;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .kanban-column {
      flex: 0 0 360px;
      max-width: 360px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .column-header {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      background: rgba(24, 24, 27, 0.4);
      flex-shrink: 0;
    }

    .column-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .column-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .wave-number {
      font-size: 0.6875rem;
      font-family: 'JetBrains Mono', monospace;
      padding: 0.1rem 0.35rem;
      border-radius: var(--radius-sm);
      background: var(--border-subtle);
      color: var(--text-muted);
    }

    .column-count {
      font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-faint);
    }

    .column-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
      line-height: 1.35;
    }

    .column-wave-progress {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.15rem;
    }

    .wave-bar {
      flex: 1;
      height: 4px;
      background: #27272a;
      border-radius: 999px;
      overflow: hidden;
    }

    .wave-bar-fill {
      height: 100%;
      background: var(--status-approved);
      transition: width 0.2s ease;
    }

    .wave-percent {
      font-size: 0.6875rem;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-faint);
    }

    .column-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    /* Card Item */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.875rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      position: relative;
    }

    .card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-strong);
      transform: translateY(-1px);
    }

    .card.approved { border-left: 3px solid var(--status-approved); }
    .card.issues { border-left: 3px solid var(--status-issues); }
    .card.reviewing { border-left: 3px solid var(--status-reviewing); }
    .card.pending { border-left: 3px solid var(--status-pending); }

    .card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .card-id {
      font-size: 0.6875rem;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-faint);
    }

    .card-badges {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .badge {
      font-size: 0.625rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.1rem 0.35rem;
      border-radius: var(--radius-sm);
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
    }

    .badge-prio-critical { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-prio-high { background: rgba(249, 115, 22, 0.15); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); }
    .badge-prio-medium { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
    .badge-prio-low { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }

    .card-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-main);
      line-height: 1.35;
    }

    .card-files {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .file-chip {
      font-size: 0.6875rem;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-muted);
      background: rgba(0, 0, 0, 0.25);
      padding: 0.15rem 0.35rem;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.25rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-lines {
      color: var(--text-faint);
      font-size: 0.625rem;
    }

    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding-top: 0.4rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .status-select {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
      font-size: 0.6875rem;
      padding: 0.2rem 0.4rem;
      border-radius: var(--radius-sm);
      outline: none;
      cursor: pointer;
      font-family: inherit;
    }

    .status-select.approved { color: var(--status-approved); border-color: var(--status-approved); }
    .status-select.issues { color: var(--status-issues); border-color: var(--status-issues); }
    .status-select.reviewing { color: var(--status-reviewing); border-color: var(--status-reviewing); }
    .status-select.pending { color: var(--status-pending); }

    .card-checklist-stats {
      font-size: 0.6875rem;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-faint);
    }

    /* ==========================================================================
       RICH INTERACTIVE GRAPH VIEW ENGINE (NO VOID / FULL-SCREEN)
       ========================================================================== */
    .graph-view-container {
      display: none;
      width: 100%;
      height: 100%;
      flex: 1;
      min-height: 0;
      flex-direction: column;
      background: #09090b;
      position: relative;
    }

    .graph-view-container.active {
      display: flex;
    }

    .graph-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 1.5rem;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
      z-index: 10;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .graph-controls-group {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .graph-viewport {
      flex: 1;
      min-height: 0;
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      background: #09090b;
      cursor: grab;
      user-select: none;
    }

    .graph-viewport:active {
      cursor: grabbing;
    }

    #graph-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Graph SVG Elements Styling */
    .cluster-rect {
      fill: rgba(18, 18, 22, 0.85);
      stroke-width: 1;
      rx: 8;
      transition: stroke 0.2s;
    }

    .cluster-title {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 700;
      fill: #ffffff;
    }

    .cluster-subtitle {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      fill: #a1a1aa;
    }

    /* Graph Nodes */
    .graph-node {
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.2s;
    }

    .graph-node:hover {
      filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.9));
    }

    .node-bg {
      fill: #141417;
      stroke: var(--border-subtle);
      stroke-width: 1;
      rx: 5;
      transition: all 0.2s;
    }

    .graph-node:hover .node-bg {
      stroke: var(--border-strong);
      fill: #1d1d23;
    }

    .graph-node.selected .node-bg {
      stroke: var(--accent) !important;
      stroke-width: 2 !important;
      fill: #241a15 !important;
    }

    .node-status-dot {
      r: 4;
      transition: all 0.2s;
    }

    .node-status-dot.approved { fill: var(--status-approved); filter: drop-shadow(0 0 6px rgba(34, 197, 94, 0.8)); }
    .node-status-dot.issues { fill: var(--status-issues); filter: drop-shadow(0 0 6px rgba(249, 115, 22, 0.8)); }
    .node-status-dot.reviewing { fill: var(--status-reviewing); filter: drop-shadow(0 0 6px rgba(234, 179, 8, 0.8)); }
    .node-status-dot.pending { fill: var(--status-pending); }

    .node-id-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9.5px;
      font-weight: 700;
      fill: #71717a;
    }

    .node-title-text {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: 600;
      fill: #f4f4f5;
    }

    .node-info-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5px;
      fill: #a1a1aa;
    }

    /* Graph Edges / Paths */
    .edge-path {
      fill: none;
      stroke: #333338;
      stroke-width: 1.5;
      opacity: 0.35;
      transition: stroke 0.2s, opacity 0.2s, stroke-width 0.2s;
      stroke-linecap: round;
    }

    .edge-path.highlight-out {
      stroke: var(--accent) !important;
      stroke-width: 2.5 !important;
      opacity: 1 !important;
      stroke-dasharray: 6 3;
      animation: dashPulse 1.2s linear infinite;
    }

    .edge-path.highlight-in {
      stroke: #38bdf8 !important;
      stroke-width: 2.5 !important;
      opacity: 1 !important;
      stroke-dasharray: 6 3;
      animation: dashPulse 1.2s linear infinite reverse;
    }

    .edge-path.critical-path {
      stroke: #f43f5e !important;
      stroke-width: 2.5 !important;
      opacity: 0.95 !important;
    }

    @keyframes dashPulse {
      from { stroke-dashoffset: 18; }
      to { stroke-dashoffset: 0; }
    }

    .graph-node.dimmed, .edge-path.dimmed, .cluster-box.dimmed {
      opacity: 0.08 !important;
    }

    /* Floating Graph Inspector HUD */
    .graph-hud {
      position: absolute;
      right: 1.5rem;
      bottom: 1.5rem;
      width: 360px;
      max-height: 480px;
      background: rgba(18, 18, 22, 0.94);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);
      padding: 1.25rem;
      display: none;
      flex-direction: column;
      gap: 1rem;
      z-index: 25;
      overflow-y: auto;
    }

    .graph-hud.active {
      display: flex;
    }

    .hud-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .hud-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .hud-chip {
      font-size: 0.6875rem;
      font-family: 'JetBrains Mono', monospace;
      padding: 0.15rem 0.45rem;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      cursor: pointer;
    }

    .hud-chip:hover {
      background: var(--bg-card-hover);
      color: #fff;
      border-color: var(--accent);
    }

    /* Modal / Deep-Dive Drawer */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .modal-backdrop.open {
      display: flex;
    }

    .modal-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-lg);
      max-width: 820px;
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
    }

    .modal-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }

    .modal-title-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .modal-nav-buttons {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .modal-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0.25rem;
    }

    .modal-close:hover {
      color: #ffffff;
    }

    .modal-body {
      padding: 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .section-title {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-faint);
      margin-bottom: 0.6rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .quick-status-group {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .status-btn {
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border-subtle);
      background: var(--bg-card);
      color: var(--text-muted);
      transition: all 0.15s ease;
    }

    .status-btn.active.pending { background: rgba(113, 113, 122, 0.2); border-color: var(--status-pending); color: #fff; }
    .status-btn.active.reviewing { background: rgba(234, 179, 8, 0.2); border-color: var(--status-reviewing); color: #facc15; }
    .status-btn.active.issues { background: rgba(249, 115, 22, 0.2); border-color: var(--status-issues); color: #fb923c; }
    .status-btn.active.approved { background: rgba(34, 197, 94, 0.2); border-color: var(--status-approved); color: #4ade80; }

    .checklist-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      padding: 0.65rem 0.875rem;
      border-radius: var(--radius-sm);
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }

    .checklist-item:hover {
      background: var(--bg-card-hover);
    }

    .checklist-checkbox {
      margin-top: 0.15rem;
      accent-color: var(--accent);
      width: 15px;
      height: 15px;
      cursor: pointer;
    }

    .checklist-text {
      font-size: 0.8125rem;
      line-height: 1.4;
      color: var(--text-main);
    }

    .checklist-item.checked .checklist-text {
      color: var(--text-faint);
      text-decoration: line-through;
    }

    .notes-textarea {
      width: 100%;
      min-height: 100px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.75rem;
      color: var(--text-main);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      outline: none;
      resize: vertical;
    }

    .notes-textarea:focus {
      border-color: var(--accent);
    }

    .symbols-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .symbol-chip {
      font-size: 0.6875rem;
      font-family: 'JetBrains Mono', monospace;
      background: rgba(255, 85, 0, 0.08);
      border: 1px solid rgba(255, 85, 0, 0.2);
      color: #ffaa80;
      padding: 0.2rem 0.5rem;
      border-radius: var(--radius-sm);
    }

    .modal-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      background: rgba(24, 24, 27, 0.3);
    }

    .toast-popup {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: #18181b;
      border: 1px solid var(--border-strong);
      padding: 0.75rem 1.25rem;
      border-radius: var(--radius-md);
      font-size: 0.8125rem;
      color: #fff;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      z-index: 200;
      display: none;
      align-items: center;
      gap: 0.5rem;
    }

    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg-canvas);
    }
    ::-webkit-scrollbar-thumb {
      background: var(--border-strong);
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #52525b;
    }
  </style>
</head>
<body>

  <header>
    <div class="header-content">
      <div class="brand-group">
        <svg class="nemon-logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M 50 10 A 40 40 0 1 0 90 50" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round"/>
          <path d="M 90 40 A 40 40 0 0 0 60 10" stroke="#FF5500" stroke-width="12" stroke-linecap="round"/>
        </svg>
        <div>
          <h1 class="brand-title">
            Nemon
            <span class="brand-badge">Auditoria de Código & QA · 100% Cobertura</span>
          </h1>
        </div>
      </div>

      <div class="header-metrics">
        <div class="stat-pill">
          <span class="stat-label">Progresso Geral</span>
          <span class="stat-value" id="global-progress-percent">${pctApproved}%</span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">Aprovados</span>
          <span class="stat-value" id="stat-approved-count" style="color: var(--status-approved);">${approvedCards}</span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">Em Análise</span>
          <span class="stat-value" id="stat-reviewing-count" style="color: var(--status-reviewing);">${reviewingCards}</span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">Com Ajustes</span>
          <span class="stat-value" id="stat-issues-count" style="color: var(--status-issues);">${issuesCards}</span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">Total Módulos</span>
          <span class="stat-value" id="stat-total-count">${totalCards}</span>
        </div>
        <div class="stat-pill">
          <span class="stat-label">Arquivos Mapeados</span>
          <span class="stat-value" id="stat-files-count" style="color: #60a5fa;">118</span>
        </div>
      </div>

      <div class="header-actions">
        <button class="btn" onclick="exportState()">Exportar JSON</button>
        <button class="btn" onclick="document.getElementById('import-file-input').click()">Importar JSON</button>
        <input type="file" id="import-file-input" style="display: none;" accept=".json" onchange="importState(event)" />
        <button class="btn" onclick="resetState()" title="Restaurar estado inicial">Reset</button>
      </div>
    </div>
  </header>

  <div class="progress-strip">
    <div class="progress-wrapper">
      <div class="progress-bar-container">
        <div class="progress-segment seg-approved" id="seg-approved" style="width: ${pctApprovedWidth}%;"></div>
        <div class="progress-segment seg-issues" id="seg-issues" style="width: ${pctIssues}%;"></div>
        <div class="progress-segment seg-reviewing" id="seg-reviewing" style="width: ${pctReviewing}%;"></div>
      </div>
      <div class="progress-text" id="progress-summary-text">${approvedCards} de ${totalCards} módulos aprovados (${pctApproved}%)</div>
    </div>
  </div>

  <div class="toolbar">
    <div class="toolbar-container">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="search-input" placeholder="Buscar arquivos, classes, funções ou tags..." oninput="handleSearch(this.value)" />
      </div>

      <div class="filter-pills">
        <span class="filter-pill active" data-filter="all" onclick="setFilter('all', this)">Todos</span>
        <span class="filter-pill" data-filter="pending" onclick="setFilter('pending', this)">Pendentes</span>
        <span class="filter-pill" data-filter="reviewing" onclick="setFilter('reviewing', this)">Em Análise</span>
        <span class="filter-pill" data-filter="issues" onclick="setFilter('issues', this)">Com Ajustes</span>
        <span class="filter-pill" data-filter="approved" onclick="setFilter('approved', this)">Aprovados</span>
        <span class="filter-pill" data-filter="critical" onclick="setFilter('critical', this)">🚨 Críticos</span>
      </div>

      <div class="view-toggle">
        <button class="toggle-btn active" id="btn-view-kanban" onclick="switchView('kanban')">Kanban por Ondas</button>
        <button class="toggle-btn" id="btn-view-graph" onclick="switchView('graph')">Grafo de Dependências</button>
      </div>
    </div>
  </div>

  <main>
    <!-- View 1: Kanban Board -->
    <div class="kanban-board" id="kanban-view">
      <!-- Generated via JS -->
    </div>

    <!-- View 2: Rich Dependency Graph View -->
    <div class="graph-view-container" id="graph-view">
      <div class="graph-topbar">
        <div class="graph-controls-group">
          <span style="font-size: 0.8125rem; font-weight: 600; color: #fff; margin-right: 0.5rem;">Grafo de Dependências</span>
          <button class="btn" onclick="graphZoom(1.2)" title="Aumentar Zoom">Zoom +</button>
          <button class="btn" onclick="graphZoom(0.8)" title="Diminuir Zoom">Zoom -</button>
          <button class="btn" onclick="graphFitView()" title="Ajustar à Tela">⛶ Enquadrar</button>
          <button class="btn" id="btn-toggle-critical" onclick="toggleCriticalPath()" title="Destacar Caminho Crítico">⚡ Caminho Crítico</button>
        </div>

        <div class="graph-controls-group">
          <select class="status-select" id="graph-wave-filter" onchange="filterGraphWave(this.value)" style="padding: 0.35rem 0.6rem; font-size: 0.75rem;">
            <option value="all">Todas as 9 Ondas (Visão Global)</option>
            <option value="w1">Onda 1: Infra & Config</option>
            <option value="w2">Onda 2: Tipos & Consts</option>
            <option value="w3">Onda 3: APIs & Streaming</option>
            <option value="w4">Onda 4: Code IDE & Harness</option>
            <option value="w5">Onda 5: DNA & Personas</option>
            <option value="w6">Onda 6: Chat UI & Mensagens</option>
            <option value="w7">Onda 7: Sidebar & Modais</option>
            <option value="w8">Onda 8: Utilitários & Design</option>
            <option value="w9">Onda 9: App.tsx Central</option>
          </select>
          <span style="font-size: 0.6875rem; font-family: 'JetBrains Mono', monospace; color: var(--text-faint);">Arraste o canvas livremente · Scroll para zoom</span>
        </div>
      </div>

      <div class="graph-viewport" id="graph-viewport">
        <svg id="graph-svg">
          <defs>
            <pattern id="grid-dots" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="#26262d" />
            </pattern>
            <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3f3f46" />
            </marker>
            <marker id="arrow-out" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ff5500" />
            </marker>
            <marker id="arrow-in" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
            </marker>
            <marker id="arrow-crit" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f43f5e" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-dots)" />
          <g id="graph-transform-root">
            <g id="graph-clusters-layer"></g>
            <g id="graph-edges-layer"></g>
            <g id="graph-nodes-layer"></g>
          </g>
        </svg>

        <!-- Floating Graph HUD Drawer -->
        <div class="graph-hud" id="graph-hud">
          <div class="hud-header">
            <div>
              <div style="display: flex; gap: 0.35rem; align-items: center; margin-bottom: 0.2rem;">
                <span style="font-size: 0.6875rem; font-family: 'JetBrains Mono', monospace; color: #ff7733;" id="hud-card-id">ID</span>
                <span class="badge" id="hud-card-prio">PRIO</span>
              </div>
              <h3 style="font-size: 0.875rem; font-weight: 700; color: #fff;" id="hud-card-title">Título</h3>
            </div>
            <button class="modal-close" onclick="closeGraphHud()">✕</button>
          </div>

          <div>
            <div class="section-title">Status Rápido</div>
            <div class="quick-status-group" style="gap: 0.35rem;">
              <button class="status-btn" id="hud-st-pending" onclick="setHudCardStatus('pending')">🔴</button>
              <button class="status-btn" id="hud-st-reviewing" onclick="setHudCardStatus('reviewing')">🟡</button>
              <button class="status-btn" id="hud-st-issues" onclick="setHudCardStatus('issues')">🟠</button>
              <button class="status-btn" id="hud-st-approved" onclick="setHudCardStatus('approved')">🟢</button>
            </div>
          </div>

          <div>
            <div class="section-title">Depende De (Inputs):</div>
            <div class="hud-chip-list" id="hud-inputs-list"></div>
          </div>

          <div>
            <div class="section-title">Alimenta (Outputs):</div>
            <div class="hud-chip-list" id="hud-outputs-list"></div>
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: auto;">
            <button class="btn btn-primary" style="flex: 1;" onclick="openCardModalFromHud()">📋 Abrir no Kanban</button>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Card Details Modal -->
  <div class="modal-backdrop" id="card-modal" onclick="closeModal(event)">
    <div class="modal-card" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div class="modal-title-group">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="card-id" id="modal-card-id">ID</span>
            <span class="badge" id="modal-card-prio">PRIORIDADE</span>
            <span class="badge" id="modal-card-category" style="background: rgba(255,255,255,0.1); color: #fff;">CATEGORIA</span>
          </div>
          <h2 style="font-size: 1.125rem; font-weight: 700; color: #fff;" id="modal-card-title">Título do Módulo</h2>
        </div>
        <div class="modal-nav-buttons">
          <button class="btn" onclick="navigateCard(-1)" title="Módulo Anterior">◀</button>
          <button class="btn" onclick="navigateCard(1)" title="Próximo Módulo">▶</button>
          <button class="modal-close" onclick="closeModalDirect()">✕</button>
        </div>
      </div>

      <div class="modal-body">
        <div>
          <div class="section-title">
            <span>Status da Revisão</span>
            <span id="modal-status-badge" style="font-size: 0.75rem; text-transform: none; color: var(--text-muted);"></span>
          </div>
          <div class="quick-status-group">
            <button class="status-btn pending" id="btn-st-pending" onclick="setCardStatus(currentModalCardId, 'pending')">🔴 Pendente</button>
            <button class="status-btn reviewing" id="btn-st-reviewing" onclick="setCardStatus(currentModalCardId, 'reviewing')">🟡 Em Análise</button>
            <button class="status-btn issues" id="btn-st-issues" onclick="setCardStatus(currentModalCardId, 'issues')">🟠 Ajustes Necessários</button>
            <button class="status-btn approved" id="btn-st-approved" onclick="setCardStatus(currentModalCardId, 'approved')">🟢 Aprovado</button>
          </div>
        </div>

        <div>
          <div class="section-title">Arquivos e Componentes Avaliados</div>
          <div id="modal-files-list" style="display: flex; flex-direction: column; gap: 0.4rem;"></div>
        </div>

        <div>
          <div class="section-title">Principais Símbolos, Funções & Classes</div>
          <div class="symbols-list" id="modal-symbols-list"></div>
        </div>

        <div>
          <div class="section-title">
            <span>Checklist Especializado de Verificação</span>
            <button class="btn" style="padding: 0.15rem 0.5rem; font-size: 0.6875rem;" onclick="toggleAllChecklist(currentModalCardId)">Alternar Todos</button>
          </div>
          <div class="checklist-container" id="modal-checklist-container"></div>
        </div>

        <div>
          <div class="section-title">Diretrizes de Qualidade & Engenharia</div>
          <ul id="modal-objectives-list" style="padding-left: 1.25rem; font-size: 0.8125rem; line-height: 1.6; color: var(--text-muted);"></ul>
        </div>

        <div>
          <div class="section-title">Anotações do Code Review & Achados</div>
          <textarea class="notes-textarea" id="modal-notes" placeholder="Digite observações, débitos técnicos encontrados ou melhorias a aplicar..." oninput="saveCardNotes(currentModalCardId, this.value)"></textarea>
        </div>
      </div>

      <div class="modal-footer">
        <span style="font-size: 0.75rem; color: var(--text-faint);">As alterações são salvas automaticamente no armazenamento local.</span>
        <button class="btn btn-primary" onclick="closeModalDirect()">Concluir</button>
      </div>
    </div>
  </div>

  <div class="toast-popup" id="toast-popup">Estado salvo com sucesso!</div>

  <script>
    const RAW_WAVES = ${dataJson};
    const RAW_EDGES = ${edgesJson};

    let currentFilter = 'all';
    let currentSearch = '';
    let currentModalCardId = null;
    let selectedGraphNodeId = null;
    let isCriticalPathActive = false;
    let graphFilterWave = 'all';

    const ALL_CARD_IDS = [];
    const CARD_MAP = {};
    RAW_WAVES.forEach(w => {
      w.cards.forEach(c => {
        ALL_CARD_IDS.push(c.id);
        CARD_MAP[c.id] = { ...c, waveNumber: w.number, waveId: w.id, waveColor: w.color };
      });
    });

    const defaultReviewState = {};
    RAW_WAVES.forEach(w => {
      w.cards.forEach(c => {
        const chkMap = {};
        if (c.checklist) {
          c.checklist.forEach(chk => {
            chkMap[chk.id] = !!chk.checked;
          });
        }
        defaultReviewState[c.id] = {
          status: c.status || "pending",
          checklist: chkMap,
          notes: ""
        };
      });
    });

    const STORAGE_KEY = "nemon_code_review_v2";
    let userStored = {};
    try {
      userStored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (e) {
      userStored = {};
    }

    let reviewState = JSON.parse(JSON.stringify(defaultReviewState));
    if (userStored && typeof userStored === "object") {
      Object.keys(userStored).forEach(cardId => {
        if (reviewState[cardId]) {
          reviewState[cardId].status = userStored[cardId].status || reviewState[cardId].status;
          reviewState[cardId].notes = userStored[cardId].notes || reviewState[cardId].notes;
          if (userStored[cardId].checklist) {
            reviewState[cardId].checklist = {
              ...reviewState[cardId].checklist,
              ...userStored[cardId].checklist
            };
          }
        } else {
          reviewState[cardId] = userStored[cardId];
        }
      });
    }

    function showToast(msg) {
      const el = document.getElementById('toast-popup');
      el.innerText = msg;
      el.style.display = 'flex';
      setTimeout(() => { el.style.display = 'none'; }, 2000);
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reviewState));
      updateGlobalMetrics();
      if (document.getElementById('graph-view').classList.contains('active')) {
        updateGraphNodeStatuses();
      }
    }

    function getCardData(cardId) {
      return CARD_MAP[cardId] || null;
    }

    function getCardStatus(cardId) {
      return reviewState[cardId]?.status || CARD_MAP[cardId]?.status || "pending";
    }

    function getChecklistChecked(cardId, checkId) {
      if (reviewState[cardId]?.checklist?.[checkId] !== undefined) {
        return !!reviewState[cardId].checklist[checkId];
      }
      const card = getCardData(cardId);
      const chk = card?.checklist?.find(i => i.id === checkId);
      return chk ? !!chk.checked : false;
    }

    function setCardStatus(cardId, status) {
      if (!reviewState[cardId]) reviewState[cardId] = { checklist: {}, notes: '' };
      reviewState[cardId].status = status;
      saveState();
      renderBoard();
      if (currentModalCardId === cardId) {
        updateModalStatusButtons(status);
      }
      if (selectedGraphNodeId === cardId) {
        updateHudStatusButtons(status);
      }
    }

    function updateModalStatusButtons(status) {
      document.querySelectorAll('#card-modal .status-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      const target = document.getElementById('btn-st-' + status);
      if (target) target.classList.add('active');
    }

    function updateHudStatusButtons(status) {
      document.querySelectorAll('#graph-hud .status-btn').forEach(btn => btn.classList.remove('active'));
      const target = document.getElementById('hud-st-' + status);
      if (target) target.classList.add('active');
    }

    function setHudCardStatus(status) {
      if (selectedGraphNodeId) {
        setCardStatus(selectedGraphNodeId, status);
      }
    }

    function toggleChecklistItem(cardId, checkId) {
      if (!reviewState[cardId]) reviewState[cardId] = { status: getCardStatus(cardId), checklist: {}, notes: "" };
      if (!reviewState[cardId].checklist) reviewState[cardId].checklist = {};
      const current = getChecklistChecked(cardId, checkId);
      reviewState[cardId].checklist[checkId] = !current;
      saveState();
      renderModalChecklist(cardId);
      renderBoard();
    }

    function toggleAllChecklist(cardId) {
      const card = getCardData(cardId);
      if (!card) return;
      if (!reviewState[cardId]) reviewState[cardId] = { checklist: {}, notes: '' };
      if (!reviewState[cardId].checklist) reviewState[cardId].checklist = {};
      
      const allChecked = card.checklist.every(chk => reviewState[cardId].checklist[chk.id]);
      card.checklist.forEach(chk => {
        reviewState[cardId].checklist[chk.id] = !allChecked;
      });
      saveState();
      renderModalChecklist(cardId);
      renderBoard();
    }

    function saveCardNotes(cardId, text) {
      if (!reviewState[cardId]) reviewState[cardId] = { checklist: {}, notes: '' };
      reviewState[cardId].notes = text;
      saveState();
    }

    function renderBoard() {
      const container = document.getElementById('kanban-view');
      container.innerHTML = '';

      for (const wave of RAW_WAVES) {
        const col = document.createElement('div');
        col.className = 'kanban-column';
        col.id = 'wave-col-' + wave.id;

        const filteredCards = wave.cards.filter(c => {
          const status = getCardStatus(c.id);
          if (currentFilter === 'pending' && status !== 'pending') return false;
          if (currentFilter === 'reviewing' && status !== 'reviewing') return false;
          if (currentFilter === 'issues' && status !== 'issues') return false;
          if (currentFilter === 'approved' && status !== 'approved') return false;
          if (currentFilter === 'critical' && c.priority !== 'critical') return false;

          if (currentSearch) {
            const q = currentSearch.toLowerCase();
            const matchTitle = c.title.toLowerCase().includes(q);
            const matchFiles = c.files.some(f => f.path.toLowerCase().includes(q));
            const matchSymbols = c.keySymbols.some(s => s.toLowerCase().includes(q));
            const matchCat = c.category.toLowerCase().includes(q);
            if (!matchTitle && !matchFiles && !matchSymbols && !matchCat) return false;
          }
          return true;
        });

        const waveTotal = wave.cards.length;
        const waveApproved = wave.cards.filter(c => getCardStatus(c.id) === 'approved').length;
        const wavePct = waveTotal > 0 ? Math.round((waveApproved / waveTotal) * 100) : 0;

        col.innerHTML = \`
          <div class="column-header">
            <div class="column-title-row">
              <span class="column-title">
                <span class="wave-number">O\${wave.number}</span>
                \${wave.shortTitle}
              </span>
              <span class="column-count">\${filteredCards.length}/\${wave.cards.length}</span>
            </div>
            <div class="column-desc">\${wave.desc}</div>
            <div class="column-wave-progress">
              <div class="wave-bar">
                <div class="wave-bar-fill" style="width: \${wavePct}%;"></div>
              </div>
              <span class="wave-percent">\${wavePct}%</span>
            </div>
          </div>
          <div class="column-body" id="col-body-\${wave.id}"></div>
        \`;

        const body = col.querySelector('#col-body-' + wave.id);

        for (const card of filteredCards) {
          const status = getCardStatus(card.id);
          const checkedCount = card.checklist.filter(chk => getChecklistChecked(card.id, chk.id)).length;
          const totalCheck = card.checklist.length;

          const cardEl = document.createElement('div');
          cardEl.className = \`card \${status}\`;
          cardEl.onclick = () => openCardModal(card.id);

          const prioClass = \`badge-prio-\${card.priority}\`;
          const prioLabel = card.priority.toUpperCase();

          let filesHtml = card.files.map(f => \`
            <div class="file-chip">
              <span>\${f.path.split('/').pop()}</span>
              <span class="file-lines">\${f.lines} lin</span>
            </div>
          \`).join('');

          cardEl.innerHTML = \`
            <div class="card-top">
              <span class="card-id">\${card.id}</span>
              <div class="card-badges">
                <span class="badge \${prioClass}">\${prioLabel}</span>
              </div>
            </div>
            <div class="card-title">\${card.title}</div>
            <div class="card-files">\${filesHtml}</div>
            <div class="card-footer" onclick="event.stopPropagation()">
              <select class="status-select \${status}" onchange="setCardStatus('\${card.id}', this.value)">
                <option value="pending" \${status === 'pending' ? 'selected' : ''}>🔴 Pendente</option>
                <option value="reviewing" \${status === 'reviewing' ? 'selected' : ''}>🟡 Em Análise</option>
                <option value="issues" \${status === 'issues' ? 'selected' : ''}>🟠 Ajustes</option>
                <option value="approved" \${status === 'approved' ? 'selected' : ''}>🟢 Aprovado</option>
              </select>
              <span class="card-checklist-stats">\${checkedCount}/\${totalCheck} chks</span>
            </div>
          \`;

          body.appendChild(cardEl);
        }

        container.appendChild(col);
      }

      updateGlobalMetrics();
    }

    function updateGlobalMetrics() {
      let total = 0;
      let approved = 0;
      let reviewing = 0;
      let issues = 0;

      for (const wave of RAW_WAVES) {
        for (const card of wave.cards) {
          total++;
          const st = getCardStatus(card.id);
          if (st === 'approved') approved++;
          else if (st === 'reviewing') reviewing++;
          else if (st === 'issues') issues++;
        }
      }

      const pctApproved = total > 0 ? Math.round((approved / total) * 100) : 0;
      const pctIssues = total > 0 ? (issues / total) * 100 : 0;
      const pctReviewing = total > 0 ? (reviewing / total) * 100 : 0;
      const pctAppWidth = total > 0 ? (approved / total) * 100 : 0;

      document.getElementById('global-progress-percent').innerText = pctApproved + '%';
      document.getElementById('stat-approved-count').innerText = approved;
      document.getElementById('stat-reviewing-count').innerText = reviewing;
      document.getElementById('stat-issues-count').innerText = issues;
      document.getElementById('stat-total-count').innerText = total;

      document.getElementById('seg-approved').style.width = pctAppWidth + '%';
      document.getElementById('seg-issues').style.width = pctIssues + '%';
      document.getElementById('seg-reviewing').style.width = pctReviewing + '%';

      document.getElementById('progress-summary-text').innerText = \`\${approved} de \${total} módulos aprovados (\${pctApproved}%)\`;
    }

    function handleSearch(val) {
      currentSearch = val;
      renderBoard();
      if (document.getElementById('graph-view').classList.contains('active')) {
        highlightGraphSearch(val);
      }
    }

    function setFilter(filter, el) {
      currentFilter = filter;
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
      renderBoard();
    }

    function switchView(mode) {
      if (mode === 'kanban') {
        document.getElementById('kanban-view').style.display = 'flex';
        document.getElementById('graph-view').classList.remove('active');
        document.getElementById('btn-view-kanban').classList.add('active');
        document.getElementById('btn-view-graph').classList.remove('active');
      } else {
        document.getElementById('kanban-view').style.display = 'none';
        document.getElementById('graph-view').classList.add('active');
        document.getElementById('btn-view-kanban').classList.remove('active');
        document.getElementById('btn-view-graph').classList.add('active');
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (!hasRenderedGraph) {
              initInteractiveGraph();
            } else {
              graphFitView();
            }
          }, 30);
        });
      }
    }

    function focusWave(waveId) {
      switchView('kanban');
      const el = document.getElementById('wave-col-' + waveId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', inline: 'center' });
      }
    }

    function openCardModal(cardId) {
      currentModalCardId = cardId;
      const card = getCardData(cardId);
      if (!card) return;

      document.getElementById('modal-card-id').innerText = card.id;
      document.getElementById('modal-card-title').innerText = card.title;
      document.getElementById('modal-card-category').innerText = card.category;
      
      const prioBadge = document.getElementById('modal-card-prio');
      prioBadge.className = 'badge badge-prio-' + card.priority;
      prioBadge.innerText = card.priority.toUpperCase();

      updateModalStatusButtons(getCardStatus(cardId));

      const filesContainer = document.getElementById('modal-files-list');
      filesContainer.innerHTML = card.files.map(f => \`
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.8125rem;">
          <div style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #fff; margin-bottom: 0.2rem;">\${f.path} <span style="color: var(--text-faint); font-size: 0.75rem;">(\${f.lines} linhas)</span></div>
          <div style="color: var(--text-muted); font-size: 0.75rem;">\${f.desc}</div>
        </div>
      \`).join('');

      const symContainer = document.getElementById('modal-symbols-list');
      symContainer.innerHTML = card.keySymbols.map(s => \`
        <span class="symbol-chip">\${s}</span>
      \`).join('');

      renderModalChecklist(cardId);

      const objContainer = document.getElementById('modal-objectives-list');
      objContainer.innerHTML = card.objectives.map(o => \`<li>\${o}</li>\`).join('');

      document.getElementById('modal-notes').value = reviewState[cardId]?.notes || '';

      document.getElementById('card-modal').classList.add('open');
    }

    function navigateCard(delta) {
      if (!currentModalCardId) return;
      const idx = ALL_CARD_IDS.indexOf(currentModalCardId);
      if (idx === -1) return;
      let nextIdx = idx + delta;
      if (nextIdx < 0) nextIdx = ALL_CARD_IDS.length - 1;
      if (nextIdx >= ALL_CARD_IDS.length) nextIdx = 0;
      openCardModal(ALL_CARD_IDS[nextIdx]);
    }

    function renderModalChecklist(cardId) {
      const card = getCardData(cardId);
      if (!card) return;
      const chkContainer = document.getElementById('modal-checklist-container');
      chkContainer.innerHTML = card.checklist.map(chk => {
        const isChecked = getChecklistChecked(cardId, chk.id);
        return \`
          <div class="checklist-item \${isChecked ? 'checked' : ''}" onclick="toggleChecklistItem('\${cardId}', '\${chk.id}')">
            <input type="checkbox" class="checklist-checkbox" \${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleChecklistItem('\${cardId}', '\${chk.id}')" />
            <span class="checklist-text">\${chk.text}</span>
          </div>
        \`;
      }).join('');
    }

    function closeModal(e) {
      if (e.target === document.getElementById('card-modal')) {
        closeModalDirect();
      }
    }

    function closeModalDirect() {
      document.getElementById('card-modal').classList.remove('open');
      currentModalCardId = null;
    }

    function exportState() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reviewState, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "nemon_code_review_progress.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Arquivo de progresso exportado!');
    }

    function importState(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const imported = JSON.parse(e.target.result);
          reviewState = imported;
          saveState();
          renderBoard();
          showToast('Progresso importado com sucesso!');
        } catch (err) {
          alert('Erro ao importar JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    }

    function resetState() {
      if (confirm("Deseja restaurar o progresso para o baseline verificado pelo code review?")) {
        localStorage.removeItem(STORAGE_KEY);
        reviewState = JSON.parse(JSON.stringify(defaultReviewState));
        saveState();
        renderBoard();
        showToast("Progresso restaurado para o baseline auditado!");
      }
    }

    /* ==========================================================================
       INTERACTIVE GRAPH LOGIC & RENDERING (COMPACT 2-COLUMN CLUSTER ARCHITECTURE)
       ========================================================================== */
    let hasRenderedGraph = false;
    let graphZoomScale = 0.55;
    let graphPanX = 50;
    let graphPanY = 40;
    let isPanning = false;
    let startPointerX = 0;
    let startPointerY = 0;

    const NODE_WIDTH = 210;
    const NODE_HEIGHT = 52;
    const NODE_GAP_X = 10;
    const NODE_GAP_Y = 8;
    const CLUSTER_GAP_X = 60;

    const nodePositions = {};
    const clusterPositions = {};

    function initInteractiveGraph() {
      hasRenderedGraph = true;
      calculateGraphLayout();
      renderGraphElements();
      setupGraphPanZoom();
      updateGraphNodeStatuses();
      graphFitView();
    }

    function calculateGraphLayout() {
      let currentClusterX = 40;
      const clusterY = 40;

      RAW_WAVES.forEach((wave, waveIdx) => {
        const count = wave.cards.length;
        const useTwoCols = count > 5;
        const numCols = useTwoCols ? 2 : 1;
        const numRows = Math.ceil(count / numCols);

        const clusterWidth = numCols === 2 ? (NODE_WIDTH * 2 + NODE_GAP_X + 24) : (NODE_WIDTH + 24);
        const clusterHeight = 65 + numRows * (NODE_HEIGHT + NODE_GAP_Y) + 12;

        clusterPositions[wave.id] = {
          x: currentClusterX,
          y: clusterY,
          width: clusterWidth,
          height: clusterHeight,
          wave: wave
        };

        wave.cards.forEach((card, cardIdx) => {
          const c = useTwoCols ? (cardIdx % 2) : 0;
          const r = useTwoCols ? Math.floor(cardIdx / 2) : cardIdx;

          const nx = currentClusterX + 12 + c * (NODE_WIDTH + NODE_GAP_X);
          const ny = clusterY + 62 + r * (NODE_HEIGHT + NODE_GAP_Y);

          nodePositions[card.id] = {
            x: nx,
            y: ny,
            waveId: wave.id,
            waveIndex: waveIdx,
            color: wave.color,
            card: card
          };
        });

        currentClusterX += clusterWidth + CLUSTER_GAP_X;
      });
    }

    function renderGraphElements() {
      const clustersLayer = document.getElementById('graph-clusters-layer');
      const edgesLayer = document.getElementById('graph-edges-layer');
      const nodesLayer = document.getElementById('graph-nodes-layer');

      clustersLayer.innerHTML = '';
      edgesLayer.innerHTML = '';
      nodesLayer.innerHTML = '';

      // 1. Render Wave Clusters
      Object.keys(clusterPositions).forEach(waveId => {
        const cpos = clusterPositions[waveId];
        const wave = cpos.wave;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'cluster-box');
        g.setAttribute('id', 'cluster-' + wave.id);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', cpos.x);
        rect.setAttribute('y', cpos.y);
        rect.setAttribute('width', cpos.width);
        rect.setAttribute('height', cpos.height);
        rect.setAttribute('class', 'cluster-rect');
        rect.setAttribute('stroke', wave.color);
        rect.setAttribute('stroke-opacity', '0.35');

        // Header accent bar inside cluster
        const headerBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        headerBar.setAttribute('x', cpos.x);
        headerBar.setAttribute('y', cpos.y);
        headerBar.setAttribute('width', cpos.width);
        headerBar.setAttribute('height', 4);
        headerBar.setAttribute('fill', wave.color);
        headerBar.setAttribute('rx', 2);

        const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        title.setAttribute('x', cpos.x + 14);
        title.setAttribute('y', cpos.y + 26);
        title.setAttribute('class', 'cluster-title');
        title.textContent = \`Onda \${wave.number}: \${wave.shortTitle}\`;

        const totalLinesInWave = wave.cards.reduce((sum, cd) => sum + cd.files.reduce((fsum, f) => fsum + f.lines, 0), 0);
        const subtitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        subtitle.setAttribute('x', cpos.x + 14);
        subtitle.setAttribute('y', cpos.y + 44);
        subtitle.setAttribute('class', 'cluster-subtitle');
        subtitle.textContent = \`\${wave.cards.length} módulos · \${totalLinesInWave} linhas de código\`;

        g.appendChild(rect);
        g.appendChild(headerBar);
        g.appendChild(title);
        g.appendChild(subtitle);
        clustersLayer.appendChild(g);
      });

      // 2. Render Edges (Cubic Beziers)
      RAW_EDGES.forEach((edge) => {
        const src = nodePositions[edge.from];
        const tgt = nodePositions[edge.to];
        if (!src || !tgt) return;

        const x1 = src.x + NODE_WIDTH;
        const y1 = src.y + NODE_HEIGHT / 2;
        const x2 = tgt.x;
        const y2 = tgt.y + NODE_HEIGHT / 2;

        const dx = Math.abs(x2 - x1);
        const cx1 = x1 + Math.max(dx * 0.35, 30);
        const cx2 = x2 - Math.max(dx * 0.35, 30);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = \`M \${x1} \${y1} C \${cx1} \${y1}, \${cx2} \${y2}, \${x2} \${y2}\`;
        path.setAttribute('d', d);
        path.setAttribute('class', 'edge-path');
        path.setAttribute('id', \`edge-\${edge.from}-\${edge.to}\`);
        path.setAttribute('data-from', edge.from);
        path.setAttribute('data-to', edge.to);
        path.setAttribute('data-type', edge.type);
        path.setAttribute('marker-end', 'url(#arrow-default)');
        edgesLayer.appendChild(path);
      });

      // 3. Render Nodes
      Object.keys(nodePositions).forEach(cardId => {
        const pos = nodePositions[cardId];
        const card = pos.card;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'graph-node');
        g.setAttribute('id', 'node-' + cardId);
        g.setAttribute('data-id', cardId);
        g.setAttribute('data-wave', pos.waveId);
        g.setAttribute('transform', \`translate(\${pos.x}, \${pos.y})\`);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', NODE_WIDTH);
        rect.setAttribute('height', NODE_HEIGHT);
        rect.setAttribute('class', 'node-bg');

        const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bar.setAttribute('x', 0);
        bar.setAttribute('y', 0);
        bar.setAttribute('width', 3.5);
        bar.setAttribute('height', NODE_HEIGHT);
        bar.setAttribute('fill', pos.color);
        bar.setAttribute('rx', 1.5);

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', 14);
        dot.setAttribute('cy', 16);
        dot.setAttribute('class', 'node-status-dot pending');
        dot.setAttribute('id', 'dot-' + cardId);

        const idText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        idText.setAttribute('x', 24);
        idText.setAttribute('y', 19);
        idText.setAttribute('class', 'node-id-text');
        idText.textContent = cardId;

        const prioText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        prioText.setAttribute('x', NODE_WIDTH - 10);
        prioText.setAttribute('y', 19);
        prioText.setAttribute('text-anchor', 'end');
        prioText.setAttribute('class', 'node-id-text');
        prioText.setAttribute('fill', card.priority === 'critical' ? '#f87171' : (card.priority === 'high' ? '#fb923c' : '#a1a1aa'));
        prioText.textContent = card.priority.slice(0, 4).toUpperCase();

        const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleText.setAttribute('x', 12);
        titleText.setAttribute('y', 35);
        titleText.setAttribute('class', 'node-title-text');
        titleText.textContent = card.title.length > 25 ? card.title.slice(0, 24) + '…' : card.title;

        const primaryFile = card.files[0] ? card.files[0].path.split('/').pop() : '';
        const totalLines = card.files.reduce((acc, f) => acc + f.lines, 0);
        const infoText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        infoText.setAttribute('x', 12);
        infoText.setAttribute('y', 46);
        infoText.setAttribute('class', 'node-info-text');
        infoText.textContent = \`\${primaryFile} (\${totalLines} l)\`;

        g.appendChild(rect);
        g.appendChild(bar);
        g.appendChild(dot);
        g.appendChild(idText);
        g.appendChild(prioText);
        g.appendChild(titleText);
        g.appendChild(infoText);

        g.addEventListener('mouseenter', () => highlightNodeConnections(cardId));
        g.addEventListener('mouseleave', () => resetGraphHighlight());
        g.addEventListener('click', (e) => {
          e.stopPropagation();
          selectGraphNode(cardId);
        });

        nodesLayer.appendChild(g);
      });

      applyGraphTransform();
    }

    function updateGraphNodeStatuses() {
      Object.keys(nodePositions).forEach(cardId => {
        const dot = document.getElementById('dot-' + cardId);
        if (dot) {
          const st = getCardStatus(cardId);
          dot.setAttribute('class', 'node-status-dot ' + st);
        }
      });
    }

    function highlightNodeConnections(cardId) {
      document.querySelectorAll('.graph-node').forEach(n => {
        if (n.getAttribute('data-id') !== cardId) {
          n.classList.add('dimmed');
        }
      });
      document.querySelectorAll('.edge-path').forEach(p => p.classList.add('dimmed'));
      document.querySelectorAll('.cluster-box').forEach(c => c.classList.add('dimmed'));

      const incomingNodes = new Set();
      const outgoingNodes = new Set();

      document.querySelectorAll('.edge-path').forEach(path => {
        const from = path.getAttribute('data-from');
        const to = path.getAttribute('data-to');

        if (from === cardId) {
          path.classList.remove('dimmed');
          path.classList.add('highlight-out');
          path.setAttribute('marker-end', 'url(#arrow-out)');
          outgoingNodes.add(to);
        } else if (to === cardId) {
          path.classList.remove('dimmed');
          path.classList.add('highlight-in');
          path.setAttribute('marker-end', 'url(#arrow-in)');
          incomingNodes.add(from);
        }
      });

      incomingNodes.forEach(id => {
        const el = document.getElementById('node-' + id);
        if (el) el.classList.remove('dimmed');
      });

      outgoingNodes.forEach(id => {
        const el = document.getElementById('node-' + id);
        if (el) el.classList.remove('dimmed');
      });

      const selfNode = document.getElementById('node-' + cardId);
      if (selfNode) selfNode.classList.remove('dimmed');

      const waveId = nodePositions[cardId]?.waveId;
      const selfCluster = document.getElementById('cluster-' + waveId);
      if (selfCluster) selfCluster.classList.remove('dimmed');
    }

    function resetGraphHighlight() {
      if (selectedGraphNodeId) {
        highlightNodeConnections(selectedGraphNodeId);
        return;
      }
      document.querySelectorAll('.graph-node').forEach(n => n.classList.remove('dimmed'));
      document.querySelectorAll('.edge-path').forEach(p => {
        p.classList.remove('dimmed', 'highlight-out', 'highlight-in');
        p.setAttribute('marker-end', 'url(#arrow-default)');
      });
      document.querySelectorAll('.cluster-box').forEach(c => c.classList.remove('dimmed'));

      if (isCriticalPathActive) {
        highlightCriticalPath();
      }
    }

    function selectGraphNode(cardId) {
      selectedGraphNodeId = cardId;
      document.querySelectorAll('.graph-node').forEach(n => n.classList.remove('selected'));
      const el = document.getElementById('node-' + cardId);
      if (el) el.classList.add('selected');

      highlightNodeConnections(cardId);
      openGraphHud(cardId);
    }

    function openGraphHud(cardId) {
      const card = getCardData(cardId);
      if (!card) return;

      document.getElementById('hud-card-id').innerText = card.id;
      document.getElementById('hud-card-title').innerText = card.title;
      
      const prio = document.getElementById('hud-card-prio');
      prio.className = 'badge badge-prio-' + card.priority;
      prio.innerText = card.priority.toUpperCase();

      updateHudStatusButtons(getCardStatus(cardId));

      const inputs = RAW_EDGES.filter(e => e.to === cardId);
      const outputs = RAW_EDGES.filter(e => e.from === cardId);

      const inputsList = document.getElementById('hud-inputs-list');
      if (inputs.length === 0) {
        inputsList.innerHTML = '<span style="font-size: 0.6875rem; color: var(--text-faint);">Módulo Raiz (sem dependências)</span>';
      } else {
        inputsList.innerHTML = inputs.map(e => \`
          <span class="hud-chip" onclick="selectGraphNode('\${e.from}')">\${e.from} (\${e.type})</span>
        \`).join('');
      }

      const outputsList = document.getElementById('hud-outputs-list');
      if (outputs.length === 0) {
        outputsList.innerHTML = '<span style="font-size: 0.6875rem; color: var(--text-faint);">Terminal (não alimenta outros)</span>';
      } else {
        outputsList.innerHTML = outputs.map(e => \`
          <span class="hud-chip" onclick="selectGraphNode('\${e.to}')">\${e.to} (\${e.type})</span>
        \`).join('');
      }

      document.getElementById('graph-hud').classList.add('active');
    }

    function closeGraphHud() {
      document.getElementById('graph-hud').classList.remove('active');
      selectedGraphNodeId = null;
      resetGraphHighlight();
    }

    function openCardModalFromHud() {
      if (selectedGraphNodeId) {
        openCardModal(selectedGraphNodeId);
      }
    }

    function toggleCriticalPath() {
      isCriticalPathActive = !isCriticalPathActive;
      const btn = document.getElementById('btn-toggle-critical');
      if (isCriticalPathActive) {
        btn.classList.add('active');
        btn.style.background = 'rgba(244, 63, 94, 0.2)';
        btn.style.borderColor = '#f43f5e';
        btn.style.color = '#f43f5e';
        highlightCriticalPath();
      } else {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        resetGraphHighlight();
      }
    }

    function highlightCriticalPath() {
      const CRITICAL_NODES = new Set([
        'w1-c1', 'w1-c2', 'w1-c9',
        'w2-c1', 'w2-c4',
        'w3-c1', 'w3-c6',
        'w4-c1', 'w4-c4', 'w4-c6',
        'w6-c1', 'w6-c4',
        'w9-c1', 'w9-c2', 'w9-c5'
      ]);

      document.querySelectorAll('.graph-node').forEach(n => {
        const id = n.getAttribute('data-id');
        if (!CRITICAL_NODES.has(id)) {
          n.classList.add('dimmed');
        } else {
          n.classList.remove('dimmed');
        }
      });

      document.querySelectorAll('.edge-path').forEach(p => {
        const from = p.getAttribute('data-from');
        const to = p.getAttribute('data-to');
        if (CRITICAL_NODES.has(from) && CRITICAL_NODES.has(to)) {
          p.classList.remove('dimmed');
          p.classList.add('critical-path');
          p.setAttribute('marker-end', 'url(#arrow-crit)');
        } else {
          p.classList.add('dimmed');
        }
      });
    }

    function filterGraphWave(waveId) {
      graphFilterWave = waveId;
      if (waveId === 'all') {
        document.querySelectorAll('.graph-node, .cluster-box, .edge-path').forEach(el => el.classList.remove('dimmed'));
        graphFitView();
        return;
      }

      document.querySelectorAll('.cluster-box').forEach(c => {
        if (c.id === 'cluster-' + waveId) c.classList.remove('dimmed');
        else c.classList.add('dimmed');
      });

      document.querySelectorAll('.graph-node').forEach(n => {
        if (n.getAttribute('data-wave') === waveId) n.classList.remove('dimmed');
        else n.classList.add('dimmed');
      });

      document.querySelectorAll('.edge-path').forEach(p => {
        const from = p.getAttribute('data-from');
        const to = p.getAttribute('data-to');
        const srcWave = nodePositions[from]?.waveId;
        const tgtWave = nodePositions[to]?.waveId;
        if (srcWave === waveId || tgtWave === waveId) p.classList.remove('dimmed');
        else p.classList.add('dimmed');
      });

      // Pan directly to focused cluster
      const cpos = clusterPositions[waveId];
      if (cpos) {
        const viewport = document.getElementById('graph-viewport');
        const rect = viewport.getBoundingClientRect();
        graphZoomScale = Math.min(rect.width / (cpos.width + 120), rect.height / (cpos.height + 120), 1.2);
        graphPanX = (rect.width - cpos.width * graphZoomScale) / 2 - cpos.x * graphZoomScale;
        graphPanY = (rect.height - cpos.height * graphZoomScale) / 2 - cpos.y * graphZoomScale;
        applyGraphTransform();
      }
    }

    function highlightGraphSearch(q) {
      if (!q) {
        resetGraphHighlight();
        return;
      }
      const query = q.toLowerCase();
      document.querySelectorAll('.graph-node').forEach(n => {
        const id = n.getAttribute('data-id');
        const card = getCardData(id);
        if (!card) return;

        const match = card.title.toLowerCase().includes(query) ||
                      card.id.toLowerCase().includes(query) ||
                      card.files.some(f => f.path.toLowerCase().includes(query)) ||
                      card.keySymbols.some(s => s.toLowerCase().includes(query));

        if (match) n.classList.remove('dimmed');
        else n.classList.add('dimmed');
      });
    }

    function setupGraphPanZoom() {
      const viewport = document.getElementById('graph-viewport');

      viewport.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.graph-hud')) return;
        isPanning = true;
        startPointerX = e.clientX - graphPanX;
        startPointerY = e.clientY - graphPanY;
      });

      window.addEventListener('pointermove', (e) => {
        if (!isPanning) return;
        graphPanX = e.clientX - startPointerX;
        graphPanY = e.clientY - startPointerY;
        applyGraphTransform();
      });

      window.addEventListener('pointerup', () => { isPanning = false; });
      window.addEventListener('pointercancel', () => { isPanning = false; });

      viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.88;
        graphZoom(factor, e.clientX, e.clientY);
      }, { passive: false });

      viewport.addEventListener('click', (e) => {
        if (e.target.closest('.graph-node') || e.target.closest('.graph-hud')) return;
        closeGraphHud();
      });
    }

    function graphZoom(factor, centerX, centerY) {
      const newScale = Math.min(Math.max(graphZoomScale * factor, 0.15), 3.0);
      const viewport = document.getElementById('graph-viewport');
      const rect = viewport.getBoundingClientRect();
      const cx = centerX !== undefined ? centerX - rect.left : rect.width / 2;
      const cy = centerY !== undefined ? centerY - rect.top : rect.height / 2;

      graphPanX = cx - (cx - graphPanX) * (newScale / graphZoomScale);
      graphPanY = cy - (cy - graphPanY) * (newScale / graphZoomScale);
      graphZoomScale = newScale;

      applyGraphTransform();
    }

    function graphFitView() {
      const viewport = document.getElementById('graph-viewport');
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const clusterKeys = Object.keys(clusterPositions);
      if (clusterKeys.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      clusterKeys.forEach(k => {
        const c = clusterPositions[k];
        if (c.x < minX) minX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.x + c.width > maxX) maxX = c.x + c.width;
        if (c.y + c.height > maxY) maxY = c.y + c.height;
      });

      const bboxWidth = maxX - minX;
      const bboxHeight = maxY - minY;
      const padding = 45;

      const scaleX = (rect.width - padding * 2) / bboxWidth;
      const scaleY = (rect.height - padding * 2) / bboxHeight;
      graphZoomScale = Math.max(0.15, Math.min(scaleX, scaleY, 1.0));

      graphPanX = (rect.width - bboxWidth * graphZoomScale) / 2 - minX * graphZoomScale;
      graphPanY = (rect.height - bboxHeight * graphZoomScale) / 2 - minY * graphZoomScale;

      applyGraphTransform();
    }

    function applyGraphTransform() {
      const root = document.getElementById('graph-transform-root');
      if (root) {
        root.setAttribute('transform', \`translate(\${graphPanX}, \${graphPanY}) scale(\${graphZoomScale})\`);
      }
    }

    window.addEventListener('resize', () => {
      if (document.getElementById('graph-view').classList.contains('active')) {
        graphFitView();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (document.getElementById('card-modal').classList.contains('open')) {
        if (e.key === 'Escape') {
          closeModalDirect();
        } else if (e.key === 'ArrowLeft' && e.altKey) {
          navigateCard(-1);
        } else if (e.key === 'ArrowRight' && e.altKey) {
          navigateCard(1);
        }
      } else if (e.key === 'Escape' && document.getElementById('graph-hud').classList.contains('active')) {
        closeGraphHud();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('search-input').focus();
      }
    });

    renderBoard();
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'code_review_kanban.html'), template, 'utf8');
console.log('Successfully recompiled code_review_kanban.html with fixed full-screen graph! Size: ' + template.length + ' bytes.');
