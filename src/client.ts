import http from 'node:http';
import https from 'node:https';
import type { Settings, Environment } from './config.js';
export interface ApiRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
  timeoutMs: number;
}
export class ApiResponse {
  readonly requestUrl: string;
  constructor(
    readonly status: number,
    readonly headers: Record<string, string>,
    readonly body: Buffer,
    readonly request: ApiRequest,
  ) {
    this.requestUrl = request.url;
  }
  json(): any {
    return JSON.parse(this.body.toString('utf8'));
  }
  text(): string {
    return this.body.toString('utf8');
  }
}
export type Transport = (request: ApiRequest) => Promise<ApiResponse>;
export const encodeEmail = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
export interface RawOptions {
  json?: unknown;
  content?: string | Buffer;
  headers?: Record<string, string>;
}
export class ApiClient {
  private readonly agents = {
    http: new http.Agent({ keepAlive: true }),
    https: new https.Agent({ keepAlive: true }),
  };
  private closed = false;
  constructor(
    readonly settings: Settings,
    private readonly transport?: Transport,
  ) {}
  get environment(): Environment {
    return this.settings.environment;
  }
  close(): void {
    this.closed = true;
    this.agents.http.destroy();
    this.agents.https.destroy();
  }
  listUsers(): Promise<ApiResponse> {
    return this.rawRequest('GET', '/users');
  }
  createUser(payload: unknown): Promise<ApiResponse> {
    return this.rawRequest('POST', '/users', { json: payload });
  }
  getUser(email: string): Promise<ApiResponse> {
    return this.rawRequest('GET', '/users/' + encodeEmail(email));
  }
  updateUser(email: string, payload: unknown): Promise<ApiResponse> {
    return this.rawRequest('PUT', '/users/' + encodeEmail(email), { json: payload });
  }
  deleteUser(email: string, token: string | null = this.settings.authToken): Promise<ApiResponse> {
    return this.rawRequest('DELETE', '/users/' + encodeEmail(email), {
      headers: token === null ? {} : { Authentication: token },
    });
  }
  async rawRequest(method: string, path: string, options: RawOptions = {}): Promise<ApiResponse> {
    if (this.closed) throw new Error('API client is closed');
    const hasJson = Object.hasOwn(options, 'json');
    if (hasJson && options.content !== undefined)
      throw new Error('json and content are mutually exclusive');
    const headers: Record<string, string> = { accept: 'application/json' };
    for (const [key, value] of Object.entries(options.headers ?? {}))
      headers[key.toLowerCase()] = value;
    let body: Buffer | undefined;
    if (hasJson) {
      const text = JSON.stringify(options.json);
      if (text === undefined) throw new Error('Value is not JSON');
      body = Buffer.from(text);
      headers['content-type'] ??= 'application/json';
    } else if (options.content !== undefined)
      body = Buffer.isBuffer(options.content) ? options.content : Buffer.from(options.content);
    if (body !== undefined) headers['content-length'] = String(body.length);
    const request: ApiRequest = {
      method: method.toUpperCase(),
      url: this.settings.baseUrl + '/' + this.environment + '/' + path.replace(/^\/+/, ''),
      headers,
      body,
      timeoutMs: this.settings.timeoutMs,
    };
    return this.transport ? this.transport(request) : this.send(request);
  }
  private send(request: ApiRequest): Promise<ApiResponse> {
    return new Promise((resolve, reject) => {
      const secure = request.url.startsWith('https:');
      const outgoing = (secure ? https : http).request(
        request.url,
        {
          method: request.method,
          headers: request.headers,
          agent: secure ? this.agents.https : this.agents.http,
        },
        (incoming) => {
          const parts: Buffer[] = [];
          incoming.on('data', (part: Buffer) => parts.push(part));
          incoming.on('error', reject);
          incoming.on('end', () => {
            clearTimeout(timer);
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(incoming.headers))
              if (value !== undefined)
                headers[key] = Array.isArray(value) ? value.join(', ') : value;
            resolve(
              new ApiResponse(incoming.statusCode ?? 0, headers, Buffer.concat(parts), request),
            );
          });
        },
      );
      const timer = setTimeout(
        () => outgoing.destroy(new Error('HTTP request timed out')),
        request.timeoutMs,
      );
      outgoing.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      outgoing.end(request.body);
    });
  }
}
