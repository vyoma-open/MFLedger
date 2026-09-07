# MFLedger — User Guide

Welcome to **MFLedger**! This guide walks you through every feature, view, and workflow in the application.

MFLedger is **100% local-first and client-side**. All your portfolios, transactions, and tax calculations reside entirely within your browser's IndexedDB. No accounts, no servers, and no telemetry.

---

## 🧭 Table of Contents
1. [Mutual Fund Portfolio Dashboard](#1-mutual-fund-portfolio-dashboard)
2. [Trades & FIFO Lot Accounting](#2-trades--fifo-lot-accounting)
3. [Tax & Capital Gains Harvesting (FY 2024–26)](#3-tax--capital-gains-harvesting-fy-202426)
4. [SIP & Wealth Growth Simulator](#4-sip--wealth-growth-simulator)
5. [Research Notes & Portfolio Records](#5-research-notes--portfolio-records)
6. [Importing CAS Statements (CAMS & KFintech)](#6-importing-cas-statements-cams--kfintech)
7. [Security, App Lock & Encrypted Backups](#7-security-app-lock--encrypted-backups)

---

## 1. Mutual Fund Portfolio Dashboard

### What It Does
The home view (`/`) displays an aggregated overview of your mutual fund investments across all folios or filtered by individual profile/account.

### Key Metrics
*   **Total Portfolio Value**: Computed in real-time from active units multiplied by cached AMFI NAVs.
*   **Total Invested Value & Gains**: Tracks absolute gains (₹) and percentage return (%).
*   **Portfolio XIRR**: Annualized money-weighted rate of return across all SIP and lump-sum cash flows.
*   **Nifty 50 Comparison**: Compares today's portfolio movement against the Nifty 50 benchmark (`^NSEI`).
*   **Asset Allocation Bar**: Visual breakdown across Equity MF, Index Fund, Debt MF, Liquid MF, and Gold MF.
*   **Holdings Table**: Lot summaries, average purchase price, latest NAV, P&L, and active SIP commitments.

### How to Use It
1.  Use the **Portfolio Selector** in the top bar to filter between "All Portfolios" or specific accounts (e.g. Zerodha Coin, Groww).
2.  Click the **Refresh NAVs** button (or press `Ctrl/Cmd + R`) to update latest NAV quotes directly from AMFI.
3.  Click on any scheme row to open the **Asset Lots Modal** to inspect purchase history or execute a FIFO redemption.

---

## 2. Trades & FIFO Lot Accounting

### What It Does
The `/trades` view acts as an order ledger detailing individual purchase lots and historical redemptions.

### Key Capabilities
*   **Individual Lot Inspection**: Tracks purchase date, unit count, original purchase NAV, fees, and goal tags.
*   **FIFO Consumption**: When units are sold or switched, MFLedger automatically consumes the oldest available lots first, computing exact realized short-term or long-term capital gains down to the paise.
*   **Remaining Units**: Accurately shows active vs. closed lots after partial redemptions.

---

## 3. Tax & Capital Gains Harvesting (FY 2024–26)

### What It Does
Designed to help Indian investors track tax liabilities and capitalize on annual tax exemptions under Section 112A and Section 111A.

### Key Tools
*   **Financial Year Summary**: Realized STCG and LTCG for the active financial year (April 1 – March 31).
*   **LTCG Step-Up Harvesting Advisor**: Identifies equity lots held for > 12 months with unrealized gains. Helps you utilize your annual ₹1.25 Lakh tax-free LTCG exemption cap.
*   **Tax Loss Harvesting**: Highlights lots with unrealized losses to offset realized capital gains.
*   **Harvesting Simulator**: Allows you to simulate selling candidate lots and resetting the cost basis to current market NAV.

---

## 4. SIP & Wealth Growth Simulator

### What It Does
A sandbox planning suite to model compound interest, retire-early (FIRE) targets, and SIP step-up strategies.

### Modes
1.  **Portfolio Trajectory**: Connects directly to your live portfolio value and active SIP commitments. Projects wealth over 5, 10, 15, 20+ years factoring in annual step-up percentages and expected return rates.
2.  **Custom SIP Calculator**: Models hypothetical scenarios with custom lumpsum amounts, monthly commitments, and inflation adjustments.

---

## 5. Research Notes & Portfolio Records

### What It Does
A dedicated offline notebook to store critical portfolio information:
*   AMC contact numbers, helpline emails, and branch details.
*   Folio numbers, nominee registrations, and investment mandates.
*   Personal investment theses and asset allocation rebalancing rules.
*   Supports markdown formatting, pinned notes, and tag filters (`#sip`, `#tax`, `#rebalancing`).

---

## 6. Importing CAS Statements (CAMS & KFintech)

### What It Does
Allows seamless onboarding of existing portfolios from industry-standard statements without manual data entry.

### Supported Formats
*   **Consolidated Account Statements (CAS)**: PDF (password-protected or unlocked) and Excel/CSV from CAMS, KFintech, and MF Central.
*   **Broker Portfolios**: CSV exports from Zerodha Coin, Groww, Kuvera, and INDmoney.

### Features
*   **Duplicate Detection**: Compares ISIN, date, units, and price against existing records to prevent double-counting.
*   **SIP Pattern Detection**: Automatically identifies recurring monthly investments and groups them into SIP streams.
*   **100% Offline Processing**: PDF statements are parsed entirely in your browser using a locally bundled PDF.js worker. No files are ever sent to any remote server.

---

## 7. Security, App Lock & Encrypted Backups

### Settings & Controls (`/settings`)
*   **App Lock**: Set a master PIN or password. If enabled, MFLedger displays a secure Lock Screen on launch.
*   **Zero-Knowledge Encrypted Backup**: Export your entire database as an encrypted `.mfledger` snapshot secured with PBKDF2 (100,000 iterations) and AES-256-GCM.
*   **Offline PWA**: Installable as a progressive web app on macOS, Windows, iOS, and Android.
*   **Demo & Clear Data**: Load realistic sample mutual fund data to explore features, or purge all local IndexedDB tables with a single click.
