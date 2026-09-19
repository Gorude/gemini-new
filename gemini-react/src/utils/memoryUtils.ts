import { v4 as uuidv4 } from 'uuid';
import type { MemoryFact, PendingMemoryUpdate } from '../types';

/**
 * Normaliza um texto para comparação, removendo pontuações, espaços extras e acentos.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifica se um novo fato já existe (ou é substancialmente idêntico) na memória atual.
 */
export function isDuplicateMemory(existing: MemoryFact[], newText: string): boolean {
  const normNew = normalizeText(newText);
  if (!normNew) return true;

  return existing.some(fact => {
    const normExisting = normalizeText(fact.text);
    return normExisting === normNew;
  });
}

export interface ParsedMemoryResult {
  cleanText: string;
  proposals: PendingMemoryUpdate[];
  autoDeletes: string[];
}

/**
 * Analisa as tags de memória na resposta da IA e extrai propostas para confirmação visual:
 * - <MEMORY>: Proposta de novo fato (isNew = true, oldText = '').
 * - <UPDATE_MEMORY>: Proposta de atualização/contradição (isNew = false, oldText preenchido).
 * - <DELETE_MEMORY>: Remoção de fatos obsoletos por ID.
 */
export function parseAllMemoryProposals(str: string, currentFacts: MemoryFact[]): ParsedMemoryResult {
  const memoryTagRegex = /<MEMORY(?:\s+category=['"]([^'"]*)['"])?(?:\s+connections=['"]([^'"]*)['"])?>\s*([\s\S]*?)\s*<\/MEMORY>/g;
  const updateTagRegex = /<UPDATE_MEMORY\s+id=['"]([^'"]*)['"](?:\s+category=['"]([^'"]*)['"])?>\s*([\s\S]*?)\s*<\/UPDATE_MEMORY>/g;
  const deleteTagRegex = /<DELETE_MEMORY\s+id=['"]([^'"]*?)['"]\s*\/>/g;

  const proposals: PendingMemoryUpdate[] = [];
  const autoDeletes: string[] = [];
  const seenNewTexts = new Set<string>();

  // 1. Extração de novos fatos (<MEMORY>)
  let match: RegExpExecArray | null;
  while ((match = memoryTagRegex.exec(str)) !== null) {
    const categoryValue = match[1]?.trim() || 'Diversos';
    const connectionsValue = match[2] ? match[2].split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    const textValue = match[3]?.trim();

    if (textValue && !isDuplicateMemory(currentFacts, textValue)) {
      const norm = normalizeText(textValue);
      if (!seenNewTexts.has(norm)) {
        seenNewTexts.add(norm);
        proposals.push({
          id: uuidv4(),
          category: categoryValue,
          oldText: '',
          newText: textValue,
          connections: connectionsValue,
          isNew: true
        });
      }
    }
  }

  // 2. Extração de contradições / atualizações (<UPDATE_MEMORY>)
  updateTagRegex.lastIndex = 0;
  while ((match = updateTagRegex.exec(str)) !== null) {
    const idValue = match[1]?.trim();
    const categoryValue = match[2]?.trim();
    const textValue = match[3]?.trim();

    if (!idValue || !textValue) continue;

    const oldFact = currentFacts.find(m => m.id === idValue);
    if (oldFact) {
      if (oldFact.text.trim() !== textValue) {
        proposals.push({
          id: idValue,
          category: categoryValue || oldFact.category || 'Diversos',
          oldText: oldFact.text,
          newText: textValue,
          isNew: false
        });
      }
    } else {
      // Se o modelo alucinou um ID inexistente mas enviou atualização, propõe como novo fato
      if (!isDuplicateMemory(currentFacts, textValue)) {
        proposals.push({
          id: uuidv4(),
          category: categoryValue || 'Diversos',
          oldText: '',
          newText: textValue,
          isNew: true
        });
      }
    }
  }

  // 3. Extração de deleções (<DELETE_MEMORY>)
  deleteTagRegex.lastIndex = 0;
  while ((match = deleteTagRegex.exec(str)) !== null) {
    const idValue = match[1]?.trim();
    if (idValue) {
      autoDeletes.push(idValue);
    }
  }

  // 4. Limpeza de todas as tags do texto final para exibição ao usuário
  const cleanText = str
    .replace(memoryTagRegex, '')
    .replace(updateTagRegex, '')
    .replace(deleteTagRegex, '')
    .trim();

  return { cleanText, proposals, autoDeletes };
}

/**
 * Formata o contexto de memórias DNA para injeção no prompt de sistema,
 * impondo limites rígidos e ordenação para prevenir sobrecarga de contexto e latência.
 */
export function formatMemoryContext(facts: MemoryFact[], maxFacts: number = 40): string {
  if (!facts || facts.length === 0) return '';

  // Ordena prioritariamente os fatos mais recentes
  const sorted = [...facts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const slice = sorted.slice(0, maxFacts);

  return slice
    .map(f => `- [ID: ${f.id}] [Categoria: ${f.category || 'Diversos'}] ${f.text}`)
    .join('\n');
}
