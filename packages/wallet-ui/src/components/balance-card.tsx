import { chainMeta, type Chain } from '@stackr/models';
import { Col, Label, Panel, Row, Value } from '../primitives.js';
import { HIDDEN_VALUE, truncateAddress } from '../format.js';
import { ChainBadge } from './chain-badge.js';

export interface BalanceCardProps {
  chain: Chain;
  /** Display-ready decimal balance (base-unit math happens in services). */
  balance: string;
  /** Display-ready fiat value, already currency-formatted. */
  fiatValue?: string;
  address?: string;
  /** Privacy mode: mask every amount. */
  hidden?: boolean;
}

/** One chain's balance — the wallet home screen is a stack of these. */
export function BalanceCard({
  chain,
  balance,
  fiatValue,
  address,
  hidden = false,
}: BalanceCardProps) {
  const { symbol } = chainMeta[chain];

  return (
    <Panel gap="$3">
      <Row justifyContent="space-between">
        <ChainBadge chain={chain} />
        {address !== undefined ? <Label>{truncateAddress(address)}</Label> : null}
      </Row>
      <Col gap="$1">
        <Value emphasis>{hidden ? HIDDEN_VALUE : `${balance} ${symbol}`}</Value>
        {fiatValue !== undefined ? (
          <Value tone="muted">{hidden ? HIDDEN_VALUE : fiatValue}</Value>
        ) : null}
      </Col>
    </Panel>
  );
}
