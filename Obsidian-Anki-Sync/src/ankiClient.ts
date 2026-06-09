const ANKI_CONNECT_URL = "http://localhost:8765";

function request(action: string, params: Record<string, unknown> = {}) {
  return fetch(ANKI_CONNECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params }),
  });
}

export async function ping(): Promise<boolean> {
  try {
    const res = await request("version");
    const body = await res.json();
    return body.result != null;
  } catch {
    return false;
  }
}
