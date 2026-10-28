import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { avatarRadius, useColors } from '@/lib/theme';

/** The app icon's sparkle and dot on a brand squircle, for the Discover header and sign-in. */
export function BrandMark({ size = 34 }: { size?: number }) {
  const c = useColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: avatarRadius(size),
        backgroundColor: c.tint,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Svg width={size * 0.7} height={size * 0.7} viewBox="0 0 24 24">
        <Path d="M10 3C10.8 8.2 13.8 11.2 19 12C13.8 12.8 10.8 15.8 10 21C9.2 15.8 6.2 12.8 1 12C6.2 11.2 9.2 8.2 10 3Z" fill={c.onTint} />
        <Circle cx={20} cy={5} r={2.6} fill={c.accent} />
      </Svg>
    </View>
  );
}
