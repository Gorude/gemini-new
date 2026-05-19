const fs = require('fs');
const path = require('path');

const text = fs.readFileSync(path.join(__dirname, 'raw_input.txt'), 'utf8');

console.log("File loaded. Total characters:", text.length);

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
        // If the next character is a double quote, we need to check if it's actually the structural closing quote
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
            result += '"'; // Output unescaped structural closing quote
          } else {
            result += '\\"'; // Output escaped inner quote
          }
          i++; // Skip the quote character
        } else {
          // Copy backslash and next character as-is
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

function runCleanup(text) {
  try {
    let fixedJson = escapeInnerQuotes(text);
    console.log("\n--- After escapeInnerQuotes ---");
    const lines = fixedJson.split('\n');
    console.log("Line 57:", lines[56]);

    // Step B is no longer needed since escapeInnerQuotes handles escaped closing quotes perfectly!
    console.log("\n--- (Step B omitted because escapeInnerQuotes handles it) ---");

    fixedJson = fixedJson.replace(/\\(.)/g, (match, p1) => {
      if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(p1)) {
        return match;
      }
      if (p1 === 'u' && /^[0-9a-fA-F]{4}/.test(match.slice(2))) {
        return match;
      }
      return '\\\\' + p1;
    });
    console.log("\n--- After doubling backslashes ---");
    const lines3 = fixedJson.split('\n');
    console.log("Line 57:", lines3[56]);

    fixedJson = fixedJson.replace(/,\s*([\]}])/g, '$1');
    
    console.log("\nTrying to parse fixedJson...");
    const parsed = JSON.parse(fixedJson);
    console.log("SUCCESS!");
    console.log("Segment 10 verified:", parsed[9].segment);
  } catch (err) {
    console.error("Cleanup failed:", err.message);
    if (err.message.includes("position")) {
      const posMatch = err.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        console.log("Failure index:", pos);
      }
    }
  }
}

console.log("Forcing cleanup on input text...");
runCleanup(text);
