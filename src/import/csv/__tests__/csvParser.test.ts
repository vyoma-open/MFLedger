import { describe, it, expect } from 'vitest';
import {
  parseCSVDate,
  parseCSVNumber,
  guessFieldMappings,
  isMFLotDuplicate,
} from '../csvParser';
import type { InvestmentLot } from '@/types/db.types';

describe('import/csv: csvParser', () => {
  it('correctly parses various Indian date formats', () => {
    // DD-MM-YYYY
    const d1 = parseCSVDate('15-08-2024');
    const date1 = new Date(d1);
    expect(date1.getFullYear()).toBe(2024);
    expect(date1.getMonth()).toBe(7); // Aug is 7
    expect(date1.getDate()).toBe(15);

    // DD-MMM-YYYY
    const d2 = parseCSVDate('23-Jul-2024');
    const date2 = new Date(d2);
    expect(date2.getFullYear()).toBe(2024);
    expect(date2.getMonth()).toBe(6); // Jul is 6
    expect(date2.getDate()).toBe(23);

    // YYYY-MM-DD
    const d3 = parseCSVDate('2024-04-01');
    const date3 = new Date(d3);
    expect(date3.getFullYear()).toBe(2024);
    expect(date3.getMonth()).toBe(3); // Apr is 3
    expect(date3.getDate()).toBe(1);
  });

  it('correctly parses numbers with currency symbols and commas', () => {
    expect(parseCSVNumber('₹1,25,000.50')).toBe(125000.50);
    expect(parseCSVNumber(' 5,432.10 ')).toBe(5432.10);
    expect(parseCSVNumber('')).toBe(0);
  });

  it('correctly detects column headers from Zerodha Coin and CAMS formats', () => {
    const coinHeaders = ['tradingsymbol', 'isin', 'trade_date', 'quantity', 'price'];
    const mapping = guessFieldMappings(coinHeaders);

    expect(mapping.name).toBe('tradingsymbol');
    expect(mapping.isin).toBe('isin');
    expect(mapping.date).toBe('trade_date');
    expect(mapping.units).toBe('quantity');
    expect(mapping.price).toBe('price');
  });

  it('identifies duplicate lots based on ISIN and trade details', () => {
    const tradeDate = new Date('2024-05-10').getTime();
    const existingLot: InvestmentLot = {
      id: 'lot_1',
      account_id: 'acc_1',
      symbol: 'INF879O01019',
      isin: 'INF879O01019',
      name: 'Parag Parikh Flexi Cap Fund',
      asset_class: 'EQUITY_MF',
      purchase_date: tradeDate,
      units_original: 100,
      units_remaining: 100,
      purchase_price_paise: 5000,
      fees_paise: 0,
      status: 'ACTIVE',
      created_at: tradeDate,
      updated_at: tradeDate,
      version: 1,
    };

    const duplicateCandidate = {
      isin: 'INF879O01019',
      units: 100,
    };

    expect(isMFLotDuplicate(duplicateCandidate, existingLot, tradeDate, 5000)).toBe(true);

    const differentUnitsCandidate = {
      isin: 'INF879O01019',
      units: 250,
    };

    expect(isMFLotDuplicate(differentUnitsCandidate, existingLot, tradeDate, 5000)).toBe(false);
  });
});
