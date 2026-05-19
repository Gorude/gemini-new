function escapeInnerQuotes(jsonStr) {
  let result = '';
  let inString = false;
  let isKey = false;
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
      // Inside a string
      if (char === '\\') {
        if (jsonStr[i + 1] === '"') {
          const rest = jsonStr.slice(i + 2);
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
          i++;
        } else {
          result += '\\' + (jsonStr[i + 1] || '');
          i++;
        }
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
  if (!text) return null;
  
  let cleaned = text.trim();
  
  if (cleaned.includes("```")) {
    cleaned = cleaned.replace(/```json|```/g, "").trim();
  }

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');

  let start = -1;
  let end = -1;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    end = lastBracket;
  } else if (firstBrace !== -1) {
    start = firstBrace;
    end = lastBrace;
  }

  if (start === -1 || end === -1) {
    throw new Error("Não foi possível encontrar uma estrutura JSON válida na resposta.");
  }

  const jsonStr = cleaned.substring(start, end + 1);
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    try {
      let fixedJson = escapeInnerQuotes(jsonStr);

      fixedJson = fixedJson.replace(/\\(.)/g, (match, p1) => {
        if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(p1)) {
          return match;
        }
        if (p1 === 'u' && /^[0-9a-fA-F]{4}/.test(match.slice(2))) {
          return match;
        }
        return '\\\\' + p1;
      });

      fixedJson = fixedJson.replace(/,\s*([\]}])/g, '$1');

      return JSON.parse(fixedJson);
    } catch (e2) {
      console.warn("JSON cleanup failed:", e2.message);
      throw e;
    }
  }
}

// Regression cases to test
const testCases = [
  // Case 1: Simple valid JSON
  `{ "name": "Gemini", "isVerified": true }`,
  
  // Case 2: LaTeX formulas (double backslashes)
  `{
    "segment": "MMLU ... Gemma 4 31B $\\\\approx 82\\\\%$ ... Gemini 3 Flash $\\\\approx 85\\\\%$",
    "isVerified": false,
    "explanation": "As fontes citam o MMLU Pro para o Gemma 4 31B (85.2%), mas não confirmam"
  }`,

  // Case 3: LaTeX with single backslashes (like what LLM actually sends)
  `{
    "segment": "MMLU ... Gemma 4 31B $\\approx 82\\%$ ... Gemini 3 Flash $\\approx 85\\%$",
    "isVerified": false,
    "explanation": "As fontes citam o MMLU Pro para o Gemma 4 31B (85.2%), mas não confirmam"
  }`,

  // Case 4: Unescaped double quotes inside values
  `{
    "segment": "O Gemma 4 31B é "dense" (denso) em fontes",
    "explanation": "Ele foi otimizado para ser um "núcleo de raciocínio local"",
    "isVerified": true
  }`,

  // Case 5: Nested double quotes that are already escaped, but might have trailing comma
  `{
    "segment": "menos propensão a entrar em loops de raciocínio infinito (problema observado no Flash em benchmarks como o \\"FoodTruck Bench\\")",
    "isVerified": true
  }`,

  // Case 6: Complex nested quotes like ":" or "{" in text
  `{
    "explanation": "O resultado foi "1:1" no teste",
    "isVerified": true
  }`,
  
  // Case 7: Quote inside text containing braces
  `{
    "explanation": "O resultado foi "{"status": true}" no teste",
    "isVerified": true
  }`,

  // Case 8: Escaped closing quote returned by model
  `{
    "explanation": "This is a fact.\\",
    "isVerified": true
  }`
];

testCases.forEach((tc, idx) => {
  console.log(`\n--- Test Case ${idx + 1} ---`);
  try {
    const parsed = extractAndParseJson(tc);
    console.log("SUCCESS:", JSON.stringify(parsed, null, 2));
  } catch (err) {
    console.error("FAILED:", err.message);
  }
});
