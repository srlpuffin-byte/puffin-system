export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("puffin_token");
  const resp = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> || {}),
    },
  });

  // Si el servidor responde 401 (token expirado o inválido), limpiar sesión y redirigir al login
  if (resp.status === 401) {
    localStorage.removeItem("puffin_token");
    window.location.href = "/login";
    throw new Error("Sesión expirada. Por favor, inicia sesión nuevamente.");
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `Error ${resp.status}` }));
    throw new Error(err.error || `Error ${resp.status}`);
  }
  return resp.json();
}
