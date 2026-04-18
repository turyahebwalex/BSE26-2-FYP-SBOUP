/**
 * SBOUP Mobile Design System — Typography Tokens
 */
const typography = {
  // Font family (loaded via Expo — system fallback is fine for RN)
  fontFamily: {
    regular:  'System',
    medium:   'System',
    semibold: 'System',
    bold:     'System',
  },

  // Font sizes
  size: {
    xs:   11,
    sm:   13,
    base: 15,
    md:   16,
    lg:   18,
    xl:   20,
    '2xl': 24,
    '3xl': 30,
  },

  // Font weights (React Native uses string weights)
  weight: {
    regular:  '400',
    medium:   '500',
    semibold: '600',
    bold:     '700',
  },

  // Line heights
  lineHeight: {
    tight:   1.2,
    normal:  1.5,
    relaxed: 1.75,
  },
};

export default typography;
