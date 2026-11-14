// Fester Wortbaum (Offline-Fallback).
// Wird benutzt, wenn kein API-Key da ist, das Internet fehlt oder die KI zu
// langsam antwortet. Deckt dieselben Themen ab wie die KI:
// Körper & Schmerzen, Lage & Pflege, Gefühle & Familie.
// WICHTIG: Opa isst und trinkt nichts -> hier steht nichts zu Essen/Trinken.
//
// Aufbau eines Knotens: { f: Fertig anbieten?, o: [Optionen] }
// Aufbau einer Option:  { t: Text, e: Emoji, n: Folgeknoten (optional) }
// Die Optionen sind nach Wahrscheinlichkeit sortiert (wichtigste zuerst).

const ENDE = { f: true, o: [] };

// Für Sätze, die der Baum nicht kennt (z. B. von der KI angefangen).
const ALLGEMEIN = {
  f: true,
  o: [
    { t: 'jetzt', e: '⏱️' },
    { t: 'bitte', e: '🙏' },
    { t: 'danke', e: '💐' },
  ],
};

const DREHEN = {
  f: true,
  o: [
    { t: 'nach links', e: '⬅️' },
    { t: 'nach rechts', e: '➡️' },
    { t: 'auf den Rücken', e: '⬆️' },
  ],
};

const SCHMERZ_WANN = {
  f: true,
  o: [
    { t: 'schon lange', e: '⏳' },
    { t: 'seit heute', e: '📅' },
    { t: 'beim Liegen', e: '🛏️' },
    { t: 'beim Atmen', e: '😮‍💨' },
    { t: 'beim Husten', e: '😷' },
    { t: 'beim Umdrehen', e: '🔄' },
  ],
};

const SCHMERZ_ORT = {
  f: true,
  o: [
    { t: 'im Rücken', e: '🦴', n: SCHMERZ_WANN },
    { t: 'im Bauch', e: '🫃', n: SCHMERZ_WANN },
    { t: 'im Kopf', e: '🤕', n: SCHMERZ_WANN },
    { t: 'am Gesäß', e: '🪑', n: SCHMERZ_WANN },
    { t: 'in der Brust', e: '🫁', n: SCHMERZ_WANN },
    { t: 'im Bein', e: '🦵', n: SCHMERZ_WANN },
    { t: 'im Arm', e: '💪', n: SCHMERZ_WANN },
    { t: 'im Hals', e: '🧣', n: SCHMERZ_WANN },
    { t: 'im Mund', e: '👄', n: SCHMERZ_WANN },
    { t: 'an der Nase', e: '👃', n: SCHMERZ_WANN },
    { t: 'am Fuß', e: '🦶', n: SCHMERZ_WANN },
    { t: 'überall', e: '🧍', n: SCHMERZ_WANN },
  ],
};

const JUCK_ORT = {
  f: true,
  o: [
    { t: 'am Rücken', e: '🦴' },
    { t: 'am Kopf', e: '🤕' },
    { t: 'im Gesicht', e: '🙂' },
    { t: 'an der Nase', e: '👃' },
    { t: 'am Bein', e: '🦵' },
    { t: 'am Arm', e: '💪' },
  ],
};

const KISSEN_WO = {
  f: true,
  o: [
    { t: 'unter den Kopf', e: '🤕' },
    { t: 'unter die Beine', e: '🦵' },
    { t: 'in den Rücken', e: '🦴' },
  ],
};

const ANGST_WOVOR = {
  f: true,
  o: [
    { t: 'vor der Nacht', e: '🌙' },
    { t: 'vor Schmerzen', e: '😣' },
    { t: 'allein zu sein', e: '🧍' },
  ],
};

// Baut den ganzen Baum. Die Familiennamen aus den Einstellungen werden an
// den passenden Stellen eingesetzt.
function baueBaum(namen) {
  const sehen = namen.map((n) => ({ t: `${n} sehen`, e: '🧑' }));
  const vermissen = namen.map((n) => ({ t: n, e: '🧑' }));
  const anrufen = namen.map((n) => ({ t: `${n} anrufen`, e: '📞' }));

  const ICH_MOECHTE = {
    f: false,
    o: [
      { t: 'gedreht werden', e: '🔄', n: DREHEN },
      { t: 'schlafen', e: '😴' },
      { t: 'höher liegen', e: '⬆️' },
      { t: 'eine Decke', e: '🛌' },
      { t: 'ein Kissen', e: '🛏️', n: KISSEN_WO },
      { t: 'flacher liegen', e: '⬇️' },
      { t: 'auf die Toilette', e: '🚽' },
      { t: 'meine Brille', e: '👓' },
      { t: 'Ruhe', e: '🤫' },
      ...sehen,
      { t: 'das Licht aus', e: '🌙' },
      { t: 'das Licht an', e: '💡' },
      { t: 'die Pflege rufen', e: '🔔' },
      { t: 'den Arzt sehen', e: '👨‍⚕️' },
      { t: 'nach Hause', e: '🏠' },
      { t: 'frische Luft', e: '🪟' },
      { t: 'Musik hören', e: '🎵' },
      { t: 'fernsehen', e: '📺' },
      { t: 'beten', e: '🙏' },
      { t: 'allein sein', e: '🚪' },
    ],
  };

  const ICH_BIN = {
    f: false,
    o: [
      { t: 'müde', e: '😴' },
      { t: 'traurig', e: '😢' },
      { t: 'unruhig', e: '😟' },
      { t: 'froh', e: '😊' },
      { t: 'nass', e: '💧' },
      { t: 'erschöpft', e: '🥱' },
      { t: 'verwirrt', e: '😵‍💫' },
      { t: 'allein', e: '🧍' },
      { t: 'dankbar', e: '🙏' },
      { t: 'zufrieden', e: '😌' },
      { t: 'wütend', e: '😠' },
    ],
  };

  const ICH_HABE = {
    f: false,
    o: [
      { t: 'starke Schmerzen', e: '😖', n: SCHMERZ_ORT },
      { t: 'Angst', e: '😨', n: ANGST_WOVOR },
      { t: 'Atemnot', e: '😮‍💨' },
      { t: 'einen trockenen Mund', e: '👄' },
      { t: 'Übelkeit', e: '🤢' },
      { t: 'Juckreiz', e: '🐜', n: JUCK_ORT },
      { t: 'trockene Lippen', e: '💋' },
      { t: 'kalte Füße', e: '🦶' },
      { t: 'leichte Schmerzen', e: '😕', n: SCHMERZ_ORT },
      { t: 'Heimweh', e: '🏠' },
      { t: 'schlecht geschlafen', e: '🌙' },
      { t: 'eine Frage', e: '❓' },
    ],
  };

  const ICH_MUSS = {
    f: false,
    o: [
      { t: 'auf die Toilette', e: '🚽' },
      { t: 'husten', e: '😷' },
      { t: 'brechen', e: '🤮' },
      { t: 'mich bewegen', e: '🔄' },
      { t: 'abgesaugt werden', e: '🫁' },
      { t: 'weinen', e: '😢' },
    ],
  };

  const ICH_VERMISSE = {
    f: false,
    o: [
      ...vermissen,
      { t: 'euch alle', e: '👨‍👩‍👧‍👦' },
      { t: 'mein Zuhause', e: '🏠' },
    ],
  };

  const ICH_KANN_NICHT = {
    f: false,
    o: [
      { t: 'schlafen', e: '😴' },
      { t: 'gut atmen', e: '😮‍💨' },
      { t: 'so liegen', e: '🛏️' },
      { t: 'mehr', e: '😞' },
    ],
  };

  const ICH = {
    f: false,
    o: [
      { t: 'habe Schmerzen', e: '😣', n: SCHMERZ_ORT },
      { t: 'möchte', e: '👉', n: ICH_MOECHTE },
      { t: 'bin', e: '🙂', n: ICH_BIN },
      { t: 'habe', e: '✋', n: ICH_HABE },
      { t: 'muss', e: '❗', n: ICH_MUSS },
      { t: 'hab dich lieb', e: '❤️' },
      { t: 'friere', e: '🥶' },
      { t: 'schwitze', e: '🥵' },
      { t: 'danke euch', e: '🙏' },
      { t: 'vermisse', e: '💭', n: ICH_VERMISSE },
      { t: 'kann nicht', e: '🚫', n: ICH_KANN_NICHT },
      { t: 'verstehe das nicht', e: '❓' },
      { t: 'weiß es nicht', e: '🤷' },
    ],
  };

  const BITTE = {
    f: false,
    o: [
      { t: 'umdrehen', e: '🔄', n: DREHEN },
      { t: 'Mund befeuchten', e: '💧' },
      { t: 'Kissen richten', e: '🛏️' },
      { t: 'zudecken', e: '🛌' },
      { t: 'Decke weg', e: '🥵' },
      { t: 'Lippen eincremen', e: '💋' },
      { t: 'Pflege rufen', e: '🔔' },
      { t: 'Hand halten', e: '🤝' },
      { t: 'Kopfteil höher', e: '⬆️' },
      { t: 'Kopfteil tiefer', e: '⬇️' },
      { t: 'bleib bei mir', e: '❤️' },
      { t: 'Brille aufsetzen', e: '👓' },
      { t: 'Sonde prüfen', e: '👃' },
      { t: 'Windel wechseln', e: '🧻' },
      { t: 'kratzen', e: '✋', n: JUCK_ORT },
      { t: 'Licht aus', e: '🌙' },
      { t: 'Licht an', e: '💡' },
      { t: 'Arzt rufen', e: '👨‍⚕️' },
      ...anrufen,
      { t: 'Fenster öffnen', e: '🪟' },
      { t: 'Fenster schließen', e: '🚪' },
      { t: 'Ruhe', e: '🤫' },
      { t: 'langsamer sprechen', e: '🐢' },
      { t: 'lauter sprechen', e: '🔊' },
      { t: 'noch einmal sagen', e: '🔁' },
      { t: 'Gesicht waschen', e: '🧼' },
      { t: 'Beine hochlegen', e: '🦵' },
      { t: 'absaugen', e: '🫁' },
      { t: 'erzähl mir etwas', e: '💬' },
    ],
  };

  return { ich: ICH, bitte: BITTE };
}

// Liefert alle Vorschläge des Wortbaums für den bisherigen Satz.
// teile: [{text, emoji}, ...]   namen: ['Anna', 'Peter', ...]
// Ergebnis: { optionen: [{text, emoji}], fertig: boolean }
export function baumVorschlaege(teile, namen = []) {
  const baum = baueBaum(namen);
  let knoten = baum[(teile[0]?.text || '').toLowerCase()];

  for (let i = 1; knoten && i < teile.length; i++) {
    const gesucht = teile[i].text.toLowerCase();
    const option = knoten.o.find((o) => o.t.toLowerCase() === gesucht);
    // Unbekanntes Wort -> allgemeiner Knoten. Bekanntes Wort ohne Folge -> Ende.
    knoten = option ? option.n || ENDE : null;
  }
  if (!knoten) knoten = ALLGEMEIN;

  return {
    optionen: knoten.o.map((o) => ({ text: o.t, emoji: o.e })),
    fertig: knoten.f,
  };
}
