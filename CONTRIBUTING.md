# Contributing to MFLedger

Thank you for your interest in contributing to **MFLedger**!

MFLedger is a 100% client-side, local-first Indian mutual fund tracker and tax harvesting engine. We prioritize mathematical precision, zero-knowledge privacy, and framework independence.

---

## 🏛 Architecture & Layer Guidelines

Before writing code, please review [`ARCHITECTURE.md`](./ARCHITECTURE.md). We maintain a strict boundary between our core mathematical domain and the UI/storage delivery mechanisms:

### 1. The `src/domain/` Boundary (Pure TypeScript)
All financial and mathematical rules live in `src/domain/`:
* **FIFO Engine** (`src/domain/fifo/`): Lot allocation and unit matching.
* **Tax Engine** (`src/domain/tax/`): Section 112A/111A capital gains, holding periods, ₹1.25L exemption.
* **XIRR Engine** (`src/domain/xirr/`): Cashflow returns solver.
* **SIP Detector** (`src/domain/sip/`): Cadence, step-up, and recurring pattern detection.

**Rules for `src/domain/`:**
* **NO React** (no JSX, hooks, or component imports).
* **NO Dexie / IndexedDB** (take plain objects/arrays in, return plain objects out).
* **NO Network / Fetch** (no cloud dependencies).
* **NO Browser / DOM APIs** (must run in pure Node/Deno/Bun/V8 runtimes).
* **Aggressive Unit Testing**: Every domain change must include fast, zero-mock unit tests under `__tests__/`.

### 2. The `src/data/` & `src/import/` Boundary
* **Data Providers** (`src/data/providers/`): Pure fetchers and parsers for AMFI and MFAPI.in.
* **Statement Parsers** (`src/import/`): Parsers for CAMS CAS PDF, KFintech Excel/CSV, and broker export formats.

### 3. The `src/db/` Layer
* Database schemas and IndexedDB storage managed via `Dexie.js`.
* Functions here act as persistence adapters that load entities from IndexedDB, pass them into `domain/` functions, and persist the results.

### 4. The `src/features/` Layer
* React presentation components, modals, and views.

---

## 🛠 Local Development Workflow

### Setup
```bash
git clone https://github.com/<your-username>/MFLedger.git
cd MFLedger
npm ci
```

### Development Server
```bash
npm run dev
```
Open `http://localhost:5173/` in your browser.

### Running Tests
All tests run with Vitest:
```bash
npm test
```

To run tests in watch mode during development:
```bash
npm run test:watch
```

### Building for Production
```bash
npm run build
```
Verifies TypeScript compilation (`tsc -b`) and bundles the static PWA into `dist/`.

---

## 📝 Pull Request Guidelines

1. **Keep Commits Focused**: One feature or bugfix per pull request.
2. **Include Tests**: Add unit tests for any new financial calculations or parser additions.
3. **Preserve Privacy**: Never commit private API tokens, personal holdings, or user identifiable information.
4. **Follow the Paise Rule**: All monetary amounts must be calculated and stored as integer paise (₹1 = 100 paise).
