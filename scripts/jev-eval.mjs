// Feasibility benchmark: can TypeSafe's Jev (a non-generative decision model) file
// Paperless-style documents from closed vocabularies? Synthetic documents only.
// Usage: npm run build:backend && TYPESAFE_API_KEY=... node scripts/jev-eval.mjs [--json]
if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is not set');
const PRICE_PER_MTOK = 0.042;

const TAGS = ['Rechnung', 'Versicherung', 'Steuern', 'Lohn', 'Bank', 'Miete', 'Gesundheit', 'Auto', 'Telekom', 'Strom',
  'Schule', 'Garantie', 'Vertrag', 'Mahnung', 'Kündigung', 'Spende', 'Reise', 'Behörde', 'Abo', 'Haushalt',
  'Zahlung offen', 'Bezahlt', 'Wichtig', 'Rente', 'Kinder'];
const CORRESPONDENTS = ['Swisscom', 'Sunrise', 'CKW', 'EWZ', 'CSS Versicherung', 'Helsana', 'Die Mobiliar', 'AXA',
  'Zürcher Kantonalbank', 'PostFinance', 'Steueramt Kanton Luzern', 'Strassenverkehrsamt', 'Migros', 'Digitec Galaxus',
  'SBB', 'Livit AG', 'Ausgleichskasse Luzern', 'Kantonsspital Luzern', 'IKEA', 'Amazon', 'British Airways', 'Rotes Kreuz'];
const TYPES = ['Rechnung', 'Police', 'Vertrag', 'Lohnabrechnung', 'Kontoauszug', 'Steuerdokument', 'Mahnung', 'Brief',
  'Quittung', 'Bescheinigung', 'Kündigung', 'Offerte'];
const LANGS = { de: 'German', en: 'English', fr: 'French', it: 'Italian' };

const DOCS = [
  { lang: 'de', corr: 'Swisscom', type: 'Rechnung', date: '2026-08-04', tags: ['Rechnung', 'Telekom', 'Abo', 'Zahlung offen'], title: 'Rechnung August 2026 Mobile und Internet',
    text: `Swisscom (Schweiz) AG\nContact Center, 3050 Bern\nKundennummer 4 118 220 93\nRechnung August 2026 Mobile und Internet\nRechnungsdatum 04.08.2026   Zahlbar bis 03.09.2026\nblue Mobile M  01.08.-31.08.2026  CHF 59.90\nInternet L  CHF 69.90\nTotal inkl. 8.1% MWST CHF 129.80\nBitte begleichen Sie den Betrag mit beiliegendem QR-Einzahlungsschein. Bestellung vom 12.03.2024.` },
  { lang: 'de', corr: 'CSS Versicherung', type: 'Police', date: '2025-10-14', tags: ['Versicherung', 'Gesundheit', 'Vertrag'], title: 'Versicherungspolice 2026 Grundversicherung KVG',
    text: `CSS Kranken-Versicherung AG\nTribschenstrasse 21, 6005 Luzern\nLuzern, 14. Oktober 2025\nVersicherungspolice 2026 Grundversicherung KVG\nGültig ab 01.01.2026\nVersicherte Person: Muster Anna, geb. 02.05.1991\nObligatorische Krankenpflegeversicherung, Franchise CHF 2500, Hausarztmodell\nMonatsprämie CHF 312.45\nKündigungsfrist: bis 30.11.2026 auf Ende Jahr.` },
  { lang: 'de', corr: 'Steueramt Kanton Luzern', type: 'Steuerdokument', date: '2026-05-22', tags: ['Steuern', 'Behörde', 'Zahlung offen', 'Wichtig'], title: 'Definitive Veranlagung Staats- und Gemeindesteuern 2025',
    text: `Kanton Luzern  Dienststelle Steuern\nBuobenmatt 1, 6002 Luzern\nRegister-Nr. 1024.553.12\nDefinitive Veranlagung Staats- und Gemeindesteuern 2025\nDatum 22.05.2026\nSteuerbares Einkommen CHF 61'400  Steuerbares Vermögen CHF 38'000\nSteuerbetrag CHF 6'812.30  bereits bezahlt CHF 6'000.00\nRestbetrag CHF 812.30 zahlbar bis 30.06.2026\nRechtsmittel: Einsprache innert 30 Tagen.` },
  { lang: 'de', corr: 'Livit AG', type: 'Mahnung', date: '2026-07-16', tags: ['Miete', 'Mahnung', 'Zahlung offen', 'Wichtig'], title: '1. Mahnung Mietzins Juli 2026',
    text: `Livit AG Real Estate Management\nAltstetterstrasse 124, 8048 Zürich\nZürich, 16.07.2026\n1. Mahnung Mietzins Juli 2026\nMietobjekt: 3.5-Zimmer-Wohnung, Bahnhofstrasse 9, 6003 Luzern, Mietvertrag vom 01.04.2022\nSehr geehrte Frau Muster\nUnsere Buchhaltung zeigt, dass der Mietzins von CHF 1'890.00 fällig am 01.07.2026 noch nicht eingegangen ist.\nWir bitten Sie, den Betrag innert 10 Tagen zu überweisen. Mahngebühr CHF 20.00.` },
  { lang: 'de', corr: 'Zürcher Kantonalbank', type: 'Kontoauszug', date: '2026-06-30', tags: ['Bank'], title: 'Kontoauszug Privatkonto 01.06.2026 - 30.06.2026',
    text: `Zürcher Kantonalbank\nPostfach, 8010 Zürich\nKontoauszug Privatkonto 01.06.2026 - 30.06.2026\nIBAN CH93 0070 0110 0012 3456 7   Erstellt am 30.06.2026\nSaldovortrag 4'210.55\n02.06. Lohn CKW AG  +5'120.00\n03.06. Dauerauftrag Miete -1'890.00\n11.06. TWINT Migros -64.20\n27.06. Swisscom LSV -129.80\nSchlusssaldo 7'246.55` },
  { lang: 'de', corr: 'CKW', type: 'Lohnabrechnung', date: '2026-08-25', tags: ['Lohn'], title: 'Lohnabrechnung August 2026',
    text: `CKW AG\nTäschmattstrasse 4, 6015 Luzern\nPersonal-Nr. 20417\nLohnabrechnung August 2026\nAuszahlung 25.08.2026\nMonatslohn CHF 5'600.00\nAHV/IV/EO 5.3% -296.80  ALV 1.1% -61.60  BVG -248.00  NBU -39.20\nNettolohn CHF 4'954.40\nÜberweisung auf CH93 0070 0110 0012 3456 7` },
  { lang: 'de', corr: 'Digitec Galaxus', type: 'Rechnung', date: '2026-02-09', tags: ['Rechnung', 'Garantie', 'Bezahlt', 'Haushalt'], title: 'Rechnung 88120447 Geschirrspüler Bosch',
    text: `Digitec Galaxus AG\nPfingstweidstrasse 60b, 8005 Zürich\nRechnung 88120447 Geschirrspüler Bosch\nBestelldatum 07.02.2026  Rechnungsdatum 09.02.2026\n1x Bosch SMV4HCX48E Geschirrspüler vollintegriert CHF 749.00\nLieferung und Montage CHF 99.00\nTotal CHF 848.00 - bezahlt mit Kreditkarte\nGarantie: 2 Jahre Herstellergarantie bis 09.02.2028. Bewahren Sie diese Rechnung als Garantiebeleg auf.` },
  { lang: 'de', corr: 'Strassenverkehrsamt', type: 'Rechnung', date: '2026-01-12', tags: ['Auto', 'Behörde', 'Rechnung', 'Zahlung offen'], title: 'Verkehrssteuer 2026 LU 245 118',
    text: `Strassenverkehrsamt des Kantons Luzern\nArsenalstrasse 45, 6010 Kriens\nRechnung Nr. 2026-0099812   Datum: 12.01.2026\nVerkehrssteuer 2026 LU 245 118\nFahrzeug: VW Golf 1.5 TSI, 1. Inverkehrsetzung 14.06.2019\nSteuerperiode 01.01.2026 - 31.12.2026   CHF 386.00\nZahlbar innert 30 Tagen.` },
  { lang: 'de', corr: 'Sunrise', type: 'Kündigung', date: '2026-03-03', tags: ['Telekom', 'Kündigung', 'Abo'], title: 'Bestätigung Ihrer Kündigung Sunrise Up Mobile',
    text: `Sunrise GmbH\nThurgauerstrasse 101B, 8152 Glattpark\n3. März 2026\nBestätigung Ihrer Kündigung Sunrise Up Mobile\nGuten Tag Frau Muster\nWir bestätigen den Eingang Ihrer Kündigung vom 27.02.2026. Ihr Abo Sunrise Up Mobile M endet am 30.04.2026.\nBis zu diesem Datum stellen wir Ihnen die Grundgebühr wie gewohnt in Rechnung. Schade, dass Sie uns verlassen.` },
  { lang: 'de', corr: 'Kantonsspital Luzern', type: 'Rechnung', date: '2026-04-18', tags: ['Gesundheit', 'Rechnung', 'Zahlung offen'], title: 'Rechnung ambulante Behandlung vom 02.04.2026',
    text: `Luzerner Kantonsspital\nSpitalstrasse, 6000 Luzern 16\nPatient: Muster Anna  Fall-Nr. 7781230\nRechnung ambulante Behandlung vom 02.04.2026\nRechnungsdatum 18.04.2026\nTARMED 00.0010 Konsultation erste 5 Min.  CHF 18.40\nTARMED 39.0020 Röntgen Handgelenk  CHF 96.10\nTotal CHF 114.50 zahlbar innert 30 Tagen. Rückforderungsbeleg für Ihre Krankenkasse liegt bei.` },
  { lang: 'en', corr: 'British Airways', type: 'Quittung', date: '2026-05-06', tags: ['Reise', 'Bezahlt'], title: 'Your e-ticket receipt ZRH - LHR',
    text: `BRITISH AIRWAYS\nBooking reference: X7KQ2M\nYour e-ticket receipt ZRH - LHR\nIssued: 06 May 2026\nPassenger: MS ANNA MUSTER\nBA0713 Zurich (ZRH) to London Heathrow (LHR) 19 Jun 2026 07:20\nBA0716 London Heathrow (LHR) to Zurich (ZRH) 23 Jun 2026 17:55\nFare CHF 212.00  Taxes, fees and charges CHF 98.40  Total paid CHF 310.40 (Visa ending 4417)` },
  { lang: 'en', corr: 'Amazon', type: 'Rechnung', date: '2026-07-29', tags: ['Rechnung', 'Bezahlt', 'Kinder'], title: 'Invoice LEGO Technic 42151 and school backpack',
    text: `Amazon EU S.a r.l.\n38 avenue John F. Kennedy, L-1855 Luxembourg\nInvoice LEGO Technic 42151 and school backpack\nInvoice date 29 July 2026   Order date 27 July 2026   Order # 302-1188420-5529147\n1 x LEGO Technic Bugatti Bolide 42151  EUR 39.99\n1 x Ergobag kids school backpack set  EUR 189.00\nTotal EUR 228.99  Paid - Mastercard` },
  { lang: 'de', corr: 'Ausgleichskasse Luzern', type: 'Bescheinigung', date: '2026-02-20', tags: ['Rente', 'Behörde'], title: 'Auszug aus dem individuellen Konto (IK) AHV',
    text: `Ausgleichskasse Luzern\nWürzenbachstrasse 8, 6000 Luzern 15\nLuzern, 20.02.2026\nAuszug aus dem individuellen Konto (IK) AHV\nVersichertennummer 756.1234.5678.97\nBeitragsjahr 2023 Einkommen 58'200  2024 Einkommen 61'900  2025 Einkommen 66'300\nDer Auszug zeigt die Einkommen, auf denen AHV-Beiträge abgerechnet wurden. Keine Beitragslücken.` },
  { lang: 'de', corr: null, type: 'Offerte', date: '2026-09-02', tags: ['Haushalt'], title: 'Offerte Nr. 2026-117 Malerarbeiten Wohnzimmer',
    text: `Malergeschäft Huber & Söhne GmbH\nDorfstrasse 3, 6274 Eschenbach\nOfferte Nr. 2026-117 Malerarbeiten Wohnzimmer\nEschenbach, 2. September 2026\nWände und Decke Wohnzimmer 28 m2 abdecken, spachteln, zweimal streichen  CHF 1'480.00\nMaterial Dispersion weiss matt  CHF 210.00\nTotal exkl. MWST CHF 1'690.00   Offerte gültig bis 31.10.2026` },
];

// Runs the shipped provider code (dist/services/typesafeService), so build first.
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.TAGVICO_DATA_DIR ||= mkdtempSync(join(tmpdir(), 'tagvico-jev-eval-'));
process.env.AI_PROVIDER = 'typesafe';
process.env.REVIEW_THRESHOLD ||= '0.8';
const require = createRequire(import.meta.url);
const service = require('../dist/services/typesafeService');
const log = console.log; console.log = () => {};

const rows = [];
for (const doc of DOCS) {
  const started = performance.now();
  const result = await service.analyzeDocument(doc.text, TAGS, CORRESPONDENTS, TYPES, 'eval');
  const ms = performance.now() - started;
  if (result.error) throw new Error(result.error);
  const d = result.document;
  const tp = d.tags.filter((t) => doc.tags.includes(t)).length;
  rows.push({ doc: doc.title.slice(0, 34), ms: Math.round(ms), tokens: result.metrics.promptTokens,
    corr: (d.correspondent || null) === doc.corr, type: d.document_type === doc.type, lang: d.language === doc.lang,
    date: d.document_date === doc.date, title: d.title === doc.title, tp, fp: d.tags.length - tp, fn: doc.tags.length - tp,
    held: d.held_for_review.filter((f) => !['custom_fields', 'owner'].includes(f)).join(',') || '-',
    typeGot: d.document_type, wrongTags: d.tags.filter((t) => !doc.tags.includes(t)), missedTags: doc.tags.filter((t) => !d.tags.includes(t)) });
}
console.log = log;

const n = rows.length, sum = (f) => rows.reduce((s, r) => s + f(r), 0), pct = (f) => `${sum((r) => (f(r) ? 1 : 0))}/${n}`;
const tp = sum((r) => r.tp), fp = sum((r) => r.fp), fn = sum((r) => r.fn), tokens = sum((r) => r.tokens);
const summary = { documents: n, correspondent: pct((r) => r.corr), document_type: pct((r) => r.type), language: pct((r) => r.lang), date: pct((r) => r.date), title: pct((r) => r.title),
  tagPrecision: +(tp / (tp + fp)).toFixed(2), tagRecall: +(tp / (tp + fn)).toFixed(2), medianMs: rows.map((r) => r.ms).sort((x, y) => x - y)[Math.floor(n / 2)],
  tagThreshold: Number(process.env.TYPESAFE_TAG_THRESHOLD || 0.6), avgInputTokens: Math.round(tokens / n), usdPer1000Docs: +((tokens / n) * 1000 * PRICE_PER_MTOK / 1e6).toFixed(4), usdThisRun: +(tokens * PRICE_PER_MTOK / 1e6).toFixed(6) };
if (process.argv.includes('--json')) console.log(JSON.stringify({ summary, rows }, null, 1));
else { console.table(rows.map(({ wrongTags, missedTags, typeGot, ...r }) => r)); console.log(summary);
  for (const r of rows) if (r.wrongTags.length || r.missedTags.length || !r.type || !r.date) console.log(`- ${r.doc}: wrong=[${r.wrongTags}] missed=[${r.missedTags}]${r.type ? '' : ` type=${r.typeGot}`}`); }
