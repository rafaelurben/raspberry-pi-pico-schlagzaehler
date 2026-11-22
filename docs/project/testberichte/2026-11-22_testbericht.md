# Testbericht Schlagzähler

- **Datum**: 22. November 2026
- **Prüfgrundlage**: [Testkonzept – Schlagzähler](../testkonzept.md)
- **Testmittel**:
    - Schlagzähler-Prototyp mit 3 Piezos
    - Softwarestand: Firmware v0.3; Commit b12953d30753d359f56bbf7fdd182023579ef5a4
    - Trommelböckli mit Holzrahmen und Plastikfell (Modell Schlebach)
    - Holzschlägel (Schwertfeger 9)
    - MacBook Pro (M5) mit Google Chrome (Companion Web App via Web Serial, 115200 Baud)
    - Apple iPhone 16 Pro (Slo-Mo Kamera: 1080p @ 240 fps, $\Delta t_{\text{frame}} \approx 4{,}167\,\text{ms}$)
    - Ausführender: Rafael Urben (Ich spiele seit 2016 die Basler Trommel und erachte mich daher als "erfahrenen 
      Tambour".)

---

## 1. Übersicht der Testergebnisse

| Nr.     | Testfall-ID        | Gegenstand / Bereich                                      | Abgedeckte Anforderungen  | Ergebnis      |
|---------|--------------------|-----------------------------------------------------------|---------------------------|---------------|
| **1**   | `TC-FA-STANDALONE` | Autonomer Funktions- und Spielablauf (ohne Host)          | FA-H01-H02, FA-S01–FA-S12 | **BESTANDEN** |
| **2.1** | `TC-FA-HOST-1`     | Einzelgerät-Betrieb: Steuerung, Moduswechsel & Telemetrie | FA-K01-K03, FA-C01-C03    | **BESTANDEN** |
| **2.2** | `TC-FA-HOST-2`     | Resilienz bei Verbindungsunterbruch & Wiederverbindung    | FA-K03, FA-C04, FA-C05    | **BESTANDEN** |
| **3**   | `TC-NFA-REC`       | Sensor-Erkennungsraten, Dynamik & Störfestigkeit          | NFA-S01-S04               | **BESTANDEN** |
| **4**   | `TC-NFA-LAT`       | Latenzmessung Display & Web Companion (240 fps Video)     | NFA-S05, NFA-C01          | **BESTANDEN** |
| **5**   | `TC-NFA-MECH`      | Mechanische Montage & Haptik / Spielverhalten             | NFA-H01, NFA-H02          | **BESTANDEN** |

---

## 2. Detaillierte Testergebnisse

### Test 1: Autonomer Funktions- und Spielablauf ohne Host (`TC-FA-STANDALONE`)

**Ergebnis**: **Bestanden** (alle Schritte ohne Fehler absolviert).

### Test 2: Host-Kommunikation & Companion Web App (`TC-FA-HOST`)

#### 2.1: Einzelgerät-Betrieb (`TC-FA-HOST-1`)

**Ergebnis**: **Bestanden** (alle Schritte ohne Fehler absolviert).

#### 2.2: Resilienz bei Verbindungsunterbruch (`TC-FA-HOST-2`)

**Ergebnis**: **Bestanden** (alle Schritte ohne Fehler absolviert).

### Test 3: Sensor-Erkennungsraten, Dynamik & Störfestigkeit (`TC-NFA-REC`)

Je Testserie wurden $N = 100$ reale Ereignisse bzw. Schläge durchgeführt.

| Teiltest  | Anforderung | Testbedingung                                              | Soll-Kriterium                                | Gemessene Ereignisse         | Ist-Quote | Status        |
|-----------|-------------|------------------------------------------------------------|-----------------------------------------------|------------------------------|-----------|---------------|
| **3.i**   | **NFA-S01** | Störvibrationen (Klopfen an Tisch/Gestell, Nebengeräusche) | Falsch-Positive $\le 5\%$ ($\le 5$ Treffer)   | 5 Störereignisse registriert | 5.0 %     | **BESTANDEN** |
| **3.ii**  | **NFA-S02** | 100 Schläge *mezzo-forte* über Fell verteilt               | Erkennung $\ge 95\%$ ($\ge 95$ Treffer)       | 100 gezählt                  | 100.0 %   | **BESTANDEN** |
| **3.iii** | **NFA-S03** | 100 Schläge *piano* zentriert auf Fellmitte                | Erkennung $\ge 80\%$ ($\ge 80$ Treffer)       | 99 gezählt                   | 99.0 %    | **BESTANDEN** |
| **3.iv**  | **NFA-S04** | 100 Schläge *forte* mit Rebound (Doppelzählungsvermeidung) | Einfachzählung $\ge 95\%$ ($\le 105$ Treffer) | 100 gezählt                  | 100.0 %   | **BESTANDEN** |

Anmerkung: Besonders Störereignisse mit dem Schlägel am Böckliständer oder Rütteln am Ständer mit abruptem Stopp (z. B.
Anstossen an ein Objekt) haben zu einer Erkennung geführt. Eine Signalanalyse zeigt, dass das Signal gleich
aussieht wie bei einem normalen Schlag. Eine allfällige Dämpfung müsste also auf Hardwareebene geschehen.

**Ergebnis**: **Bestanden** (alle Teiltest innerhalb der Toleranz).

### Test 4: Latenzmessung Display & Companion (`TC-NFA-LAT`)

| Messung        | Display [Frames] | Display [ms] | Web [Frames] | Web [ms]    | Status Display                   | Status Web                       |
|----------------|------------------|--------------|--------------|-------------|----------------------------------|----------------------------------|
| 1              | 10               | 41.7 ms      | 17           | 70.8 ms     | Bestanden                        | Bestanden                        |
| 2              | 8                | 33.3 ms      | 13           | 54.2 ms     | Bestanden                        | Bestanden                        |
| 3              | 8                | 33.3 ms      | 14           | 58.3 ms     | Bestanden                        | Bestanden                        |
| 4              | 8                | 33.3 ms      | 13           | 54.2 ms     | Bestanden                        | Bestanden                        |
| 5              | 8                | 33.3 ms      | 16           | 66.7 ms     | Bestanden                        | Bestanden                        |
| 6              | 9                | 37.5 ms      | 13           | 54.2 ms     | Bestanden                        | Bestanden                        |
| 7              | 9                | 37.5 ms      | 16           | 66.7 ms     | Bestanden                        | Bestanden                        |
| 8              | 9                | 37.5 ms      | 14           | 58.3 ms     | Bestanden                        | Bestanden                        |
| 9              | 9                | 37.5 ms      | 12           | 50.0 ms     | Bestanden                        | Bestanden                        |
| 10             | 10               | 41.7 ms      | 17           | 70.8 ms     | Bestanden                        | Bestanden                        |
| **Min**        | **8**            | **33.3 ms**  | **12**       | **50.0 ms** | –                                | –                                |
| **Max**        | **10**           | **41.7 ms**  | **17**       | **70.8 ms** | $\le 100\,\text{ms}$ eingehalten | $\le 200\,\text{ms}$ eingehalten |
| **Mittelwert** | **8.8**          | **36.7 ms**  | **14.5**     | **60.4 ms** | –                                | –                                |

**Ergebnis**: **Bestanden** (Sowohl TFT-Display als auch Companion unterschreiten die Grenzwerte deutlich)

### Test 5: Mechanische Montage & Haptik / Spielverhalten (`TC-NFA-MECH`)

- **Montagehinweise**:
    - Sensorik montiert mit Hilfe von etwas haushaltsüblichem Klebeband, damit die Montage einfacher fällt und die
      Stecker im Prototyp nicht auseinandergerissen werden.
    - Klebeband lässt sich problemlos rückstandslos entfernen.
    - Das Prototyp-Board wurde nicht am Böckli befestigt, sondern auf einen Tisch gelegt, da für den Prototyp noch keine
      integrale Halterung vorgesehen ist.
    - Anforderung NFA-H01 ist erfüllt.
- **Haptik & Spielverhalten**:
    - Prüfung durch erfahrenen Tambour (ich...) vor und nach Montage.
    - Das Schlagverhalten (Rebound, Schwingungsverhalten, Klang) hat sich nicht verändert.
    - Anforderung NFA-H02 ist erfüllt.

**Ergebnis**: **Bestanden**.

---

## 3. Abschlussstatement

Sämtliche im [Testkonzept](../testkonzept.md) definierten Testfälle (Test 1 bis 5) wurden vollständig durchgeführt und
ausnahmslos bestanden. Alle 22 funktionalen Anforderungen (`FA-H01`–`FA-H02`, `FA-S01`–`FA-S12`, `FA-K01`–`FA-K03`,
`FA-C01`–`FA-C05`) sowie alle 8 nicht-funktionalen Anforderungen (`NFA-H01`–`NFA-H02`, `NFA-S01`–`NFA-S05`, `NFA-C01`)
sind nachweislich erfüllt.

Das System erfüllt damit alle Austrittskriterien gemäss Kapitel 7.3 des Testkonzepts.
