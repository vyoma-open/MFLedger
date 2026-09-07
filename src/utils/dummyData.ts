import { db } from '../db/schema';
import type { InvestmentLot, AssetClass } from '../db/schema';
import { seedDatabase, setSetting } from '../db/seed';

/**
 * Adds realistic mutual fund demo data:
 * - 2 Portfolio Accounts: Zerodha Coin & Groww MF
 * - Diversified MF holdings (Flexi Cap, Index, Mid Cap, Debt, Gold)
 * - SIP stream history & FIFO redemption event
 * - Active SIP recurring templates and portfolio notes
 */
export async function addDummyData(): Promise<{ message: string }> {
  await setSetting('db_seeded', false);
  const now = Date.now();

  const tablesToClear = [
    db.profiles,
    db.accounts,
    db.investment_lots,
    db.lot_consumption_events,
    db.recurring_templates,
    db.notes,
    db.market_cache,
  ];

  await db.transaction('rw', tablesToClear, async () => {
    for (const table of tablesToClear) {
      await table.clear();
    }
  });

  await seedDatabase();

  // ── Default System Profile ───────────────────────────────────────────────
  const defaultProfileId = 'profile_default';
  await db.profiles.bulkPut([
    {
      id: defaultProfileId,
      name: 'Primary',
      system_role: 'PRIMARY',
      color: '#059669',
      is_active: 1,
      created_at: now,
      updated_at: now,
      version: 1,
      deleted_at: 0,
    },
  ]);

  // ── Portfolio Accounts ───────────────────────────────────────────────────
  const coinFolioId = 'acc_zerodha_coin';
  const growwFolioId = 'acc_groww_mf';

  await db.accounts.bulkPut([
    {
      id: coinFolioId,
      name: 'Zerodha Coin',
      type: 'MF',
      subtype: 'ASSET',
      currency: 'INR',
      profile_id: defaultProfileId,
      institution: 'Zerodha',
      account_number: 'DEMO-COIN-8891',
      color: '#059669',
      icon: 'Briefcase',
      is_archived: 0,
      created_at: now,
      updated_at: now,
      version: 1,
      deleted_at: 0,
    },
    {
      id: growwFolioId,
      name: 'Groww MF',
      type: 'MF',
      subtype: 'ASSET',
      currency: 'INR',
      profile_id: defaultProfileId,
      institution: 'Groww',
      account_number: 'DEMO-GROWW-4412',
      color: '#0D9488',
      icon: 'Wallet',
      is_archived: 0,
      created_at: now,
      updated_at: now,
      version: 1,
      deleted_at: 0,
    },
  ]);

  function d(year: number, month: number, day: number) {
    return new Date(year, month - 1, day, 10, 0, 0).getTime();
  }

  // ── Investment Lots (SIP streams & Lumpsums) ───────────────────────────
  const lots: InvestmentLot[] = [
    // ── Zerodha Coin: Parag Parikh Flexi Cap SIP stream ──
    {
      id: 'lot_ppfas_1',
      account_id: coinFolioId,
      profile_id: defaultProfileId,
      symbol: 'AMFI:122639',
      name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
      asset_class: 'EQUITY_MF' as AssetClass,
      isin: 'INF879O01019',
      mf_plan: 'DIRECT',
      mf_option: 'GROWTH',
      purchase_date: d(2023, 4, 15),
      units_original: 1250.432,
      units_remaining: 750.432, // 500 units redeemed in FIFO test
      purchase_price_paise: 5200, // ₹52.00 NAV
      fees_paise: 0,
      investment_type: 'SIP',
      sip_stream_id: 'sip_stream_ppfas',
      goal_tag: 'Retirement',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      version: 1,
    },
    {
      id: 'lot_ppfas_2',
      account_id: coinFolioId,
      profile_id: defaultProfileId,
      symbol: 'AMFI:122639',
      name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
      asset_class: 'EQUITY_MF' as AssetClass,
      isin: 'INF879O01019',
      mf_plan: 'DIRECT',
      mf_option: 'GROWTH',
      purchase_date: d(2023, 10, 15),
      units_original: 920.150,
      units_remaining: 920.150,
      purchase_price_paise: 5850,
      fees_paise: 0,
      investment_type: 'SIP',
      sip_stream_id: 'sip_stream_ppfas',
      goal_tag: 'Retirement',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      version: 1,
    },
    {
      id: 'lot_ppfas_3',
      account_id: coinFolioId,
      profile_id: defaultProfileId,
      symbol: 'AMFI:122639',
      name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
      asset_class: 'EQUITY_MF' as AssetClass,
      isin: 'INF879O01019',
      mf_plan: 'DIRECT',
      mf_option: 'GROWTH',
      purchase_date: d(2024, 4, 15),
      units_original: 780.220,
      units_remaining: 780.220,
      purchase_price_paise: 6720,
      fees_paise: 0,
      investment_type: 'SIP',
      sip_stream_id: 'sip_stream_ppfas',
      goal_tag: 'Retirement',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      version: 1,
    },
    {
      id: 'lot_ppfas_4',
      account_id: coinFolioId,
      profile_id: defaultProfileId,
      symbol: 'AMFI:122639',
      name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
      asset_class: 'EQUITY_MF' as AssetClass,
      isin: 'INF879O01019',
      mf_plan: 'DIRECT',
      mf_option: 'GROWTH',
      purchase_date: d(2024, 10, 15),
      units_original: 640.110,
      units_remaining: 640.110,
      purchase_price_paise: 7650,
      fees_paise: 0,
      investment_type: 'SIP',
      sip_stream_id: 'sip_stream_ppfas',
      goal_tag: 'Retirement',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      version: 1,
    },

    // ── Groww MF: UTI Nifty 50 Index Fund SIP stream ──
    {
      id: 'lot_uti_index_1',
      account_id: growwFolioId,
      profile_id: defaultProfileId,
      symbol: 'AMFI:120716',
      name: 'UTI Nifty 50 Index Fund - Direct Plan - Growth',
      asset_class: 'INDEX_MF' as AssetClass,
      isin: 'INF789F01X13',
      mf_plan: 'DIRECT',
      mf_option: 'GROWTH',
      purchase_date: d(2023, 6, 10),
      units_original: 1850.500,
      units_remaining: 1850.500,
      purchase_price_paise: 13200,
      fees_paise: 0,
      investment_type: 'SIP',
      sip_stream_id: 'sip_stream_uti',
      goal_tag: 'House Downpayment',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      version: 1,
    },
    {
      id: 'lot_uti_index_2',
      account_id: growwFolioId,
      profile_id: defaultProfileId,
      symbol: 'AMFI:120716',
      name: 'UTI Nifty 50 Index Fund - Direct Plan - Growth',
      asset_class: 'INDEX_MF' as AssetClass,
      isin: 'INF789F01X13',
      mf_plan: 'DIRECT',
      mf_option: 'GROWTH',
      purchase_date: d(2024, 6, 10),
      units_original: 1540.250,
      units_remaining: 1540.250,
      purchase_price_paise: 15800,
      fees_paise: 0,
      investment_type: 'SIP',
      sip_stream_id: 'sip_stream_uti',
      goal_tag: 'House Downpayment',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      version: 1,
    },

    // ── Zerodha Coin: HDFC Mid-Cap Opportunities Fund ──
    {
      id: 'lot_hdfc_midcap_1',
      account_id: coinFolioId,
      profile_id: defaultProfileId,
      symbol: 'AMFI:118989',
      name: 'HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth',
      asset_class: 'EQUITY_MF' as AssetClass,
      isin: 'INF179K01BE2',
      mf_plan: 'DIRECT',
      mf_option: 'GROWTH',
      purchase_date: d(2024, 1, 20),
      units_original: 800.000,
      units_remaining: 800.000,
      purchase_price_paise: 12500,
      fees_paise: 0,
      investment_type: 'LUMPSUM',
      goal_tag: 'Child Education',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      version: 1,
    },

    // ── Groww MF: ICICI Prudential All Seasons Bond Fund ──
    {
      id: 'lot_icici_debt_1',
      account_id: growwFolioId,
      profile_id: defaultProfileId,
      symbol: 'AMFI:120251',
      name: 'ICICI Prudential All Seasons Bond Fund - Direct Plan - Growth',
      asset_class: 'DEBT_MF' as AssetClass,
      isin: 'INF109K01Q78',
      mf_plan: 'DIRECT',
      mf_option: 'GROWTH',
      purchase_date: d(2023, 8, 1),
      units_original: 3200.000,
      units_remaining: 3200.000,
      purchase_price_paise: 3100,
      fees_paise: 0,
      investment_type: 'LUMPSUM',
      goal_tag: 'Emergency Reserve',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      version: 1,
    },

    // ── Zerodha Coin: Nippon India Gold Savings Fund ──
    {
      id: 'lot_nippon_gold_1',
      account_id: coinFolioId,
      profile_id: defaultProfileId,
      symbol: 'AMFI:119775',
      name: 'Nippon India Gold Savings Fund - Direct Plan - Growth',
      asset_class: 'GOLD_MF' as AssetClass,
      isin: 'INF204K01UQ0',
      mf_plan: 'DIRECT',
      mf_option: 'GROWTH',
      purchase_date: d(2023, 11, 1),
      units_original: 1200.000,
      units_remaining: 1200.000,
      purchase_price_paise: 2150,
      fees_paise: 0,
      investment_type: 'LUMPSUM',
      goal_tag: 'Gold Hedge',
      status: 'ACTIVE',
      created_at: now,
      updated_at: now,
      version: 1,
    },
  ];

  await db.investment_lots.bulkPut(lots);

  // ── FIFO Consumption Event (Sale demonstration) ───────────────────────
  await db.lot_consumption_events.bulkPut([
    {
      id: 'evt_ppfas_sale_1',
      lot_id: 'lot_ppfas_1',
      units_consumed: 500,
      sale_price_paise: 8200, // Sold at ₹82.00 (Long Term Gain)
      created_at: d(2024, 11, 20),
    },
  ]);

  // ── Market Cache (Current NAVs) ───────────────────────────────────────
  const cacheDate = d(2025, 1, 15);
  await db.market_cache.bulkPut([
    {
      id: 'AMFI:122639',
      symbol: 'AMFI:122639',
      source: 'AMFI',
      nav_paise: 8450, // ₹84.50
      nav_date: cacheDate,
      name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
      created_at: now,
    },
    {
      id: 'INF879O01019',
      symbol: 'INF879O01019',
      source: 'AMFI',
      nav_paise: 8450,
      nav_date: cacheDate,
      name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
      created_at: now,
    },
    {
      id: 'AMFI:120716',
      symbol: 'AMFI:120716',
      source: 'AMFI',
      nav_paise: 17200, // ₹172.00
      nav_date: cacheDate,
      name: 'UTI Nifty 50 Index Fund - Direct Plan - Growth',
      created_at: now,
    },
    {
      id: 'INF789F01X13',
      symbol: 'INF789F01X13',
      source: 'AMFI',
      nav_paise: 17200,
      nav_date: cacheDate,
      name: 'UTI Nifty 50 Index Fund - Direct Plan - Growth',
      created_at: now,
    },
    {
      id: 'AMFI:118989',
      symbol: 'AMFI:118989',
      source: 'AMFI',
      nav_paise: 16400, // ₹164.00
      nav_date: cacheDate,
      name: 'HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth',
      created_at: now,
    },
    {
      id: 'AMFI:120251',
      symbol: 'AMFI:120251',
      source: 'AMFI',
      nav_paise: 3350, // ₹33.50
      nav_date: cacheDate,
      name: 'ICICI Prudential All Seasons Bond Fund - Direct Plan - Growth',
      created_at: now,
    },
    {
      id: 'AMFI:119775',
      symbol: 'AMFI:119775',
      source: 'AMFI',
      nav_paise: 2750, // ₹27.50
      nav_date: cacheDate,
      name: 'Nippon India Gold Savings Fund - Direct Plan - Growth',
      created_at: now,
    },
  ]);

  // ── Scheduled SIP Templates ───────────────────────────────────────────
  await db.recurring_templates.bulkPut([
    {
      id: 'sip_rec_ppfas',
      name: 'Parag Parikh Flexi Cap SIP',
      frequency: 'MONTHLY',
      amount_paise: 1000000, // ₹10,000 / month
      to_account_id: coinFolioId,
      description: 'Auto-debit for PPFAS Flexi Cap (Zerodha Coin)',
      next_execution: d(2025, 2, 15),
      is_active: 1,
      asset_class: 'EQUITY_MF',
      created_at: now,
      updated_at: now,
      version: 1,
    },
    {
      id: 'sip_rec_uti',
      name: 'UTI Nifty 50 Index SIP',
      frequency: 'MONTHLY',
      amount_paise: 1500000, // ₹15,000 / month
      to_account_id: growwFolioId,
      description: 'Monthly Index SIP (Groww MF)',
      next_execution: d(2025, 2, 10),
      is_active: 1,
      asset_class: 'INDEX_MF',
      created_at: now,
      updated_at: now,
      version: 1,
    },
  ]);

  // ── Sample Investment Notes ───────────────────────────────────────────
  await db.notes.bulkPut([
    {
      id: 'note_coin_mandate',
      title: 'Zerodha Coin SIP Mandate',
      content: 'E-mandate active via HDFC Bank net banking. SIP deduction date is 15th of every month. Folio units held in Demat mode.',
      pinned: 1,
      account_id: coinFolioId,
      tags: 'Mandate, Coin, Demat',
      created_at: d(2024, 1, 1),
      updated_at: d(2024, 1, 1),
      deleted_at: 0,
    },
    {
      id: 'note_groww_mandate',
      title: 'Groww MF OTM Mandate',
      content: 'One-time AutoPay mandate registered. Monthly Index SIP deduction on 10th of every month. Units held in SOA (non-demat) physical folio format.',
      pinned: 1,
      account_id: growwFolioId,
      tags: 'AutoPay, Groww, SOA',
      created_at: d(2024, 2, 1),
      updated_at: d(2024, 2, 1),
      deleted_at: 0,
    },
  ]);

  return {
    message: `Mutual Fund demo data loaded: 2 Portfolio Accounts (Zerodha Coin, Groww MF), 9 investment lots, active SIPs, and NAV prices.`,
  };
}
