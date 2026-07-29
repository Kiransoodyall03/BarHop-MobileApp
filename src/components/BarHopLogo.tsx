import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// Two trimmed, transparent variants derived from assets/icon.png. The store
// icon itself can't be used in-app: it's fully opaque white with dark #033947
// ink, so it renders as a white box on the auth gradient and its wordmark
// disappears against the dark plum surface.
//
// The variants differ ONLY in ink colour (wordmark + glass outline). The
// coral→orange spill is untouched in both — it's already #E63A5B → #F4720F,
// which is `primary` and `buttonGradient`, so the mark carries the palette.
const LOGO_ON_LIGHT = require('../../assets/logo-on-light.png');
const LOGO_ON_DARK = require('../../assets/logo-on-dark.png');

// Intrinsic ratio of the trimmed artwork (1058 × 293). Height is derived from
// width so the lockup can never be squashed by a caller passing both.
const ASPECT_RATIO = 1058 / 293;

interface Props {
  /** Rendered width in dp; height follows the lockup's aspect ratio. */
  width: number;
  style?: StyleProp<ImageStyle>;
}

/** The BarHop wordmark lockup, in whichever ink reads on the current theme. */
export default function BarHopLogo({ width, style }: Props) {
  const { mode } = useTheme();

  return (
    <Image
      source={mode === 'dark' ? LOGO_ON_DARK : LOGO_ON_LIGHT}
      style={[{ width, height: width / ASPECT_RATIO }, style]}
      resizeMode="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="BarHop"
    />
  );
}
