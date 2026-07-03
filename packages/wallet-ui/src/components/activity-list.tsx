import type { Chain } from '@stackr/models';
import { Col, Label, Panel, Row, Value } from '../primitives.js';
import {
  formatRelativeTime,
  formatSignedAmount,
  HIDDEN_VALUE,
  truncateAddress,
} from '../format.js';
import { ChainBadge } from './chain-badge.js';

export interface ActivityItem {
  id: string;
  chain: Chain;
  direction: 'send' | 'receive';
  /** Display-ready decimal amount. */
  amount: string;
  symbol: string;
  /** ISO timestamp of the transaction. */
  timestamp: string;
  status: 'pending' | 'confirmed' | 'failed';
  counterparty?: string;
}

export interface ActivityRowProps {
  item: ActivityItem;
  /** Clock input for relative timestamps — pass `new Date()` at render time. */
  now: Date;
  hidden?: boolean;
}

function statusTone(status: ActivityItem['status'], direction: ActivityItem['direction']) {
  if (status === 'failed') {
    return 'negative';
  }
  if (status === 'pending') {
    return 'warning';
  }
  return direction === 'receive' ? 'positive' : 'default';
}

export function ActivityRow({ item, now, hidden = false }: ActivityRowProps) {
  return (
    <Row justifyContent="space-between" paddingVertical="$3" gap="$3">
      <Col gap="$1" flexShrink={1}>
        <ChainBadge chain={item.chain} />
        {item.counterparty !== undefined ? (
          <Label>
            {item.direction === 'receive' ? 'from' : 'to'} {truncateAddress(item.counterparty)}
          </Label>
        ) : null}
      </Col>
      <Col gap="$1" alignItems="flex-end">
        <Value tone={statusTone(item.status, item.direction)}>
          {hidden ? HIDDEN_VALUE : formatSignedAmount(item.direction, item.amount, item.symbol)}
        </Value>
        <Label>
          {item.status === 'confirmed' ? formatRelativeTime(item.timestamp, now) : item.status}
        </Label>
      </Col>
    </Row>
  );
}

export interface ActivityListProps {
  items: ActivityItem[];
  now: Date;
  hidden?: boolean;
  emptyMessage?: string;
}

/** The wallet's second surface: a flat, newest-first transaction feed. */
export function ActivityList({
  items,
  now,
  hidden = false,
  emptyMessage = 'No activity yet',
}: ActivityListProps) {
  if (items.length === 0) {
    return (
      <Panel alignItems="center" paddingVertical="$8">
        <Label>{emptyMessage}</Label>
      </Panel>
    );
  }

  return (
    <Panel paddingVertical="$1">
      {items.map(item => (
        <ActivityRow key={item.id} item={item} now={now} hidden={hidden} />
      ))}
    </Panel>
  );
}
