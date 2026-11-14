// Auswahl-Logik: "Hinschauen und halten".
// Bekommt in jedem Takt die aktuelle Blickrichtung (oder null für Mitte)
// und entscheidet, wann ein Feld als gewählt gilt.
//
// Regeln:
// - Blick bleibt auf einem Feld -> Fortschritt füllt sich bis zur Verweildauer.
// - Wegschauen -> Fortschritt wird zurückgesetzt (nach kurzer Gnadenfrist,
//   damit ein Blinzeln oder ein kurzes Zucken nicht alles löscht).
// - Nach jeder Auswahl: Sperre. Erst wenn die Sperrzeit um ist UND der Blick
//   wieder in der Mitte war, kann neu gewählt werden.

const GNADE_MS = 250; // so lange darf der Blick kurz "weg" sein
const MITTE_MS = 200; // so lange muss der Blick in der Mitte ruhen

export class Auswahl {
  // beiZustand({ blick, anteil, bereit }): für die Anzeige (Ring, Hervorhebung)
  // beiAuswahl(richtung): ein Feld wurde gewählt
  constructor({ beiZustand, beiAuswahl }) {
    this.beiZustand = beiZustand;
    this.beiAuswahl = beiAuswahl;
    this.verweilMs = 2000;
    this.sperreMs = 1000;
    this.erlaubt = new Set(); // Richtungen, auf denen gerade etwas liegt
    this.ziel = null; // Feld, das gerade angeschaut wird
    this.zeit = 0; // bisher angesammelte Blickzeit auf dem Ziel
    this.wegSeit = 0;
    this.bereit = false;
    this.gesperrtBis = 0;
    this.mitteSeit = 0;
    this.letzterTakt = 0;
  }

  setzeErlaubt(richtungen) {
    this.erlaubt = new Set(richtungen);
  }

  // Sperre starten (nach einer Auswahl, nach Pause, nach Bildschirmwechsel).
  sperre(jetzt = performance.now()) {
    this.bereit = false;
    this.gesperrtBis = jetzt + this.sperreMs;
    this.mitteSeit = 0;
    this.ziel = null;
    this.zeit = 0;
    this.wegSeit = 0;
    this.beiZustand({ blick: null, anteil: 0, bereit: false });
  }

  // Einmal pro Bild aufrufen. richtung: 'links' | 'rechts' | 'oben' | 'unten' | null
  aktualisiere(richtung, jetzt) {
    // Höchstens 250 ms pro Takt anrechnen: Hängt der Laptop kurz, darf die
    // verlorene Zeit nicht als "hingeschaut" zählen.
    const dt = Math.min(250, jetzt - this.letzterTakt);
    this.letzterTakt = jetzt;

    if (!this.bereit) {
      // Gesperrt: warten, bis die Zeit um ist und der Blick in der Mitte ruht.
      if (richtung === null) {
        if (!this.mitteSeit) this.mitteSeit = jetzt;
      } else {
        this.mitteSeit = 0;
      }
      const mitteOk = this.mitteSeit && jetzt - this.mitteSeit >= MITTE_MS;
      if (jetzt >= this.gesperrtBis && mitteOk) {
        this.bereit = true;
        this.beiZustand({ blick: null, anteil: 0, bereit: true });
      }
      return;
    }

    const blick = richtung && this.erlaubt.has(richtung) ? richtung : null;
    if (blick && blick === this.ziel) {
      this.zeit += dt; // weiter auf demselben Feld
      this.wegSeit = 0;
    } else if (blick) {
      this.ziel = blick; // neues Feld: von vorn
      this.zeit = 0;
      this.wegSeit = 0;
    } else if (this.ziel) {
      if (!this.wegSeit) this.wegSeit = jetzt; // weggeschaut
      if (jetzt - this.wegSeit > GNADE_MS) {
        this.ziel = null;
        this.zeit = 0;
      }
    }

    const anteil = this.ziel ? Math.min(1, this.zeit / this.verweilMs) : 0;
    this.beiZustand({ blick: this.ziel, anteil, bereit: true });

    if (this.ziel && anteil >= 1) {
      const gewaehlt = this.ziel;
      this.sperre(jetzt);
      this.beiAuswahl(gewaehlt);
    }
  }
}
