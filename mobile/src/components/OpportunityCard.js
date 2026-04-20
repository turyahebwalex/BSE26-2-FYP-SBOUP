import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const typeBadgeColors = {
  formal: { bg: '#DBEAFE', text: '#1D4ED8' },
  contract: { bg: '#FEF3C7', text: '#D97706' },
  freelance: { bg: '#D1FAE5', text: '#059669' },
  apprenticeship: { bg: '#EDE9FE', text: '#7C3AED' },
};

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

  const displayCompany = company || employer?.fullName || employer?.company || 'Company';
  const displayLocation = location || 'Uganda';
  const displayType = type || 'formal';
  const displaySkills = skills || requiredSkills || [];
  const badge = typeBadgeColors[displayType] || typeBadgeColors.formal;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.company} numberOfLines={1}>
            {displayCompany}
          </Text>
        </View>
        {matchScore != null && (
          <View style={styles.matchBadge}>
            <Text style={styles.matchText}>{Math.round(matchScore)}%</Text>
          </View>
        )}
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={14} color="#6B7280" />
          <Text style={styles.metaText}>{displayLocation}</Text>
        </View>
        {compensation && (
          <View style={styles.metaItem}>
            <Ionicons name="cash-outline" size={14} color="#6B7280" />
            <Text style={styles.metaText}>
              {compensation.min && compensation.max
                ? `${compensation.min.toLocaleString()} - ${compensation.max.toLocaleString()} UGX`
                : compensation.amount
                ? `${compensation.amount.toLocaleString()} UGX`
                : 'Negotiable'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.skillsRow}>
          {displaySkills.slice(0, 3).map((skill, index) => {
            const skillName = typeof skill === 'string' ? skill : skill.name || skill.skill;
            return (
              <View key={index} style={styles.skillChip}>
                <Text style={styles.skillChipText}>{skillName}</Text>
              </View>
            );
          })}
          {displaySkills.length > 3 && (
            <Text style={styles.moreSkills}>+{displaySkills.length - 3}</Text>
          )}
        </View>
        <View style={[styles.typeBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.typeBadgeText, { color: badge.text }]}>
            {displayType.charAt(0).toUpperCase() + displayType.slice(1)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleSection: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  company: {
    fontSize: 13,
    color: '#6B7280',
  },
  matchBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#F97316',
  },
  matchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F97316',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
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
    gap: 6,
    alignItems: 'center',
  },
  skillChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  skillChipText: {
    fontSize: 11,
    color: '#4B5563',
  },
  moreSkills: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  typeBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default OpportunityCard;
