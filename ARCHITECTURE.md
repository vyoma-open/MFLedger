# MFLedger — Developer Architecture & Mathematical Engines

This document provides a comprehensive technical overview of the design patterns, mathematical engines, data models, and database schema governing **MFLedger**.

---

## 📖 Table of Contents
1. [Data Primitives: The Paise Convention](#1-data-primitives-the-paise-convention)
2. [Data Model & IndexedDB Schema](#2-data-model--indexeddb-schema)
3. [Investment Lot Accounting & FIFO Consumption Engine](#3-investment-lot-accounting--fifo-consumption-engine)
4. [Indian Capital Gains Tax Engine (FY 2024–26)](#4-indian-capital-gains-tax-engine-fy-202426)
5. [SIP Detection Engine & Stream Analytics](#5-sip-detection-engine--stream-analytics)
6. [High-Precision XIRR Engine](#6-high-precision-xirr-engine)
7. [Live AMFI NAV Integration & Market Cache](#7-live-amfi-nav-integration--market-cache)
8. [Zero-Knowledge Security & Backup Architecture](#8-zero-knowledge-security--backup-architecture)
9. [Domain-Driven Architecture & Layer Isolation](#9-domain-driven-architecture--layer-isolation)

---

## 1. Data Primitives: The Paise Convention

To prevent floating-point inaccuracies inherent in IEEE 754 float math (e.g. `0.1 + 0.2 === 0.30000000000000004`), MFLedger strictly stores all monetary values, NAVs, and transaction amounts as **integers representing paise** (1 Rupee = 100 Paise).

Monetary figures are only divided by 100 in the UI presentation layer.

### Implementation Reference (`src/utils/currency.tsx`)
```typescript
/** Format paise to Indian Rupee string */
export function formatINR(paise: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  const rupees = Math.abs(paise) / 100;
  const { compact = false, decimals } = opts;

  if (compact) {
    if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)} Cr`;
    if (rupees >= 1_00_000)    return `₹${(rupees / 1_00_000).toFixed(2)} L`;
    if (rupees >= 1000)        return `₹${(rupees / 1000).toFixed(1)} K`;
  }

  const d = decimals ?? (rupees >= 100 ? 0 : 2);
  return '₹' + rupees.toLocaleString('en-IN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
```

---

## 2. Data Model & IndexedDB Schema

MFLedger stores all client-side data inside the browser's IndexedDB database named `MFLedgerDB`, managed via **Dexie.js**.

### Database Definition (`src/db/schema.ts`)
```typescript
export class MFLedgerDB extends Dexie {
  profiles!: Table<Profile>;
  accounts!: Table<Account>;
  investment_lots!: Table<InvestmentLot>;
  lot_consumption_events!: Table<LotConsumptionEvent>;
  tax_rules!: Table<TaxRule>;
  recurring_templates!: Table<RecurringTemplate>;
  market_cache!: Table<MarketCache>;
  notes!: Table<Note>;
  app_settings!: Table<AppSetting>;
  goals!: Table<Goal>;
  goal_contributions!: Table<GoalContribution>;

  constructor() {
    super('MFLedgerDB');

    this.version(1).stores({
      profiles:               'id, name, system_role, is_active, deleted_at, [is_active+deleted_at]',
      accounts:               'id, name, type, subtype, currency, profile_id, is_archived, deleted_at, [profile_id+deleted_at], [is_archived+deleted_at]',
      investment_lots:        'id, account_id, profile_id, symbol, isin, asset_class, status, purchase_date, [account_id+status], [profile_id+status], [symbol+status]',
      lot_consumption_events: 'id, lot_id',
      tax_rules:              'id, asset_class, effective_from',
      recurring_templates:    'id, frequency, next_execution, is_active',
      market_cache:           'id, symbol, name, nav_date, source, [symbol+nav_date]',
      notes:                  'id, pinned, created_at, deleted_at, [pinned+deleted_at]',
      app_settings:           'key',
      goals:                  'id, name, target_date, deleted_at',
      goal_contributions:     'id, goal_id, account_id',
    });
  }
}
```

---

## 3. Investment Lot Accounting & FIFO Consumption Engine

To support accurate capital gains calculation, buy orders are stored as immutable lots (`InvestmentLot`), and redemptions are computed using **First-In, First-Out (FIFO)** lot consumption.

### FIFO Consumption Code (`src/engines/fifo.ts`)
```typescript
export async function sellFIFO(params: {
  account_id: string;
  symbol: string;
  units_to_sell: number;
  sale_price_per_unit_paise: number;
  sale_date: number;
  holding_period_months_threshold?: number;
}): Promise<SaleLotResult[]> {
  const { account_id, symbol, units_to_sell, sale_price_per_unit_paise, sale_date } = params;

  // Retrieve active lots for this symbol, sorted oldest first (FIFO)
  const lots = await db.investment_lots
    .where('[account_id+status]')
    .equals([account_id, 'ACTIVE'])
    .filter(l => l.symbol === symbol && l.units_remaining > 0)
    .sortBy('purchase_date');

  const totalAvailable = lots.reduce((sum, l) => sum + l.units_remaining, 0);
  if (totalAvailable < units_to_sell) {
    throw new Error(
      `Insufficient units. Available: ${totalAvailable.toFixed(4)}, Requested: ${units_to_sell.toFixed(4)}`
    );
  }

  const results: SaleLotResult[] = [];
  let remainingToSell = units_to_sell;
  const now = Date.now();

  for (const lot of lots) {
    if (remainingToSell <= 0) break;

    const unitsFromThisLot = Math.min(lot.units_remaining, remainingToSell);
    const gainPaise = Math.round(
      unitsFromThisLot * (sale_price_per_unit_paise - lot.purchase_price_paise)
    );
    const months = holdingMonths(lot.purchase_date, sale_date);
    const threshold = params.holding_period_months_threshold ?? 12;

    // Write consumption event (event sourcing audit trail)
    const event: LotConsumptionEvent = {
      id: generateId('evt'),
      lot_id: lot.id,
      units_consumed: unitsFromThisLot,
      sale_price_paise: sale_price_per_unit_paise,
      created_at: sale_date,
    };
    await db.lot_consumption_events.add(event);

    // Update remaining units
    const newUnitsRemaining = lot.units_remaining - unitsFromThisLot;
    await db.investment_lots.update(lot.id, {
      units_remaining: newUnitsRemaining,
      status: newUnitsRemaining < 1e-6 ? 'CLOSED' : 'ACTIVE',
      updated_at: now,
      version: lot.version + 1,
    });

    results.push({
      lot_id: lot.id,
      units_consumed: unitsFromThisLot,
      purchase_date: lot.purchase_date,
      purchase_price_paise: lot.purchase_price_paise,
      sale_price_paise: sale_price_per_unit_paise,
      gain_paise: gainPaise,
      holding_months: months,
      is_long_term: months >= threshold,
    });

    remainingToSell -= unitsFromThisLot;
  }

  return results;
}
```

---

## 4. Indian Capital Gains Tax Engine (FY 2024–26)

MFLedger complies with Indian taxation rules as amended under Budget 2024 (effective July 23, 2024):
*   **Equity & Index Mutual Funds**:
    *   **LTCG** (Holding Period ≥ 12 months): 12.5% on gains exceeding ₹1.25 Lakh annual exemption under Section 112A.
    *   **STCG** (Holding Period < 12 months): 20% flat tax under Section 111A.
*   **Debt & Liquid Mutual Funds**:
    *   Taxed at applicable income tax slab rates regardless of holding period (Section 50AA).
*   **Gold Mutual Funds**:
    *   **LTCG** (Holding Period ≥ 24 months): 12.5% tax.
    *   **STCG** (Holding Period < 24 months): Slab rate.

### Tax Computation Logic (`src/engines/tax.ts`)
Each FIFO sale is evaluated against applicable `TaxRule` records, tracking remaining ₹1.25L exemption capacity and computing net tax liability.

---

## 5. SIP Detection Engine & Stream Analytics

When importing CAS or statement files, `src/engines/sipDetector.ts` analyzes historical cashflow intervals:
*   **Cadence Inference**: Evaluates delta days between transactions (25–35 days for monthly, 80–100 days for quarterly).
*   **Step-Up Tranche Segmentation**: Automatically splits SIP streams into distinct installment amounts when an investor steps up monthly contributions (e.g., ₹5,000 → ₹7,500), rather than calculating an inaccurate blended average.
*   **Keyword Detection**: Matches transaction narrations containing `SIP`, `SYSTEMATIC`, or `AUTO DEBIT`.

---

## 6. High-Precision XIRR Engine

MFLedger utilizes an optimized Newton-Raphson annualized return calculator (`src/utils/xirr.ts`) with:
*   Bisection search fallback for irregular cashflow convergence.
*   Memoization cache keyed by sorted cashflow hashes to avoid redundant recalculation during UI rendering.
*   Strict tolerance (`1e-7`) with maximum iteration limits to guarantee non-blocking UI performance.

---

## 7. Live AMFI NAV Integration & Market Cache

*   **Public Open Data**: Fetches latest NAV prices directly from `https://api.mfapi.in/mf/:schemeCode` without intermediate servers.
*   **Direct Scheme Search**: Resolves fund names via `https://api.mfapi.in/mf/search?q=`.
*   **Local Caching**: NAV updates are persisted in IndexedDB `market_cache` table. Subsequent app sessions load cached NAVs instantaneously without network requests.

---

## 8. Zero-Knowledge Security & Backup Architecture

*   **100% Client-Side**: No financial data, folios, or balances ever leave the device.
*   **PBKDF2 Key Derivation**: Uses 100,000 iterations of SHA-256 with a fresh 16-byte cryptographically secure random salt.
*   **AES-256-GCM Encryption**: Generates a fresh 12-byte IV per export. Backups are exported as self-describing `.mfledger` encrypted JSON files.
*   **Local PDF.js Processing**: PDF parsing of CAS statements uses a locally bundled Web Worker (`pdf.worker.min.mjs`), ensuring zero third-party script execution.

---

## 9. Domain-Driven Architecture & Layer Isolation

To maintain longevity, mathematical purity, and open-source auditability, MFLedger enforces strict layer boundaries:

```
src/
├── domain/            # 🧠 Pure mathematical models (Pure TypeScript: NO React, NO Dexie, NO network)
│   ├── fifo/          # Pure FIFO lot redemption allocator (allocateFIFORedemption)
│   ├── tax/           # Pure Indian capital gains (Sec 112A/111A/50AA), holding periods, FY calculations
│   ├── xirr/          # Pure Newton-Raphson cashflow solver and cache
│   └── sip/           # Pure cadence detection, step-up tolerance, and stream analytics
├── data/
│   └── providers/     # 🌐 External data fetchers (MFAPI.in, AMFI feeds)
├── import/
│   └── csv/           # 📄 Statement & CAS parsers (CAMS, KFintech, generic CSV)
├── db/                # 💾 Persistence layer (Dexie.js IndexedDB schema, migrations, seeders)
├── features/          # 📱 User interface feature views (React components, state, hooks)
└── components/        # 🎨 Reusable design system primitives (modals, dropdowns, tables)
```

### The Domain Boundary Invariants
1. **Zero Framework Dependencies**: Code in `src/domain/` MUST NOT import React, Dexie, IndexedDB, or DOM elements.
2. **Zero Network / Cloud Dependencies**: No `fetch`, no Cloudflare Workers, no KV store dependencies.
3. **Pure Function Contract**: Functions take plain TypeScript data structures as arguments and return calculated results.
4. **Zero-Mock Testing**: All domain modules can be tested aggressively in milliseconds without running a browser or database mock.
