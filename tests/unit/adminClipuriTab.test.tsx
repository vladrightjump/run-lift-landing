import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { AdminClipuriTab } from '../../src/admin/AdminClipuriTab';
import type { AdminReelRow } from '../../src/lib/adminApi';

/**
 * Ecranul benzii cu clipuri.
 *
 * Contractul păzit aici: linkul de YouTube se normalizează la identificator
 * indiferent de forma lipită, ecranul NU acceptă altceva, linkul de Instagram
 * își pierde coada singur, iar refuzul serverului ajunge la om în cuvintele
 * lui. Numărul clipului nu se tastează niciodată — îl pune serverul, iar
 * butonul îl arată dinainte.
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
      String(e).includes('training_reels_un_youtube') ? 'Clipul e deja în bandă.' : 'eroare'
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
  youtube: 'dQw4w9WgXcQ',
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
  it('arată clipurile cu numărul și identificatorul lor', async () => {
    listTrainingReels.mockResolvedValue([rand(), rand({ id: 'r2', numar: 2, caption: 'Joi', youtube: '_-Ab0123456' })]);
    randeaza();
    expect(await screen.findByText('Marți în parc')).toBeDefined();
    expect(screen.getByText('Joi')).toBeDefined();
    expect(screen.getByText('dQw4w9WgXcQ')).toBeDefined();
  });

  it('un clip ascuns e marcat ca atare', async () => {
    listTrainingReels.mockResolvedValue([rand({ vizibil: false })]);
    randeaza();
    await screen.findByText('Marți în parc');
    expect(screen.getByText(/ascuns/)).toBeDefined();
  });

  it('reordonarea se face alegând poziția, nu ciocănind rând cu rând', async () => {
    // Erau două butoane de direcție pe FIECARE rând, unul mereu dezactivat la
    // capete. Zece clipuri însemnau douăzeci de butoane.
    listTrainingReels.mockResolvedValue([rand(), rand({ id: 'r2', numar: 2, caption: 'Joi', youtube: '_-Ab0123456' })]);
    randeaza();
    await screen.findByText('Marți în parc');
    expect(screen.queryByLabelText(/mai sus/)).toBeNull();
    expect(screen.queryByLabelText(/mai jos/)).toBeNull();
    expect(screen.getByLabelText('Poziția pentru „Joi”')).toBeDefined();
  });

  it('mutarea pe o poziție se traduce în pași de câte unul', async () => {
    // Serverul mută cu un singur pas. O mutare de pe 3 pe 1 e două apeluri.
    listTrainingReels.mockResolvedValue([
      rand(),
      rand({ id: 'r2', numar: 2, caption: 'Joi', youtube: '_-Ab0123456' }),
      rand({ id: 'r3', numar: 3, caption: 'Sâmbătă', youtube: 'ZZbb1122334' }),
    ]);
    randeaza();
    await screen.findByText('Sâmbătă');
    fireEvent.change(screen.getByLabelText('Poziția pentru „Sâmbătă”'), {
      target: { value: '1' },
    });
    await waitFor(() => expect(moveTrainingReel).toHaveBeenCalledTimes(2));
    expect(moveTrainingReel).toHaveBeenCalledWith('tok', 'r3', -1);
  });

  it('scoaterea nu pretinde că a șters clipul de pe gazdă', async () => {
    listTrainingReels.mockResolvedValue([rand()]);
    randeaza();
    await screen.findByText('Marți în parc');
    fireEvent.click(screen.getByLabelText(/Scoate clipul „Marți în parc”/));
    await waitFor(() => expect(deleteTrainingReel).toHaveBeenCalledWith('tok', 'r1'));
    expect(showToast.mock.calls.at(-1)?.[0].msg).toMatch(/a ieșit din bandă/);
  });
});

describe('formularul refuză înainte să deranjeze serverul', () => {
  const completeaza = (over: Partial<Record<string, string>> = {}) => {
    fireEvent.change(camp('Linkul clipului de pe YouTube'), {
      target: { value: over.youtube ?? 'https://www.youtube.com/shorts/dQw4w9WgXcQ' },
    });
    fireEvent.change(camp('Legenda'), { target: { value: over.caption ?? 'Marți' } });
    fireEvent.change(camp('Linkul postării'), {
      target: { value: over.url ?? 'https://www.instagram.com/reel/AAAAA11111/' },
    });
  };

  it('un link care nu e YouTube nu pleacă la server', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    completeaza({ youtube: 'https://alt-domeniu.example/x.mp4' });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    expect(saveTrainingReel).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/clip YouTube/);
  });

  it('legenda goală nu pleacă la server — ea e ce citește un cititor de ecran', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    completeaza({ caption: '   ' });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    expect(saveTrainingReel).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/cititor de ecran/);
  });

  it('un link valid pleacă la server ca identificator, nu ca adresă', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    completeaza();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel.mock.calls[0][2]).toBe('dQw4w9WgXcQ');
  });
});

describe('linkul lipit din YouTube', () => {
  const link = () => camp('Linkul clipului de pe YouTube');

  it.each([
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'linkul scurt de pe telefon'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share', 'pagina de Shorts'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=15', 'partajarea de pe desktop'],
  ])('%s se reduce la identificator (%s)', async (lipit) => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(link(), { target: { value: lipit } });
    expect(link().value).toBe('dQw4w9WgXcQ');
  });

  it('un link de pe altă gazdă rămâne în câmp și cade la validare', async () => {
    // Nu se golește: un text care dispare fără explicație e mai rău decât unul
    // care ajunge la validare, unde există un mesaj pentru exact cazul ăsta.
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(link(), { target: { value: 'https://vimeo.com/123456789' } });
    expect(link().value).toBe('https://vimeo.com/123456789');

    fireEvent.change(camp('Legenda'), { target: { value: 'Marți' } });
    fireEvent.change(camp('Linkul postării'), {
      target: { value: 'https://www.instagram.com/reel/AAAAA11111/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    expect(saveTrainingReel).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/clip YouTube/);
  });

  it('se poate TASTA un link, nu doar lipi — caracterele nu se mai pierd', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    // Tastarea trimite un `change` per caracter, cu text incomplet de fiecare
    // dată. Înainte, fiecare dintre ele golea câmpul.
    fireEvent.change(link(), { target: { value: 'https://yout' } });
    expect(link().value).toBe('https://yout');
    fireEvent.change(link(), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    expect(link().value).toBe('dQw4w9WgXcQ');
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
    fireEvent.change(camp('Linkul clipului de pe YouTube'), {
      target: { value: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' },
    });
    fireEvent.change(camp('Legenda'), { target: { value: 'Marți' } });
    fireEvent.change(camp('Linkul postării'), {
      target: { value: 'https://www.instagram.com/reel/AAAAA11111/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel.mock.calls[0][1]).toBeNull();
  });

  it('deschiderea unui clip existent nu-l declară nesalvat', async () => {
    // Câmpurile se umplu la deschidere. Un „nesalvat" dedus din ele ar minți
    // din prima clipă și ar cere confirmare la plecare fără nicio schimbare.
    listTrainingReels.mockResolvedValue([rand()]);
    randeaza();
    await screen.findByText('Marți în parc');
    fireEvent.click(screen.getByRole('button', { name: 'Editează' }));
    expect(screen.queryByText('Nesalvat')).toBeNull();
    expect(garda()()).toBe(true);
  });

  it('după o tastare, clipul deschis devine nesalvat', async () => {
    listTrainingReels.mockResolvedValue([rand()]);
    randeaza();
    await screen.findByText('Marți în parc');
    fireEvent.click(screen.getByRole('button', { name: 'Editează' }));
    fireEvent.change(camp('Legenda'), { target: { value: 'Altceva' } });
    expect(screen.getByText('Nesalvat')).toBeDefined();
  });

  it('editarea unui clip existent îi trimite id-ul', async () => {
    listTrainingReels.mockResolvedValue([rand()]);
    randeaza();
    await screen.findByText('Marți în parc');
    fireEvent.click(screen.getByRole('button', { name: 'Editează' }));
    fireEvent.change(camp('Legenda'), { target: { value: 'Altă legendă' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel.mock.calls[0][1]).toBe('r1');
    expect(saveTrainingReel.mock.calls[0][3]).toBe('Altă legendă');
  });

  it('un clip vizibil nu oferă „Salvează" — editarea lui se scrie doar prin „Publică"', async () => {
    // „Salvează" scria clipul ascuns, deci o legendă corectată pe un clip de pe
    // pagină îl scotea de pe pagină. Pe un clip vizibil nu există ciornă
    // separată: rândul public e singurul loc de scriere.
    listTrainingReels.mockResolvedValue([rand({ vizibil: true })]);
    randeaza();
    await screen.findByText('Marți în parc');
    fireEvent.click(screen.getByRole('button', { name: 'Editează' }));
    fireEvent.change(camp('Legenda'), { target: { value: 'Legendă corectată' } });

    expect(screen.queryByRole('button', { name: 'Salvează' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel.mock.calls[0][5]).toBe(true);
  });

  it('„Salvează" pe un clip ascuns îl lasă ascuns', async () => {
    listTrainingReels.mockResolvedValue([rand({ vizibil: false })]);
    randeaza();
    await screen.findByText('Marți în parc');
    fireEvent.click(screen.getByRole('button', { name: 'Editează' }));
    fireEvent.change(camp('Legenda'), { target: { value: 'Încă nu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel.mock.calls[0][1]).toBe('r1');
    expect(saveTrainingReel.mock.calls[0][5]).toBe(false);
  });

  it('un clip nou se poate salva ascuns, înainte de publicare', async () => {
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(camp('Linkul clipului de pe YouTube'), {
      target: { value: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' },
    });
    fireEvent.change(camp('Legenda'), { target: { value: 'Marți' } });
    fireEvent.change(camp('Linkul postării'), {
      target: { value: 'https://www.instagram.com/reel/AAAAA11111/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel.mock.calls[0][5]).toBe(false);
  });

  it('refuzul serverului ajunge la om, în cuvintele lui', async () => {
    saveTrainingReel.mockRejectedValue(new Error('training_reels_un_youtube'));
    randeaza();
    await screen.findByText(/Niciun clip/);
    fireEvent.change(camp('Linkul clipului de pe YouTube'), {
      target: { value: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' },
    });
    fireEvent.change(camp('Legenda'), { target: { value: 'Marți' } });
    fireEvent.change(camp('Linkul postării'), {
      target: { value: 'https://www.instagram.com/reel/AAAAA11111/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

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
    fireEvent.change(camp('Linkul clipului de pe YouTube'), {
      target: { value: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' },
    });

    expect(garda()()).toBe(true);
    confirm.mockRestore();
  });
});

describe('vizibilitatea din listă', () => {
  it('un clip vizibil se poate ascunde din rândul lui, fără să-l scoți din bandă', async () => {
    // „Salvează" nu mai ascunde un clip vizibil, deci rândul trebuie să ofere
    // drumul explicit — altfel singura cale de a-l lua de pe pagină ar fi ștergerea.
    listTrainingReels.mockResolvedValue([rand({ vizibil: true })]);
    randeaza();
    await screen.findByText('Marți în parc');
    fireEvent.click(screen.getByRole('button', { name: 'Ascunde clipul „Marți în parc”' }));

    await waitFor(() => expect(saveTrainingReel).toHaveBeenCalled());
    expect(saveTrainingReel).toHaveBeenCalledWith(
      'tok',
      'r1',
      'dQw4w9WgXcQ',
      'Marți în parc',
      'https://www.instagram.com/reel/AAAAA11111/',
      false
    );
  });

  it('un clip ascuns oferă „Arată", nu „Ascunde"', async () => {
    listTrainingReels.mockResolvedValue([rand({ vizibil: false })]);
    randeaza();
    await screen.findByText('Marți în parc');
    expect(screen.getByRole('button', { name: 'Arată clipul „Marți în parc”' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Ascunde clipul/ })).toBeNull();
  });
});
