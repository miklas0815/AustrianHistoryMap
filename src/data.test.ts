import { describe, expect, it } from 'vitest';
import { fetchJson } from './data';

function fakeFetch(bodies: string[]) {
  const calls: RequestCache[] = [];
  const fn = (async (_url: string, init?: RequestInit) => {
    calls.push(init?.cache ?? 'default');
    return new Response(bodies[calls.length - 1]);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('fetchJson', () => {
  it('lädt eine abgeschnittene Datei einmal frisch nach', async () => {
    const { fn, calls } = fakeFetch(['{"a": 48.2', '{"a": 48.2082}']);
    expect(await fetchJson('data/maler.json', fn)).toEqual({ a: 48.2082 });
    expect(calls).toEqual(['default', 'reload']);
  });

  it('meldet einen Fehler, wenn auch der zweite Versuch scheitert', async () => {
    const { fn } = fakeFetch(['{"a": 48.2', '{"a": 48.2']);
    await expect(fetchJson('data/maler.json', fn)).rejects.toThrow(/^maler\.json konnte nicht geladen werden/);
  });

  it('braucht bei einer intakten Datei nur einen Versuch', async () => {
    const { fn, calls } = fakeFetch(['[1, 2]']);
    expect(await fetchJson('data/x.json', fn)).toEqual([1, 2]);
    expect(calls).toEqual(['default']);
  });
});
