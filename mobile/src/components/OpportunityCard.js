import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './ui/Card';
import Badge from './ui/Badge';
import colors from '../theme/colors';
import spacing from '../theme/spacing';
import typography from '../theme/typography';

/**
 * Reusable Opportunity Card
 * Used in Discover, Dashboard recommendations, and Applications screens.
 */
const OpportunityCard = ({ opportunity, onPress }) => {
  const {
    title,
    company,
    employer,
    location,
    type,
    skills,
    requiredSkills,
    compensation,
    matchScore,
  } = opportunity;

  const displayCompany  = company || employer?.fullName || employer?.company || 'Company';
  const displayLocation = location || 'Uganda';
  const displayType     = type || 'formal';
  const displaySkills   = skills || requiredSkills || [];

  // Map job type to badge variant
  const badgeVariant = {
    formal:         'filled',
    contract:       'match',
    freelance:      'active',
    apprenticeship: 'draft',
  }[displayType] ?? 'draft';

  return (
    <Card onPress={onPress} style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Text style={styles.company} numberOfLines={1}>{displayCompany}</Text>
        </View>

        {matchScore != null && (
          <View style={styles.matchBadge}>
            <Text style={styles.matchText}>{Math.round(matchScore)}%</Text>
          </View>
        )}
      </View>

      {/* Meta */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.metaText}>{displayLocation}</Text>
        </View>
        {compensation && (
          <View style={styles.metaItem}>
            <Ionicons name="cash-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.metaText}>
              {compensation.min && compensation.max
                ? `${compensation.min.toLocaleString()}–${compensation.max.toLocaleString()} UGX`
                : compensation.amount
                ? `${compensation.amount.toLocaleString()} UGX`
                : 'Negotiable'}
            </Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.skillsRow}>
          {displaySkills.slice(0, 3).map((skill, i) => {
            const name = typeof skill === 'string' ? skill : skill.name ?? skill.skill;
            return (
              <View key={i} style={styles.skillChip}>
                <Text style={styles.skillChipText}>{name}</Text>
              </View>
            );
          })}
          {displaySkills.length > 3 && (
            <Text style={styles.moreSkills}>+{displaySkills.length - 3}</Text>
          )}
        </View>

        <Badge variant={badgeVariant}>
          {displayType.charAt(0).toUpperCase() + displayType.slice(1)}
        </Badge>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing[3],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  titleSection: {
    flex: 1,
    marginRight: spacing[3],
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  company: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  matchBadge: {
    backgroundColor: colors.primaryBg,
    borderRadius: spacing.radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderWidth: 1,
    borderColor: colors.primary,
  },
  matchText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  metaText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: spacing[2],
    alignItems: 'center',
  },
  skillChip: {
    backgroundColor: colors.divider,
    borderRadius: spacing.radius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  skillChipText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  moreSkills: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});

export default OpportunityCard;
