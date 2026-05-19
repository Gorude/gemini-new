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

try {
  console.log("Original parsing...");
  JSON.parse(text);
  console.log("Parsed perfectly without cleanup!");
} catch (e) {
  console.log("Original parse failed:", e.message);
  
  try {
    let fixedJson = escapeInnerQuotes(text);
    console.log("After escapeInnerQuotes (around line 57):");
    const lines = fixedJson.split('\n');
    for (let l = 53; l < 62; l++) {
      if (lines[l]) console.log(`${l + 1}: ${lines[l]}`);
    }

    fixedJson = fixedJson.replace(/\\"\s*(,|\}|\]|$)/g, '"$1');
    console.log("After fixing escaped closing quotes (around line 57):");
    const lines2 = fixedJson.split('\n');
    for (let l = 53; l < 62; l++) {
      if (lines2[l]) console.log(`${l + 1}: ${lines2[l]}`);
    }

    fixedJson = fixedJson.replace(/\\(.)/g, (match, p1) => {
      if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(p1)) {
        return match;
      }
      if (p1 === 'u' && /^[0-9a-fA-F]{4}/.test(match.slice(2))) {
        return match;
      }
      return '\\\\' + p1;
    });
    console.log("After doubling backslashes (around line 57):");
    const lines3 = fixedJson.split('\n');
    for (let l = 53; l < 62; l++) {
      if (lines3[l]) console.log(`${l + 1}: ${lines3[l]}`);
    }

    fixedJson = fixedJson.replace(/,\s*([\]}])/g, '$1');
    
    console.log("Trying to parse fixedJson...");
    JSON.parse(fixedJson);
    console.log("SUCCESS!");
  } catch (err) {
    console.error("Cleanup failed:", err.message);
    // Find index of failure
    if (err.message.includes("position")) {
      const posMatch = err.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        console.log("Failure character:", JSON.stringify(err.message));
        console.log("Context around failure position:");
        console.log(err.message);
      }
    }
  }
}
