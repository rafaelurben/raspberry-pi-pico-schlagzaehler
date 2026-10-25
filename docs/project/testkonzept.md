# Testkonzept – Schlagzähler

## 1. Scope

- **In Scope**:
    - Alle 22 funktionalen Anforderungen gemäss [
      `requirements-functional.csv`](./requirements/requirements-functional.csv).
    - Alle 8 nicht-funktionalen Anforderungen gemäss [
      `requirements-non-functional.csv`](./requirements/requirements-non-functional.csv).
- **Out of Scope (Nicht im Testumfang)**:
    - Optionale Anforderungen gemäss [
      `requirements-functional-optional.csv`](./requirements/requirements-functional-optional.csv) sind nicht Gegenstand
      der dieses Testkonzepts.

## 2. Testobjekte & Systemübersicht

Das Gesamtsystem besteht aus den nachfolgenden Teilsystemen:

### 2.1 Teilsysteme

1. **Hardware-Komponenten (`HW`)**:
    - Raspberry Pi Pico W Board, USB-Spannungsversorgung (5V).
    - Piezo-Sensoren
    - 4 Drucktaster (`UP`, `DOWN`, `LEFT`, `RIGHT`) an GPIOs.
    - ST7735 SPI TFT-Display (128x160) via SPI.
    - Mechanische Montagevorrichtung am Böckli.
2. **Firmware (`FW`)**:
    - **Core 0**: Schlagerkennung, Rauschkalibrierung, adaptiver Schwellwert mit
      Exponential-Decay, Lockout-Filterung, Tasten-Entprellung/Vibrationsunterdrückung, Spiel-Zustandsmaschine
    - **Core 1**: Display-Rendering, Kommunikationsprotokoll
    - **OSAL**: Hardware-Abstraktionsschicht für Portierbarkeit und Host-Testbarkeit.
3. **Companion Web App (`WEB`)**:
    - Angular v22 Single-Page Application (TypeScript, Tailwind CSS 4, rxjs).
    - Multi-Device Management
    - Web Serial Transport
    - Dashboard (Live-Scores/Timer), Signal Analyzer und Einstellungen mit Event-Log.

## 3. Teststufen & Testansatz

Das Testkonzept folgt dem V-Modell mit vier aufeinander aufbauenden Teststufen:

- Stufe 1: Modul- & Unit-Tests (C-Firmware Host-Tests, Angular Vitest)
- Stufe 2: Schnittstellen- & Protokolltests (Inter-Core IPC, Web Serial)
- Stufe 3: System- & Integrationstests HW (Latenz, Standalone, Multi)
- Stufe 4: Akzeptanz- & Feldtests (Praxiseinsatz Böckli, Tambour)

### 3.1 Teststufe 1: Modul- und Unit-Tests (Komponentenebene)

- **Ziel**: Isolierte Prüfung von Datenstrukturen, Algorithmen, Zustandsübergängen und Parsern ohne
  Hardware-Abhängigkeit.
- **Firmware (`schlagzaehler-pico`)**:
    - Dank der OSAL-Schicht (`src/OSAL/inc/`) werden Module auf dem Host-Betriebssystem via GCC/Clang kompiliert.
    - Mock-Implementierungen für Zeit (`Time_now_us`), Hardware-Queues (`OsalQueue`), GPIO-Interrupts und serielle
      Schnittstelle.
    - Abdeckung: `ConfigService`, `HitDetector` (dynamische Schwellwerte, Exponential-Decay, Lockout), `SignalCapture`
      (5:1 Max-Pooling, Ringspeicher), `GameController` & `GameState` (`Count`, `Timed`, `Race`), `ButtonController` (25
      ms Entprellung), `CompanionProtocol` & `CommandHandler`.
- **Companion (`schlagzaehler-web`)**:
    - Automatisierte Vitest-Suite für alle Services, Transports und Komponenten.
    - Mocking der W3C Web Serial API.
    - Abdeckung: `NewlineEventParser` (Chunk-Grenzen, CR/LF, Buffer-Splits), `companion-protocol` (ASCII-Parser und
      Command-Builder), `DeviceManagerService` (Signal-State, Multi-Device Isolation), Dashboard & Analyzer UI.

### 3.2 Teststufe 2: Schnittstellen- und Protokolltests

- **Tests Companion-Protokoll**:
    - Der Web-Companion wird nur dazu verwendet, Events vom Schlagzähler auszulesen und manuelle Events zu senden.

### 3.3 Teststufe 3: Systemtests (Gesamtsystem auf RP2040)

- **Standalone-Betrieb**: Vollständige Spielzyklen auf der Hardware ohne PC-Verbindung.
- **Host-Verbindung**: Funktionsfähigkeit bei Verbindung mit dem Companion.

### 3.4 Teststufe 4: Akzeptanz- und Feldtests (Praxiserprobung)

- **Montagetests**: Zerstörungsfreie, nicht-invasive Montage/Demontage am Böckli-Rahmen/Fell.
- **Schlagdynamik-Tests**: Systematisches Abspielen von Testsequenzen durch einen erfahrenen Tambour in definierten
  Dynamikstufen.
- **Störfestigkeit**: Klopfen auf den Tisch, Sprechen, Rütteln am Gestell zur Verifikation der Falsch-Positiv-Rate.
- **Latenzmessungen**: High-Speed-Videoanalyse (iPhone 16 Pro) zur Bestätigung von NFA-S05 und NFA-C01.

## 4. Testumgebung, Messmethoden & methodische Entscheidungen

### 4.1 Hardware- & Messumgebung

| Komponente            | Spezifikation                                                     | Einsatzbereich                        |
|-----------------------|-------------------------------------------------------------------|---------------------------------------|
| **Schlagzähler**      | Raspberry Pi Pico W mit ST7735 Display, 4 Buttons und Piezo-Modul | SUT (System Under Test)               |
| **Test-Böckli**       | Standard-Trommelböckli (mit Holzrahmen und Plastikfell)           | Mechanische Montage & Feldtests       |
| **Schlägel**          | Trommelschlägel (Holz)                                            | Schlagtests                           |
| **Host**              | Laptop mit Google Chrome (Web Serial Support)                     | Companion Web App & Datenerfassung    |
| **High-Speed-Kamera** | Apple iPhone 16 Pro (Slo-Mo Modus: 1080p bei 240 fps)             | Messtechnischer Nachweis für Latenzen |

### 4.2 Methodische Entscheidungen & Begründungen

#### A. Messung der Latenzen

- **Entscheidung**: Die Verifikation der Latenzanforderungen erfolgt optisch über High-Speed-Videoaufnahmen mit
  einem aktuellen Smartphone (z. B. iPhone 16 Pro).
- **Begründung & Genauigkeit**:
    - Ein Video-Frame bei 240 Bildern pro Sekunde entspricht einer zeitlichen Auflösung von:
      $$\Delta t_{\text{frame}} = \frac{1}{240\,\text{s}} \approx 4{,}167\,\text{ms}$$
    - Diese zeitliche Auflösung ist um mehr als den Faktor 24 feiner als das Display-Kriterium ($100\,\text{ms}$) und um
      den Faktor 48 feiner als das Companion-Kriterium ($200\,\text{ms}$). Sie liefert klaren Nachweis der
      Gesamtsystem-Latenz (inklusive physischem Fellausschlag, ADC-Sampling, Signalfilterung, Task-Scheduling und
      Display-/Browser-Rendering).

#### B. Beurteilung der Schlagdynamik durch einen erfahrenen Tambour

- **Entscheidung**: Die Schläge mit definierter Dynamik werden durch einen erfahrenen Tambour
  durchgeführt und nicht über einen künstlichen Prüfstand (wie z. B. Fallgewichte oder kalibrierte
  Kraftmesszellen).
- **Begründung & Dokumentation**: Es fehlt das nötige Equipment und eine maschinelle Ausführung der Schläge wäre
  nicht wirklich praxisnahe und kann den natürlichen Rückprall eines Schlages nur schlecht simulieren.

## 5. Traceability-Matrix: Anforderungen zu Testfällen

Zur Reduktion von Redundanzen und da für die Gesamtfreigabe ausnahmslos alle Anforderungen bestanden werden müssen,
werden die Anforderungen in zusammenhängenden End-to-End-Testfällen gebündelt geprüft (detaillierte Abläufe siehe
Kapitel 6):

- **`TC-FA-STANDALONE`**: Deckt alle 14 funktionalen Anforderungen des autarken Betriebs ohne Host ab (`FA-H01`,
  `FA-H02`, `FA-S01` bis `FA-S12`).
- **`TC-FA-HOST`**: Deckt alle 8 funktionalen Anforderungen des Host- und Companion-Betriebs ab (`FA-K01` bis `FA-K03`,
  `FA-C01` bis `FA-C05`).
- **`TC-NFA-REC`**: Deckt alle 4 Anforderungen an Sensor-Erkennungsraten, Dynamik und Störfestigkeit ab (`NFA-S01` bis
  `NFA-S04`).
- **`TC-NFA-LAT`**: Deckt beide Latenzanforderungen von Display und Companion ab (`NFA-S05`, `NFA-C01`).
- **`TC-NFA-MECH`**: Deckt die Montage und das Spielverhalten am Böckli ab (`NFA-H01`, `NFA-H02`).

### 5.1 Funktionale Anforderungen (FA)

| Anforderungs-ID | Anforderungstext                                               | Erwartetes Ergebnis (Soll)                                                                                                                       |
|-----------------|----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| **FA-H01**      | Der Schlagzähler wird über USB mit Strom versorgt (5V).        | Gerät bootet stabil an 5V USB-Netzteil und USB-Hub.                                                                                              |
| **FA-H02**      | Verfügt über Display und 4 Buttons zur Steuerung.              | Display zeigt UI an; alle 4 Taster (`UP`, `DOWN`, `LEFT`, `RIGHT`) lösen die zugewiesenen Aktionen aus.                                          |
| **FA-S01**      | Erkennt Schläge auf das Schlagfell des Böckli.                 | Schläge mit dem Trommelstock lösen ein `HIT`-Event aus und erhöhen den Zähler, sofern das System in einem entsprechenden Zustand ist.            |
| **FA-S02**      | Empfindlichkeit wird beim Start automatisch kalibriert.        | Beim Boot wechselt Sensor in `CALIBRATING`, ermittelt Baseline & Rauschen und schaltet dann in `ARMED` bzw. Game-State `READY`.                  |
| **FA-S03**      | Spielmodus «Zählen» ohne Ziel oder Ende.                       | Modus `COUNT`: Jeder Schlag inkrementiert Score fortlaufend; Zeit läuft aufwärts; kein automatischer Abbruch.                                    |
| **FA-S04**      | Spielmodus «Zeit» (max. Schläge in Zeitspanne).                | Modus `TIMED`: Countdown zählt rückwärts; nach Ablauf der Zeit wechselt State in `FINISHED`; keine weiteren Hits gezählt.                        |
| **FA-S05**      | Modus «Zeit» Zeitspanne in Schritten anpassbar.                | Im `READY`-Zustand verändern `UP`/`DOWN` die Zeitspanne in 5-Sekunden-Schritten.                                                                 |
| **FA-S06**      | Spielmodus «Rennen» (bestimmte Schläge in min. Zeit).          | Modus `RACE`: Bei Erreichen des Zielwerts (z. B. 50 Schläge) stoppt die Zeit sofort und wechselt in `FINISHED`.                                  |
| **FA-S07**      | Modus «Rennen» Schlaganzahl in Schritten anpassbar.            | Im `READY`-Zustand verändern `UP`/`DOWN` das Ziel in 5-Schlag-Schritten.                                                                         |
| **FA-S08**      | Modi «Zählen», «Zeit», «Rennen» ohne Host spielbar.            | Sämtliche Spielmodi können autonom über Taster und TFT gespielt werden, ohne dass ein USB-Host angeschlossen ist.                                |
| **FA-S09**      | Navigation über Spielmodi, Menüs, Konfiguration via 4 Buttons. | Menüaufruf (`LEFT`), Moduswechsel (`UP`/`DOWN`), Bestätigen (`RIGHT`), Parameteranpassung funktionieren gemäss Spezifikation.                    |
| **FA-S10**      | Display zeigt je nach Zustand Punktestand, Zeit oder Menü an.  | Display zeigt spezifische Ansichten für `BOOT`, `MENU`, `READY`, `RUNNING`, `FINISHED` und `CAPTURING`.                                          |
| **FA-S11**      | Nach Spielende wird Ergebnis angezeigt bis Menü/Neustart.      | Im Zustand `FINISHED` bleibt der finale Score & Zeit sichtbar; `LEFT` führt ins Menü, `RIGHT` setzt auf `READY` zurück.                          |
| **FA-S12**      | Laufendes Spiel über Bedienelemente unterbrechbar.             | Drücken von `RIGHT` während `RUNNING` bricht das Spiel sofort ab und setzt den Zustand zurück auf `READY`.                                       |
| **FA-K01**      | Bidirektionale Kommunikation mit Computer.                     | Pico sendet Telemetrie an Host; Host sendet Befehle (`START`, `RESET`, `MODE:...`, `PARAM:...`), die der Pico ausführt.                          |
| **FA-K02**      | Ereignisbasierte Zustandsübertragung an Computer.              | Bei Zustandsänderung, Hit, Score- oder Timer-Tick wird sofort ein entsprechendes Event über USB gesendet.                                        |
| **FA-K03**      | Kommunikation via USB.                                         | Kommunikation erfolgt stabil über USB CDC Serial mit 115200 Baud, 8N1.                                                                           |
| **FA-C01**      | Im Companion können mehrere Schlagzähler verbunden werden.     | 2 Picos werden über Web Serial angeschlossen; beide erscheinen als unabhängige Geräte im Dashboard.                                              |
| **FA-C02**      | Zustand aller verbundenen Schlagzähler im Companion sichtbar.  | Dashboard zeigt für jeden Pico synchron Modus, Zustand (`READY`/`RUNNING`), Live-Score und interpolierten Timer.                                 |
| **FA-C03**      | Über Companion kann Spielmodus gewechselt werden.              | Klick auf Modus-Buttons (`COUNT`, `TIMED`, `RACE`) im Web sendet `MODE:...`; Pico quittiert und wechselt den Modus.                              |
| **FA-C04**      | Companion erkennt Unterbruch und zeigt dies an.                | Nach Trennen des USB-Kabels schaltet der Gerätestatus auf `disconnected` / `error`; Warnhinweis in UI sichtbar.                                  |
| **FA-C05**      | Unterbruch zum Companion beendet lokales Spiel nicht.          | USB-Verbindung während laufendem Spiel trennen ohne die Stromzufuhr zu unterbrechen (externes USB-Hub); Spiel auf Pico läuft unverändert weiter. |

### 5.2 Nicht-funktionale Anforderungen (NFA)

| Anforderungs-ID | Anforderungstext                                               | Messmethode / Vorgehen                                         | Akzeptanzkriterium (Soll)                                                                                                      |
|-----------------|----------------------------------------------------------------|----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| **NFA-H01**     | Nicht-invasive Montage und Demontage am Böckli.                | Physische Inspektion & Test                                    | Montage erfolgt ohne Bohren, Kleben oder Beschädigen des Böckli; rückstandsfrei demontierbar in < 2 Min.                       |
| **NFA-H02**     | Spielverhalten des Böckli nicht spürbar verändert.             | Blindtest mit erfahrenem Tambour                               | Tambour testet Böckli mit und ohne montierten Sensor; Rebound, Klang und Schwingungsverhalten werden als unverändert bewertet. |
| **NFA-S01**     | Falsch-positive Erkennungen durch Nebenereignisse $\le 5\%$.   | 100 Störvibrationen (Klopfen am Tisch/Gestell, Nebengeräusche) | Bei 100 Störereignissen werden maximal 5 Treffer fälschlicherweise registriert ($\le 5\%$).                                    |
| **NFA-S02**     | Schläge ab *mezzo-forte* in mindestens $95\%$ erkannt.         | 100 Schläge *mezzo-forte* durch Tambour über Fell verteilt     | Mindestens 95 von 100 Schlägen werden korrekt gezählt ($\ge 95\%$).                                                            |
| **NFA-S03**     | Schläge auf Fellmitte ab *piano* zu mindestens $80\%$ erkannt. | 100 Schläge *piano* durch Tambour zentriert auf Fellmitte      | Mindestens 80 von 100 Schlägen werden korrekt registriert ($\ge 80\%$).                                                        |
| **NFA-S04**     | Schläge werden in mind. $95\%$ höchstens einmal gezählt.       | 100 Schläge *forte* durch Tambour                              | Maximal 5 Schläge lösen eine Doppelzählung durch Nachschwingen (Ringdown) aus ($\ge 95\%$ Einfachzählung).                     |
| **NFA-S05**     | Latenz Schlag bis Displayanzeige maximal $100\,\text{ms}$.     | iPhone 16 Pro Slo-Mo Video (240 fps, 1 Frame = 4.167 ms)       | Zeit zwischen Stockaufprall und Display-Inkrement beträgt $\Delta t \le 100\,\text{ms}$.                                       |
| **NFA-C01**     | Latenz Schlag bis Companionanzeige maximal $200\,\text{ms}$.   | iPhone 16 Pro Slo-Mo Video (240 fps, Fell + Monitor)           | Zeit zwischen Stockaufprall und UI-Reaktion im Browser beträgt $\Delta t \le 200\,\text{ms}$.                                  |

## 6. Detaillierte Testfallspezifikationen

### 6.1 Testfall `TC-FA-STANDALONE`: Autonomer Funktions- und Spielablauf (ohne Host)

- **Abgedeckte Anforderungen**: `FA-H01`, `FA-H02`, `FA-S01`, `FA-S02`, `FA-S03`, `FA-S04`, `FA-S05`, `FA-S06`,
  `FA-S07`, `FA-S08`, `FA-S09`, `FA-S10`, `FA-S11`, `FA-S12`
- **Ziel**: Vollständiger Nachweis aller autarken Hardware-, Sensor-, Navigations- und Spielmodi-Funktionen auf dem
  Schlagzähler ohne jegliche Host-Verbindung.
- **Voraussetzung**: Schlagzähler ist am Böckli montiert. USB-Kabel ist ausschliesslich mit einer 5V-Stromquelle
  (Netzteil oder Powerbank) verbunden; kein Computer angeschlossen.
- **Durchführung**:
    1. **Spannungsversorgung & automatische Kalibrierung (`FA-H01`, `FA-H02`, `FA-S02`, `FA-S10`)**:
        - 5V USB-Versorgung anstecken.
        - Das ST7735-Display initialisiert und zeigt den Boot-Screen an.
        - Das System führt selbstständig die Rauschkalibrierung durch (`CALIBRATING`) und wechselt nach Abschluss in den
          Zustand `READY` (Default-Modus: `COUNT`).
    2. **Menüaufruf & 4-Tasten-Navigation (`FA-H02`, `FA-S09`, `FA-S10`)**:
        - Taste `LEFT` drücken: Das Hauptmenü öffnet sich auf dem Display.
        - Mit den Tasten `UP` und `DOWN` durch die Spielmodi (`COUNT`, `TIMED`, `RACE`) navigieren.
        - Mit Taste `RIGHT` einen Modus bestätigen und zurück zur Spielansicht wechseln.
    3. **Spielmodus «Zählen» & Spielunterbrechung (`FA-S01`, `FA-S03`, `FA-S08`, `FA-S10`, `FA-S12`)**:
        - Via Menu (`LEFT`) in den Modus `COUNT` wechseln.
        - Display zeigt Zustand `READY`, Punktestand `0` und Timer `00:00`.
        - Ersten Schlag auf das Fell ausführen: Das System wechselt in `RUNNING`, der Timer läuft vorwärts.
        - 5 Schläge spielen: Jeder Schlag inkrementiert den Zähler exakt um 1.
        - Taste `RIGHT` während des laufenden Spiels drücken: Das Spiel wird unverzüglich abgebrochen, der Zustand
          wechselt zurück zu `READY`, Score und Zeit werden zurückgesetzt.
    4. **Spielmodus «Zeit» mit Parameteranpassung & Resultatanzeige (`FA-S04`, `FA-S05`, `FA-S08`, `FA-S10`,
       `FA-S11`)**:
        - Via Menü (`LEFT`) in den Modus `TIMED` wechseln.
        - Im Zustand `READY` mittels `UP`/`DOWN` das Zeitlimit in 5-Sekunden-Schritten anpassen (z. B. auf 15 Sekunden
          einstellen).
        - Spiel durch ersten Schlag starten: Zustand springt auf `RUNNING`, Countdown zählt rückwärts, Schläge
          inkrementieren den Score.
        - Ein paar Schläge spielen.
        - Countdown bis 0 ablaufen lassen: Bei Ablauf wechselt der Zustand automatisch in `FINISHED`.
        - Zusätzliche Schläge auf das Fell ausführen: Es werden keine weiteren Schläge registriert.
        - Displayanzeige prüfen: Das finale Ergebnis (Score und Zeit) bleibt unverändert dauerhaft sichtbar.
        - Taste `RIGHT` drücken: Setzt das Spiel zurück in den Zustand `READY`; Taste `LEFT` führt ins Menü.
    5. **Spielmodus «Rennen» mit Parameteranpassung & Zielerreichung (`FA-S06`, `FA-S07`, `FA-S08`, `FA-S10`,
       `FA-S11`)**:
        - Via Menu (`LEFT`) in den Modus `RACE` wechseln.
        - Im Zustand `READY` mittels `UP`/`DOWN` das Schlagziel in 5-Schlag-Schritten anpassen (z. B. auf 20 Schläge
          einstellen).
        - Erster Schlag startet den Timer (vorwärtszählend).
        - Kontinuierlich schlagen, bis exakt 20 Treffer registriert sind: Im selben Moment stoppt die Zeitnahme und das
          System wechselt sofort in `FINISHED`.
        - Das Endergebnis bleibt dauerhaft stehen, auch wenn weitere Schläge erfolgen.
- **Akzeptanzkriterium**: Sämtliche Teilprüfungen werden ohne Neustart, Hänger oder Fehlzählung rein über die lokalen
  Bedienelemente und das Display erfolgreich absolviert.

### 6.2 Testfall `TC-FA-HOST`: Verbundener Betrieb mit Companion Web App & Multi-Device

- **Abgedeckte Anforderungen**: `FA-K01`, `FA-K02`, `FA-K03`, `FA-C01`, `FA-C02`, `FA-C03`, `FA-C04`, `FA-C05`
- **Ziel**: Vollständiger Nachweis der seriellen USB-Kommunikation, des Multi-Device-Betriebs im Web-Dashboard, der
  Fernsteuerung und der Resilienz bei Verbindungsunterbruch.
- **Voraussetzung**:
    - Laptop mit Google Chrome und geöffnetem Companion
    - Erster Schlagzähler (Pico 1) direkt via USB mit dem Laptop verbunden
    - Zweiter Schlagzähler (Pico 2) via extern mit Strom versorgtem USB-Hub am Laptop angeschlossen.
- **Durchführung**:
    1. **Multi-Device USB-Verbindung (`FA-K03`, `FA-C01`)**:
        - Im Browser über den Serial-Dialog nacheinander die Ports beider Picos freigebe.
        - Verifizieren, dass beide Geräte gleichzeitig im Web-Dashboard als unabhängige Karten mit Status `connected`
          erscheinen.
    2. **Bidirektionale Fernsteuerung & Synchronisation (`FA-K01`, `FA-K02`, `FA-C02`, `FA-C03`)**:
        - Dashboard zeigt für beide Geräte synchron Modus, Zustand (`READY`), Score und Timer an.
        - Im Dashboard für Pico 1 den Modus `TIMED` wählen und das Zeitlimit auf 15 Sekunden setzen (`MODE:TIMED`,
          `PARAM:15`).
        - Display von Pico 1 synchronisiert sich unverzüglich und zeigt `TIMED` sowie 15s an.
        - Über die Buttons von Pico 2 den Spielmodus auf `RACE` ändern und das Ziel auf 10 Schläge erhöhen.
        - Im Dashboard wird bei Pico 2 der Modus `RACE` und die 10s angezeigt.
        - Mit Schlag auf Pico 2 das Spiel starten.
        - Im Dashboard zählt der Timer synchron mit dem Display aufwärts.
    3. **Ereignisbasierte Telemetrie im Spielbetrieb (`FA-K01`, `FA-K02`, `FA-C02`)**:
        - Spiel auf Pico 1 per Schlag starten: Web empfängt sofort `STATE:RUNNING`.
        - 10 Schläge spielen: Jeder Schlag wird ereignisbasiert übertragen und im Web-Dashboard
          ohne spürbare Verzögerung visualisiert.
        - Nach Ablauf von 15s meldet Pico 1 `STATE:FINISHED` und `RESULT`; das finale Ergebnis wird im Dashboard
          synchron dargestellt.
    4. **Resilienz gegen Verbindungsunterbruch (`FA-C04`, `FA-C05`)**:
        - Neues Spiel im Modus `TIMED` (30s) auf Pico 1 starten (`RUNNING`).
        - Nach 10 Sekunden das Daten-USB-Kabel zwischen Laptop und Pico 1 abziehen (Spannungsversorgung bleibt via
          externem Hub bestehen).
        - Web Companion: Das Dashboard erkennt den Verbindungsabriss sofort und schaltet den Status von Pico 1 auf
          getrennt/Fehler um.
        - Pico 1: Das laufende Spiel wird auf dem RP2040 ohne Unterbrechung autonom weitergeführt. Score zählt weiter,
          Countdown läuft auf 0 ab, Display schaltet sauber in `FINISHED`.
        - USB-Kabel wieder einstecken und im Browser neu verbinden: Status synchronisiert sich wieder stabil.
        - Pico 2 wurde durch das Trennen von Pico 1 nicht beeinflusst und der Timer läuft immer noch weiter.
- **Akzeptanzkriterium**: Sämtliche 8 Host- und Kommunikationsanforderungen werden fehlerfrei erfüllt.

### 6.3 Testfall `TC-NFA-REC`: Sensor-Erkennungsraten, Dynamik & Störfestigkeit

- **Abgedeckte Anforderungen**: `NFA-S01`, `NFA-S02`, `NFA-S03`, `NFA-S04`
- **Ziel**: Quantitativer Nachweis der Erkennungsgenauigkeit in allen geforderten Dynamikstufen sowie der Störfestigkeit
  gegen Nebengeräusche.
- **Messmethode & Aufbau**:
    - Schlagzähler ist betriebsbereit am Böckli montiert und im Modus `COUNT`.
    - Eine Testserie umfasst jeweils exakt $N_{\text{real}} = 100$ Schläge bzw. Störereignisse.
    - Der Tambour zählt manuell mit bzw. protokolliert die echten Ereignisse als Ground Truth. Die 
      Firmware zählt automatisch am Display mit.
- **Durchführung & Akzeptanzkriterien**:
    1. **Störfestigkeit / Falsch-Positive (`NFA-S01`)**:
        - 100 Störereignisse ausführen: Klopfen mit dem Knöchel/Schlägel auf die Tischplatte neben dem Böckli, lautes
          Klatschen/Rufen in unmittelbarer Nähe, Rütteln am Böckliständer.
        - Schläge, welche das Böckliteller aber nicht das Schlagfell treffen, werden nicht getestet, da diese als
          valider Schlag interpretiert werden können.
        - **Kriterium**: Maximal 5 fälschlicherweise registrierte Treffer ($\le 5\%$).
    2. **Mezzo-forte Erkennung (`NFA-S02`)**:
        - Der erfahrene Tambour spielt 100 mittelstarke Einzelschläge (_mezzo-forte_), gleichmässig verteilt über das
          gesamte Fell (Mitte und Randbereich).
        - **Kriterium**: Mindestens 95 von 100 Schlägen werden gezählt ($\ge 95\%$).
    3. **Piano Fellmitte (`NFA-S03`)**:
        - Der Tambour spielt 100 feine Einzelschläge (_piano_) gezielt in den mittleren Bereich des Fells.
        - **Kriterium**: Mindestens 80 von 100 Schlägen werden gezählt ($\ge 80\%$).
    4. **Vermeidung von Doppelzählungen / Ringdown (`NFA-S04`)**:
        - Der Tambour führt 100 kräftige Einzelschläge (_forte_) mit natürlichem Rückprall aus.
        - **Kriterium**: Nachschwingungen des Fells werden durch Lockout und adaptiven Decay zuverlässig ignoriert. Bei
          mindestens 95 Schlägen wird exakt 1 Zähler registriert ($N_{\text{detected}} - N_{\text{real}} \le 5$, d. h.
          maximal 105 Zähler insgesamt, $\ge 95\%$ Einfachzählung).

### 6.4 Testfall `TC-NFA-LAT`: Kombinierte Latenzmessung Display & Companion (iPhone 16 Pro Slo-Mo)

- **Abgedeckte Anforderungen**: `NFA-S05`, `NFA-C01`
- **Ziel**: Messtechnischer Nachweis der Reaktionszeiten vom mechanischen Schlag bis zur Anzeige auf dem ST7735-Display
  ($\le 100\,\text{ms}$) und im Web-Companion ($\le 200\,\text{ms}$) in einem einzigen, kombinierten Messaufbau.
- **Messmittel**: Apple iPhone 16 Pro im Modus **Slo-Mo (1080p, 240 fps)** auf Stativ oder stabiler Unterlage, Laptop 
  mit geöffnetem Web-Companion.
- **Voraussetzung**: Schlagzähler am Böckli montiert, via USB mit dem Laptop verbunden und im Dashboard als `connected`
  registriert. Modus `COUNT` aktiv.
- **Durchführung**:
    1. Smartphone so positionieren, dass Schlagfell/Stockspitze, ST7735-Display und Laptop-Bildschirm gleichzeitig 
       scharf im selben Bildausschnitt liegen.
    2. Videoaufnahme mit 240 fps starten.
    3. 10 deutliche Einzelschläge mit jeweils 1–2 Sekunden Pause ausführen.
    4. Video in eine Schnittsoftware mit Frame-Zählung (z. B. QuickTime Player, DaVinci Resolve) importieren.
    5. Für jeden der 10 Schläge folgende Schlüssel-Frames ablesen:
        - $F_{\text{impact}, i}$: Frame, in dem die Stockspitze das Fell erstmalig berührt (Fellauslenkung beginnt).
        - $F_{\text{display}, i}$: Frame, in dem das ST7735-Display das Score-Inkrement (Pixeländerung) anzeigt.
        - $F_{\text{web}, i}$: Frame, in dem das Web-Dashboard die Zähleränderung im Browser rendert.
    6. Latenzen berechnen (1 Frame bei 240 fps = $4{,}167\,\text{ms}$):
       $$\Delta t_{\text{display}, i} = (F_{\text{display}, i} - F_{\text{impact}, i}) \times 4{,}167\,\text{ms}$$
       $$\Delta t_{\text{companion}, i} = (F_{\text{web}, i} - F_{\text{impact}, i}) \times 4{,}167\,\text{ms}$$
- **Akzeptanzkriterium**:
    - **Display (`NFA-S05`)**: Mittelwert und Maximum aller 10 Messungen
      erfüllen $\Delta t_{\text{display}} \le 100\,\text{ms}$.
    - **Companion (`NFA-C01`)**: Mittelwert und Maximum aller 10 Messungen
      erfüllen $\Delta t_{\text{companion}} \le 200\,\text{ms}$.

### 6.5 Testfall `TC-NFA-MECH`: Mechanische Montage & Haptik / Spielverhalten

- **Abgedeckte Anforderungen**: `NFA-H01`, `NFA-H02`
- **Ziel**: Nachweis der nicht-invasiven, beschädigungsfreien Montage sowie des Erhalts des originalen Spielverhaltens
  am Böckli.
- **Durchführung**:
    1. **Montage & Demontage (`NFA-H01`)**:
        - Sensorhalterung und Elektronik am Böckli ohne Bohren, Schrauben ins Holz oder Kleben anbringen und wieder
          abnehmen.
        - Böckli auf Rückstände oder Beschädigungen inspizieren.
    2. **Spielverhalten & Akustik (`NFA-H02`)**:
        - Ein erfahrener Tambour spielt eine Komposition vor und nach der Montage auf dem Böckli.
        - Haptischer Rebound, Eigenschwingung und Klang werden subjektiv beurteilt.
- **Akzeptanzkriterium**:
    - Montage und Demontage erfolgen rückstandsfrei in jeweils $< 2\,\text{Minuten}$ (`NFA-H01`).
    - Der Tambour bestätigt, dass Spielgefühl, Schwingungsverhalten und Rebound durch die Montage nicht spürbar
      verändert werden (`NFA-H02`).

## 7. Testkriterien

### 7.1 Eintrittskriterien (Entry Criteria)

- Quellcode kompiliert fehlerfrei (`-Wall -Wextra` für C23, TypeScript strict mode).
- 100% der Modul- und Unit-Tests sind erfolgreich (`PASS`).
- Testaufbau mit Böckli und iPhone 16 Pro ist einsatzbereit.

### 7.2 Abbruchkriterien (Suspension Criteria)

- Auslösen von Watchdog-Resets auf dem Pico während regulärer Spielabläufe.
- Zu hohe Falsch-Positiv-Rate (erfordert Nachjustierung des Schwellwert-Algorithmus).
- Absturz des Webbrowsers oder Blockieren des USB-Serial-Ports.

### 7.3 Austritts- und Abnahmekriterien (Exit Criteria)

Das System gilt als erfolgreich qualifiziert, wenn:

1. Alle 5 Testfälle erfolgreich durchgeführt werden.
2. Keine offenen Blocker- oder Critical-Bugs mehr existieren.
