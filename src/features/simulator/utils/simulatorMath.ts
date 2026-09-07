export interface SIPInputs {
  lumpsum: number;
  monthly: number;
  rate: number;
  tenureMonths: number;
  stepUpPercent: number;
  inflationRate: number;
  showFireTarget: boolean;
  fireTarget: number;
}

export interface SIPRow {
  year: number;
  yearLabel: string;
  principal: number;
  returns: number;
  wealth: number;
  realWealth: number;
}

export interface SIPResult {
  rows: SIPRow[];
  finalWealth: number;
  finalPrincipal: number;
  finalReturns: number;
  finalRealWealth: number;
  fireReachedMonth: number;
}

export function calculateSIP({
  lumpsum,
  monthly,
  rate,
  tenureMonths,
  stepUpPercent,
  inflationRate,
  showFireTarget,
  fireTarget,
}: SIPInputs): SIPResult {
  const rows: SIPRow[] = [];
  let totalSipWealth = lumpsum;
  let totalSipPrincipal = lumpsum;
  const yearlyRate = rate / 100;
  const monthlyRate = yearlyRate / 12;
  const yearlyInflation = inflationRate / 100;

  const realYearlyRate = ((1 + yearlyRate) / (1 + yearlyInflation)) - 1;
  const realMonthlyRate = realYearlyRate / 12;
  let totalRealWealth = lumpsum;

  let currentMonthlySip = monthly;

  // Add year 0
  rows.push({
    year: 0,
    yearLabel: 'Now',
    principal: lumpsum,
    wealth: lumpsum,
    realWealth: lumpsum,
    returns: 0,
  });

  let fireReachedMonth = -1;

  for (let m = 1; m <= tenureMonths; m++) {
    totalSipWealth = (totalSipWealth + currentMonthlySip) * (1 + monthlyRate);
    totalRealWealth = (totalRealWealth + currentMonthlySip) * (1 + realMonthlyRate);
    totalSipPrincipal += currentMonthlySip;

    if (showFireTarget && totalSipWealth >= fireTarget && fireReachedMonth === -1) {
      fireReachedMonth = m;
    }

    if (m % 12 === 0 || m === tenureMonths) {
      const yearIndex = Math.ceil(m / 12);
      const yearLabel = m % 12 === 0 ? `Year ${yearIndex}` : `Year ${yearIndex} (${m % 12}mo)`;

      rows.push({
        year: yearIndex,
        yearLabel,
        principal: totalSipPrincipal,
        wealth: Math.round(totalSipWealth),
        realWealth: Math.round(totalRealWealth),
        returns: Math.round(totalSipWealth - totalSipPrincipal),
      });

      // Apply annual step up if not the final month
      if (m % 12 === 0 && m !== tenureMonths && stepUpPercent > 0) {
        currentMonthlySip += Math.round(currentMonthlySip * (stepUpPercent / 100));
      }
    }
  }

  return {
    rows,
    finalWealth: Math.round(totalSipWealth),
    finalPrincipal: totalSipPrincipal,
    finalReturns: Math.round(totalSipWealth - totalSipPrincipal),
    finalRealWealth: Math.round(totalRealWealth),
    fireReachedMonth,
  };
}

export interface LoanInputs {
  principal: number;
  rate: number;
  tenureMonths: number;
  downPayment: number;
  monthlyPrepayment: number;
  annualPrepayment: number;
}

export interface AmortizationRow {
  year: number;
  yearLabel: string;
  openingBal: number;
  principalPaid: number;
  interestPaid: number;
  closingBal: number;
  cumPrincipal: number;
  cumInterest: number;
  closingBalPrepay: number;
}

export interface LoanResult {
  emi: number;
  totalPayment: number;
  totalInterest: number;
  schedule: AmortizationRow[];
  interestSaved: number;
  monthsSaved: number;
  prepayMonths: number;
}

export function calculateLoanAmortization({
  principal,
  rate,
  tenureMonths,
  downPayment,
  monthlyPrepayment,
  annualPrepayment,
}: LoanInputs): LoanResult {
  const actualLoanAmount = Math.max(0, principal - downPayment);
  const r = (rate / 12) / 100;

  const emi = r > 0
    ? Math.round(actualLoanAmount * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1))
    : Math.round(actualLoanAmount / (tenureMonths || 1));

  const totalPayment = emi * tenureMonths + downPayment;
  const totalInterest = (emi * tenureMonths) - actualLoanAmount;

  const schedule: AmortizationRow[] = [];

  let currentBalance = actualLoanAmount;
  let currentPrepayBalance = actualLoanAmount;
  let cumPrincipalAmt = 0;
  let cumInterestAmt = 0;

  let prepayCumPrincipal = 0;
  let prepayCumInterest = 0;
  let prepayMonths = 0;
  let hasPrepaidClosed = false;

  // Year 0 starting balance
  schedule.push({
    year: 0,
    yearLabel: 'Start',
    openingBal: actualLoanAmount,
    principalPaid: 0,
    interestPaid: 0,
    closingBal: actualLoanAmount,
    cumPrincipal: 0,
    cumInterest: 0,
    closingBalPrepay: actualLoanAmount,
  });

  for (let m = 1; m <= tenureMonths; m++) {
    // --- Base Loan Calculations ---
    const interestForMonth = Math.round(currentBalance * r);
    const principalForMonth = Math.min(currentBalance, emi - interestForMonth);
    const balanceBefore = currentBalance;
    currentBalance = Math.max(0, currentBalance - principalForMonth);
    cumPrincipalAmt += principalForMonth;
    cumInterestAmt += interestForMonth;

    // --- Prepaid Loan Calculations ---
    if (!hasPrepaidClosed) {
      prepayMonths++;
      const prepayInterest = Math.round(currentPrepayBalance * r);
      const prepayEmiPart = Math.min(currentPrepayBalance + prepayInterest, emi);
      let prepayPrincipal = prepayEmiPart - prepayInterest;

      currentPrepayBalance = Math.max(0, currentPrepayBalance - prepayPrincipal);

      // Monthly prepayment
      if (currentPrepayBalance > 0 && monthlyPrepayment > 0) {
        const extra = Math.min(currentPrepayBalance, monthlyPrepayment);
        currentPrepayBalance -= extra;
        prepayPrincipal += extra;
      }

      // Annual prepayment
      if (m % 12 === 0 && currentPrepayBalance > 0 && annualPrepayment > 0) {
        const extra = Math.min(currentPrepayBalance, annualPrepayment);
        currentPrepayBalance -= extra;
        prepayPrincipal += extra;
      }

      prepayCumPrincipal += prepayPrincipal;
      prepayCumInterest += prepayInterest;

      if (currentPrepayBalance <= 0) {
        hasPrepaidClosed = true;
      }
    }

    const yearIndex = Math.ceil(m / 12);
    let existingRow = schedule.find(row => row.year === yearIndex);

    if (!existingRow) {
      existingRow = {
        year: yearIndex,
        yearLabel: `Year ${yearIndex}`,
        openingBal: balanceBefore,
        principalPaid: principalForMonth,
        interestPaid: interestForMonth,
        closingBal: currentBalance,
        cumPrincipal: cumPrincipalAmt,
        cumInterest: cumInterestAmt,
        closingBalPrepay: currentPrepayBalance,
      };
      schedule.push(existingRow);
    } else {
      existingRow.principalPaid += principalForMonth;
      existingRow.interestPaid += interestForMonth;
      existingRow.closingBal = currentBalance;
      existingRow.cumPrincipal = cumPrincipalAmt;
      existingRow.cumInterest = cumInterestAmt;
      existingRow.closingBalPrepay = currentPrepayBalance;
    }
  }

  const interestSaved = Math.max(0, totalInterest - prepayCumInterest);
  const monthsSaved = Math.max(0, tenureMonths - prepayMonths);

  return {
    emi,
    totalPayment,
    totalInterest,
    schedule,
    interestSaved,
    monthsSaved,
    prepayMonths,
  };
}

export interface CompareInputs {
  extraMonthly: number;
  loanAmount: number;
  loanRate: number;
  loanTenureMonths: number;
  investRate: number;
}

export interface CompareRow {
  year: number;
  yearLabel: string;
  wealthA: number;
  wealthB: number;
  loanBalanceA: number;
  loanBalanceB: number;
}

export interface CompareResult {
  schedule: CompareRow[];
  finalWealthA: number;
  finalWealthB: number;
  totalInterestCompareA: number;
  totalInterestCompareB: number;
  optionAClosedMonth: number;
}

export function calculateComparison({
  extraMonthly,
  loanAmount,
  loanRate,
  loanTenureMonths,
  investRate,
}: CompareInputs): CompareResult {
  const schedule: CompareRow[] = [];
  const compareLoanR = (loanRate / 12) / 100;

  const compareEmi = compareLoanR > 0
    ? Math.round(loanAmount * compareLoanR * Math.pow(1 + compareLoanR, loanTenureMonths) / (Math.pow(1 + compareLoanR, loanTenureMonths) - 1))
    : Math.round(loanAmount / (loanTenureMonths || 1));

  const compareInvestR = (investRate / 100) / 12;

  let loanBalA = loanAmount;
  let loanBalB = loanAmount;
  let wealthA = 0;
  let wealthB = 0;
  let optionAClosedMonth = -1;
  let totalInterestCompareA = 0;
  let totalInterestCompareB = 0;

  // Month 0
  schedule.push({
    year: 0,
    yearLabel: 'Start',
    wealthA: 0,
    wealthB: 0,
    loanBalanceA: loanAmount,
    loanBalanceB: loanAmount,
  });

  for (let m = 1; m <= loanTenureMonths; m++) {
    // --- Option B: Normal EMI + Invest the Difference ---
    const interestB = Math.round(loanBalB * compareLoanR);
    const emiB = Math.min(loanBalB + interestB, compareEmi);
    loanBalB = Math.max(0, loanBalB - (emiB - interestB));
    totalInterestCompareB += interestB;
    wealthB = (wealthB + extraMonthly) * (1 + compareInvestR);

    // --- Option A: Prepay accelerating first, then invest entire EMI + Extra ---
    const interestA = Math.round(loanBalA * compareLoanR);
    const totalPaymentA = Math.min(loanBalA + interestA, compareEmi + extraMonthly);
    loanBalA = Math.max(0, loanBalA - (totalPaymentA - interestA));
    totalInterestCompareA += interestA;

    let moneyToInvestA = 0;
    if (loanBalA <= 0) {
      if (optionAClosedMonth === -1) {
        optionAClosedMonth = m;
      }
      const maxBudget = compareEmi + extraMonthly;
      moneyToInvestA = Math.max(0, maxBudget - totalPaymentA);
    }

    wealthA = (wealthA + moneyToInvestA) * (1 + compareInvestR);

    // Year end rollup
    if (m % 12 === 0 || m === loanTenureMonths) {
      const yearIndex = Math.ceil(m / 12);
      schedule.push({
        year: yearIndex,
        yearLabel: `Year ${yearIndex}`,
        wealthA: Math.round(wealthA),
        wealthB: Math.round(wealthB),
        loanBalanceA: loanBalA,
        loanBalanceB: loanBalB,
      });
    }
  }

  return {
    schedule,
    finalWealthA: Math.round(wealthA),
    finalWealthB: Math.round(wealthB),
    totalInterestCompareA,
    totalInterestCompareB,
    optionAClosedMonth,
  };
}
