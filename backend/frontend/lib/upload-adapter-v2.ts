// DeckSpert FE – Dynamic Upload Adapter v2 (20MB Guard + Progress)
// Auto-switch between multipart and JSON(base64) depending on backend /health flags.
// Adds: 20MB size guard + upload progress callbacks for both paths.

export type HealthFlags = { llm: string; ssl: string; multipart: string };
export type ProgressCallback = (pct: number) => void; // 0..100

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

let _healthCache: HealthFlags | null = null;

export async function fetchHealth(): Promise<HealthFlags> {
  try {
    const r = await fetch("/health", { cache: "no-store" });
    const j = await r.json();
    return (_healthCache = {
      llm: String(j.llm ?? "false").toLowerCase(),
      ssl: String(j.ssl ?? "false").toLowerCase(),
      multipart: String(j.multipart ?? j.has_multipart ?? j.form ?? "false").toLowerCase(),
    });
  } catch {
    return (_healthCache = { llm: "false", ssl: "false", multipart: "false" });
  }
}

export async function ensureHealth(): Promise<HealthFlags> {
  return _healthCache ?? fetchHealth();
}

// ---- Size guard ----
export function assertSizeWithinLimit(file: File, maxBytes: number = MAX_FILE_BYTES) {
  if (file.size > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(0);
    throw new Error(`파일이 너무 큽니다. 최대 ${mb}MB까지 업로드할 수 있어요.`);
  }
}

// ---- Base64 with progress (for JSON path) ----
export async function fileToBase64WithProgress(file: File, onProgress?: ProgressCallback): Promise<string> {
  const chunkSize = 256 * 1024; // 256KB
  const total = file.size;
  let offset = 0;
  let binary = "";
  while (offset < total) {
    const slice = file.slice(offset, Math.min(offset + chunkSize, total));
    const buf = await slice.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let chunkStr = "";
    for (let i = 0; i < bytes.length; i++) chunkStr += String.fromCharCode(bytes[i]);
    binary += chunkStr;
    offset += bytes.length;
    if (onProgress) onProgress(Math.min(50, Math.round((offset / total) * 50))); // 0..50 during encoding
  }
  return btoa(binary);
}

// ---- XHR helpers for progress ----
function xhrPost(url: string, body: Document | XMLHttpRequestBodyInit | null, headers: Record<string, string> = {}, onProgress?: ProgressCallback): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (evt.lengthComputable) {
        // For JSON path, treat upload as 50..100 range; for multipart we also map 0..100
        const pct = Math.round((evt.loaded / (evt.total || 1)) * 100);
        onProgress(pct);
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        const response = new Response(xhr.responseText, {
          status: xhr.status,
          headers: new Headers(xhr.getAllResponseHeaders().split("\r\n").filter(Boolean).map((h) => h.split(": ") as [string, string])),
        });
        if (xhr.status >= 200 && xhr.status < 300) resolve(response);
        else reject(new Error(`Request failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body as any);
  });
}

// ---- API shims with progress ----
export async function callBackendParserDynamicWithProgress(file: File, onProgress?: ProgressCallback) {
  assertSizeWithinLimit(file);
  const health = await ensureHealth();

  if (health.multipart === "true") {
    const form = new FormData();
    form.append("file", file);
    const res = await xhrPost("/api/parse", form as any, {}, onProgress);
    if (!res.ok) throw new Error("/api/parse failed");
    return res.json();
  }

  // JSON fallback with base64 conversion progress (0..50) and upload progress via XHR (0..100)
  let lastPct = 0;
  const base64 = await fileToBase64WithProgress(file, (p) => {
    lastPct = p; // 0..50
    if (onProgress) onProgress(p);
  });
  const payload = JSON.stringify({ filename: file.name, content_base64: base64 });
  const res = await xhrPost("/api/parse_json", payload, { "Content-Type": "application/json" }, (p) => {
    if (onProgress) onProgress(Math.max(lastPct, Math.min(100, Math.round(50 + p / 2)))); // 50..100
  });
  if (!res.ok) throw new Error("/api/parse_json failed");
  return res.json();
}

export async function callBackendSectionsDynamicWithProgress(file: File, onProgress?: ProgressCallback) {
  assertSizeWithinLimit(file);
  const health = await ensureHealth();

  if (health.multipart === "true") {
    const form = new FormData();
    form.append("file", file);
    const res = await xhrPost("/api/sections", form as any, {}, onProgress);
    if (!res.ok) throw new Error("/api/sections failed");
    return res.json();
  }

  let lastPct = 0;
  const base64 = await fileToBase64WithProgress(file, (p) => {
    lastPct = p;
    if (onProgress) onProgress(p);
  });
  const payload = JSON.stringify({ filename: file.name, content_base64: base64 });
  const res = await xhrPost("/api/sections_json", payload, { "Content-Type": "application/json" }, (p) => {
    if (onProgress) onProgress(Math.max(lastPct, Math.min(100, Math.round(50 + p / 2))));
  });
  if (!res.ok) throw new Error("/api/sections_json failed");
  return res.json();
}

export async function callBackendTranslate(text: string, target_lang: string, glossary: string[] = []) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, target_lang, glossary }),
  });
  if (!res.ok) throw new Error("/api/translate failed");
  return res.json();
}

// ---- Minimal Smoke Tests (run in browser console) ----
if (typeof window !== "undefined") {
  (window as any).__DeckspertUploadTestV2 = async function () {
    try {
      const h = await fetchHealth();
      console.log("[UploadAdapterV2] health:", h);
      const small = new Blob(["Problem: A\n\nSolution: B"], { type: "text/plain" });
      const f = new File([small], "demo.txt");
      let prog: number[] = [];
      const parsed = await callBackendParserDynamicWithProgress(f, (p)=>prog.push(p));
      const secs = await callBackendSectionsDynamicWithProgress(f, (p)=>prog.push(p));
      console.log("[UploadAdapterV2] parse ok", parsed, "sections ok", secs, "progress samples:", prog.slice(0,5), "..", prog.slice(-3));
      // 20MB guard test
      const big = new File([new Uint8Array(20*1024*1024 + 1)], "big.bin");
      let guardErr = "";
      try { await callBackendParserDynamicWithProgress(big); } catch (e:any) { guardErr = String(e.message||e); }
      console.assert(/최대 20MB/i.test(guardErr), "20MB guard should trigger");
      return { h, ok: true };
    } catch (e) {
      console.warn("[UploadAdapterV2] smoke fail", e);
      return { error: String(e) };
    }
  };
}
