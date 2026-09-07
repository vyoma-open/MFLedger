import { describe, it, expect } from 'vitest';
import { allocateFIFORedemption, type AllocatableLot } from '../fifoAllocator';

describe('domain/fifo: allocateFIFORedemption', () => {
  it('allocates redemption against oldest purchase lots first (FIFO)', () => {
    const d = (year: number, month: number, day: number) =>
      new Date(year, month - 1, day).getTime();

    const lots: AllocatableLot[] = [
      {
        id: 'lot_2',
        purchase_date: d(2024, 6, 1),
        units_remaining: 100,
        purchase_price_paise: 6000, // ₹60.00
      },
      {
        id: 'lot_1',
        purchase_date: d(2023, 1, 1),
        units_remaining: 50,
        purchase_price_paise: 5000, // ₹50.00
      },
    ];

    // Sell 80 units at ₹80.00 on 2024-08-01
    const result = allocateFIFORedemption(lots, {
      units_to_sell: 80,
      sale_price_per_unit_paise: 8000,
      sale_date: d(2024, 8, 1),
      holding_period_months_threshold: 12,
    });

    expect(result.consumed_lots).toHaveLength(2);

    // First consumed: all 50 units from lot_1 (oldest)
    const first = result.consumed_lots[0];
    expect(first.lot_id).toBe('lot_1');
    expect(first.units_consumed).toBe(50);
    expect(first.is_long_term).toBe(true); // Jan 2023 to Aug 2024 > 12m
    expect(first.gain_paise).toBe(50 * (8000 - 5000)); // ₹1,500.00 gain

    // Second consumed: remaining 30 units from lot_2
    const second = result.consumed_lots[1];
    expect(second.lot_id).toBe('lot_2');
    expect(second.units_consumed).toBe(30);
    expect(second.is_long_term).toBe(false); // Jun 2024 to Aug 2024 < 12m

    // Lot status updates
    expect(result.updated_lots).toEqual([
      { id: 'lot_1', units_remaining: 0, status: 'CLOSED', nextVersion: 2 },
      { id: 'lot_2', units_remaining: 70, status: 'ACTIVE', nextVersion: 2 },
    ]);
  });

  it('throws an error if requested units exceed total available units', () => {
    const lots: AllocatableLot[] = [
      {
        id: 'lot_1',
        purchase_date: Date.now(),
        units_remaining: 25,
        purchase_price_paise: 1000,
      },
    ];

    expect(() =>
      allocateFIFORedemption(lots, {
        units_to_sell: 50,
        sale_price_per_unit_paise: 2000,
        sale_date: Date.now(),
      })
    ).toThrowError(/Insufficient units/);
  });
});
