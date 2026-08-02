import { describe, it, expect, afterEach, vi } from 'vitest';
import { envVars } from '../../assets/js/env.js';

// env.js only reads window.location.hostname, so a minimal stub is enough.
function setHostname(hostname) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { hostname },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('envVars — identity by hostname', () => {
  it('tuckermclean.com → Tucker McLean / TM', async () => {
    setHostname('tuckermclean.com');
    const env = await envVars(false);
    expect(env.NAME).toBe('Tucker McLean');
    expect(env.INITIALS).toBe('TM');
    expect(env.EMAIL).toBe('me@tuckermclean.com');
  });

  it('www.tuckermclean.com collapses to the last two labels', async () => {
    setHostname('www.tuckermclean.com');
    const env = await envVars(false);
    expect(env.DOMAIN_NAME).toBe('tuckermclean.com');
    expect(env.NAME).toBe('Tucker McLean');
  });

  it('alijamaluddin.com → Ali Jamaluddin / AJ', async () => {
    setHostname('alijamaluddin.com');
    const env = await envVars(false);
    expect(env.NAME).toBe('Ali Jamaluddin');
    expect(env.INITIALS).toBe('AJ');
    expect(env.EMAIL).toBe('me@alijamaluddin.com');
  });

  it('technomantics.com → Developer McDev / DM', async () => {
    setHostname('technomantics.com');
    const env = await envVars(false);
    expect(env.NAME).toBe('Developer McDev');
    expect(env.INITIALS).toBe('DM');
    expect(env.EMAIL).toBe('fakedev@technomantics.com');
  });

  it('unknown host defaults to the Tucker McLean identity', async () => {
    setHostname('example.org');
    const env = await envVars(false);
    expect(env.NAME).toBe('Tucker McLean');
    expect(env.INITIALS).toBe('TM');
  });
});

describe('envVars — URL derivation', () => {
  it('derives BASE / API / WS urls from the domain', async () => {
    setHostname('tuckermclean.com');
    const env = await envVars(false);
    expect(env.BASE_URL).toBe('https://tuckermclean.com/');
    expect(env.API_BASE_URL).toBe('https://api.tuckermclean.com/');
    expect(env.API_WS_BASE_URL).toBe('wss://api-ws.tuckermclean.com/');
  });
});

describe('envVars — clientConfig merge', () => {
  it('merges fetched clientConfig over the base vars', async () => {
    setHostname('tuckermclean.com');
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ NAME: 'Overridden', COGNITO_CLIENT_ID: 'abc123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const env = await envVars(true);

    expect(fetchMock).toHaveBeenCalledWith('https://api.tuckermclean.com/clientConfig');
    expect(env.NAME).toBe('Overridden');
    expect(env.COGNITO_CLIENT_ID).toBe('abc123');
  });
});
