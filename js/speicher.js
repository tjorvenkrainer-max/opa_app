// Alles, was lokal im Browser gespeichert wird (localStorage):
// Einstellungen, Kalibrierung und der Verlauf der letzten Sätze.
// Nichts davon verlässt den Laptop.

const K_EINSTELLUNGEN = 'opa.einstellungen';
const K_KALIBRIERUNG = 'opa.kalibrierung';
const K_VERLAUF = 'opa.verlauf';

export const STANDARD = {
  apiKey: '',
  modell: 'claude-haiku-5-5',
  verweildauer: 2, // Sekunden (1–4)
  // 1 = unempfindlich (weit schauen), 10 = sehr empfindlich.
  // UNTEN ist absichtlich empfindlicher, weil die Lider die Iris verdecken.
  empfindlichkeit: { links: 5, rechts: 5, oben: 5, unten: 7 },
  namen: '', // eine Zeile pro Person, z. B. "Anna (Tochter)"
  schrift: 1, // Faktor für die Schriftgröße
  obenAnderes: true, // Feld OBEN zeigt "Anderes" statt 3. Vorschlag
  satzMitte: false, // Satz in der Mitte statt oben anzeigen
  debug: false,
};

function lies(schluessel) {
  try {
    return JSON.parse(localStorage.getItem(schluessel));
  } catch {
    return null;
  }
}

function schreibe(schluessel, wert) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    // Speicher voll oder gesperrt: App läuft trotzdem weiter.
  }
}

export function ladeEinstellungen() {
  const g = lies(K_EINSTELLUNGEN) || {};
  return {
    ...STANDARD,
    ...g,
    empfindlichkeit: { ...STANDARD.empfindlichkeit, ...(g.empfindlichkeit || {}) },
  };
}

export function speichereEinstellungen(e) {
  schreibe(K_EINSTELLUNGEN, e);
}

// Aus "Anna (Tochter)\nPeter" wird ['Anna', 'Peter'].
export function namenListe(e) {
  return (e.namen || '')
    .split(/[\n,;]/)
    .map((z) => z.replace(/\(.*?\)/g, '').trim())
    .filter(Boolean);
}

export function ladeKalibrierung() {
  const k = lies(K_KALIBRIERUNG);
  return k && k.mitte && k.ziele ? k : null;
}

export function speichereKalibrierung(k) {
  schreibe(K_KALIBRIERUNG, k);
}

export function ladeVerlauf() {
  return lies(K_VERLAUF) || [];
}

// Neuen Satz vorne einfügen, nur die letzten 10 behalten.
export function merkeSatz(text) {
  const verlauf = [{ text, zeit: Date.now() }, ...ladeVerlauf()].slice(0, 10);
  schreibe(K_VERLAUF, verlauf);
  return verlauf;
}

export function loescheVerlauf() {
  schreibe(K_VERLAUF, []);
}

// Setzt die gewählten Teile zu einem Satz zusammen.
export function satzText(teile) {
  return teile.map((t) => t.text).join(' ');
}
