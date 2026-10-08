import { invoke, isTauri } from '@tauri-apps/api/core';
import { CloudHttpRequest, CloudHttpResponse } from './types';

/** Cloud API transport: Tauri proxy when available, otherwise browser fetch. */
export async function cloudRequest(req: CloudHttpRequest): Promise<CloudHttpResponse> {
  if (isTauri()) {
    return (await invoke('cloud_http', {
      req: {
        method: req.method,
        url: req.url,
        headers: req.headers ?? {},
        body: req.body ?? null,
      },
    })) as CloudHttpResponse;
  }

  const response = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    status: response.status,
    body: await response.text(),
    headers,
  };
}

export async function cloudJson<T>(
  req: CloudHttpRequest,
  okStatuses: number[] = [200, 201, 204, 207],
): Promise<T> {
  const res = await cloudRequest(req);
  if (!okStatuses.includes(res.status)) {
    const snippet = res.body.slice(0, 240).replace(/\s+/g, ' ').trim();
    throw new Error(`Cloud API ${res.status}${snippet ? `: ${snippet}` : ''}`);
  }
  if (!res.body) return {} as T;
  return JSON.parse(res.body) as T;
}
