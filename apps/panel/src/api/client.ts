// Cliente de la API del nodo para el panel. Valida cada respuesta con los esquemas de
// `@pope/shared` (AGENTS.md: toda entrada externa se valida con zod) y convierte cualquier
// fallo en un `ApiError` con un mensaje en español listo para mostrar.

/** Lo que el cliente necesita de un esquema de zod. */
export interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** Un problema de validación de un campo, tal como lo devuelve el nodo. */
export interface FieldIssue {
  path: string;
  message: string;
}

export const NETWORK_ERROR = 'No se puede conectar con el nodo local. Revisa que esté encendido.';
export const UNEXPECTED_RESPONSE = 'El nodo respondió algo inesperado. Recarga la página.';
export const SESSION_EXPIRED = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

/** Mensaje por defecto de cada código, si el nodo no da uno. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Revisa los datos.',
  401: SESSION_EXPIRED,
  403: 'No tienes permiso para hacer esto.',
  404: 'No existe.',
  409: 'No se puede hacer ahora.',
};

/** Un fallo al hablar con el nodo, con un mensaje para el encargado. */
export class ApiError extends Error {
  constructor(
    /** Código HTTP; 0 si no hubo respuesta. */
    readonly status: number,
    message: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
  }
}

/** Ruta del login: su 401 es "usuario o contraseña incorrectos", no una sesión caducada. */
const LOGIN_PATH = '/auth/login';

export interface ApiClientOptions {
  /** `fetch` a usar; los tests pasan uno falso. */
  fetch?: typeof fetch;
  /** Se llama cuando la sesión del personal deja de valer (401 fuera del login). */
  onUnauthorized?: () => void;
}

export class ApiClient {
  private readonly fetchFn: typeof fetch;
  private readonly onUnauthorized: (() => void) | undefined;

  constructor(options: ApiClientOptions = {}) {
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.onUnauthorized = options.onUnauthorized;
  }

  get<T>(path: string, schema: Schema<T>): Promise<T> {
    return this.request('GET', path, schema);
  }

  post<T>(path: string, body: unknown, schema: Schema<T>): Promise<T> {
    return this.request('POST', path, schema, body);
  }

  put<T>(path: string, body: unknown, schema: Schema<T>): Promise<T> {
    return this.request('PUT', path, schema, body);
  }

  patch<T>(path: string, body: unknown, schema: Schema<T>): Promise<T> {
    return this.request('PATCH', path, schema, body);
  }

  /** Petición sin respuesta que leer (p. ej. 204). */
  async send(method: string, path: string, body?: unknown): Promise<void> {
    await this.raw(method, path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    schema: Schema<T>,
    body?: unknown,
  ): Promise<T> {
    const response = await this.raw(method, path, body);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(response.status, UNEXPECTED_RESPONSE);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new ApiError(response.status, UNEXPECTED_RESPONSE);
    }
    return parsed.data;
  }

  private async raw(method: string, path: string, body?: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchFn(path, {
        method,
        credentials: 'same-origin',
        // Fastify rechaza `application/json` con el cuerpo vacío.
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, NETWORK_ERROR);
    }
    if (response.ok) {
      return response;
    }
    if (response.status === 401 && path !== LOGIN_PATH) {
      this.onUnauthorized?.();
    }
    throw await errorFrom(response);
  }
}

/** Saca el mensaje del nodo (`message` de NestJS) y los problemas de cada campo. */
async function errorFrom(response: Response): Promise<ApiError> {
  const fallback = STATUS_MESSAGES[response.status] ?? 'Error del nodo. Inténtalo de nuevo.';
  let detail: unknown;
  try {
    detail = await response.json();
  } catch {
    return new ApiError(response.status, fallback);
  }
  if (typeof detail !== 'object' || detail === null) {
    return new ApiError(response.status, fallback);
  }
  const record = detail as { message?: unknown; issues?: unknown };
  let message = fallback;
  if (typeof record.message === 'string' && record.message.trim()) {
    message = record.message;
  } else if (Array.isArray(record.message)) {
    message = record.message.filter((m) => typeof m === 'string').join('. ') || fallback;
  }
  const issues = Array.isArray(record.issues)
    ? record.issues.filter(
        (i): i is FieldIssue =>
          typeof i === 'object' &&
          i !== null &&
          typeof (i as FieldIssue).path === 'string' &&
          typeof (i as FieldIssue).message === 'string',
      )
    : [];
  return new ApiError(response.status, message, issues);
}
