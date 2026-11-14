# Opa-Sprechhilfe

Eine kleine Web-App, mit der Opa nur mit den Augen Sätze bauen kann.
Sie läuft komplett auf dem Laptop. Die Kamerabilder verlassen den Laptop nie.

## Starten

1. Doppelklick auf **`start.bat`**.
2. Es öffnet sich ein schwarzes Fenster (bitte offen lassen) und danach der Browser.
3. Im Browser die Frage nach der **Kamera** mit „Zulassen“ beantworten.
4. Laptop ausrichten, bis oben grün „Gesicht gut im Bild“ steht.
5. **Kalibrieren** drücken und Opa durch die fünf Schritte begleiten (ca. 25 Sekunden).
6. **Übernehmen und starten**. Mit der Taste **F11** oder dem Knopf „Vollbild“ wird der Bildschirm ganz genutzt.

Beenden: Browser-Fenster schließen und das schwarze Fenster schließen.

Es muss nichts installiert werden. Gebraucht wird nur Windows und ein aktueller
Browser (Chrome oder Edge). Falls Windows beim ersten Start warnt
(„Der Computer wurde durch Windows geschützt“): „Weitere Informationen“ →
„Trotzdem ausführen“.

## So bedient Opa die App

- Es gibt vier große Felder: **links, rechts, oben, unten**. Die Mitte ist neutral.
- Opa schaut deutlich in eine Richtung und **hält den Blick**. Der gelbe Ring füllt sich.
  Ist er voll, ist das Feld gewählt. Schaut er vorher weg, beginnt der Ring von vorn.
- Nach jeder Auswahl muss er **kurz zurück zur Mitte** schauen. Der Punkt in der Mitte
  wird grün, sobald wieder gewählt werden kann.
- Start: **JA** (links), **NEIN** (rechts), **ICH …** (oben), **BITTE …** (unten).
- Im Satz: links und rechts stehen die wahrscheinlichsten Fortsetzungen. Oben steht
  **➕ Anderes** (zeigt weitere Vorschläge). Unten steht immer **↩ Zurück**.
  Ist der Satz vollständig, steht oben **✔ Fertig**.
- Der fertige Satz steht groß auf dem Bildschirm, bis jemand klickt oder eine Taste drückt.

Tipp: Der Blick darf ruhig über den Bildschirmrand hinausgehen. Das ist für die
Kamera leichter zu erkennen als ein kleiner Blick zur Seite.

## Tasten für die Familie

| Taste | Wirkung |
| --- | --- |
| Pfeiltasten (gedrückt halten) | simulieren den Blick in die vier Richtungen |
| Mausklick auf ein Feld | wählt das Feld sofort |
| Leertaste | Pause / Weiter |
| Esc | zurück zum Start |
| N | andere Vorschläge für denselben Satz |
| F11 | Vollbild |

Unten gibt es eine schmale Leiste mit **Verlauf** (die letzten 10 Sätze),
**Debug**, **Einrichten** und **Einstellungen**.

## Einstellungen

- **API-Key / Modell**: Mit einem Anthropic-API-Key schlägt die KI passende
  nächste Wörter vor. Der Key wird nur in diesem Browser gespeichert.
  „Verbindung testen“ zeigt, ob es klappt. Ohne Key (oder ohne Internet) nutzt
  die App automatisch einen festen Wortbaum mit denselben Themen.
- **Verweildauer**: wie lange Opa hinschauen muss (1–4 Sekunden, Standard 2).
- **Empfindlichkeit je Richtung**: höher = ein kleinerer Blick genügt.
  UNTEN ist absichtlich empfindlicher eingestellt, weil beim Blick nach unten
  die Lider die Iris verdecken.
- **Familiennamen**: eine Zeile pro Person, z. B. `Anna (Tochter)`.
  Die Namen tauchen dann in den Vorschlägen auf.
- **Schriftgröße**, **Satz in der Mitte**.
- **Feld OBEN als „Anderes“** (Standard: an). Ausgeschaltet zeigt OBEN einen dritten
  Vorschlag; weitere Vorschläge gibt es dann nur über die Taste N.
- **Neu kalibrieren**: immer dann, wenn Opa anders liegt oder der Laptop
  verschoben wurde.

## Sprechtafel zum Tippen (Ordner `sprechtafel/`)

Eine zweite, einfache Seite ohne Kamera: große farbige Felder, ein Tipp spricht
den Satz laut aus (z. B. „Ich habe Schmerzen“). Unten stehen immer JA, NEIN und HILFE.

- Am Laptop öffnen: `http://localhost:8080/sprechtafel/` oder über den Knopf auf der Startseite.
- Stimme und Sprechtempo: Zahnrad oben rechts.
- Sätze ändern: in `sprechtafel/index.html` im Abschnitt „DIE SÄTZE“.

**Für das iPad** muss der Ordner im Internet liegen (`localhost` gilt nur für den Laptop):

1. Den ganzen Ordner `sprechtafel` (mit `index.html` und `sw.js`) auf einen Webspace
   mit https hochladen.
2. Am iPad die Adresse in Safari öffnen, dann Teilen → „Zum Home-Bildschirm“.
   Die Tafel startet danach wie eine App.
3. Nach dem ersten Öffnen funktioniert sie auch ohne Internet. Nach einer Änderung
   die Dateien neu hochladen; das iPad zeigt die neue Fassung beim übernächsten Öffnen.

Die Seite enthält keine Namen oder persönlichen Daten und ist für Suchmaschinen gesperrt.

## Wenn etwas nicht klappt

- **„Kein Gesicht erkannt“**: Laptop näher und gerader vor das Gesicht, mehr Licht
  von vorn. Brillen mit starker Spiegelung können stören.
- **Falsche Felder werden gewählt**: neu kalibrieren. Danach bei Bedarf die
  Empfindlichkeit der betroffenen Richtung senken oder die Verweildauer erhöhen.
- **UNTEN wird nicht erkannt**: Empfindlichkeit für Unten erhöhen. Oft hilft es,
  den Laptop etwas tiefer zu hängen, damit die Kamera leicht von unten schaut.
- **Debug-Ansicht** (Knopf „Debug“): zeigt das Kamerabild mit den Augenpunkten,
  die erkannte Richtung und ein kleines Diagramm. Der Punkt wandert in die
  Richtung des Blicks; erreicht er den gelben Strich, gilt die Richtung als erkannt.
- **Keine Kamera**: Mit „Ohne Kamera starten“ läuft alles mit Pfeiltasten und Maus.
- **Port belegt**: Die App sucht selbst einen freien Port (8080 bis 8089).

## Datenschutz

- Die Gesichtserkennung (MediaPipe) läuft im Browser auf dem Laptop, auch ohne Internet.
- An die KI wird nur der bisherige Satz als Text geschickt (plus die
  eingetragenen Familiennamen), nie ein Bild.
- Einstellungen, Kalibrierung und Verlauf liegen nur im Browser dieses Laptops.

## Aufbau (für Neugierige)

| Datei | Aufgabe |
| --- | --- |
| `start.bat`, `server.ps1` | startet einen kleinen lokalen Server und öffnet den Browser |
| `index.html`, `css/style.css` | Seite und Aussehen |
| `js/app.js` | Ablauf: Einrichten, Kalibrierung, Satzbau, Tasten |
| `js/eyetracking.js` | Kamera, MediaPipe, Blickrichtung, Kalibrierung |
| `js/auswahl.js` | Verweildauer, Fortschritt, Sperre nach der Auswahl |
| `js/ki.js` | Claude API, Vorladen, Wechsel auf den Wortbaum |
| `js/wortbaum.js` | fester Wortbaum für den Betrieb ohne KI |
| `js/ui.js` | alles, was gezeichnet wird |
| `js/speicher.js` | Einstellungen, Kalibrierung, Verlauf (lokal) |
| `vendor/mediapipe/` | Gesichtserkennung von Google MediaPipe (lokal mitgeliefert) |
