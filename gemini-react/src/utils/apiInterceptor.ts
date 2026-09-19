const originalFetch = window.fetch;

// Helper to get fallback values from localStorage
const getLocalStorageFallback = (key: string, defaultValue: string): string => {
  try {
    const value = localStorage.getItem(key);
    return value !== null ? value : defaultValue;
  } catch (e) {
    console.error(`Error reading ${key} from localStorage:`, e);
    return defaultValue;
  }
};

const setLocalStorageFallback = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error(`Error writing ${key} to localStorage:`, e);
  }
};

window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : (input instanceof URL ? input.href : input.url);

  // Determina se a URL é da mesma origem (ou relativa) e inicia com /api/
  let isLocalApi = false;
  let pathname = "";
  try {
    if (url.startsWith("/api/")) {
      isLocalApi = true;
      pathname = url.split("?")[0];
    } else if (typeof window !== "undefined" && window.location) {
      const parsed = new URL(url, window.location.href);
      if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/")) {
        isLocalApi = true;
        pathname = parsed.pathname;
      }
    }
  } catch {
    isLocalApi = false;
  }

  // Mapeia apenas endpoints locais conhecidos para o armazenamento offline
  let storageKey = "";
  let defaultResponse = "";

  if (isLocalApi) {
    if (pathname.startsWith("/api/history")) {
      storageKey = "nemon_chat_history";
      defaultResponse = "[]";
    } else if (pathname.startsWith("/api/memory")) {
      storageKey = "nemon_user_memory";
      defaultResponse = "[]";
    } else if (pathname.startsWith("/api/personalities")) {
      storageKey = "nemon_personalities";
      defaultResponse = "[]";
    } else if (pathname.startsWith("/api/usage")) {
      storageKey = "nemon_usage_data";
      defaultResponse = "{\"dailyUsage\":[]}";
    } else if (pathname.startsWith("/api/config")) {
      storageKey = "nemon_app_config";
      defaultResponse = "{\"paidApiKey\":\"\"}";
    }
  }

  // Se não for um endpoint local gerenciado pelo storage, delega para o fetch nativo
  if (!storageKey) {
    return originalFetch(input, init);
  }

  const method = (
    init?.method ||
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
  ).toUpperCase();

  if (method === "GET") {
    try {
      const response = await originalFetch(input, init);
      if (response.ok) {
        const text = await response.clone().text();
        setLocalStorageFallback(storageKey, text);
        return response;
      }
      throw new Error(`Server returned ${response.status}`);
    } catch (error) {
      console.warn(`Fetch to ${pathname} failed, using localStorage fallback:`, error);
      const fallbackData = getLocalStorageFallback(storageKey, defaultResponse);
      return new Response(fallbackData, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  } else if (method === "POST") {
    let bodyText = "";
    if (init?.body) {
      if (typeof init.body === "string") {
        bodyText = init.body;
      } else if (init.body instanceof Blob) {
        bodyText = await init.body.text();
      }
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        bodyText = await input.clone().text();
      } catch {
        // ignore
      }
    }

    if (bodyText) {
      setLocalStorageFallback(storageKey, bodyText);
    }

    try {
      return await originalFetch(input, init);
    } catch (error) {
      console.warn(`Sync to ${pathname} failed, saved locally:`, error);
      return new Response(JSON.stringify({ success: true, localOnly: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  return originalFetch(input, init);
};
