/**
 * SBOUP Mobile Design System — Color Tokens
 * Single source of truth for all colors across the mobile app.
 */
const colors = {
  // Brand
  primary:      '#F97316',
  primaryDark:  '#EA6C0A',
  primaryLight: '#FED7AA',
  primaryBg:    '#FFF7ED',   // very light orange tint for backgrounds

  // Surfaces
  background:   '#F9FAFB',
  surface:      '#FFFFFF',
  border:       '#E5E7EB',
  divider:      '#F3F4F6',

  // Text
  textPrimary:   '#111827',
  textSecondary: '#6B7280',
  textMuted:     '#9CA3AF',
  textInverse:   '#FFFFFF',

  // Semantic
  success:      '#10B981',
  successBg:    '#D1FAE5',
  successText:  '#065F46',

  warning:      '#F59E0B',
  warningBg:    '#FEF3C7',
  warningText:  '#D97706',

  error:        '#EF4444',
  errorBg:      '#FEF2F2',
  errorText:    '#DC2626',

  info:         '#3B82F6',
  infoBg:       '#DBEAFE',
  infoText:     '#1E40AF',

  // Badge variants
  badge: {
    active: { bg: '#D1FAE5', text: '#065F46' },
    filled: { bg: '#DBEAFE', text: '#1E40AF' },
    draft:  { bg: '#F3F4F6', text: '#374151' },
    match:  { bg: '#FED7AA', text: '#C2410C' },
  },

  // Misc
  overlay:      'rgba(0,0,0,0.4)',
  shadow:       '#000000',
};

export default colors;
