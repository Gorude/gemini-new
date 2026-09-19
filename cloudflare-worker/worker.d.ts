export interface DuckDuckGoWorkerResult {
  title: string;
  uri: string;
  snippet: string;
}

export function directDuckDuckGoSearch(query: string, count?: number): Promise<DuckDuckGoWorkerResult[]>;
export function directFetchUrl(url: string): Promise<string>;
export function formatDuckDuckGoSummary(results: DuckDuckGoWorkerResult[]): {
  summary: string;
  sources: Array<{ title: string; uri: string }>;
};

declare const worker: {
  fetch(request: Request): Promise<Response>;
};

export default worker;
