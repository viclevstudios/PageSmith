# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Aus dem Bestand abgeleitet: Menschen, die auf Windows 11 regelmäßig Dokumente und PDFs umwandeln, zusammenfügen, teilen, neu anordnen, exportieren oder komprimieren.

## Product Purpose

PageSmith PDF führt lokale PDF-Arbeiten in einer kleinen Desktop-Anwendung aus. Erfolg bedeutet, dass Nutzer Dateien auswählen, die passende Ausgabe konfigurieren und das Ergebnis ohne unnötige Umwege im Zielordner erhalten.

## Positioning

Aus dem Bestand übernommen: Die primären Dateioperationen laufen lokal auf dem eigenen Computer; es gibt keine Cloud-Verarbeitung, kein Telemetrie- und kein Cloud-Speicher-Versprechen.

## Operating Context

Die Anwendung wird als Windows-Desktop-App genutzt. Der typische Ablauf ist: Werkzeug wählen, Dateien über den Explorer oder Drag & Drop hinzufügen, Optionen prüfen, Zielordner festlegen und den Auftrag ausführen.

## Capabilities and Constraints

Unterstützt werden Konvertierung zu PDF, PDF-Export nach TXT/DOCX/HTML/Markdown, Zusammenfügen, Teilen, Neuanordnung und Komprimierung. Die Oberfläche ist deutsch und englisch verfügbar. Microsoft Office, LibreOffice und Ghostscript sind optionale lokale Abhängigkeiten für bestimmte Funktionen. Die PDF-Verarbeitungslogik bleibt außerhalb des UI-Redesigns unverändert.

## Brand Commitments

Der Produktname lautet PageSmith PDF. Die Oberfläche muss die Aussage „Local & Private“ glaubwürdig als Produkteigenschaft behandeln und darf keine zusätzlichen Marketingversprechen erfinden.

## Evidence on Hand

README.md, src/main.js, src/preload.js und die bestehende Renderer-Oberfläche. Es liegen keine Testimonials, externen Markenassets oder weiteren Belege vor.

## Product Principles

- Dateien zuerst, Optionen nur im notwendigen Kontext.
- Lokale Verarbeitung bleibt verständlich und sichtbar.
- Der nächste sinnvolle Schritt ist jederzeit auffindbar.
- Bestehende Funktionen und Zustände bleiben erhalten.

## Accessibility & Inclusion

Aus dem Arbeitsauftrag abgeleitet: Tastaturbedienung, sichtbare Fokuszustände, WCAG-AA-Kontrast und eine kleinere Fenstergröße müssen unterstützt werden. Zustände dürfen nicht allein über Farbe vermittelt werden.
