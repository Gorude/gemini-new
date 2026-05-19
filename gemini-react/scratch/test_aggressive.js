function escapeInnerQuotes(jsonStr) {
  let result = '';
  let inString = false;
  let isKey = false; // whether we are currently in a key string
  let lastStructuralChar = '';
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    
    if (!inString) {
      if (char === '"') {
        // Entering a string!
        // It is structural if the last structural char was '{', '[', ',', or ':'
        const isStructuralStart = ['{', '[', ',', ':'].includes(lastStructuralChar) || lastStructuralChar === '';
        if (isStructuralStart) {
          inString = true;
          isKey = (lastStructuralChar === '{' || lastStructuralChar === ',');
          result += '"';
        } else {
          // If it's a quote outside a string but not in structural position, escape it
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
        // Copy the backslash and the next character as-is to preserve escapes
        result += '\\' + (jsonStr[i + 1] || '');
        i++;
      } else if (char === '"') {
        // We see a quote. Is it the structural closing quote?
        const rest = jsonStr.slice(i + 1);
        let isStructuralClose = false;
        
        if (isKey) {
          // A key's closing quote must be followed by ':'
          isStructuralClose = /^\s*:/.test(rest);
        } else {
          // A value's closing quote must be followed by ',', '}', or ']'
          // In case of ',', the next non-whitespace char should be a start of key/value/bracket
          if (/^\s*\}/.test(rest) || /^\s*\]/.test(rest)) {
            isStructuralClose = true;
          } else if (/^\s*,/.test(rest)) {
            // Verify it's a valid structural comma (followed by key start, value start, or end of container)
            const afterComma = rest.replace(/^\s*,/, '');
            isStructuralClose = /^\s*["}\]0-9tfn{\[]/.test(afterComma);
          }
        }
        
        if (isStructuralClose) {
          inString = false;
          result += '"';
        } else {
          // Escape this inner quote
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
  
  // 1. Remove markdown code blocks if present
  if (cleaned.includes("```")) {
    cleaned = cleaned.replace(/```json|```/g, "").trim();
  }

  // 2. Find the first [ or { and the last ] or }
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
    // Attempt standard parse first
    return JSON.parse(jsonStr);
  } catch (e) {
    // Standard parse failed, do aggressive cleanup silently unless it completely fails
    try {
      // A. Escape unescaped double quotes inside text values using our robust state machine
      let fixedJson = escapeInnerQuotes(jsonStr);

      // B. Fix escaped closing quotes that might have been broken (e.g. \" at the end of a value before a comma or brace)
      fixedJson = fixedJson.replace(/\\"\s*(,|\}|\]|$)/g, '"$1');

      // C. Fix unescaped control backslashes (e.g. \tau, \approx, \$) by doubling them
      // We only double backslashes that are NOT part of a valid JSON escape sequence.
      fixedJson = fixedJson.replace(/\\(.)/g, (match, p1) => {
        if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(p1)) {
          return match;
        }
        if (p1 === 'u' && /^[0-9a-fA-F]{4}/.test(match.slice(2))) {
          return match;
        }
        return '\\\\' + p1;
      });

      // D. Remove trailing commas
      fixedJson = fixedJson.replace(/,\s*([\]}])/g, '$1');

      return JSON.parse(fixedJson);
    } catch (e2) {
      // Both standard and aggressive parse failed, log warning/error
      console.warn("JSON parsing completely failed in extractAndParseJson.", {
        originalError: e.message,
        aggressiveError: e2.message,
        jsonStr
      });
      throw e; // throw original error
    }
  }
}

// Scenarios to test
const testCases = [
  // Case 1: Simple valid JSON
  `{ "name": "Gemini", "isVerified": true }`,
  
  // Case 2: LaTeX formulas (backslash escaping needed)
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
    "isVerified": true,
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
