import { describe, it, expect } from "vitest";
import { parseDuckDuckGoHtml, formatDuckDuckGoSummary } from "./duckduckgoSearch";

describe("duckduckgoSearch", () => {
  it("should parse duckduckgo html results correctly", () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <div class="result results_links">
            <h2 class="result__title">
              <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FEval">Eval - Wikipedia</a>
            </h2>
            <a class="result__snippet" href="#">Eval is a built-in function in many languages.</a>
          </div>
          <div class="result results_links">
            <h2 class="result__title">
              <a class="result__a" href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval">eval() - MDN</a>
            </h2>
            <a class="result__snippet" href="#">The eval() function evaluates JavaScript code.</a>
          </div>
        </body>
      </html>
    `;

    const results = parseDuckDuckGoHtml(mockHtml);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Eval - Wikipedia");
    expect(results[0].uri).toBe("https://en.wikipedia.org/wiki/Eval");
    expect(results[0].snippet).toBe("Eval is a built-in function in many languages.");
    expect(results[1].title).toBe("eval() - MDN");
    expect(results[1].uri).toBe("https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval");
  });

  it("should preserve encoded html tags in snippets without stripping them", () => {
    const mockHtml = `
      <div class="result results_links">
        <h2 class="result__title">
          <a class="result__a" href="https://example.com/html">HTML Guide</a>
        </h2>
        <a class="result__snippet" href="#">Learn how to use &lt;div class="box"&gt; and &lt;span&gt; tags</a>
      </div>
    `;

    const results = parseDuckDuckGoHtml(mockHtml);
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toContain("<div class=\"box\">");
    expect(results[0].snippet).toContain("<span>");
  });

  it("should format summary and sources accurately", () => {
    const mockResults = [
      { title: "Doc 1", uri: "https://example.com/1", snippet: "Snippet 1" },
      { title: "Doc 2", uri: "https://example.com/2", snippet: "Snippet 2" }
    ];

    const formatted = formatDuckDuckGoSummary(mockResults);
    expect(formatted.sources).toHaveLength(2);
    expect(formatted.sources[0]).toEqual({ title: "Doc 1", uri: "https://example.com/1" });
    expect(formatted.summary).toContain("Resultados da pesquisa no DuckDuckGo:");
    expect(formatted.summary).toContain("**Doc 1**");
    expect(formatted.summary).toContain("Snippet 1");
  });

  it("should parse more than 5 links without artificial limit", () => {
    let mockHtml = "<html><body>";
    for (let i = 1; i <= 8; i++) {
      mockHtml += `
        <div class="result results_links">
          <h2 class="result__title">
            <a class="result__a" href="https://example.com/page${i}">Title ${i}</a>
          </h2>
          <a class="result__snippet" href="#">Snippet ${i}</a>
        </div>
      `;
    }
    mockHtml += "</body></html>";

    const results = parseDuckDuckGoHtml(mockHtml);
    expect(results).toHaveLength(8);
  });
});
