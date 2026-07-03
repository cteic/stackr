import { styled, Text, View } from 'tamagui';

/**
 * Base building blocks for the wallet surfaces. Everything imports from
 * `tamagui` only (never `react-native`) so the package typechecks and
 * unit-tests without a native runtime; Tamagui resolves to RN primitives in
 * the app and to DOM on web.
 */

export const Screen = styled(View, {
  flex: 1,
  backgroundColor: '$background',
  padding: '$4',
});

export const Panel = styled(View, {
  backgroundColor: '$card',
  borderWidth: 1,
  borderColor: '$border',
  padding: '$4',
});

export const Row = styled(View, {
  flexDirection: 'row',
  alignItems: 'center',
});

export const Col = styled(View, {
  flexDirection: 'column',
});

/** Uppercase micro-label, the terminal look's section headers. */
export const Label = styled(Text, {
  color: '$mutedForeground',
  fontFamily: '$mono',
  fontSize: '$2',
  letterSpacing: 1,
  textTransform: 'uppercase',
});

export const Value = styled(Text, {
  color: '$foreground',
  fontFamily: '$mono',
  fontSize: '$4',

  variants: {
    tone: {
      default: { color: '$foreground' },
      muted: { color: '$mutedForeground' },
      positive: { color: '$success' },
      negative: { color: '$destructive' },
      warning: { color: '$warning' },
    },
    emphasis: {
      true: { fontSize: '$7', fontWeight: '600' },
    },
  } as const,

  defaultVariants: {
    tone: 'default',
  },
});

export const ActionButton = styled(View, {
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: '$3',
  paddingHorizontal: '$4',
  borderWidth: 1,
  cursor: 'pointer',

  variants: {
    tone: {
      primary: {
        backgroundColor: '$primary',
        borderColor: '$primary',
      },
      danger: {
        backgroundColor: '$background',
        borderColor: '$destructive',
      },
      ghost: {
        backgroundColor: '$background',
        borderColor: '$border',
      },
    },
    disabled: {
      true: { opacity: 0.5, pointerEvents: 'none' },
    },
  } as const,

  defaultVariants: {
    tone: 'ghost',
  },
});

export const ActionButtonText = styled(Text, {
  fontFamily: '$mono',
  fontSize: '$3',
  letterSpacing: 1,
  textTransform: 'uppercase',

  variants: {
    tone: {
      primary: { color: '$primaryForeground' },
      danger: { color: '$destructive' },
      ghost: { color: '$foreground' },
    },
  } as const,

  defaultVariants: {
    tone: 'ghost',
  },
});
