import React from 'react';
import { useParams } from 'react-router-dom';
import { HoldingsTable } from './HoldingsTable';

export function MutualFunds() {
  const { accountId } = useParams();
  return (
    <HoldingsTable
      accountId={accountId}
      assetClasses={['EQUITY_MF', 'INDEX_MF', 'DEBT_MF', 'LIQUID_MF', 'GOLD_MF']}
      title="Mutual Funds"
      defaultClass="EQUITY_MF"
      allowedClasses={['EQUITY_MF', 'INDEX_MF', 'DEBT_MF', 'LIQUID_MF', 'GOLD_MF']}
      addLotTitle="Add MF Lot"
      addLotAccountTypes={['MF']}
    />
  );
}

export default MutualFunds;
