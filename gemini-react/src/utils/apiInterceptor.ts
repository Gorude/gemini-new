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
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);

  // We only intercept requests starting with /api/ or containing /api/
  if (url.includes('/api/')) {
    // Find the relative path part starting with /api/
    const apiIndex = url.indexOf('/api/');
    const relativeUrl = url.substring(apiIndex);
    const endpoint = relativeUrl.split('?')[0]; // strip query params if any
    const method = (init?.method || 'GET').toUpperCase();

    // Map endpoints to localStorage keys
    let storageKey = '';
    let defaultResponse = '';

    if (endpoint.startsWith('/api/history')) {
      storageKey = 'nemon_chat_history';
      defaultResponse = '[]';
    } else if (endpoint.startsWith('/api/memory')) {
      storageKey = 'nemon_user_memory';
      defaultResponse = '[]';
    } else if (endpoint.startsWith('/api/personalities')) {
      storageKey = 'nemon_personalities';
      defaultResponse = '[]';
    } else if (endpoint.startsWith('/api/usage')) {
      storageKey = 'nemon_usage_data';
      defaultResponse = '{"dailyUsage":[]}';
    } else if (endpoint.startsWith('/api/config')) {
      storageKey = 'nemon_app_config';
      defaultResponse = '{"paidApiKey":""}';
    }

    if (method === 'GET') {
      try {
        // Try the actual network request first
        const response = await originalFetch(input, init);
        if (response.ok) {
          // Sync successful server response to localStorage for offline fallback
          const text = await response.clone().text();
          if (storageKey) {
            setLocalStorageFallback(storageKey, text);
          }
          return response;
        }
        throw new Error(`Server returned ${response.status}`);
      } catch (error) {
        console.warn(`Fetch to ${endpoint} failed, using localStorage fallback:`, error);
        if (storageKey) {
          const fallbackData = getLocalStorageFallback(storageKey, defaultResponse);
          return new Response(fallbackData, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    } else if (method === 'POST') {
      // Get the body
      let bodyText = '';
      if (init?.body) {
        if (typeof init.body === 'string') {
          bodyText = init.body;
        } else if (init.body instanceof Blob) {
          bodyText = await init.body.text();
        }
      }

      // Save to localStorage immediately so user's data is saved
      if (storageKey && bodyText) {
        setLocalStorageFallback(storageKey, bodyText);
      }

      try {
        // Try to sync with server
        const response = await originalFetch(input, init);
        return response;
      } catch (error) {
        console.warn(`Sync to ${endpoint} failed, but saved locally:`, error);
        return new Response(JSON.stringify({ success: true, localOnly: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }

  // Fallback to original fetch for everything else
  return originalFetch(input, init);
};
