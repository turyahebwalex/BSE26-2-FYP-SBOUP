import { StyleSheet } from 'react-native';
import colors from '../theme/colors';
import spacing from '../theme/spacing';
import typography from '../theme/typography';

/**
 * SBOUP Mobile — Global Shared Styles
 *
 * Import what you need in any screen:
 *   import { layout, text, form, card, badge } from '../../styles/globalStyles';
 */

// ── Layout ──────────────────────────────────────────────────────────────────
export const layout = StyleSheet.create({
  // Full-screen safe container
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Centered loading / empty state
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  // Standard horizontal padding used on all screens
  container: {
    paddingHorizontal: spacing.screenPadding,
  },
  // Scroll content padding
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing[8],
  },
  // Row with space-between
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Divider line
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing[4],
  },
});

// ── Typography ───────────────────────────────────────────────────────────────
export const text = StyleSheet.create({
  // Headings
  h1: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  h2: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  h3: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  h4: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  // Body
  body: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.regular,
    color: colors.textPrimary,
  },
  bodySmall: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.regular,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.regular,
    color: colors.textMuted,
  },
  // Labels
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textPrimary,
  },
  // Links / CTAs
  link: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  // Section title (used above lists/cards)
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[3],
  },
  // Brand name
  brand: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.primary,
    letterSpacing: 1,
  },
  // Error text
  error: {
    fontSize: typography.size.xs,
    color: colors.error,
  },
  // Muted helper text
  muted: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
});

// ── Cards ────────────────────────────────────────────────────────────────────
export const card = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  // Compact card (less padding)
  compact: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  // Stat card (used in dashboards)
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing[4],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
});

// ── Forms ────────────────────────────────────────────────────────────────────
export const form = StyleSheet.create({
  // Wraps a label + input pair
  group: {
    marginBottom: spacing[4],
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.size.base,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    minHeight: spacing.touchTarget,
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  inputError: {
    borderColor: colors.error,
    borderWidth: 2,
  },
  errorText: {
    marginTop: spacing[1],
    fontSize: typography.size.xs,
    color: colors.error,
  },
  helperText: {
    marginTop: spacing[1],
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});

// ── Badges ───────────────────────────────────────────────────────────────────
export const badge = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: spacing.radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  label: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  // Preset variants (apply bg/text color separately from colors.badge)
  active: { backgroundColor: colors.badge.active.bg },
  filled: { backgroundColor: colors.badge.filled.bg },
  draft:  { backgroundColor: colors.badge.draft.bg },
  match:  { backgroundColor: colors.badge.match.bg },
});

// ── Feedback States ──────────────────────────────────────────────────────────
export const feedback = StyleSheet.create({
  // Empty state container
  empty: {
    alignItems: 'center',
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[6],
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginTop: spacing[3],
    marginBottom: spacing[2],
    textAlign: 'center',
  },
  emptyText: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  // Inline error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBg,
    borderRadius: spacing.radius.md,
    padding: spacing[3],
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  errorBannerText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.error,
  },
  // Success banner
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderRadius: spacing.radius.md,
    padding: spacing[3],
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  successBannerText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.successText,
  },
});

// ── Navigation / Header ──────────────────────────────────────────────────────
export const nav = StyleSheet.create({
  // Screen header row
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing[4],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  // Back button touch area
  backButton: {
    minWidth: spacing.touchTarget,
    minHeight: spacing.touchTarget,
    justifyContent: 'center',
  },
  // Tab bar (used in WorkerTabs / EmployerTabs options)
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 6,
    paddingTop: 6,
    height: 60,
  },
  tabBarLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
});
