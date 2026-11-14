// Hauptmodul: verbindet Eyetracking, Auswahl-Logik, KI/Wortbaum und UI.
//
// Ablauf: Einrichten (Kamera prüfen) -> Kalibrierung -> Tafel (Sätze bauen).
// Tasten: Pfeile = Blickrichtung simulieren, Leertaste = Pause/Weiter,
//         Esc = zurück zum Start, N = andere Vorschläge.

import * as ui from './ui.js';
import { $ } from './ui.js';
import { EyeTracker, RICHTUNGEN, berechneKalibrierung } from './eyetracking.js';
import { Auswahl } from './auswahl.js';
import { Vorschlaege } from './ki.js';
import {
  ladeEinstellungen,
  speichereEinstellungen,
  ladeKalibrierung,
  speichereKalibrierung,
  ladeVerlauf,
  merkeSatz,
  loescheVerlauf,
  satzText,
} from './speicher.js';

const JA_NEIN_MS = 3500; // so lange bleibt JA / NEIN stehen
const SPERRE_MS = 1000; // Sperre nach jeder Auswahl
const KALIB_VORLAUF_MS = 1800; // Zeit zum Hinschauen, bevor gemessen wird
const KALIB_SAMMEL_MS = 2500; // Messdauer pro Richtung
const KALIB_MIN_PROBEN = 20;

const KALIB_SCHRITTE = [
  { id: 'mitte', text: 'Schau zur MITTE', pfeil: '⏺️' },
  { id: 'links', text: 'Schau nach LINKS', pfeil: '⬅️' },
  { id: 'rechts', text: 'Schau nach RECHTS', pfeil: '➡️' },
  { id: 'oben', text: 'Schau nach OBEN', pfeil: '⬆️' },
  { id: 'unten', text: 'Schau nach UNTEN', pfeil: '⬇️' },
];

const PFEILTASTEN = { ArrowLeft: 'links', ArrowRight: 'rechts', ArrowUp: 'oben', ArrowDown: 'unten' };

const FELD_ZURUECK = { art: 'zurueck', emoji: '↩️', text: 'Zurück' };
const FELD_FERTIG = { art: 'fertig', emoji: '✔️', text: 'Fertig' };
const FELD_ANDERES = { art: 'anderes', emoji: '➕', text: 'Anderes' };
const FELD_LADEN = { art: 'laden', emoji: '', text: '…' };

let einstellungen = ladeEinstellungen();

// Gesamter Zustand der App an einer Stelle
const z = {
  seite: 'einrichten', // 'einrichten' | 'kalibrierung' | 'tafel'
  ueberlagerung: null, // 'einstellungen' | 'verlauf' | null
  anzeige: null, // { bis } solange JA/NEIN oder ein fertiger Satz gezeigt wird
  pause: false,
  kameraAn: false,
  kameraFehler: '',
  blickAktiv: false, // true = Blicksteuerung, false = nur Pfeiltasten/Maus
  schritte: [], // Stapel: [{ teile: [{text, emoji}], seite }]
  belegung: {}, // was liegt gerade auf welchem Feld
  ladeNr: 0, // erkennt veraltete Antworten
  tasten: [], // gerade gedrückte Pfeiltasten
  tafelWarAktiv: false,
  kalib: null,
};

const tracker = new EyeTracker();
const vorschlaege = new Vorschlaege(() => einstellungen, zeigeKiStatus);
const auswahl = new Auswahl({ beiZustand: ui.setzeFortschritt, beiAuswahl: waehle });

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Einstellungen anwenden ----------

function wendeEinstellungenAn() {
  document.documentElement.style.setProperty('--schrift', einstellungen.schrift);
  document.body.classList.toggle('satz-in-mitte', einstellungen.satzMitte);
  document.body.classList.toggle('debug-an', einstellungen.debug);
  $('debug').classList.toggle('versteckt', !einstellungen.debug);
  auswahl.verweilMs = einstellungen.verweildauer * 1000;
  auswahl.sperreMs = SPERRE_MS;
  tracker.setzeEmpfindlichkeit(einstellungen.empfindlichkeit);
  ui.alleAnpassen();
}

function zeigeKiStatus(status, meldung) {
  const texte = {
    aus: ['KI: aus (fester Wortbaum)', ''],
    ok: ['KI: an', 'gut'],
    gestoert: ['KI nicht erreichbar – fester Wortbaum', 'warnung'],
    key: ['API-Key ungültig – fester Wortbaum', 'warnung'],
  };
  const [text, klasse] = texte[status] || texte.aus;
  ui.setzeStatus('statusKi', text, klasse);
  $('statusKi').title = meldung || '';
}

// ---------- Kamera und Einrichten ----------

async function starteKamera() {
  z.kameraFehler = '';
  $('btnKameraNeu').classList.add('versteckt');
  ui.setzeVorschauHinweis('Kamera startet …', '');
  try {
    await tracker.ladeModell();
  } catch (fehler) {
    console.error(fehler);
    z.kameraFehler = 'Gesichtserkennung konnte nicht geladen werden (Ordner „vendor“ vollständig?)';
  }
  if (!z.kameraFehler) {
    try {
      await tracker.starteKamera($('video'));
      z.kameraAn = true;
    } catch (fehler) {
      console.error(fehler);
      z.kameraFehler = 'Keine Kamera gefunden oder Zugriff nicht erlaubt';
    }
  }
  if (z.kameraFehler) $('btnKameraNeu').classList.remove('versteckt');
  aktualisiereEinrichten();
}

function aktualisiereEinrichten() {
  const k = tracker.kalibrierung;
  $('btnStart').disabled = !(z.kameraAn && k);
  $('btnKalibrieren').disabled = !z.kameraAn;
  $('kalibStatus').textContent = k
    ? `Kalibrierung gespeichert (${new Date(k.datum).toLocaleString('de-DE')}). Bei neuer Sitzposition bitte neu kalibrieren.`
    : 'Noch nicht kalibriert.';
}

function einrichtenTakt() {
  if (z.kameraFehler) {
    ui.setzeVorschauHinweis(z.kameraFehler, 'fehler');
  } else if (z.kameraAn) {
    tracker.zeichneVorschau($('vorschau'));
    const p = tracker.zustand.pruefung;
    ui.setzeVorschauHinweis(p.ok ? `✅ ${p.text}` : `⚠️ ${p.text}`, p.ok ? 'ok' : '');
  }
}

function zeigeEinrichten() {
  z.seite = 'einrichten';
  z.kalib = null;
  tracker.beendeSammeln();
  ui.zeigeSeite('einrichten');
  aktualisiereEinrichten();
}

// ---------- Kalibrierung ----------

function starteKalibrierung() {
  if (!z.kameraAn) return;
  schliesseUeberlagerung();
  z.seite = 'kalibrierung';
  z.kalib = { phase: 'vorher', nr: 0, start: 0, proben: {}, versuche: 0, ergebnis: null };
  ui.zeigeSeite('kalibrierung');
  ui.setzeKalibrierung({
    phase: 'vorher',
    text: 'Kalibrierung',
    unter:
      'Bitte erklären: „Schau immer dorthin, wo der gelbe Kreis ist, und bleib dort, bis er weiterspringt.“ ' +
      'Den Kopf möglichst ruhig halten. Es dauert etwa 25 Sekunden.',
  });
}

function kalibSchritt(jetzt, hinweis = '') {
  const k = z.kalib;
  const s = KALIB_SCHRITTE[k.nr];
  k.phase = 'vorlauf';
  k.start = jetzt;
  ui.setzeKalibrierung({ phase: 'laeuft', schritt: s.id, pfeil: s.pfeil, text: s.text, unter: hinweis });
}

function kalibTakt(jetzt) {
  const k = z.kalib;
  if (!k || (k.phase !== 'vorlauf' && k.phase !== 'sammeln')) return;
  const vergangen = jetzt - k.start;

  if (k.phase === 'vorlauf') {
    if (vergangen >= KALIB_VORLAUF_MS) {
      k.phase = 'sammeln';
      k.start = jetzt;
      tracker.starteSammeln();
    }
    return;
  }

  ui.setzeKalibRing(Math.min(1, vergangen / KALIB_SAMMEL_MS));
  if (vergangen < KALIB_SAMMEL_MS) return;

  const proben = tracker.beendeSammeln();
  if (proben.length < KALIB_MIN_PROBEN) {
    // Gesicht oder Augen waren nicht zu sehen: Schritt wiederholen
    k.versuche++;
    if (k.versuche >= 3) {
      k.phase = 'vorher';
      ui.setzeKalibrierung({
        phase: 'vorher',
        text: 'Das hat nicht geklappt',
        unter: 'Das Gesicht oder die Augen waren nicht gut zu sehen. Bitte Licht und Position prüfen und noch einmal versuchen.',
      });
      k.nr = 0;
      k.versuche = 0;
      k.proben = {};
    } else {
      kalibSchritt(jetzt, 'Nicht erkannt – bitte noch einmal.');
    }
    return;
  }

  k.proben[KALIB_SCHRITTE[k.nr].id] = proben;
  k.nr++;
  k.versuche = 0;
  if (k.nr < KALIB_SCHRITTE.length) {
    kalibSchritt(jetzt);
    return;
  }

  // Alle fünf Schritte fertig: auswerten und Ergebnis zeigen
  k.phase = 'ergebnis';
  k.ergebnis = berechneKalibrierung(k.proben);
  const name = { links: '⬅️ Links', rechts: '➡️ Rechts', oben: '⬆️ Oben', unten: '⬇️ Unten' };
  const urteil = {
    gut: '✅ gut erkannt',
    schwach: '⚠️ schwach – evtl. Empfindlichkeit erhöhen',
    fehlt: '❌ nicht erkannt – bitte wiederholen',
  };
  ui.setzeKalibListe(RICHTUNGEN.map((r) => `${name[r]}: ${urteil[k.ergebnis.qualitaet[r]]}`));
  const allesGut = RICHTUNGEN.every((r) => k.ergebnis.qualitaet[r] === 'gut');
  ui.setzeKalibrierung({
    phase: 'ergebnis',
    text: allesGut ? 'Fertig 👍' : 'Fertig – bitte prüfen',
    unter: allesGut
      ? ''
      : 'Tipp: Der Blick darf ruhig über den Bildschirmrand hinausgehen. Für UNTEN hilft es oft, den Laptop etwas tiefer zu hängen.',
  });
}

function uebernehmeKalibrierung() {
  const k = z.kalib?.ergebnis;
  if (!k) return;
  speichereKalibrierung(k);
  tracker.setzeKalibrierung(k);
  starteTafel(true);
}

// ---------- Tafel: Satzbau ----------

function starteTafel(mitBlick) {
  z.seite = 'tafel';
  z.kalib = null;
  z.blickAktiv = mitBlick;
  z.pause = false;
  ui.zeigeSeite('tafel');
  zeigeStart();
}

// Felder belegen und der Auswahl-Logik sagen, welche Richtungen gelten.
function belege(belegung) {
  z.belegung = belegung;
  for (const r of RICHTUNGEN) ui.setzeFeld(r, belegung[r] || null);
  auswahl.setzeErlaubt(RICHTUNGEN.filter((r) => belegung[r] && belegung[r].art !== 'laden'));
  auswahl.sperre();
  ui.alleAnpassen();
}

// Startbildschirm: feste Optionen ohne KI.
function zeigeStart() {
  z.schritte = [];
  z.ladeNr++;
  ui.setzeSatz('');
  belege({
    links: { art: 'ja', emoji: '✅', text: 'JA', gross: true },
    rechts: { art: 'nein', emoji: '❌', text: 'NEIN', gross: true },
    oben: { art: 'start', emoji: '🙋', text: 'ICH …', satz: 'Ich' },
    unten: { art: 'start', emoji: '🙏', text: 'BITTE …', satz: 'Bitte' },
  });
  // Die beiden Satzanfänge schon einmal im Hintergrund vorladen
  vorschlaege.vorladen([{ text: 'Ich', emoji: '🙋' }]);
  vorschlaege.vorladen([{ text: 'Bitte', emoji: '🙏' }]);
}

// Zeigt die Vorschläge für den aktuellen Schritt des Satzes.
async function zeigeSchritt() {
  const schritt = z.schritte.at(-1);
  if (!schritt) {
    zeigeStart();
    return;
  }
  const nr = ++z.ladeNr;
  ui.setzeSatz(satzText(schritt.teile));

  const anfrage = vorschlaege.hole(schritt.teile, (schritt.seite + 1) * 3);
  let erg = await Promise.race([anfrage, warte(120).then(() => null)]);
  if (nr !== z.ladeNr) return; // inzwischen wurde etwas anderes gewählt
  if (!erg) {
    // Dauert länger: Ladezustand zeigen. "Zurück" geht trotzdem.
    belege({ links: FELD_LADEN, rechts: FELD_LADEN, oben: FELD_LADEN, unten: FELD_ZURUECK });
    erg = await anfrage;
    if (nr !== z.ladeNr) return;
  }

  // Wie viele Vorschläge passen auf eine Seite? OBEN ist "Fertig", wenn der
  // Satz vollständig ist, oder "Anderes", wenn das so eingestellt ist.
  const proSeite = erg.fertig || einstellungen.obenAnderes ? 2 : 3;
  let ab = schritt.seite * proSeite;
  if (ab >= erg.optionen.length) {
    schritt.seite = 0; // am Ende angekommen: wieder von vorn
    ab = 0;
  }
  const sicht = erg.optionen.slice(ab, ab + proSeite);
  const mehr = !erg.erschoepft || erg.optionen.length > proSeite;
  const feld = (o) => (o ? { art: 'option', emoji: o.emoji, text: o.text } : null);

  let oben;
  if (erg.fertig) oben = FELD_FERTIG;
  else if (einstellungen.obenAnderes) oben = mehr ? FELD_ANDERES : null;
  else oben = feld(sicht[2]);

  // Wahrscheinlichste Option links, zweite rechts (am leichtesten zu erreichen)
  belege({ links: feld(sicht[0]), rechts: feld(sicht[1]), oben, unten: FELD_ZURUECK });

  // Nächste Schritte vorladen, damit es gleich ohne Wartezeit weitergeht
  for (const o of sicht) vorschlaege.vorladen([...schritt.teile, { text: o.text, emoji: o.emoji }]);
}

// Andere Vorschläge für denselben Satz (Feld "Anderes" oder Taste N).
function zeigeAndere() {
  const schritt = z.schritte.at(-1);
  if (!schritt || z.anzeige) return;
  z.schritte.push({ teile: schritt.teile, seite: schritt.seite + 1 });
  zeigeSchritt();
}

// Ein Feld wurde gewählt (per Blick, Pfeiltaste oder Mausklick).
function waehle(richtung) {
  const b = z.belegung[richtung];
  if (!b || b.art === 'laden') return;
  const schritt = z.schritte.at(-1);

  switch (b.art) {
    case 'ja':
    case 'nein':
      zeigeAnzeige({ emoji: b.emoji, text: b.text, klasse: `kurz ${b.art}`, dauer: JA_NEIN_MS });
      break;
    case 'start':
      z.schritte.push({ teile: [{ text: b.satz, emoji: b.emoji }], seite: 0 });
      zeigeSchritt();
      break;
    case 'option':
      z.schritte.push({ teile: [...schritt.teile, { text: b.text, emoji: b.emoji }], seite: 0 });
      zeigeSchritt();
      break;
    case 'anderes':
      zeigeAndere();
      break;
    case 'zurueck':
      z.schritte.pop();
      zeigeSchritt();
      break;
    case 'fertig': {
      const text = satzText(schritt.teile);
      merkeSatz(text);
      const emojis = [...new Set(schritt.teile.slice(1).map((t) => t.emoji).filter(Boolean))].join(' ');
      zeigeAnzeige({ emoji: emojis, text, klasse: 'satz-fertig', hinweis: 'Klicken oder eine Taste drücken, um weiterzumachen' });
      break;
    }
  }
}

// ---------- Anzeige (bildschirmfüllend) ----------

function zeigeAnzeige({ emoji, text, klasse, hinweis, dauer }) {
  z.anzeige = { bis: dauer ? performance.now() + dauer : 0 };
  ui.zeigeAnzeige({ emoji, text, klasse, hinweis });
}

function schliesseAnzeige() {
  if (!z.anzeige) return;
  z.anzeige = null;
  ui.versteckeAnzeige();
  zeigeStart();
}

// ---------- Überlagerungen ----------

function oeffneEinstellungen() {
  ui.fuelleEinstellungen(einstellungen);
  z.ueberlagerung = 'einstellungen';
  ui.zeigeUeberlagerung('einstellungen', true);
}

function oeffneVerlauf() {
  ui.zeigeVerlaufListe(ladeVerlauf());
  z.ueberlagerung = 'verlauf';
  ui.zeigeUeberlagerung('verlauf', true);
}

function schliesseUeberlagerung() {
  if (!z.ueberlagerung) return;
  ui.zeigeUeberlagerung(z.ueberlagerung, false);
  z.ueberlagerung = null;
}

function speichereDialog() {
  einstellungen = { ...einstellungen, ...ui.leseEinstellungen() };
  speichereEinstellungen(einstellungen);
  wendeEinstellungenAn();
  vorschlaege.leeren(); // Key, Modell oder Namen können sich geändert haben
  schliesseUeberlagerung();
  if (z.seite === 'tafel' && !z.anzeige) zeigeSchritt();
}

async function testeKi() {
  const anzeige = $('kiTestText');
  anzeige.textContent = 'Teste …';
  const gespeichert = einstellungen;
  einstellungen = { ...einstellungen, ...ui.leseEinstellungen() }; // mit den eingetippten Werten testen
  const ergebnis = await vorschlaege.teste();
  einstellungen = gespeichert;
  anzeige.textContent = (ergebnis.ok ? '✅ ' : '❌ ') + ergebnis.meldung;
}

// ---------- Takt: läuft für jedes Bild ----------

// Aktuelle Richtung: Pfeiltaste hat Vorrang, sonst der Blick.
function eingabeRichtung() {
  if (z.tasten.length) return z.tasten.at(-1);
  // Nur frische Kamerabilder zählen: Ein altes Bild darf nie etwas auswählen.
  if (z.blickAktiv && z.kameraAn && tracker.zustand.gesicht && tracker.istFrisch()) {
    return tracker.zustand.richtung;
  }
  return null;
}

function tafelTakt(jetzt) {
  const aktiv = !z.pause && !z.ueberlagerung && !z.anzeige;
  if (aktiv) {
    auswahl.aktualisiere(eingabeRichtung(), jetzt);
  } else if (z.tafelWarAktiv) {
    auswahl.sperre(jetzt); // Fortschritt verwerfen, danach erst wieder zur Mitte
  }
  z.tafelWarAktiv = aktiv;

  // Kleiner Hinweis in der Mitte
  const blickAn = z.blickAktiv && z.kameraAn;
  let mitte = '';
  if (z.pause) mitte = '⏸ Pause';
  else if (blickAn && !tracker.zustand.gesicht) mitte = 'Kein Gesicht erkannt';
  else if (z.belegung.links?.art === 'laden') mitte = 'Vorschläge werden geladen …';
  ui.setzeMitteText(mitte);

  if (!blickAn) ui.setzeStatus('statusKamera', 'Blick: aus (Pfeiltasten / Maus)', '');
  else if (!tracker.zustand.gesicht) ui.setzeStatus('statusKamera', 'Blick: kein Gesicht', 'warnung');
  else ui.setzeStatus('statusKamera', 'Blick: an', 'gut');

  if (einstellungen.debug) zeichneDebug();
}

function zeichneDebug() {
  if (!z.kameraAn) {
    $('debugText').textContent = `Kamera aus\nTaste: ${z.tasten.at(-1) || '–'}`;
    return;
  }
  tracker.zeichneVorschau($('debugBild'));
  tracker.zeichneSignal($('debugSignal'));
  const t = tracker.zustand;
  const w = t.werte;
  const f = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);
  $('debugText').textContent =
    `Richtung: ${(t.richtung || 'Mitte').toUpperCase()}${t.augenZu ? ' (Augen zu)' : ''}\n` +
    `L${f(w.links)} R${f(w.rechts)}\nO${f(w.oben)} U${f(w.unten)}\n` +
    (t.merkmale ? `Lid ${t.merkmale.offen.toFixed(2)}  Kopf ${(t.kopfWinkel ?? 0).toFixed(0)}°\n` : '') +
    `${t.bps} Bilder/s`;
}

let letzterTakt = 0;

function takt() {
  const jetzt = performance.now();
  letzterTakt = jetzt;
  if (z.seite === 'einrichten') einrichtenTakt();
  else if (z.seite === 'kalibrierung') kalibTakt(jetzt);
  else if (z.seite === 'tafel') tafelTakt(jetzt);
  if (z.anzeige?.bis && jetzt >= z.anzeige.bis) schliesseAnzeige();
}

// Normalerweise läuft der Takt mit jedem Bild des Browsers. Bremst der
// Browser das aus (z. B. Fenster verdeckt), springt ein Zeitgeber ein,
// damit die App nie stehen bleibt.
function starteTakt() {
  const bild = () => {
    takt();
    requestAnimationFrame(bild);
  };
  requestAnimationFrame(bild);
  setInterval(() => {
    if (performance.now() - letzterTakt > 100) takt();
  }, 50);
}

// ---------- Tastatur und Maus ----------

function setzePause(an) {
  z.pause = an;
  $('btnPause').textContent = an ? '▶ Weiter' : '⏸ Pause';
}

window.addEventListener('keydown', (e) => {
  // In Dialogen gehören die Tasten den Eingabefeldern; nur Esc schließt.
  if (z.ueberlagerung) {
    if (e.key === 'Escape') schliesseUeberlagerung();
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey || /^F\d+$/.test(e.key)) return;

  // JA/NEIN oder fertiger Satz: jede (neu gedrückte) Taste macht weiter
  if (z.anzeige) {
    e.preventDefault();
    if (!e.repeat) schliesseAnzeige();
    return;
  }

  if (z.seite === 'kalibrierung') {
    if (e.key === 'Escape') zeigeEinrichten();
    else if (e.key === ' ' && z.kalib?.phase === 'vorher') {
      e.preventDefault();
      kalibSchritt(performance.now());
    }
    return;
  }
  if (z.seite !== 'tafel') return;

  const richtung = PFEILTASTEN[e.key];
  if (richtung) {
    e.preventDefault();
    if (!z.tasten.includes(richtung)) z.tasten.push(richtung);
  } else if (e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) setzePause(!z.pause);
  } else if (e.key === 'Escape') {
    setzePause(false);
    zeigeStart();
  } else if (e.key.toLowerCase() === 'n' && !e.repeat) {
    zeigeAndere();
  }
});

window.addEventListener('keyup', (e) => {
  const richtung = PFEILTASTEN[e.key];
  if (richtung) z.tasten = z.tasten.filter((t) => t !== richtung);
  if (e.key === ' ' && z.seite === 'tafel' && !z.ueberlagerung) e.preventDefault();
});

// Fenster verliert den Fokus: keine Taste gilt mehr als gedrückt
window.addEventListener('blur', () => {
  z.tasten = [];
});

window.addEventListener('resize', () => ui.alleAnpassen());

function verbindeKnoepfe() {
  const klick = (id, aktion) =>
    $(id).addEventListener('click', (e) => {
      e.currentTarget.blur(); // sonst würde die Leertaste den Knopf erneut drücken
      aktion(e);
    });

  // Einrichten
  klick('btnStart', () => starteTafel(true));
  klick('btnKalibrieren', starteKalibrierung);
  klick('btnOhneKamera', () => starteTafel(false));
  klick('btnEinstellungenE', oeffneEinstellungen);
  klick('btnKameraNeu', starteKamera);

  // Kalibrierung
  klick('btnKalibLos', () => kalibSchritt(performance.now()));
  klick('btnKalibAbbruch', zeigeEinrichten);
  klick('btnKalibOk', uebernehmeKalibrierung);
  klick('btnKalibNochmal', starteKalibrierung);
  klick('btnKalibZurueck', zeigeEinrichten);

  // Tafel: Die Familie kann ein Feld auch direkt anklicken
  for (const r of RICHTUNGEN) {
    klick(`feld-${r}`, () => {
      if (z.pause || z.anzeige) return;
      waehle(r);
    });
  }
  klick('btnHeim', () => {
    setzePause(false);
    zeigeStart();
  });
  klick('btnPause', () => setzePause(!z.pause));
  klick('btnAndere', zeigeAndere);
  klick('btnVerlauf', oeffneVerlauf);
  klick('btnDebug', () => {
    einstellungen.debug = !einstellungen.debug;
    speichereEinstellungen(einstellungen);
    wendeEinstellungenAn();
  });
  klick('btnEinrichten', zeigeEinrichten);
  klick('btnEinstellungen', oeffneEinstellungen);
  klick('btnVollbild', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });

  // Anzeige: Klick macht weiter
  $('anzeige').addEventListener('click', schliesseAnzeige);

  // Einstellungen
  $('formEinstellungen').addEventListener('submit', (e) => {
    e.preventDefault();
    speichereDialog();
  });
  klick('btnEAbbruch', schliesseUeberlagerung);
  klick('btnKiTest', testeKi);
  klick('btnNeuKalib', () => {
    if (z.kameraAn) starteKalibrierung();
    else $('kiTestText').textContent = 'Kalibrieren geht nur mit laufender Kamera.';
  });

  // Verlauf
  klick('btnVerlaufZu', schliesseUeberlagerung);
  klick('btnVerlaufLeeren', () => {
    loescheVerlauf();
    ui.zeigeVerlaufListe([]);
  });
}

// ---------- Start ----------

function start() {
  ui.baueFelder();
  ui.verbindeRegler();
  verbindeKnoepfe();
  tracker.setzeKalibrierung(ladeKalibrierung());
  wendeEinstellungenAn();
  vorschlaege.leeren(); // setzt auch den KI-Status in der Leiste
  zeigeKiStatus(vorschlaege.status, '');
  zeigeEinrichten();
  starteTakt();
  starteKamera();
}

start();
