import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { AdminClipuriTab } from '../../src/admin/AdminClipuriTab';
import type { AdminReelRow } from '../../src/lib/adminApi';

/**
 * Ecranul benzii cu clipuri.
 *
 * Contractul păzit aici: ecranul NU acceptă o cale care n-arată a fișier din
 * `public/reels/`, linkul lipit din Instagram își pierde coada singur, iar
 * refuzul serverului ajunge la om în cuvintele lui. Numărul clipului nu se
 * tastează niciodată — îl pune serverul, iar butonul îl arată dinainte.
 *
 * Validarea din formular nu e apărarea reală: constrângerile din baza de date
 * sînt. Rostul ei e să nu trimită omul la server ca să afle ce vede ecranul.
 */

const { listTrainingReels, saveTrainingReel, moveTrainingReel, deleteTrainingReel, mesajRefuzClip } =
  vi.hoisted(() => ({
    listTrainingReels: vi.fn(),
    saveTrainingReel: vi.fn(),
    moveTrainingReel: vi.fn(),
    deleteTrainingReel: vi.fn(),
    mesajRefuzClip: vi.fn((e: unknown) =>
      String(e).includes('training_reels_un_fisier') ? 'Clipul e deja în bandă.' : 'eroare'
    ),
  }));

vi.mock('../../src/lib/adminApi', () => ({
  listTrainingReels,
  saveTrainingReel,
  moveTrainingReel,
  deleteTrainingReel,
  mesajRefuzClip,
}));

const showToast = vi.fn();
const onAuthError = vi.fn(() => false);

const rand = (over: Partial<AdminReelRow> = {}): AdminReelRow => ({
  id: 'r1',
  numar: 1,
  video: '/reels/marti.mp4',
  poster: '/reels/marti.jpg',
  caption: 'Marți în parc',
  url: 'https://www.instagram.com/reel/AAAAA11111/',
  vizibil: true,
  ...over,
});

const inregistreazaGardaIesire = vi.fn();

const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="tok" onAuthError={onAuthError} showToast={showToast}>
      <AdminClipuriTab inregistreazaGardaIesire={inregistreazaGardaIesire} />
    </FurnizorSesiuneAdmin>
  );

/** Ultima gardă predată dashboardului. */
const garda = (): (() => boolean) =>
  inregistreazaGardaIesire.mock.calls.filter((c) => c[0]).at(-1)![0];

const camp = (eticheta: string) =>
  screen.getByLabelText(eticheta, { exact: false }) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  listTrainingReels.mockResolvedValue([]);
  saveTrainingReel.mockResolvedValue('id-nou');
  moveTrainingReel.mockResolvedValue(1);
  deleteTrainingReel.mockResolvedValue(1);
});

afterEach(cleanup);

describe('banda goală', () => {
  it('spune că secțiunea nu apare, în loc să arate o listă goală', async () => {
    randeaza();
    expect(await screen.findByText(/Niciun clip/)).toBeDefined();
  });

  it('butonul de adăugare arată dinainte ce număr va primi clipul', async () => {
    randeaza();
    expect(await screen.findByText(/Clip nou \(va fi 01\)/)).toBeDefined();
  });
});

describe('lista', () => {
  it('arată clipurile cu numărul și fișierul lor', async () => {
    listTrainingReels.mockResolvedValue([rand(), rand({ id: 'r2', numar: 2, caption: 'Joi', video: '/reels/joi.mp4' })]);
    randeaza();
    expect(await screen.findByText('Marți în parc')).toBeDefined();
    expect(screen.getByText('Joi')).toBeDefined();
    expect(screen.getByText('/reels/marti.mp4')).toBeDefined();
  });

  it('un clip ascuns e marcat ca atare', async () => {
    listTrainingReels.mockResolvedValue([rand({ vizibil: false })]);
    randeaza();
    await screen.findByText('Marți în parc');
    expect(screen.getByText(/ascuns/)).toBeDefined();
  });

  it('primul clip nu se poate muta mai sus, ultimul nu mai jos', async () => {
    listTrainingReels.mockResolvedValue([rand(), rand({ id: 'r2', numar: 2, caption: 'Joi', video: '/reels/joi.mp4' })]);
    randeaza();
    await screen.findByText('Marți în parc');
    expect(screen.getByLabelText(/Mută „Marți în parc” mai sus/).hasAttribute('disabled')).toBe(
      true
    );
    expect(screen.getByLabelText(/Mută „Joi” mai jos/).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText(/Mută „Joi” mai sus/).hasAttribute('disabled')).toBe(false);
  });

  it('mutarea cere serverului direcția, nu lista întreagă', async () => {
    listTrainingReels.mockResolvedValue([rand(), rand({ id: 'r2', numar: 2, caption: 'Joi', video: '/reels/joi.mp4' })]);
    randeaza();
    await screen.findByText('Joi');
    fireEvent.click(screen.getByLabelText(/Mută „Joi” mai sus/));
    await waitFor(() => expect(moveTrainingReel).toHaveBeenCalledWith('tok', 'r2', -1));
  });

  it('scoaterea spune explicit că fișierul rămâne în repo', async () => {
    listTrainingReels.mockResolvedValue([rand()]);
    randeaza();
    await screen.findByText('Marți în parc');
    fireEvent.click(screen.getByLabelText(/Scoate clipul „Marți în parc”/));
    await waitFor(() => expect(deleteTrainingReel).toHaveBeenCalledWith('tok', 'r1'));
    expect(showToast.mock.calls.at(-1)?.[0].msg).toMatch(/rămâne în repo/);
  });
});

describe('formularul refuză înainte să deranjeze serverul', () => {
  const completeaza = (over: Partial<Record<string, string>> = {}) => {
    fireEvent.change(camp('Calea clipului'), {
      target: { value: over.video ?? '/reels/marti.mp4' },
    });
    fireEvent.change(camp('Legenda'), { target: { value: over.caption ?? 'Marți' } });
    fireEvent.change(camp('Linkul postării'), {
      target: { value: over.url ?? 'https://www.instagram.com/reel/AAAAA11111/' },
    });
  };

  it('o cale care nu e /reels/*.mp4 nu pleacă la server', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    completeaza({ video: 'https://alt-domeniu.example/x.mp4' });
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă în bandă' }));
    expect(saveTrainingReel).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/npm run reel/);
  });

  it('legenda goală nu pleacă la server — ea e ce citește un cititor de ecran', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    completeaza({ caption: '   ' });
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă în bandă' }));
    expect(saveTrainingReel).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/cititor de ecran/);
  });

  it('posterul gol e permis — cardul are marcajul desenat ca rezervă', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    completeaza();
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă în bandă' }));
    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel.mock.calls[0][3]).toBe('');
  });
});

describe('linkul lipit din Instagram', () => {
  it('își pierde coada de urmărire la lipire', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(camp('Linkul postării'), {
      target: { value: 'https://www.instagram.com/reel/ABC12345/?igsh=MXY123abc' },
    });
    expect(camp('Linkul postării').value).toBe('https://www.instagram.com/reel/ABC12345/');
  });

  it('„/reels/" pluralul din share-ul de browser se normalizează la „reel"', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(camp('Linkul postării'), {
      target: { value: 'https://instagram.com/reels/XYZ98765/' },
    });
    expect(camp('Linkul postării').value).toBe('https://www.instagram.com/reel/XYZ98765/');
  });

  it('o postare rămâne pe ruta „/p/" — Instagram n-o servește pe cealaltă', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(camp('Linkul postării'), {
      target: { value: 'https://www.instagram.com/p/QWE45678/?img_index=1' },
    });
    expect(camp('Linkul postării').value).toBe('https://www.instagram.com/p/QWE45678/');
  });
});

describe('salvarea', () => {
  it('un clip nou pleacă fără id — numărul îl pune serverul', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(camp('Calea clipului'), { target: { value: '/reels/marti.mp4' } });
    fireEvent.change(camp('Legenda'), { target: { value: 'Marți' } });
    fireEvent.change(camp('Linkul postării'), {
      target: { value: 'https://www.instagram.com/reel/AAAAA11111/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă în bandă' }));

    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel.mock.calls[0][1]).toBeNull();
  });

  it('editarea unui clip existent îi trimite id-ul', async () => {
    listTrainingReels.mockResolvedValue([rand()]);
    randeaza();
    await screen.findByText('Marți în parc');
    fireEvent.click(screen.getByRole('button', { name: 'Editează' }));
    fireEvent.change(camp('Legenda'), { target: { value: 'Altă legendă' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel.mock.calls[0][1]).toBe('r1');
    expect(saveTrainingReel.mock.calls[0][4]).toBe('Altă legendă');
  });

  it('refuzul serverului ajunge la om, în cuvintele lui', async () => {
    saveTrainingReel.mockRejectedValue(new Error('training_reels_un_fisier'));
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(camp('Calea clipului'), { target: { value: '/reels/marti.mp4' } });
    fireEvent.change(camp('Legenda'), { target: { value: 'Marți' } });
    fireEvent.change(camp('Linkul postării'), {
      target: { value: 'https://www.instagram.com/reel/AAAAA11111/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă în bandă' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Clipul e deja în bandă.');
  });
});

describe('garda de ieșire', () => {
  it('cu editorul gol, schimbarea tabului trece fără întrebare', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    expect(garda()()).toBe(true);
  });

  it('cu un clip început, schimbarea tabului cere confirmare', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(camp('Legenda'), { target: { value: 'Marți' } });

    expect(garda()()).toBe(false);
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('confirmarea lasă omul să plece', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(camp('Calea clipului'), { target: { value: '/reels/marti.mp4' } });

    expect(garda()()).toBe(true);
    confirm.mockRestore();
  });
});
