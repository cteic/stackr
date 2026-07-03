import { chainMeta, type Chain } from '@stackr/models';
import { Text, View } from 'tamagui';
import { chainColors } from '../theme/colors.js';
import { Row } from '../primitives.js';

export interface ChainBadgeProps {
  chain: Chain;
}

/** Chain identity: brand-colored square dot + uppercase name. */
export function ChainBadge({ chain }: ChainBadgeProps) {
  return (
    <Row gap="$2">
      <View width={8} height={8} backgroundColor={chainColors[chain]} />
      <Text
        color="$mutedForeground"
        fontFamily="$mono"
        fontSize="$1"
        letterSpacing={1}
        textTransform="uppercase"
      >
        {chainMeta[chain].name}
      </Text>
    </Row>
  );
}
