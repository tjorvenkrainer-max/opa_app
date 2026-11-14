// KI-Modul: holt Vorschläge für die nächsten Wörter von der Claude API
// (direkt aus dem Browser) und fällt auf den festen Wortbaum zurück, wenn
// die KI fehlt, nicht erreichbar oder zu langsam ist.
// Datenschutz: An die API geht nur Text (der bisherige Satz), nie ein Bild.

import { baumVorschlaege } from './wortbaum.js';
import { namenListe, satzText } from './speicher.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const WARTEZEIT_MS = 4000; // so lange wartet die Anzeige höchstens auf die KI
const ABBRUCH_MS = 12000; // danach wird die Anfrage ganz abgebrochen
const PAUSE_NACH_FEHLER_MS = 20000; // nach einem Fehler erst einmal nur Wortbaum

// Striktes Antwortformat: Liste von Optionen plus "fertig"-Flag.
const SCHEMA = {
  type: 'object',
  properties: {
    optionen: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          emoji: { type: 'string' },
        },
        required: ['text', 'emoji'],
        additionalProperties: false,
      },
    },
    fertig: { type: 'boolean' },
  },
  required: ['optionen', 'fertig'],
  additionalProperties: false,
};

// Sicherheitsnetz: Opa darf nichts essen oder trinken. Falls die KI trotz
// Anweisung so etwas vorschlägt, wird die Option hier aussortiert.
// ("Wasser lassen" bleibt erlaubt, das ist der Toilettengang.)
const VERBOTEN = new RegExp(
  '(?<![\\p{L}])(' +
    'essen|esse|isst|iss|gegessen|mahlzeit|frühstück\\p{L}*|mittagessen|abendessen|' +
    'trinken|trinke|trinkt|getrunken|getränk\\p{L}*|schluck\\p{L}*|' +
    'durst|durstig|hunger|hungrig|appetit|' +
    'wasser(?!\\s+lassen)|kaffee|tee|saft|bier|wein|milch|kakao|limo\\p{L}*|cola|' +
    'suppe|brot|brötchen|kuchen|keks\\p{L}*|schokolade|obst|apfel|banane|joghurt|pudding|eis|bonbon\\p{L}*' +
    ')(?![\\p{L}])',
  'iu'
);

export function istErlaubt(text) {
  return !VERBOTEN.test(text);
}

// Beschreibt der KI die Lage von Opa und die Regeln für Vorschläge.
function systemPrompt(namen) {
  const familie = namen.length
    ? `Diese Menschen gehören zu seiner Familie. Du darfst ihre Namen vorschlagen, wenn es passt: ${namen.join('; ')}.`
    : 'Es sind keine Familiennamen hinterlegt. Verwende allgemeine Wörter wie "meine Familie".';

  return `Du hilfst einem 89-jährigen Mann im Krankenhaus, Sätze zu bauen. Er kann nicht sprechen und sich kaum bewegen. Er wählt mit den Augen aus wenigen großen Feldern auf einem Bildschirm. Seine Familie sitzt bei ihm und liest mit. Deine Aufgabe: Vorschlagen, wie sein angefangener Satz weitergehen könnte.

Seine Lage:
- Er liegt im Krankenhausbett und ist bei allem auf Pflege angewiesen.
- Er isst und trinkt nichts. Er wird vollständig über Infusion und Nasensonde ernährt. Schlage deshalb niemals Essen, Trinken, Getränke, Speisen, Hunger oder Durst vor, auch nicht "einen Schluck Wasser". Passend sind stattdessen zum Beispiel: "einen trockenen Mund", "Mund befeuchten", "Lippen eincremen", "die Sonde stört".
- Er liest schlecht, und das Pflegepersonal soll alles sofort verstehen. Verwende deshalb nur kurze, einfache, alltägliche Wörter in Hochdeutsch. Kein Dialekt, keine Fachwörter.

Themen, die für ihn wichtig sind:
- Körper und Schmerzen: wo es weh tut, wie stark, Übelkeit, Atemnot, Juckreiz.
- Lage und Pflege: umdrehen, Kissen, Decke, kalt oder warm, Mund trocken, Toilette oder Windel, Licht, Brille.
- Gefühle und Familie: Angst, müde, traurig, Danke, "Ich hab dich lieb", wer kommen soll.

${familie}

Regeln für die Optionen:
- Jede Option setzt den bisherigen Satz direkt fort und ist grammatisch richtig. Wiederhole den bisherigen Satz nicht.
- Eine Option hat 1 bis 3 Wörter. Kurze Wortgruppen wie "habe Schmerzen" oder "möchte gedreht werden" sind gut, weil er dann seltener wählen muss.
- Keine Satzzeichen. Nur Nomen und Namen groß schreiben.
- Die Optionen sollen sich deutlich voneinander unterscheiden, damit möglichst viele Bedürfnisse erreichbar sind. Sortiere sie: die wahrscheinlichste zuerst.
- Jede Option bekommt genau ein passendes, leicht erkennbares Emoji.
- Setze "fertig" auf true, wenn der bisherige Satz schon ein vollständiger, sinnvoller Satz ist (zum Beispiel "Ich habe Schmerzen"). Biete dann trotzdem sinnvolle Ergänzungen an, etwa Ort, Stärke oder Zeit. Gibt es keine sinnvolle Ergänzung mehr, gib eine leere Liste zurück.

Antworte nur mit JSON in dieser Form: {"optionen":[{"text":"...","emoji":"..."}],"fertig":false}`;
}

function nutzerText(teile, bekannte, anzahl) {
  let t = `Bisheriger Satz: "${satzText(teile)}"`;
  if (bekannte.length) {
    t += `\nDiese Fortsetzungen hat er schon gesehen und nicht gewählt. Schlage andere vor: ${bekannte
      .map((o) => `"${o.text}"`)
      .join(', ')}`;
  }
  return `${t}\nGib ${anzahl} Optionen.`;
}

// Text aus der Antwort ziehen (Blöcke nach Typ lesen, nicht nach Position).
function leseJson(antwort) {
  if (antwort.stop_reason === 'refusal' || antwort.stop_reason === 'max_tokens') {
    throw new Error(`Antwort unvollständig (${antwort.stop_reason})`);
  }
  const text = (antwort.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    // Falls doch Text um das JSON herum steht: den JSON-Teil herausschneiden.
    const a = text.indexOf('{');
    const z = text.lastIndexOf('}');
    if (a < 0 || z <= a) throw new Error('Antwort ist kein JSON');
    return JSON.parse(text.slice(a, z + 1));
  }
}

// Option der KI säubern; ungültige oder verbotene Optionen ergeben null.
function saeubere(option) {
  if (!option || typeof option.text !== 'string') return null;
  const text = option.text
    .replace(/["„“”]/g, '')
    .replace(/[.!?…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length > 40 || text.split(' ').length > 4) return null;
  if (!istErlaubt(text)) return null;
  const emoji = typeof option.emoji === 'string' ? option.emoji.trim().slice(0, 16) : '';
  return { text, emoji: emoji || '💬' };
}

export class Vorschlaege {
  // holeEinstellungen: Funktion, die die aktuellen Einstellungen liefert
  // beiStatus: wird gerufen, wenn sich der KI-Status ändert
  constructor(holeEinstellungen, beiStatus = () => {}) {
    this.holeEinstellungen = holeEinstellungen;
    this.beiStatus = beiStatus;
    this.speicher = new Map(); // Satz -> Eintrag
    this.gestoertBis = 0;
    this.einfacheModelle = new Set(); // Modelle, die das strikte Format ablehnen
    this.status = 'aus'; // 'aus' | 'ok' | 'gestoert' | 'key'
    this.meldung = '';
  }

  // Nach geänderten Einstellungen (Key, Modell, Namen) alles neu holen.
  leeren() {
    this.speicher.clear();
    this.gestoertBis = 0;
    this.setzeStatus(this.holeEinstellungen().apiKey ? 'ok' : 'aus', '');
  }

  setzeStatus(status, meldung) {
    if (status === this.status && meldung === this.meldung) return;
    this.status = status;
    this.meldung = meldung;
    this.beiStatus(status, meldung);
  }

  kiNutzbar() {
    return Boolean(this.holeEinstellungen().apiKey) && Date.now() >= this.gestoertBis;
  }

  eintrag(teile) {
    const schluessel = satzText(teile).toLowerCase();
    let e = this.speicher.get(schluessel);
    if (!e) {
      e = { optionen: [], fertig: false, quelle: null, erschoepft: false, baum: false, laufend: null };
      this.speicher.set(schluessel, e);
    }
    return e;
  }

  // Liefert die Vorschläge für den Satz. Es werden mindestens `bedarf`
  // Optionen bereitgestellt, falls es so viele gibt.
  // Ergebnis: { optionen, fertig, quelle: 'ki' | 'offline', erschoepft }
  async hole(teile, bedarf) {
    const e = this.eintrag(teile);
    if (e.optionen.length < bedarf && !e.erschoepft) {
      let kiOk = false;
      if (this.kiNutzbar() && !e.baum) {
        // Auf die KI warten, aber nie länger als WARTEZEIT_MS.
        const warte = new Promise((r) => setTimeout(() => r('zeit'), WARTEZEIT_MS));
        const ausgang = await Promise.race([this.ladeKI(e, teile).then(() => true, () => false), warte]);
        kiOk = ausgang === true;
        if (ausgang === 'zeit') {
          // Zu langsam: eine Weile nur den Wortbaum nehmen, statt bei jedem
          // Schritt erneut zu warten.
          this.gestoertBis = Date.now() + PAUSE_NACH_FEHLER_MS;
          this.setzeStatus('gestoert', 'Die KI hat zu lange gebraucht.');
        }
      }
      // Wortbaum nehmen, wenn die KI ausfällt, zu wenig liefert oder gar
      // nichts Brauchbares geliefert hat (Sackgasse vermeiden).
      const zuWenig = e.optionen.length < bedarf && !e.erschoepft;
      const leer = e.optionen.length === 0 && !e.fertig;
      if (!kiOk || zuWenig || leer) this.fuelleAusBaum(e, teile);
    }
    return { optionen: e.optionen, fertig: e.fertig, quelle: e.quelle, erschoepft: e.erschoepft };
  }

  // Im Hintergrund vorladen, damit beim nächsten Schritt keine Wartezeit entsteht.
  vorladen(teile) {
    const e = this.eintrag(teile);
    if (e.optionen.length || e.erschoepft || e.baum || !this.kiNutzbar()) return;
    this.ladeKI(e, teile).catch(() => {});
  }

  // Wortbaum-Optionen anhängen (ohne Doppelte). Danach gibt es nichts Neues mehr.
  fuelleAusBaum(e, teile) {
    const b = baumVorschlaege(teile, namenListe(this.holeEinstellungen()));
    const bekannt = new Set(e.optionen.map((o) => o.text.toLowerCase()));
    for (const o of b.optionen) {
      if (!bekannt.has(o.text.toLowerCase())) e.optionen.push(o);
    }
    if (!e.quelle) {
      e.quelle = 'offline';
      e.fertig = b.fertig;
    }
    e.baum = true;
    e.erschoepft = true;
  }

  // Holt 3 weitere Optionen von der KI und hängt sie an den Eintrag an.
  // Mehrere Aufrufe für denselben Satz teilen sich eine Anfrage.
  ladeKI(e, teile) {
    if (e.laufend) return e.laufend;
    const bekannte = [...e.optionen];
    e.laufend = this.frageKI(teile, bekannte)
      .then((daten) => {
        if (e.baum) return; // Wortbaum wurde inzwischen angezeigt: nichts mehr ändern
        const satz = satzText(teile).toLowerCase();
        const bekannt = new Set(e.optionen.map((o) => o.text.toLowerCase()));
        let neu = 0;
        for (const roh of Array.isArray(daten.optionen) ? daten.optionen : []) {
          const o = saeubere(roh);
          if (!o) continue;
          const klein = o.text.toLowerCase();
          if (bekannt.has(klein) || klein === satz) continue;
          bekannt.add(klein);
          e.optionen.push(o);
          neu++;
          if (neu >= 3) break;
        }
        if (!e.quelle) {
          e.quelle = 'ki';
          e.fertig = Boolean(daten.fertig);
        }
        if (neu === 0) e.erschoepft = true;
        this.setzeStatus('ok', '');
      })
      .catch((fehler) => {
        this.gestoertBis = Date.now() + PAUSE_NACH_FEHLER_MS;
        this.setzeStatus(fehler.keyFehler ? 'key' : 'gestoert', fehler.message);
        throw fehler;
      })
      .finally(() => {
        e.laufend = null;
      });
    return e.laufend;
  }

  // Eine Anfrage an die Claude Messages API.
  async frageKI(teile, bekannte, anzahl = 3) {
    const s = this.holeEinstellungen();
    const system = systemPrompt(
      (s.namen || '').split(/[\n,;]/).map((z) => z.trim()).filter(Boolean)
    );
    const nutzer = nutzerText(teile, bekannte, anzahl);

    const sende = async (einfach) => {
      const body = {
        model: s.modell,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: nutzer }],
      };
      if (!einfach) {
        // Wenig Nachdenken = schnelle Antwort; Schema = garantiert gültiges JSON.
        body.output_config = { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } };
        if (/haiku/i.test(s.modell)) body.thinking = { type: 'disabled' };
      }
      const abbruch = new AbortController();
      const uhr = setTimeout(() => abbruch.abort(), ABBRUCH_MS);
      try {
        return await fetch(API_URL, {
          method: 'POST',
          signal: abbruch.signal,
          headers: {
            'content-type': 'application/json',
            'x-api-key': s.apiKey,
            'anthropic-version': '2026-10-21',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
        });
      } finally {
        clearTimeout(uhr);
      }
    };

    let einfach = this.einfacheModelle.has(s.modell);
    let antwort = await sende(einfach);
    if (antwort.status === 400 && !einfach) {
      // Manche (ältere) Modelle kennen diese Parameter nicht: ohne sie wiederholen.
      this.einfacheModelle.add(s.modell);
      antwort = await sende(true);
    }
    if (!antwort.ok) {
      let detail = '';
      try {
        detail = (await antwort.json())?.error?.message || '';
      } catch {
        // Fehlertext nicht lesbar: egal
      }
      const fehler = new Error(`API-Fehler ${antwort.status}${detail ? ': ' + detail : ''}`);
      fehler.keyFehler = antwort.status === 401 || antwort.status === 403;
      throw fehler;
    }
    return leseJson(await antwort.json());
  }

  // Für den Knopf "Verbindung testen" in den Einstellungen.
  async teste() {
    if (!this.holeEinstellungen().apiKey) return { ok: false, meldung: 'Kein API-Key eingetragen.' };
    try {
      const daten = await this.frageKI([{ text: 'Ich', emoji: '🙋' }], []);
      const anzahl = Array.isArray(daten.optionen) ? daten.optionen.length : 0;
      this.gestoertBis = 0;
      this.setzeStatus('ok', '');
      return { ok: true, meldung: `Verbindung in Ordnung (${anzahl} Vorschläge erhalten).` };
    } catch (fehler) {
      const text = fehler.name === 'AbortError' ? 'Keine Antwort (Zeitüberschreitung).' : fehler.message;
      return { ok: false, meldung: `Keine Verbindung: ${text}` };
    }
  }
}
