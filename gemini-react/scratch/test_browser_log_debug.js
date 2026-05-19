const rawJsonStr = `[
 {
 "segment": "Gemma 4 31B é um modelo denso",
 "isVerified": true,
 "sourceUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGy3Qc9QyGXlZQS2goBOqVd4oVuM_2vg-sPI6TjY-Y68spn7UJw3q61TyVWYSWKqkKA74eY-wuvXKg41v4S0Y10Y68DydsDLtpsLYvQ8UN83kgieY-XwgKZf8PQEBOGhd0=",
 "explanation": "Fontes confirmam que o Gemma 4 31B é um modelo denso (dense multimodal model)."
 },
 {
 "segment": "Gemini 3 Flash é um modelo destilado",
 "isVerified": true,
 "sourceUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHsTaEMLds_AwDPEDPwLYR59ke-1yVgMq8bbcgONU5qNeC-FIDFVAT_kpPP-hl-UGr5y_6qQYRKViYYEbv81EchYYMGAt_-Zo8S1FsTFqwWxy4qqYtDXy0pukIHNrSarjvQvTFwP8FdHYlHOliUFRSv7V0c_j-23KNCZg10zJUaTDQ=",
 "explanation": "Documentação técnica menciona a otimização arquitetural durante a destilação do Gemini 3 Flash."
 },
 {
 "segment": "MMLU | Inteligência Geral | $\\\\approx 82\\\\%$ | $\\\\approx 85\\\\%$ | Gemini 3 Flash",
 "isVerified": false,
 "sourceUrl": "",
 "explanation": "Não foram encontrados dados exatos de $\\\\approx 82\\\\%$ para Gemma 4 31B ou $\\\\approx 85\\\\%$ para Gemini 3 Flash no benchmark MMLU geral nos resultados da busca."
 },
 {
 "segment": "GSM8K / AIME | Raciocínio Matemático | 89.2% (AIME 26) | 95.2% (AIME 25) | Gemini 3 Flash",
 "isVerified": false,
 "sourceUrl": "",
 "explanation": "Embora o valor de 89.2% para o Gemma 4 31B no AIME 2026 seja verificado, o valor de 95.2% para o Gemini 3 Flash no AIME 25 não foi encontrado."
 },
 {
 "segment": "SWE-bench | Resolução de Bugs Reais | $\\\\approx 72\\\\%$ | 75.8% | Gemini 3 Flash",
 "isVerified": false,
 "sourceUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHBBtAv2vzpW2Qayh5EesCcdeaj4edgd9-9JuyknmevwVt_AEykKAXnASjMqiXogw8YSLrIO10RHgPyJhqC495lU0eaHpzzvj3RNbj5u26g4rF_Segek-ptqaTfDMhv-VS5bTAGGrbwOR3O4O5Kz3VBfBH2yes9PXT6XWxs4uNI",
 "explanation": "O valor para o Gemini 3 Flash no SWE-bench Verified é de 78%, e não 75.8%."
 },
 {
 "segment": "Tau2-Bench | Chamada de Função (Agentic) | 86.4% | $\\\\approx 82\\\\%$ | Gemma 4 31B",
 "isVerified": false,
 "sourceUrl": "",
 "explanation": "O valor de 86.4% para o Gemma 4 31B é verificado, mas o valor de $\\\\approx 82\\\\%$ para o Gemini 3 Flash não foi localizado."
 },
 {
 "segment": "Context Window | Memória de Trabalho | 256K tokens | 1M+ tokens | Gemini 3 Flash",
 "isVerified": true,
 "sourceUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEKOkERSfvXYFaMBC21HCW-BVmLSK6_1-2mnCf8VbSyACm22EG1JA83GK8XaJUvTezpi9quff8QaEwiTH9grQKoaL7ex3l2yddiU2CNuPhyIh4gUIy3GifnL0Ykw3spDDhiroXaJ1Xvxw==",
 "explanation": "Confirmado: Gemma 4 31B possui 256K tokens e Gemini 3 Flash possui 1.048.576 tokens."
 },
 {
 "segment": "LMArena (Text) | Preferência Humana | 1452 pts | $\\\\approx 1480$ pts | Gemini 3 Flash",
 "isVerified": false,
 "sourceUrl": "",
 "explanation": "O valor de 1452 pts para o Gemma 4 31B é verificado, mas o valor de $\\\\approx 1480$ pts para o Gemini 3 Flash não foi encontrado."
 },
 {
 "segment": "O Gemini 3 Flash leva vantagem aqui. Por ter sido destilado do Gemini 3 Pro",
 "isVerified": true,
 "sourceUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHsTaEMLds_AwDPEDPwLYR59ke-1yVgMq8bbcgONU5qNeC-FIDFVAT_kpPP-hl-UGr5y_6qQYRKViYYEbv81EchYYMGAt_-Zo8S1FsTFqwWxy4qqYtDXy0pukIHNrSarjvQvTFwP8FdHYlHOliUFRSv7V0c_j-23KNCZg10zJUaTDQ=",
 "explanation": "Fontes confirmam a natureza destilada do modelo Flash a partir de versões Pro."
 },
 {
 "segment": "Gemma 4 31B brilha. Ele foi otimizado para ser um \\\"núcleo de raciocínio local\\\", apresentando uma precisão superior em chamadas de funções (\`function calling\`)",
 "isVerified": true,
 "sourceUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGcwreILsbCX1yKrXCek9JDae4IaXLqHujjM-mWiWyPGPSLABYsdr4ndIV5Fob5yv4Lp67d_aPSUNgdsgxYg_XH8dqr8es6-0TwVdha3y2Y35yOOIRRM-FGENUJTahPU2pdOGxF97IT9T1hz2Fl9hnQ26FWQ9HCxf0bDw==",
 "explanation": "O desempenho superior em function calling é evidenciado pela pontuação de 86.4% no Tau2-Bench."
 },
 {
 "segment": "menos propensão a entrar em loops de raciocínio infinito (problema observado no Flash em benchmarks como o FoodTruck Bench)",
 "isVerified": true,
 "sourceUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGdQuwvrcDyfkLp3C6MHXEjPee0A6MBbjMS61XzRNDtcacBgdWgfCT1jIHes3WBBLT6RKcl3Koh0kRWhIEtaCzTmBwTG8rBs_0hCKvjJoQsWPQ92fSVAkShquz5qTLum_iIx2b9zYVBnFiKlmoLjiLKfGOWTvC9aPUX4fwMf2x8JXeCH1WM9Dxx9CJEv_UUDK8jgF_nYk7nR7b9Tw==",
 "explanation": "Relatos de benchmarks como o FoodTruck Bench indicam que o Gemma 4 31B lida melhor com tarefas de longo horizonte e evita falhas/loops comuns em modelos menores ou destilados."
 },
 {
 "segment": "rodar localmente na sua RX 9060 XT",
 "isVerified": true,
 "sourceUrl": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHJf3suyqaqd6wgwucUdU23dgm99Ne7O6hLPMoqCuWaBCQFCrn43z8oNkqvWKpXoCXXVIra1ALrYDI33P3V5jXPkGDzKoupMEcS7Crbqp6PDtNRRjfav1BFlRvg9Ro-tHpeo_Ot76gdiNZaWAfom7V2hpeR-d-9CtToEjeUoQzzehLN07OYmGyg",
 "explanation": "A AMD Radeon RX 9060 XT é um hardware real lançado em junho de 2025."
 }
]`;

function escapeInnerQuotes(jsonStr) {
  let result = '';
  let inString = false;
  let isKey = false; // whether we are currently in a key string
  let lastStructuralChar = '';
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    
    if (!inString) {
      if (char === '"') {
        const isStructuralStart = ['{', '[', ',', ':'].includes(lastStructuralChar) || lastStructuralChar === '';
        if (isStructuralStart) {
          inString = true;
          isKey = (lastStructuralChar === '{' || lastStructuralChar === ',');
          result += '"';
        } else {
          result += '\\"';
        }
      } else {
        result += char;
        if (['{', '}', '[', ']', ':', ','].includes(char)) {
          lastStructuralChar = char;
        }
      }
    } else {
      if (char === '\\') {
        result += '\\' + (jsonStr[i + 1] || '');
        i++;
      } else if (char === '"') {
        const rest = jsonStr.slice(i + 1);
        let isStructuralClose = false;
        
        if (isKey) {
          isStructuralClose = /^\s*:/.test(rest);
        } else {
          if (/^\s*\}/.test(rest) || /^\s*\]/.test(rest)) {
            isStructuralClose = true;
          } else if (/^\s*,/.test(rest)) {
            const afterComma = rest.replace(/^\s*,/, '');
            isStructuralClose = /^\s*["}\]0-9tfn{\[]/.test(afterComma);
          }
        }
        
        if (isStructuralClose) {
          inString = false;
          result += '"';
        } else {
          result += '\\"';
        }
      } else {
        result += char;
      }
    }
  }
  
  return result;
}

function extractAndParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.log("Standard parse failed:", e.message);
    try {
      let fixedJson = escapeInnerQuotes(text);
      console.log("After escapeInnerQuotes (first 50 chars):", fixedJson.slice(0, 100));

      fixedJson = fixedJson.replace(/\\"\s*(,|\}|\]|$)/g, '"$1');
      console.log("After fixing escaped closing quotes (first 50 chars):", fixedJson.slice(0, 100));

      fixedJson = fixedJson.replace(/\\(.)/g, (match, p1) => {
        if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(p1)) {
          return match;
        }
        if (p1 === 'u' && /^[0-9a-fA-F]{4}/.test(match.slice(2))) {
          return match;
        }
        return '\\\\' + p1;
      });
      console.log("After doubling backslashes (first 50 chars):", fixedJson.slice(0, 100));

      fixedJson = fixedJson.replace(/,\s*([\]}])/g, '$1');
      
      console.log("Parsing fixedJson...");
      return JSON.parse(fixedJson);
    } catch (e2) {
      console.error("Limpeza agressiva falhou também:", e2.message);
      throw e2;
    }
  }
}

try {
  const res = extractAndParseJson(rawJsonStr);
  console.log("SUCCESS!", JSON.stringify(res, null, 2).slice(0, 300));
} catch (e) {
  console.log("FAILED FINAL:", e);
}
