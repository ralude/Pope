// Cliente mínimo de la API del panel: lo justo para preparar los clientes de prueba como lo
// haría un encargado (así quedan todos sus eventos y su turno).
import {
  type Customer,
  customerPageSchema,
  customerSchema,
  currentShiftResponseSchema,
  type Micros,
} from '@pope/shared';

/** Lo que `seed` necesita del panel; los tests lo sustituyen por uno falso. */
export interface PanelApi {
  login(username: string, password: string): Promise<void>;
  hasOpenShift(): Promise<boolean>;
  openShift(): Promise<void>;
  closeShift(): Promise<void>;
  findCustomer(username: string): Promise<Customer | null>;
  createCustomer(username: string, password: string): Promise<Customer>;
  recharge(customerId: string, amountMicros: Micros): Promise<Customer>;
}

/** El nodo contestó con un error; el mensaje es el suyo, en español. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class HttpPanelApi implements PanelApi {
  private cookie = '';

  constructor(private readonly baseUrl: string) {}

  private async request(method: string, path: string, body?: object): Promise<unknown> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers: {
        // Fastify rechaza `application/json` con el cuerpo vacío.
        ...(body && { 'content-type': 'application/json' }),
        ...(this.cookie && { cookie: this.cookie }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const message = typeof detail?.message === 'string' ? detail.message : response.statusText;
      throw new ApiError(response.status, `${method} ${path}: ${message}`);
    }
    return response.status === 204 ? null : await response.json();
  }

  async login(username: string, password: string): Promise<void> {
    const response = await fetch(new URL('/auth/login', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      throw new ApiError(response.status, 'Usuario o contraseña del personal incorrectos');
    }
    const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
    if (!cookie) {
      throw new ApiError(response.status, 'El nodo no devolvió la cookie de sesión');
    }
    this.cookie = cookie;
  }

  async hasOpenShift(): Promise<boolean> {
    const current = currentShiftResponseSchema.parse(await this.request('GET', '/shifts/current'));
    return current.shift !== null;
  }

  async openShift(): Promise<void> {
    await this.request('POST', '/shifts');
  }

  async closeShift(): Promise<void> {
    await this.request('POST', '/shifts/current/close');
  }

  async findCustomer(username: string): Promise<Customer | null> {
    const page = customerPageSchema.parse(
      await this.request('GET', `/customers?q=${encodeURIComponent(username)}&limit=100`),
    );
    return page.items.find((c) => c.username.toLowerCase() === username.toLowerCase()) ?? null;
  }

  async createCustomer(username: string, password: string): Promise<Customer> {
    return customerSchema.parse(await this.request('POST', '/customers', { username, password }));
  }

  async recharge(customerId: string, amountMicros: Micros): Promise<Customer> {
    return customerSchema.parse(
      await this.request('POST', `/customers/${customerId}/recharges`, {
        amountMicros,
        paymentMethod: 'cash_usd',
      }),
    );
  }
}
