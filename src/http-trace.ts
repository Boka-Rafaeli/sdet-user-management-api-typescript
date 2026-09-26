import type { ApiRequest, ApiResponse } from './client.js';
import { isSensitiveKey, redact, redactText } from './redaction.js';
export class HttpTracer {
  constructor(
    private readonly enabled: boolean,
    private readonly secrets: readonly string[],
    private readonly sink: (message: string) => void = console.log,
  ) {}
  private body(body: Buffer | undefined): string {
    if (!body?.length) return '<empty>';
    const text = body.toString('utf8');
    try {
      return JSON.stringify(redact(JSON.parse(text), this.secrets));
    } catch {
      return redactText(text, this.secrets);
    }
  }
  private url(value: string): string {
    try {
      const url = new URL(value);
      for (const key of url.searchParams.keys())
        if (isSensitiveKey(key)) url.searchParams.set(key, '<redacted>');
      return redactText(url.toString(), this.secrets);
    } catch {
      return redactText(value, this.secrets);
    }
  }
  request(request: ApiRequest): void {
    if (this.enabled)
      this.sink(
        `HTTP request method=${request.method} url=${this.url(request.url)} body=${this.body(request.body)} id=${request.id ?? '-'}`,
      );
  }
  response(response: ApiResponse): void {
    if (this.enabled)
      this.sink(
        `HTTP response method=${response.request.method} url=${this.url(response.requestUrl)} status=${response.status} body=${this.body(response.body)} id=${response.request.id ?? '-'}`,
      );
  }
}
