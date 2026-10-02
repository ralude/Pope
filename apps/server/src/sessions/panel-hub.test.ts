import { describe, expect, it } from 'vitest';

import { cookieFrom } from './panel-hub.js';

describe('cookie del canal del panel', () => {
  it('lee la cookie pedida entre varias, decodificada', () => {
    expect(cookieFrom('a=1; pope_staff_session=abc%3D%3D; b=2', 'pope_staff_session')).toBe(
      'abc==',
    );
    expect(cookieFrom('pope_staff_session=x=y', 'pope_staff_session')).toBe('x=y');
  });

  it('sin cabecera, sin esa cookie o mal codificada, no hay token', () => {
    expect(cookieFrom(undefined, 'pope_staff_session')).toBeNull();
    expect(cookieFrom('otra=1', 'pope_staff_session')).toBeNull();
    expect(cookieFrom('pope_staff_session=%E0%A4%A', 'pope_staff_session')).toBeNull();
  });
});
