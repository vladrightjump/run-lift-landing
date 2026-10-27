// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useEcranCurent } from './useEcranCurent';

/**
 * Ecranul curent și adresa lui.
 *
 * Ce se păzește aici: de îndată ce ecranele se exclud, butonul „înapoi" al
 * browserului devine o așteptare rezonabilă. Fără fragment în URL, „înapoi"
 * scoate din `/admin` cu totul — pierzi tot contextul pentru că ai vrut să te
 * întorci un pas.
 *
 * Garda de ieșire stă tot aici, nu în bara de navigație: se navighează din trei
 * locuri (registru, linia de timp, semnalele de atenție), iar o gardă pusă pe
 * unul singur ar fi o gardă cu trei sferturi de gaură.
 */

afterEach(() => {
  cleanup();
  window.location.hash = '';
  window.history.replaceState(null, '', window.location.href);
});

describe('ecranul curent se citește din adresă', () => {
  it('marchează numai foile deschise din navigarea internă', () => {
    window.location.hash = '#prog-calendar';
    const { result } = renderHook(() => useEcranCurent('acum'));
    act(() => result.current.schimba('prog-azi', ['2026-10-21', 'bloc-1', '2', 'atribuire-1']));
    expect(window.history.state).toMatchObject({ programareFoaie: { data: '2026-10-21', atribuire: 'atribuire-1' } });
    expect(window.location.hash).toBe('#prog-azi/2026-10-21/bloc-1/2/atribuire-1');
  });

  it('o adresă directă a antrenamentului nu pretinde că are un pas anterior în admin', () => {
    window.location.hash = '#prog-azi/2026-10-21/bloc-1/1/atribuire-1';
    renderHook(() => useEcranCurent('acum'));
    expect(window.history.state?.programareFoaie).toBeUndefined();
  });
  it('păstrează parametrii și permite navigarea în același ecran', () => {
    window.history.replaceState(null, '', '#prog-azi/2026-10-21/bloc-1');
    const { result } = renderHook(() => useEcranCurent('acum'));
    expect(result.current.ecran).toBe('prog-azi');
    expect(result.current.parametri).toEqual(['2026-10-21', 'bloc-1']);
    act(() => result.current.schimba('prog-azi', ['2026-10-22']));
    expect(window.location.hash).toBe('#prog-azi/2026-10-22');
    expect(result.current.parametri).toEqual(['2026-10-22']);
    act(() => {
      window.location.hash = '#prog-azi/2026-10-21/bloc-1';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.parametri).toEqual(['2026-10-21', 'bloc-1']);
  });

  it('garda refuză schimbarea parametrilor și restaurează adresa completă', () => {
    window.history.replaceState(null, '', '#prog-programe/program-1');
    const { result } = renderHook(() => useEcranCurent('acum'));
    act(() => result.current.inregistreazaGardaIesire(() => false));
    act(() => {
      window.location.hash = '#prog-programe/program-2';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(window.location.hash).toBe('#prog-programe/program-1');
    expect(result.current.parametri).toEqual(['program-1']);
  });

  it('păstrează vechea adresă pentru persoane noi', () => {
    window.history.replaceState(null, '', '#grup-probe');
    const { result } = renderHook(() => useEcranCurent('acum'));
    expect(result.current.ecran).toBe('grup-probe');
    expect(result.current.parametri).toEqual([]);
  });
  it('pornește pe ecranul implicit când adresa nu spune nimic', () => {
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    expect(result.current.ecran).toBe('desfasurare');
  });

  it('pornește pe ecranul din fragment', () => {
    window.location.hash = '#clipuri';
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    expect(result.current.ecran).toBe('clipuri');
  });

  it('un fragment necunoscut cade pe ecranul implicit, nu pe ecran gol', () => {
    window.location.hash = '#nu-exista';
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    expect(result.current.ecran).toBe('desfasurare');
  });

  it('schimbarea ecranului scrie fragmentul', () => {
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    act(() => result.current.schimba('livrare'));
    expect(result.current.ecran).toBe('livrare');
    expect(window.location.hash).toBe('#livrare');
  });

  it('un „înapoi" din browser schimbă ecranul', () => {
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    act(() => result.current.schimba('clipuri'));

    act(() => {
      window.location.hash = '#participanti';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.ecran).toBe('participanti');
  });

  it('schimbarea spre ecranul în care ești deja nu face nimic', () => {
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    act(() => result.current.schimba('desfasurare'));
    expect(result.current.ecran).toBe('desfasurare');
  });
});

describe('garda de ieșire oprește plecarea dintr-un editor atins', () => {
  it('o gardă care refuză păstrează ecranul', () => {
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    act(() => result.current.inregistreazaGardaIesire(() => false));
    act(() => result.current.schimba('clipuri'));
    expect(result.current.ecran).toBe('desfasurare');
  });

  it('o gardă care acceptă lasă plecarea', () => {
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    act(() => result.current.inregistreazaGardaIesire(() => true));
    act(() => result.current.schimba('clipuri'));
    expect(result.current.ecran).toBe('clipuri');
  });

  it('garda retrasă nu mai blochează navigarea', () => {
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    act(() => result.current.inregistreazaGardaIesire(() => false));
    act(() => result.current.inregistreazaGardaIesire(null));
    act(() => result.current.schimba('clipuri'));
    expect(result.current.ecran).toBe('clipuri');
  });

  it('un „înapoi" refuzat de gardă pune fragmentul la loc', () => {
    // Altfel adresa ar spune un ecran, iar pe ecran ar fi altul — exact
    // minciuna pe care adresa trebuia s-o repare.
    const { result } = renderHook(() => useEcranCurent('desfasurare'));
    act(() => result.current.schimba('clipuri'));
    act(() => result.current.inregistreazaGardaIesire(() => false));

    act(() => {
      window.location.hash = '#participanti';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(result.current.ecran).toBe('clipuri');
    expect(window.location.hash).toBe('#clipuri');
  });
});
