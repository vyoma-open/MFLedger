# MFLedger — Technical & Parameter Reference

This reference documents the configuration parameters, database properties, cryptography specifications, and environment settings that control the MFLedger application.

---

## 📖 Table of Contents
1. [Tax Engine Parameters & Rules](#1-tax-engine-parameters--rules)
2. [IndexedDB Schema & Table Definitions](#2-indexeddb-schema--table-definitions)
3. [App Settings (IndexedDB Table: `app_settings`)](#3-app-settings-indexeddb-table-app_settings)
4. [Local & Session Storage Keys](#4-local--session-storage-keys)
5. [Public AMFI API Contract](#5-public-amfi-api-contract)
6. [Encrypted Backup Specification (`.mfledger`)](#6-encrypted-backup-specification-mfledger)

---

## 1. Tax Engine Parameters & Rules

Default capital gains parameters are seeded in the `tax_rules` table in compliance with Indian Income Tax rules post-Budget 2024:

| Asset Class | Holding Period | STCG Rate | LTCG Rate | Annual Exemption | Section |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `EQUITY_MF` | 12 Months | 20.00% (2000 bps) | 12.50% (1250 bps) | ₹1,25,000 (12,500,000 paise) | 112A / 111A |
| `INDEX_MF` | 12 Months | 20.00% (2000 bps) | 12.50% (1250 bps) | ₹1,25,000 (12,500,000 paise) | 112A / 111A |
| `GOLD_MF` | 24 Months | Slab Rate | 12.50% (1250 bps) | ₹0 | 112A |
| `DEBT_MF` | 36 Months | Slab Rate | Slab Rate | ₹0 | 50AA |
| `LIQUID_MF` | 36 Months | Slab Rate | Slab Rate | ₹0 | 50AA |

*Note: Rates are stored as Basis Points (bps) where 100 bps = 1.00%. Exemption caps are stored in integer paise.*

---

## 2. IndexedDB Schema & Table Definitions

Managed via Dexie.js under database name `MFLedgerDB` (Version 1):

| Table Name | Primary Key | Indexed Fields | Purpose |
| :--- | :--- | :--- | :--- |
| `profiles` | `id` | `name, system_role, is_active, deleted_at` | Investor profiles for multi-folio tracking. |
| `accounts` | `id` | `name, type, subtype, currency, profile_id, is_archived, deleted_at` | Portfolio/Broker accounts (e.g. Zerodha Coin, Groww). |
| `investment_lots` | `id` | `account_id, profile_id, symbol, isin, asset_class, status, purchase_date` | Individual buy orders with units, purchase NAV, and remaining balance. |
| `lot_consumption_events` | `id` | `lot_id` | Audit trail of FIFO redemption consumption. |
| `tax_rules` | `id` | `asset_class, effective_from` | Capital gains holding periods and tax percentages. |
| `recurring_templates` | `id` | `frequency, next_execution, is_active` | Scheduled systematic investment plans (SIPs). |
| `market_cache` | `id` | `symbol, name, nav_date, source` | Locally cached AMFI NAV quotes. |
| `notes` | `id` | `pinned, created_at, deleted_at` | Folio records, AMC contacts, and research notes. |
| `app_settings` | `key` | *(Key-Value)* | Master app configurations and flags. |
| `goals` | `id` | `name, target_date, deleted_at` | Long-term target allocations. |
| `goal_contributions` | `id` | `goal_id, account_id` | Mappings linking accounts to investment goals. |

---

## 3. App Settings (IndexedDB Table: `app_settings`)

Key-value records governing app configuration:

| Key | Type | Description |
| :--- | :--- | :--- |
| `db_seeded` | `boolean` | Tracks whether initial tax rules have been created. |
| `password_hash` | `string \| null` | PBKDF2 derived auth hash for Lock Screen verification. |
| `password_hint` | `string \| null` | Optional user hint for password recovery. |
| `salt` | `string \| null` | Hexadecimal cryptographic salt for password verification. |
| `market_last_refresh_ts` | `number \| null` | Unix timestamp of the last successful AMFI NAV fetch. |
| `simulators` | `Array<Object>` | Saved compound interest and SIP projection scenarios. |

---

## 4. Local & Session Storage Keys

Transient UI preferences that do not alter the integrity of financial records are stored in browser storage:

| Storage | Key | Values | Description |
| :--- | :--- | :--- | :--- |
| `localStorage` | `mfledger_theme` | `"system" \| "light" \| "dark"` | Active visual theme. |
| `localStorage` | `mfledger_sound` | `"true" \| "false"` | Enables sound cues on completed actions. |
| `localStorage` | `mfledger_animations` | `"true" \| "false"` | Enables micro-animations and confetti. |
| `localStorage` | `app_hotkeys` | `Object` | Custom keyboard navigation bindings. |
| `sessionStorage`| `mfledger_period_preset` | `"month" \| "quarter" \| "fy" \| "all"` | Active time period filter. |
| `sessionStorage`| `mfledger_period_year` | `number` | Selected filter year. |
| `sessionStorage`| `mfledger_period_month` | `number` | Selected filter month. |

---

## 5. Public AMFI API Contract

MFLedger connects directly from the user's browser to the public AMFI open data API:

*   **Fund Search**: `GET https://api.mfapi.in/mf/search?q={query}`
    *   Returns list of matching schemes with AMFI scheme codes and formal scheme names.
*   **NAV Retrieval**: `GET https://api.mfapi.in/mf/{schemeCode}`
    *   Returns historical NAV array and latest Net Asset Value quote.
*   **Direct AMFI Master**: `GET https://portal.amfiindia.com/spages/NAVAll.txt`
    *   Used for bulk offline NAV txt/csv import.

---

## 6. Encrypted Backup Specification (`.mfledger`)

Backups are exported as self-describing encrypted JSON payloads adhering to the following structure:

```json
{
  "app": "MFLedger",
  "version": 2,
  "format": "MFLEDGER_ENCRYPTED_BACKUP",
  "createdAt": "2026-09-07T07:30:00.000Z",
  "schemaVersion": 1,
  "kdf": {
    "algorithm": "PBKDF2",
    "hash": "SHA-256",
    "iterations": 100000,
    "salt": "<32-character-hex-salt>"
  },
  "cipher": {
    "algorithm": "AES-256-GCM",
    "iv": "<24-character-hex-iv>"
  },
  "ciphertext": "<base64-encoded-aes-gcm-ciphertext>"
}
```
