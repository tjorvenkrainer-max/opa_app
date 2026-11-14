// UI-Modul: alles, was auf dem Bildschirm gezeichnet wird.
// Enthält keine Logik – die Entscheidungen trifft app.js.

import { RICHTUNGEN } from './eyetracking.js';

export const $ = (id) => document.getElementById(id);

const RING_UMFANG = 2 * Math.PI * 44; // passt zu r="44" im SVG
const RING_SVG =
  '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true">' +
  '<circle class="ring-spur" cx="50" cy="50" r="44"></circle>' +
  '<circle class="ring-wert" cx="50" cy="50" r="44"></circle></svg>';

const felder = {}; // Richtung -> { feld, emoji, wort, ring }

// ---------- Seiten ----------

export function zeigeSeite(name) {
  for (const id of ['einrichten', 'kalibrierung', 'tafel']) {
    $(id).classList.toggle('versteckt', id !== name);
  }
  if (name === 'tafel') alleAnpassen();
}

export function zeigeUeberlagerung(id, sichtbar) {
  $(id).classList.toggle('versteckt', !sichtbar);
}

// ---------- Felder der Tafel ----------

// Baut einmalig den Inhalt der vier Felder (Ring, Emoji, Wort).
export function baueFelder() {
  for (const r of RICHTUNGEN) {
    const feld = $(`feld-${r}`);
    feld.innerHTML = `<span class="ring-box">${RING_SVG}<span class="emoji"></span></span><span class="wort"></span>`;
    feld.tabIndex = -1;
    felder[r] = {
      feld,
      emoji: feld.querySelector('.emoji'),
      wort: feld.querySelector('.wort'),
      ring: feld.querySelector('.ring-wert'),
    };
  }
}

// Belegt ein Feld. belegung: { art, emoji, text, gross } oder null (= leer).
export function setzeFeld(richtung, belegung) {
  const f = felder[richtung];
  const art = belegung ? belegung.art : 'leer';
  const basis = richtung === 'links' || richtung === 'rechts' ? 'feld hoch' : 'feld quer';
  f.feld.className = `${basis} art-${art}${belegung?.gross ? ' gross' : ''}`;
  f.emoji.textContent = belegung?.emoji || '';
  f.wort.textContent = belegung?.text || '';
  f.ring.style.strokeDashoffset = RING_UMFANG;
}

// Schrift so weit verkleinern, bis der Text in seinen Kasten passt.
function passeAn(textEl, kasten, minPx = 16) {
  textEl.style.fontSize = '';
  if (!kasten.clientHeight) return; // gerade nicht sichtbar
  let px = parseFloat(getComputedStyle(textEl).fontSize);
  let runden = 0;
  while (
    (kasten.scrollHeight > kasten.clientHeight + 1 || kasten.scrollWidth > kasten.clientWidth + 1) &&
    px > minPx &&
    runden++ < 60
  ) {
    px *= 0.94;
    textEl.style.fontSize = `${px}px`;
  }
}

export function alleAnpassen() {
  for (const r of RICHTUNGEN) if (felder[r]) passeAn(felder[r].wort, felder[r].feld);
  passeAn($('satzText'), $('satz'));
  if (!$('anzeige').classList.contains('versteckt')) passeAn($('anzeigeText'), $('anzeige'));
}

// Fortschrittsring und Hervorhebung. Kommt direkt aus der Auswahl-Logik.
export function setzeFortschritt({ blick, anteil, bereit }) {
  for (const r of RICHTUNGEN) {
    const f = felder[r];
    const aktiv = r === blick;
    f.feld.classList.toggle('blick', aktiv);
    f.ring.style.strokeDashoffset = RING_UMFANG * (1 - (aktiv ? anteil : 0));
  }
  $('mittePunkt').classList.toggle('bereit', bereit);
}

// ---------- Satz und Mitte ----------

export function setzeSatz(text) {
  const el = $('satzText');
  el.textContent = text || '…';
  el.classList.toggle('leer', !text);
  $('satzMitte').textContent = text || '';
  passeAn(el, $('satz'));
}

let letzterMitteText = null;
export function setzeMitteText(text) {
  if (text === letzterMitteText) return;
  letzterMitteText = text;
  $('mitteText').textContent = text;
}

export function setzeStatus(id, text, klasse = '') {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
  el.className = `status ${klasse}`;
}

// ---------- Anzeige (JA / NEIN / fertiger Satz) ----------

export function zeigeAnzeige({ emoji, text, klasse, hinweis }) {
  const a = $('anzeige');
  a.className = klasse || '';
  $('anzeigeEmoji').textContent = emoji || '';
  $('anzeigeText').textContent = text;
  $('anzeigeHinweis').textContent = hinweis || '';
  passeAn($('anzeigeText'), a, 24);
}

export function versteckeAnzeige() {
  $('anzeige').className = 'versteckt';
}

// ---------- Einrichten ----------

export function setzeVorschauHinweis(text, klasse) {
  const el = $('vorschauHinweis');
  if (el.textContent !== text) el.textContent = text;
  el.className = `hinweis ${klasse || ''}`;
}

// ---------- Kalibrierung ----------

// phase: 'vorher' | 'laeuft' | 'ergebnis'
export function setzeKalibrierung({ phase, schritt, pfeil, text, unter, anteil = 0 }) {
  const seite = $('kalibrierung');
  seite.className = `seite ${phase === 'laeuft' ? '' : 'vorher'} ${schritt === 'mitte' && phase === 'laeuft' ? 'schritt-mitte' : ''}`;
  $('kalibZiel').className = `kalib-ziel pos-${schritt || 'mitte'}`;
  $('kalibPfeil').textContent = pfeil || '';
  $('kalibText').textContent = text;
  $('kalibUnter').textContent = unter || '';
  $('kalibZiel').querySelector('.ring-wert').style.strokeDashoffset = RING_UMFANG * (1 - anteil);
  $('kalibKnoepfe').classList.toggle('versteckt', phase !== 'vorher');
  $('kalibErgebnis').classList.toggle('versteckt', phase !== 'ergebnis');
}

export function setzeKalibRing(anteil) {
  $('kalibZiel').querySelector('.ring-wert').style.strokeDashoffset = RING_UMFANG * (1 - anteil);
}

export function setzeKalibListe(zeilen) {
  $('kalibListe').replaceChildren(
    ...zeilen.map((z) => {
      const li = document.createElement('li');
      li.textContent = z;
      return li;
    })
  );
}

// ---------- Einstellungen ----------

const REGLER = [
  ['eVerweil', 'aVerweil', (v) => Number(v).toFixed(2).replace('.', ',')],
  ['eLinks', 'aLinks', (v) => v],
  ['eRechts', 'aRechts', (v) => v],
  ['eOben', 'aOben', (v) => v],
  ['eUnten', 'aUnten', (v) => v],
  ['eSchrift', 'aSchrift', (v) => Math.round(v * 100)],
];

function zeigeReglerWerte() {
  for (const [regler, ausgabe, format] of REGLER) $(ausgabe).textContent = format($(regler).value);
}

export function fuelleEinstellungen(e) {
  $('eApiKey').value = e.apiKey;
  $('eModell').value = e.modell;
  $('eVerweil').value = e.verweildauer;
  $('eLinks').value = e.empfindlichkeit.links;
  $('eRechts').value = e.empfindlichkeit.rechts;
  $('eOben').value = e.empfindlichkeit.oben;
  $('eUnten').value = e.empfindlichkeit.unten;
  $('eNamen').value = e.namen;
  $('eSchrift').value = e.schrift;
  $('eObenAnderes').checked = e.obenAnderes;
  $('eSatzMitte').checked = e.satzMitte;
  $('kiTestText').textContent = '';
  zeigeReglerWerte();
}

export function leseEinstellungen() {
  return {
    apiKey: $('eApiKey').value.trim(),
    modell: $('eModell').value.trim() || 'claude-haiku-5-5',
    verweildauer: Number($('eVerweil').value),
    empfindlichkeit: {
      links: Number($('eLinks').value),
      rechts: Number($('eRechts').value),
      oben: Number($('eOben').value),
      unten: Number($('eUnten').value),
    },
    namen: $('eNamen').value,
    schrift: Number($('eSchrift').value),
    obenAnderes: $('eObenAnderes').checked,
    satzMitte: $('eSatzMitte').checked,
  };
}

export function verbindeRegler() {
  for (const [regler] of REGLER) $(regler).addEventListener('input', zeigeReglerWerte);
}

// ---------- Verlauf ----------

export function zeigeVerlaufListe(verlauf) {
  const liste = $('verlaufListe');
  if (!verlauf.length) {
    const li = document.createElement('li');
    li.textContent = 'Noch keine Sätze.';
    liste.replaceChildren(li);
    return;
  }
  liste.replaceChildren(
    ...verlauf.map((v) => {
      const li = document.createElement('li');
      li.textContent = v.text;
      const zeit = document.createElement('span');
      zeit.className = 'zeit';
      zeit.textContent = new Date(v.zeit).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      li.append(zeit);
      return li;
    })
  );
}
