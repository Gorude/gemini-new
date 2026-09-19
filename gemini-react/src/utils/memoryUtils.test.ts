import { describe, it, expect } from 'vitest';
import { isDuplicateMemory, parseAllMemoryProposals, formatMemoryContext } from './memoryUtils';
import type { MemoryFact } from '../types';

describe('memoryUtils', () => {
  const existingFacts: MemoryFact[] = [
    { id: '1', text: 'O usuário estuda ADS no IFMS', category: 'ESTUDOS', connections: [], timestamp: 1000 },
    { id: '2', text: 'O usuário tem 19 anos', category: 'PERFIL', connections: [], timestamp: 2000 }
  ];

  it('detecta duplicatas idênticas e normalizadas', () => {
    expect(isDuplicateMemory(existingFacts, 'O usuário estuda ADS no IFMS')).toBe(true);
    expect(isDuplicateMemory(existingFacts, 'o usuario estuda ads no ifms!')).toBe(true);
    expect(isDuplicateMemory(existingFacts, 'O usuário trabalha como programador')).toBe(false);
  });

  it('extrai propostas de novos fatos (<MEMORY>) com isNew = true e oldText vazio', () => {
    const rawAiText = `
      Que ótimo saber disso!
      <MEMORY category="CARREIRA">O usuário atua como desenvolvedor de software</MEMORY>
      Vou me lembrar disso.
    `;

    const { cleanText, proposals } = parseAllMemoryProposals(rawAiText, existingFacts);

    expect(cleanText).not.toContain('<MEMORY>');
    expect(cleanText).toContain('Que ótimo saber disso!');
    expect(proposals.length).toBe(1);
    expect(proposals[0].isNew).toBe(true);
    expect(proposals[0].oldText).toBe('');
    expect(proposals[0].newText).toBe('O usuário atua como desenvolvedor de software');
    expect(proposals[0].category).toBe('CARREIRA');
  });

  it('extrai propostas de contradição (<UPDATE_MEMORY>) com isNew = false e oldText populado', () => {
    const rawAiText = `
      Parabéns pelo aniversário!
      <UPDATE_MEMORY id="2" category="PERFIL">O usuário tem 20 anos</UPDATE_MEMORY>
      Idade atualizada.
    `;

    const { cleanText, proposals } = parseAllMemoryProposals(rawAiText, existingFacts);

    expect(cleanText).not.toContain('<UPDATE_MEMORY>');
    expect(proposals.length).toBe(1);
    expect(proposals[0].isNew).toBe(false);
    expect(proposals[0].id).toBe('2');
    expect(proposals[0].oldText).toBe('O usuário tem 19 anos');
    expect(proposals[0].newText).toBe('O usuário tem 20 anos');
  });

  it('ignora tags <MEMORY> que sejam duplicatas exatas de fatos existentes', () => {
    const rawAiText = `
      <MEMORY category="ESTUDOS">O usuário estuda ADS no IFMS</MEMORY>
      Já sei isso!
    `;

    const { proposals } = parseAllMemoryProposals(rawAiText, existingFacts);
    expect(proposals.length).toBe(0);
  });

  it('formata o contexto respeitando o limite maxFacts', () => {
    const facts: MemoryFact[] = Array.from({ length: 10 }, (_, i) => ({
      id: `id-${i}`,
      text: `Fato número ${i}`,
      category: 'TESTE',
      connections: [],
      timestamp: i * 100
    }));

    const formatted = formatMemoryContext(facts, 3);
    const lines = formatted.split('\n');
    expect(lines.length).toBe(3);
    expect(formatted).toContain('id-9');
  });

  it('suporta atributos em qualquer ordem e tags case-insensitive (<memory>, <Update_Memory>)', () => {
    const rawAiText = `
      Informações recebidas:
      <memory connections="React, TypeScript" category="TECNOLOGIA">
        Especialista em desenvolvimento web frontend
      </memory>
      <Update_Memory category="PERFIL" id="2">O usuário completou 20 anos</Update_Memory>
      <delete_memory id="1"/>
    `;

    const { cleanText, proposals, autoDeletes } = parseAllMemoryProposals(rawAiText, existingFacts);

    expect(cleanText).not.toContain('<memory');
    expect(cleanText).not.toContain('<Update_Memory');
    expect(cleanText).not.toContain('<delete_memory');
    expect(cleanText).toContain('Informações recebidas:');

    // Novo fato com connections antes de category
    const newFact = proposals.find(p => p.isNew);
    expect(newFact).toBeDefined();
    expect(newFact?.category).toBe('TECNOLOGIA');
    expect(newFact?.connections).toEqual(['React', 'TypeScript']);
    expect(newFact?.newText).toBe('Especialista em desenvolvimento web frontend');

    // Update com category antes de id
    const updateFact = proposals.find(p => !p.isNew);
    expect(updateFact).toBeDefined();
    expect(updateFact?.id).toBe('2');
    expect(updateFact?.newText).toBe('O usuário completou 20 anos');

    // Auto delete com tag em minúsculo
    expect(autoDeletes).toEqual(['1']);
  });
});

