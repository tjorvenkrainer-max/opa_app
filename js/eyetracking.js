// Eyetracking-Modul: erkennt mit der Webcam, in welche RICHTUNG Opa schaut
// (links / rechts / oben / unten / Mitte). Kein pixelgenaues Blick-Tracking.
//
// So funktioniert es:
// 1. MediaPipe Face Landmarker liefert 478 Gesichtspunkte inkl. Iris.
// 2. Pro Auge wird gemessen, wo die Iris zwischen den Augenwinkeln sitzt
//    (waagrecht) und wie weit sie und das Oberlid von der Augenachse
//    entfernt sind (senkrecht). Alles relativ zur Augenbreite, deshalb
//    unabhängig von Abstand und Kopfneigung.
// 3. Die Kopfdrehung (Nasenspitze relativ zur Augenlinie) wird addiert:
//    Blickrichtung = Kopfrichtung + Augenrichtung. Dreht Opa nur leicht den
//    Kopf und schaut weiter zur Mitte, hebt sich beides auf.
// 4. Das Signal wird geglättet (gleitender Mittelwert) und mit der
//    persönlichen Kalibrierung verglichen.
//
// Die Kamerabilder werden nur hier im Browser verarbeitet.

export const RICHTUNGEN = ['links', 'rechts', 'oben', 'unten'];

const MODELL_URL = new URL('../vendor/mediapipe/face_landmarker.task', import.meta.url).href;
const WASM_URL = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const BUNDLE_URL = new URL('../vendor/mediapipe/vision_bundle.mjs', import.meta.url).href;

const GLAETTUNG = 6; // gleitender Mittelwert über so viele Bilder
const KOPF_ANTEIL = 1.0; // Gewicht der Kopfdrehung gegenüber der Augenbewegung
const IRIS_ANTEIL = 0.6; // senkrecht: Anteil der Iris ...
const LID_ANTEIL = 0.4; // ... und des Oberlids (hilft beim Blick nach unten)
const HALTEN = 0.75; // erkannte Richtung bleibt bis 75 % der Schwelle bestehen
const MIN_LAENGE = 0.02; // kleinster sinnvoller Abstand Mitte -> Ziel
const BLINZELN_MS = 500; // so lange zählt "Augen zu" als Blinzeln

// Landmark-Nummern von MediaPipe (aus Sicht des Bildes: "bildLinks" = links im Bild)
const AUGE_BILD_LINKS = { a: 33, b: 133, iris: 468, oben: 159, unten: 145 };
const AUGE_BILD_RECHTS = { a: 362, b: 263, iris: 473, oben: 386, unten: 374 };
const NASENSPITZE = 1;

// Lage eines Punktes p relativ zur Achse a->b:
// t = Position entlang der Achse (0 bei a, 1 bei b),
// n = Abstand quer zur Achse, geteilt durch die Achsenlänge (positiv = darunter).
function relativ(a, b, p) {
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const l2 = ax * ax + ay * ay || 1;
  const px = p.x - a.x;
  const py = p.y - a.y;
  return { t: (px * ax + py * ay) / l2, n: (ax * py - ay * px) / l2 };
}

// Rechnet die Gesichtspunkte in wenige Zahlen um (siehe Erklärung oben).
export function berechneMerkmale(lm, breite, hoehe) {
  const P = (i) => ({ x: lm[i].x * breite, y: lm[i].y * hoehe });

  const auge = (nr) => {
    const a = P(nr.a);
    const b = P(nr.b);
    const iris = relativ(a, b, P(nr.iris));
    const oben = relativ(a, b, P(nr.oben));
    const unten = relativ(a, b, P(nr.unten));
    return { x: iris.t - 0.5, y: iris.n, lid: oben.n, offen: unten.n - oben.n };
  };
  const l = auge(AUGE_BILD_LINKS);
  const r = auge(AUGE_BILD_RECHTS);

  // Kopfdrehung: Nasenspitze relativ zur Linie zwischen den äußeren Augenwinkeln
  const aussenL = P(AUGE_BILD_LINKS.a);
  const aussenR = P(AUGE_BILD_RECHTS.b);
  const nase = relativ(aussenL, aussenR, P(NASENSPITZE));

  const augeX = (l.x + r.x) / 2;
  const augeY = IRIS_ANTEIL * ((l.y + r.y) / 2) + LID_ANTEIL * ((l.lid + r.lid) / 2);
  const kopfX = nase.t - 0.5;
  const kopfY = nase.n;

  return {
    x: augeX + KOPF_ANTEIL * kopfX, // waagrechtes Blicksignal
    y: augeY + KOPF_ANTEIL * kopfY, // senkrechtes Blicksignal
    offen: (l.offen + r.offen) / 2, // Lidöffnung (klein = Auge zu)
    augeX,
    augeY,
    kopfX,
    kopfY,
    // Für die Bildkontrolle: Größe, Lage und Neigung des Gesichts
    abstand: Math.hypot(aussenR.x - aussenL.x, aussenR.y - aussenL.y) / breite,
    mitteX: (lm[AUGE_BILD_LINKS.a].x + lm[AUGE_BILD_RECHTS.b].x) / 2,
    mitteY: (lm[AUGE_BILD_LINKS.a].y + lm[AUGE_BILD_RECHTS.b].y) / 2,
    neigung: (Math.atan2(aussenR.y - aussenL.y, aussenR.x - aussenL.x) * 180) / Math.PI,
  };
}

function median(werte) {
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Wie weit ist das Signal von der Mitte in Richtung eines Ziels gewandert?
// 0 = Mitte, 1 = so weit wie bei der Kalibrierung.
function wert(signal, mitte, ziel) {
  const l2 = Math.max(ziel.x * ziel.x + ziel.y * ziel.y, MIN_LAENGE * MIN_LAENGE);
  return ((signal.x - mitte.x) * ziel.x + (signal.y - mitte.y) * ziel.y) / l2;
}

// Berechnet aus den gesammelten Proben die persönliche Kalibrierung.
// proben: { mitte: [{x,y,offen}], links: [...], rechts: [...], oben: [...], unten: [...] }
export function berechneKalibrierung(proben) {
  const mittel = (liste) => ({
    x: median(liste.map((p) => p.x)),
    y: median(liste.map((p) => p.y)),
    offen: median(liste.map((p) => p.offen)),
  });
  const mitte = mittel(proben.mitte);
  const ziele = {};
  const offen = { mitte: mitte.offen };
  for (const r of RICHTUNGEN) {
    const m = mittel(proben[r]);
    ziele[r] = { x: m.x - mitte.x, y: m.y - mitte.y };
    offen[r] = m.offen;
  }

  // Qualität je Richtung: Wie stark zappelt das Signal in der Mitte (Rauschen)
  // und wird die Richtung mit einer anderen verwechselt?
  const rauschen = {};
  const qualitaet = {};
  for (const r of RICHTUNGEN) {
    const w = proben.mitte.map((p) => wert(p, mitte, ziele[r]));
    const mw = w.reduce((a, b) => a + b, 0) / w.length;
    rauschen[r] = Math.sqrt(w.reduce((a, b) => a + (b - mw) ** 2, 0) / w.length);

    const laenge = Math.hypot(ziele[r].x, ziele[r].y);
    const verwechslung = Math.max(
      ...RICHTUNGEN.filter((e) => e !== r).map((e) =>
        wert({ x: mitte.x + ziele[e].x, y: mitte.y + ziele[e].y }, mitte, ziele[r])
      )
    );
    if (laenge < MIN_LAENGE || rauschen[r] > 0.35 || verwechslung > 0.8) qualitaet[r] = 'fehlt';
    else if (rauschen[r] > 0.18 || verwechslung > 0.5) qualitaet[r] = 'schwach';
    else qualitaet[r] = 'gut';
  }

  // Ab welcher Lidöffnung gilt das Auge als geschlossen? Beim Blick nach
  // unten ist das Auge schon halb zu, deshalb deutlich darunter bleiben.
  const zuSchwelle = Math.max(0.02, Math.min(0.5 * offen.mitte, 0.6 * offen.unten));

  return { mitte: { x: mitte.x, y: mitte.y }, ziele, rauschen, qualitaet, zuSchwelle, datum: Date.now() };
}

// Empfindlichkeit 1–10 aus den Einstellungen -> Schwelle 0,85–0,25.
// Schwelle 0,5 heißt: halb so weit schauen wie bei der Kalibrierung genügt.
export function schwelleAusEmpfindlichkeit(stufe) {
  const s = Math.min(10, Math.max(1, Number(stufe) || 5));
  return 0.85 - ((s - 1) * 0.6) / 9;
}

export class EyeTracker {
  constructor() {
    this.video = null;
    this.landmarker = null;
    this.laeuft = false;
    this.kalibrierung = null;
    this.schwellen = { links: 0.55, rechts: 0.55, oben: 0.55, unten: 0.45 };
    this.puffer = [];
    this.sammler = null;
    this.punkte = null; // letzte Gesichtspunkte (für die Debug-Ansicht)
    this.augenZuSeit = 0;
    this.letzteHelligkeit = 128;
    this.helligkeitZeit = 0;
    this.bildZeiten = [];
    this.beiBild = null; // wird nach jedem verarbeiteten Kamerabild gerufen
    this.zustand = {
      gesicht: false,
      augenZu: false,
      richtung: null,
      werte: { links: 0, rechts: 0, oben: 0, unten: 0 },
      signal: null,
      merkmale: null,
      pruefung: { ok: false, text: 'Kamera startet …' },
      bps: 0,
    };
  }

  // Lädt MediaPipe und das Gesichtsmodell (alles lokal aus dem Ordner vendor/).
  async ladeModell() {
    if (this.landmarker) return;
    const mp = await import(BUNDLE_URL);
    const dateien = await mp.FilesetResolver.forVisionTasks(WASM_URL);
    const optionen = (delegate) => ({
      baseOptions: { modelAssetPath: MODELL_URL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFacialTransformationMatrixes: true, // Kopfhaltung (Head Pose)
    });
    try {
      this.landmarker = await mp.FaceLandmarker.createFromOptions(dateien, optionen('GPU'));
    } catch {
      // Ohne Grafikbeschleunigung: langsamer, geht aber auch.
      this.landmarker = await mp.FaceLandmarker.createFromOptions(dateien, optionen('CPU'));
    }
  }

  // Startet die Webcam und die Erkennungsschleife.
  async starteKamera(video) {
    const strom = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = strom;
    await video.play();
    this.video = video;
    this.laeuft = true;
    this.letzteVideoZeit = -1;
    let letzterSchritt = 0;
    const schritt = () => {
      letzterSchritt = performance.now();
      if (video.readyState >= 2 && video.currentTime !== this.letzteVideoZeit) {
        this.letzteVideoZeit = video.currentTime;
        try {
          this.verarbeite(this.landmarker.detectForVideo(video, performance.now()));
        } catch (fehler) {
          console.warn('Erkennung fehlgeschlagen:', fehler);
        }
      }
    };
    const schleife = () => {
      if (!this.laeuft) return;
      schritt();
      requestAnimationFrame(schleife);
    };
    requestAnimationFrame(schleife);
    // Ersatz-Zeitgeber, falls der Browser die Bildschleife ausbremst
    clearInterval(this.zeitgeber);
    this.zeitgeber = setInterval(() => {
      if (this.laeuft && performance.now() - letzterSchritt > 150) schritt();
    }, 66);
  }

  // Wurde in der letzten halben Sekunde ein Kamerabild ausgewertet?
  istFrisch() {
    const letztes = this.bildZeiten[this.bildZeiten.length - 1] || 0;
    return performance.now() - letztes < 500;
  }

  stoppe() {
    this.laeuft = false;
    clearInterval(this.zeitgeber);
    this.video?.srcObject?.getTracks().forEach((t) => t.stop());
  }

  setzeKalibrierung(k) {
    this.kalibrierung = k;
    this.puffer = [];
  }

  setzeEmpfindlichkeit(e) {
    for (const r of RICHTUNGEN) this.schwellen[r] = schwelleAusEmpfindlichkeit(e[r]);
  }

  // Für die Kalibrierung: geglättete Signale sammeln.
  starteSammeln() {
    this.sammler = [];
  }

  beendeSammeln() {
    const proben = this.sammler || [];
    this.sammler = null;
    return proben;
  }

  // Ein Ergebnis von MediaPipe auswerten.
  verarbeite(ergebnis) {
    const jetzt = performance.now();
    const z = this.zustand;
    this.bildZeiten.push(jetzt);
    while (this.bildZeiten[0] < jetzt - 1000) this.bildZeiten.shift();
    z.bps = this.bildZeiten.length;
    this.messeHelligkeit(jetzt);

    const lm = ergebnis.faceLandmarks?.[0];
    if (!lm || lm.length < 478) {
      // Kein Gesicht: alles zurücksetzen, die App pausiert dann von selbst.
      this.punkte = null;
      this.puffer = [];
      z.gesicht = false;
      z.augenZu = false;
      z.richtung = null;
      z.signal = null;
      z.merkmale = null;
      z.pruefung = {
        ok: false,
        text: this.letzteHelligkeit < 40 ? 'Zu dunkel – kein Gesicht erkannt' : 'Kein Gesicht erkannt',
      };
      this.beiBild?.(z);
      return;
    }

    this.punkte = lm;
    const m = berechneMerkmale(lm, this.video.videoWidth, this.video.videoHeight);
    z.gesicht = true;
    z.merkmale = m;
    z.pruefung = this.pruefeBild(m, ergebnis.facialTransformationMatrixes?.[0]);

    // Blinzeln / Augen zu: Signal nicht verwenden. Kurz die alte Richtung
    // halten, bei längerem Schließen gilt "Mitte" (Opa ruht sich aus).
    const zuSchwelle = this.kalibrierung?.zuSchwelle ?? 0.07;
    if (m.offen < zuSchwelle) {
      if (!this.augenZuSeit) this.augenZuSeit = jetzt;
      z.augenZu = true;
      if (jetzt - this.augenZuSeit > BLINZELN_MS) {
        z.richtung = null;
        this.puffer = [];
      }
      this.beiBild?.(z);
      return;
    }
    this.augenZuSeit = 0;
    z.augenZu = false;

    // Glätten: gleitender Mittelwert über die letzten Bilder
    this.puffer.push({ x: m.x, y: m.y });
    if (this.puffer.length > GLAETTUNG) this.puffer.shift();
    const signal = {
      x: this.puffer.reduce((a, p) => a + p.x, 0) / this.puffer.length,
      y: this.puffer.reduce((a, p) => a + p.y, 0) / this.puffer.length,
      offen: m.offen,
    };
    z.signal = signal;
    if (this.sammler && this.puffer.length === GLAETTUNG) this.sammler.push(signal);

    z.richtung = this.bestimmeRichtung(signal);
    this.beiBild?.(z);
  }

  // Vergleicht das Signal mit der Kalibrierung und liefert die Richtung.
  bestimmeRichtung(signal) {
    const z = this.zustand;
    const k = this.kalibrierung;
    if (!k) {
      for (const r of RICHTUNGEN) z.werte[r] = 0;
      return null;
    }
    let beste = RICHTUNGEN[0];
    for (const r of RICHTUNGEN) {
      z.werte[r] = wert(signal, k.mitte, k.ziele[r]);
      if (z.werte[r] > z.werte[beste]) beste = r;
    }
    // Hysterese gegen Flackern: Eine erkannte Richtung bleibt bestehen,
    // solange sie nicht deutlich unter ihre Schwelle fällt.
    const alt = z.richtung;
    if (alt && z.werte[alt] >= this.schwellen[alt] * HALTEN && z.werte[alt] >= z.werte[beste] - 0.1) {
      return alt;
    }
    return z.werte[beste] >= this.schwellen[beste] ? beste : null;
  }

  // Kontrolle für die Familie: Ist das Gesicht gut im Bild?
  pruefeBild(m, matrix) {
    let schraeg = Math.abs(m.kopfX) > 0.2;
    if (matrix?.data) {
      // Winkel zwischen Blickrichtung des Gesichts und der Kamera-Achse
      const d = matrix.data;
      const laenge = Math.hypot(d[8], d[9], d[10]) || 1;
      const winkel = (Math.acos(Math.min(1, Math.abs(d[10]) / laenge)) * 180) / Math.PI;
      this.zustand.kopfWinkel = winkel;
      schraeg = winkel > 30;
    }
    if (this.letzteHelligkeit < 40) return { ok: false, text: 'Zu dunkel – bitte mehr Licht auf das Gesicht' };
    if (m.abstand < 0.09) return { ok: false, text: 'Zu weit weg – Laptop näher an das Gesicht' };
    if (m.abstand > 0.45) return { ok: false, text: 'Zu nah – Laptop etwas weiter weg' };
    if (schraeg || Math.abs(m.neigung) > 30) {
      return { ok: false, text: 'Gesicht zu schräg – Laptop gerade vor das Gesicht' };
    }
    if (Math.abs(m.mitteX - 0.5) > 0.3 || Math.abs(m.mitteY - 0.5) > 0.3) {
      return { ok: false, text: 'Gesicht nicht in der Bildmitte' };
    }
    return { ok: true, text: 'Gesicht gut im Bild' };
  }

  // Mittlere Helligkeit des Kamerabildes (zweimal pro Sekunde, stark verkleinert).
  messeHelligkeit(jetzt) {
    if (jetzt - this.helligkeitZeit < 500) return;
    this.helligkeitZeit = jetzt;
    try {
      if (!this.messFlaeche) {
        this.messFlaeche = document.createElement('canvas');
        this.messFlaeche.width = 32;
        this.messFlaeche.height = 24;
      }
      const ctx = this.messFlaeche.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(this.video, 0, 0, 32, 24);
      const d = ctx.getImageData(0, 0, 32, 24).data;
      let summe = 0;
      for (let i = 0; i < d.length; i += 4) summe += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      this.letzteHelligkeit = summe / (d.length / 4);
    } catch {
      // Messung nicht möglich: Wert bleibt, wie er war.
    }
  }

  // Debug/Vorschau: Kamerabild (gespiegelt wie ein Spiegel) mit Augenpunkten.
  zeichneVorschau(canvas) {
    const v = this.video;
    if (!v || !v.videoWidth) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, w, h);
    const lm = this.punkte;
    if (lm) {
      const punkt = (i, farbe, radius) => {
        ctx.fillStyle = farbe;
        ctx.beginPath();
        ctx.arc(lm[i].x * w, lm[i].y * h, radius, 0, Math.PI * 2);
        ctx.fill();
      };
      const gross = Math.max(2, w / 160);
      for (const a of [AUGE_BILD_LINKS, AUGE_BILD_RECHTS]) {
        punkt(a.a, '#00e5ff', gross); // Augenwinkel
        punkt(a.b, '#00e5ff', gross);
        punkt(a.oben, '#ffffff', gross * 0.8); // Lider
        punkt(a.unten, '#ffffff', gross * 0.8);
        punkt(a.iris, '#ffd400', gross * 1.3); // Iris-Mitte
        for (let i = 1; i <= 4; i++) punkt(a.iris + i, '#ffd400', gross * 0.6); // Iris-Rand
      }
      punkt(NASENSPITZE, '#ff4dd2', gross);
    }
    ctx.restore();
  }

  // Debug: kleines Blick-Diagramm. Der Punkt wandert zu dem Feld, das Opa
  // anschaut. Erreicht er den Strich, gilt die Richtung als erkannt.
  zeichneSignal(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const mx = w / 2;
    const my = h / 2;
    const r = Math.min(w, h) * 0.4; // entspricht Wert 1 (wie kalibriert)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#445';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx - r * 1.2, my);
    ctx.lineTo(mx + r * 1.2, my);
    ctx.moveTo(mx, my - r * 1.2);
    ctx.lineTo(mx, my + r * 1.2);
    ctx.stroke();
    // Schwellen als Striche
    ctx.strokeStyle = '#ffd400';
    ctx.lineWidth = 2;
    const s = this.schwellen;
    const strich = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    strich(mx - s.links * r, my - 8, mx - s.links * r, my + 8);
    strich(mx + s.rechts * r, my - 8, mx + s.rechts * r, my + 8);
    strich(mx - 8, my - s.oben * r, mx + 8, my - s.oben * r);
    strich(mx - 8, my + s.unten * r, mx + 8, my + s.unten * r);
    // Aktueller Blick
    const we = this.zustand.werte;
    const x = Math.max(0, we.rechts) - Math.max(0, we.links);
    const y = Math.max(0, we.unten) - Math.max(0, we.oben);
    const begrenzt = (v) => Math.max(-1.2, Math.min(1.2, v));
    ctx.fillStyle = this.zustand.richtung ? '#2ecc71' : '#fff';
    ctx.beginPath();
    ctx.arc(mx + begrenzt(x) * r, my + begrenzt(y) * r, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}
