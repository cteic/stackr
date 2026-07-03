import { useEffect, useMemo, useState } from 'react';
import type { Chain } from '@stackr/models';
import { View } from 'tamagui';
import { ActionButton, ActionButtonText, Col, Label, Panel, Row, Value } from '../primitives.js';
import { createHoldToConfirm } from '../hold-to-confirm.js';
import { ChainBadge } from './chain-badge.js';

export interface SignRequestField {
  label: string;
  value: string;
}

export interface SignRequestSheetProps {
  /** Requesting dapp origin, e.g. `app.uniswap.org`. */
  origin: string;
  chain: Chain;
  /** e.g. `Sign transaction` / `Sign message`. */
  title: string;
  /** One-line human-readable summary of the effect of signing. */
  summary: string;
  /** Decoded payload details — every request renders what is actually signed. */
  fields: SignRequestField[];
  /** Extra caution copy (e.g. unlimited approval detected). */
  warning?: string;
  /** How long approve must be held. */
  holdToConfirmMs?: number;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * The signer surface. Approval is hold-to-confirm — a stray tap can never
 * sign — and the panel always renders the decoded request, never an opaque
 * blob. Presentation (bottom sheet / modal) is the app's concern; this is
 * the content.
 */
export function SignRequestSheet({
  origin,
  chain,
  title,
  summary,
  fields,
  warning,
  holdToConfirmMs = 1200,
  onApprove,
  onReject,
}: SignRequestSheetProps) {
  const [progress, setProgress] = useState(0);

  const hold = useMemo(
    () =>
      createHoldToConfirm({
        holdMs: holdToConfirmMs,
        onConfirm: onApprove,
        onProgress: setProgress,
      }),
    [holdToConfirmMs, onApprove],
  );

  useEffect(() => hold.dispose, [hold]);

  return (
    <Panel gap="$4">
      <Row justifyContent="space-between">
        <ChainBadge chain={chain} />
        <Label>{origin}</Label>
      </Row>

      <Col gap="$2">
        <Value emphasis>{title}</Value>
        <Value tone="muted">{summary}</Value>
      </Col>

      <Col gap="$3">
        {fields.map(field => (
          <Row key={field.label} justifyContent="space-between" gap="$3">
            <Label>{field.label}</Label>
            <Value flexShrink={1} textAlign="right">
              {field.value}
            </Value>
          </Row>
        ))}
      </Col>

      {warning !== undefined ? (
        <Panel borderColor="$warning" gap="$1">
          <Label>warning</Label>
          <Value tone="warning">{warning}</Value>
        </Panel>
      ) : null}

      <Col gap="$2">
        <ActionButton
          tone="primary"
          onPressIn={hold.start}
          onPressOut={hold.cancel}
          testID="sign-approve"
        >
          <ActionButtonText tone="primary">
            {progress > 0 && progress < 1 ? 'keep holding…' : 'hold to approve'}
          </ActionButtonText>
        </ActionButton>
        <View height={2} backgroundColor="$muted">
          <View height={2} width={`${Math.round(progress * 100)}%`} backgroundColor="$primary" />
        </View>
        <ActionButton tone="danger" onPress={onReject} testID="sign-reject">
          <ActionButtonText tone="danger">reject</ActionButtonText>
        </ActionButton>
      </Col>
    </Panel>
  );
}
