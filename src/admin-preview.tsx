/**
 * Preview DOAR PENTRU DEZVOLTARE al backoffice-ului, cu date false.
 *
 * De ce există: `/admin` cere un cont real, deci orice lucru de design pe
 * dashboard însemna fie login în producție (cu date reale pe ecran), fie
 * ghicit din cod. Aici stub-uim `fetch` peste RPC-urile Supabase și randăm
 * dashboardul complet, cu date plauzibile.
 *
 * NU e inclus în build-ul de producție: `vite.config.ts` construiește doar
 * `index.html`, iar fișierul ăsta e importat exclusiv din `admin-preview.html`.
 * Se deschide cu `npm run dev` → /admin-preview.html
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AdminDashboard } from './admin/AdminDashboard';
import { SNAPSHOT_CONFIG } from './content/eventConfig';

const ACUM = Date.now();
const cuOreInUrma = (h: number) => new Date(ACUM - h * 3_600_000).toISOString();
const cuZileInUrma = (z: number) => new Date(ACUM - z * 86_400_000).toISOString();

const NUME: [string, string][] = [
  ['Cernei', 'Andrei'], ['Rusu', 'Maria'], ['Vlah', 'Dumitru'], ['Postică', 'Ana'],
  ['Groza', 'Igor'], ['Ceban', 'Elena'], ['Munteanu', 'Vasile'], ['Lungu', 'Cristina'],
  ['Bejan', 'Radu'], ['Ursu', 'Tatiana'], ['Zaharia', 'Mihai'], ['Cojocaru', 'Diana'],
  ['Grosu', 'Sergiu'], ['Balan', 'Irina'], ['Pînzaru', 'Victor'], ['Sîrbu', 'Olga'],
  ['Damian', 'Nicolae'], ['Frunze', 'Alina'], ['Melnic', 'Pavel'], ['Ostafi', 'Natalia'],
];

const inscrieri = NUME.map(([nume, prenume], i) => ({
  id: `reg-${i}`,
  created_at: cuOreInUrma(i * 7 + 2),
  nume,
  prenume,
  telefon: `069${String(100000 + i * 4137).slice(0, 6)}`,
  email: `${prenume.toLowerCase()}.${nume.toLowerCase().replace(/[^a-z]/g, '')}@gmail.com`,
  echipa: '',
  editie: 5,
  dezabonat_la: i === 11 ? cuZileInUrma(2) : null,
}));

const asteptare = NUME.slice(0, 3).map(([nume, prenume], i) => ({
  id: `wl-${i}`,
  created_at: cuOreInUrma(i * 5 + 1),
  nume: `${nume} (listă)`,
  prenume,
  telefon: `069${String(700000 + i * 311).slice(0, 6)}`,
  email: `lista${i}@gmail.com`,
  editie: 5,
}));

const jurnal = inscrieri.slice(0, 14).map((r, i) => ({
  id: `log-${i}`,
  created_at: cuOreInUrma(i * 3 + 1),
  email: r.email,
  nume: `${r.prenume} ${r.nume}`,
  subiect: i % 3 === 0 ? 'Reminder: mâine la 07:00' : 'Confirmare înscriere Run + Lift',
  text_email: 'Ne vedem la Scările de Granit.',
  mod: 'admin',
  audienta: 'participanti',
  status: i === 4 ? 'esuat' : 'trimis',
  provider_status: i === 4 ? 422 : 200,
  eroare: i === 4 ? 'Adresă respinsă de provider' : null,
  editie: 5,
}));

const evenimente = [
  { id: 'ev-1', created_at: cuOreInUrma(1), tip: 'inscriere', detaliu: { nume: 'Ana Postică' } },
  { id: 'ev-2', created_at: cuOreInUrma(4), tip: 'waitlist_promote', detaliu: { nume: 'Radu Bejan' } },
  { id: 'ev-3', created_at: cuOreInUrma(9), tip: 'config_publish', detaliu: { editie: 5 } },
  { id: 'ev-4', created_at: cuOreInUrma(26), tip: 'email_bulk', detaliu: { count: 18 } },
];

const editii = [
  { editie: 5, participanti: 20, asteptare: 3, lansare: 41, prima: cuZileInUrma(21), ultima: cuOreInUrma(2), este_curenta: true },
  { editie: 4, participanti: 34, asteptare: 6, lansare: 52, prima: cuZileInUrma(70), ultima: cuZileInUrma(41), este_curenta: false },
  { editie: 3, participanti: 28, asteptare: 2, lansare: 37, prima: cuZileInUrma(120), ultima: cuZileInUrma(96), este_curenta: false },
];

const lansare = NUME.slice(0, 9).map(([nume, prenume], i) => ({
  id: `l-${i}`,
  created_at: cuOreInUrma(i * 11 + 3),
  nume,
  prenume,
  email: `${prenume.toLowerCase()}@mail.com`,
  telefon: `069${String(200000 + i * 733).slice(0, 6)}`,
  editie: 5,
  sursa: i % 3 === 0 ? 'despre-noi' : 'lansare',
  confirmat_la: i % 2 === 0 ? cuOreInUrma(i * 11 + 1) : null,
}));

const sabloane = [
  { cheie: 'confirmare', subiect: 'Te-ai înscris la Run + Lift', text_email: 'Ne vedem pe 22 august.', actualizat_la: cuZileInUrma(9) },
  { cheie: 'reminder', subiect: 'Mâine alergăm', text_email: 'Check-in de la 06:30.', actualizat_la: cuZileInUrma(9) },
  { cheie: 'anunt', subiect: 'Ediție nouă Run + Lift', text_email: 'S-au deschis înscrierile.', actualizat_la: cuZileInUrma(30) },
  { cheie: 'badge', subiect: 'Numărul tău de concurs', text_email: 'Ai numărul 14.', actualizat_la: cuZileInUrma(30) },
];

const configPublicat = {
  id: 'cfg-pub',
  editie: 5,
  config: SNAPSHOT_CONFIG,
  status: 'published',
  created_at: cuZileInUrma(20),
  published_at: cuZileInUrma(20),
};

const RASPUNSURI: Record<string, unknown> = {
  admin_check_token: true,
  admin_list_registrations: inscrieri,
  admin_list_waitlist: asteptare,
  admin_list_email_log: jurnal,
  admin_list_events: evenimente,
  admin_list_editions: editii,
  admin_list_launch_notifications: lansare,
  admin_list_email_templates: sabloane,
  admin_get_event_config: [configPublicat],
  admin_login: 'token-preview',
  admin_logout: null,
};

// Stub-ul de rețea. Orice RPC necunoscut întoarce `null`, ca preview-ul să nu
// cadă dacă apare un apel nou în cod.
const fetchReal = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const m = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
  if (!m) return fetchReal(input as RequestInfo, init);
  await new Promise((r) => setTimeout(r, 120)); // latență plauzibilă
  const body = m[1] in RASPUNSURI ? RASPUNSURI[m[1]] : null;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminDashboard token="token-preview" onLogout={() => location.reload()} />
  </StrictMode>
);
