const testStr = `{
 "segment": "Gemma 4 31B brilha. Ele foi otimizado para ser um \\"núcleo de raciocínio local\\", apresentando"
}`;

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

console.log("Input string length:", testStr.length);
console.log("Input string:\n", testStr);
const output = escapeInnerQuotes(testStr);
console.log("Output string:\n", output);
try {
  JSON.parse(output);
  console.log("Parsed successfully!");
} catch (e) {
  console.log("Parsing failed:", e.message);
}
