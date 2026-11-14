const SESSION_STORAGE_KEY = 'vs_session_token';
let memorySessionToken: string | null = null;

export function setSessionToken(token: string) {
  memorySessionToken = token;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // Ignore if storage is restricted
  }
}

export function getSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      memorySessionToken = stored;
      return stored;
    }
  } catch {
    // Ignore
  }
  return null;
}

export function clearSessionToken() {
  memorySessionToken = null;
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const customHeaders = (options.headers || {}) as Record<string, string>;
  const hasCustomAuth = Boolean(customHeaders.Authorization || customHeaders.authorization);
  const sessionToken = getSessionToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  if (!hasCustomAuth && sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    if (res.status === 401 && !url.includes('/api/auth/')) {
      clearSessionToken();
      window.dispatchEvent(new CustomEvent('ventasmart:unauthorized'));
    }
    throw new ApiError(data?.error || `Error ${res.status} al procesar la solicitud`, res.status);
  }

  return data as T;
}

export async function downloadAuthenticatedFile(url: string, fallbackFilename: string): Promise<void> {
  const sessionToken = getSessionToken();
  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  const res = await fetch(url, {
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearSessionToken();
      window.dispatchEvent(new CustomEvent('ventasmart:unauthorized'));
    }
    const text = await res.text();
    let msg = 'No se pudo descargar el archivo.';
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) msg = parsed.error;
    } catch {
      // ignore
    }
    throw new ApiError(msg, res.status);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
