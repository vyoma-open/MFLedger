# MFLedger

**MFLedger** is a high-performance, privacy-first, 100% offline-capable Mutual Fund portfolio tracker designed specifically for Indian investors.

Built on top of IndexedDB (`MFLedgerDB` via Dexie.js), all your data remains exclusively on your device. Zero cloud sync, zero telemetry, zero accounts, and zero servers.

---

## 🎯 Core Features

1. **Portfolio & FIFO Lot Accounting**:
   - Track mutual fund folios across equity, index, debt, liquid, and gold funds.
   - Individual purchase lot tracking with units, purchase NAV, dates, and fees.
   - Exact FIFO (First-In, First-Out) lot consumption upon redemptions/switches.
   - Realized & Unrealized P&L calculation down to the paise.

2. **Accurate XIRR Engine**:
   - High-precision Newton-Raphson annualized return calculator with bisection fallback and memoization.
   - Calculates XIRR across complex multi-year SIP cashflows and partial redemptions.

3. **Live AMFI NAV Integration**:
   - Automated scheme identification by AMFI scheme code or ISIN.
   - Real-time NAV updates fetched directly from `api.mfapi.in` and cached locally in IndexedDB.
   - Pull-to-refresh on mobile and global keyboard hotkeys (`Ctrl/Cmd + R`).

4. **CAS & Statement Importer**:
   - Import Consolidated Account Statements from CAMS and KFintech (PDF with password support, Excel, or CSV).
   - Auto-detection of recurring SIP streams, lump-sum investments, and redemptions.
   - Duplicate transaction detection using hash signatures.

5. **Indian Capital Gains Tax Engine (FY 2024–25 / FY 2025–26)**:
   - Full compliance with Section 112A (LTCG) and Section 111A (STCG).
   - Equity MF LTCG holding period (12 months) and tax rate (12.5% with ₹1.25 Lakh annual exemption cap).
   - Debt MF holding period (36 months) and STCG tax rules.
   - Interactive Tax Harvesting advisor: identify tax-free LTCG rebalancing and loss-harvesting opportunities.

6. **SIP Simulator & Wealth Projections**:
   - Model compound wealth trajectories combining existing corpus and monthly SIP commitments.
   - Custom SIP calculator with annual percentage step-ups.

7. **Zero-Knowledge Security & Backup**:
   - Offline Master PIN / Password protection using PBKDF2 (100,000 iterations) and AES-256-GCM.
   - Export and restore encrypted `.mfledger` snapshots.
   - Full PWA support: installable on iOS, macOS, Windows, and Android with offline service worker.

---

## 💻 Tech Stack

- **Framework**: React 19 (`react` 19.2.6)
- **Routing**: React Router DOM 7 (`react-router-dom` 7.15.1)
- **Database**: Dexie.js 4 (`MFLedgerDB` IndexedDB)
- **Charts**: Recharts 3.8
- **Icons**: Lucide React
- **Build System**: Vite 8 + TypeScript 6
- **PWA**: `vite-plugin-pwa` (Workbox offline service worker)
- **Document Parsers**: `pdfjs-dist`, `xlsx`, `papaparse`

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (tested on Node 20 / 22)
- npm or pnpm

### Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Run unit tests
npm test

# 4. Compile production bundle
npm run build
```

---

## 🔒 Privacy & Open Source Philosophy

MFLedger is completely open-source and strictly client-side. No API keys, credentials, or personal holdings ever leave your browser.

- **No Remote Database**: IndexedDB stores all folios, lots, and tax rules on your local browser profile.
- **Direct AMFI Sync**: Queries the open-access public AMFI endpoint without intermediate servers.
- **Portability**: You can export unencrypted or encrypted backups at any time.

---

## 📄 License

MIT License.
