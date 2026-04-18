import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Badge, Avatar } from '../../components/ui';
import { layout, text, feedback } from '../../styles';
import colors from '../../theme/colors';
import spacing from '../../theme/spacing';
import typography from '../../theme/typography';

// ─── Dummy Data ───────────────────────────────────────────────────────────────
const STATS = { activePostings: 5, totalApplications: 34 };

const POSTINGS = [
  { _id: '1', title: 'Senior Frontend Engineer', postedAgo: '2 days ago', appCount: 12, icon: '</>' },
  { _id: '2', title: 'Product Designer',          postedAgo: '5 days ago', appCount: 8,  icon: '✏️' },
  { _id: '3', title: 'Backend Engineer',           postedAgo: '1 week ago', appCount: 14, icon: '⚙️' },
];

const CANDIDATES = [
  {
    _id: '1',
    name: 'Amina Jumbe',
    role: 'React Developer',
    yearsExp: 4,
    matchScore: 95,
    skills: ['TYPESCRIPT', 'TAILWIND'],
  },
  {
    _id: '2',
    name: 'Kevin Otiero',
    role: 'UI/UX Designer',
    yearsExp: 3,
    matchScore: 92,
    skills: ['FIGMA', 'UX'],
  },
];

// ─── Posting Card ─────────────────────────────────────────────────────────────
const PostingCard = ({ posting, onPress }) => (
  <Card onPress={onPress} style={styles.postingCard}>
    <View style={styles.postingIcon}>
      <Text style={styles.postingIconText}>{posting.icon}</Text>
    </View>

    <Badge variant="match" style={{ marginBottom: spacing[2] }}>
      {posting.appCount} Apps
    </Badge>

    <Text style={styles.postingTitle} numberOfLines={2}>
      {posting.title}
    </Text>
    <Text style={styles.postingDate}>Posted {posting.postedAgo}</Text>

    <TouchableOpacity onPress={onPress} style={{ marginTop: spacing[2] }}>
      <Text style={styles.viewApplicantsLink}>View Applicants →</Text>
    </TouchableOpacity>
  </Card>
);

// ─── Candidate Card ───────────────────────────────────────────────────────────
const CandidateCard = ({ candidate, onView, onShortlist }) => (
  <Card style={styles.candidateCard}>
    <View style={layout.row}>
      <Avatar
        name={candidate.name}
        size="lg"
        style={{ marginRight: spacing[3] }}
      />

      <View style={{ flex: 1 }}>
        <View style={[layout.row, { flexWrap: 'wrap', gap: spacing[2] }]}>
          <Text style={styles.candidateName}>
            {candidate.name.length > 10
              ? candidate.name.slice(0, 10) + '...'
              : candidate.name}
          </Text>
          <Badge variant="match">{candidate.matchScore}% Match</Badge>
        </View>

        <Text style={styles.candidateRole}>
          {candidate.role} • {candidate.yearsExp} yrs exp
        </Text>

        <View style={styles.skillsRow}>
          {candidate.skills.map((s) => (
            <View key={s} style={styles.skillChip}>
              <Text style={styles.skillChipText}>{s}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.candidateActions}>
        <TouchableOpacity onPress={onView} style={styles.viewBtn}>
          <Text style={styles.viewBtnText}>VIEW</Text>
        </TouchableOpacity>
        <Button size="sm" onPress={onShortlist} style={{ marginTop: spacing[2] }}>
          Shortlist
        </Button>
      </View>
    </View>
  </Card>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
const EmployerDashboardScreen = ({ navigation }) => {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <SafeAreaView style={layout.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerBtn}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('ProfileTab', { screen: 'Notifications' })}
            style={styles.headerBtn}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={24} color={colors.textPrimary} />
            {/* unread dot */}
            <View style={styles.notifDot} />
          </TouchableOpacity>
        </View>

        {/* ── Greeting ── */}
        <View style={{ marginBottom: spacing[5] }}>
          <Text style={styles.greeting}>{greeting}, John!</Text>
          <Text style={text.bodySmall}>Talent Acquisition Manager</Text>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statNumberOrange}>{STATS.activePostings}</Text>
            <Text style={styles.statLabel}>ACTIVE{'\n'}POSTINGS</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statNumberDark}>{STATS.totalApplications}</Text>
            <Text style={styles.statLabel}>TOTAL{'\n'}APPLICATIONS</Text>
          </Card>
        </View>

        {/* ── Quick Actions ── */}
        <View style={styles.actionsRow}>
          <Button
            style={styles.actionBtn}
            onPress={() => navigation.navigate('PostTab')}
          >
            + Post Opportunity
          </Button>
          <Button
            variant="secondary"
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ViewApplications')}
          >
            View Applications
          </Button>
        </View>

        {/* ── Active Postings ── */}
        <View style={styles.sectionHeader}>
          <Text style={text.sectionTitle}>Your Active Postings</Text>
          <TouchableOpacity onPress={() => navigation.navigate('ManageOpportunities')}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={POSTINGS}
          keyExtractor={(item) => item._id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing[2] }}
          style={{ marginBottom: spacing[6] }}
          renderItem={({ item }) => (
            <PostingCard
              posting={item}
              onPress={() =>
                navigation.navigate('ViewApplications', {
                  opportunityId: item._id,
                  opportunityTitle: item.title,
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={{ width: spacing[3] }} />}
        />

        {/* ── Top Candidates ── */}
        <View style={styles.sectionHeader}>
          <Text style={text.sectionTitle}>Top Candidates This Week</Text>
          <TouchableOpacity onPress={() => navigation.navigate('ViewApplications')}>
            <Text style={styles.seeAll}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={{ gap: spacing[3] }}>
          {CANDIDATES.map((c) => (
            <CandidateCard
              key={c._id}
              candidate={c}
              onView={() => navigation.navigate('ProfileTab', { screen: 'Profile' })}
              onShortlist={() => {}}
            />
          ))}
        </View>
      </ScrollView>

      {/* ── Bottom Nav ── */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="home" size={24} color={colors.primary} />
          <Text style={[styles.navLabel, { color: colors.primary }]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('ManageOpportunities')}
        >
          <Ionicons name="people-outline" size={24} color={colors.textMuted} />
          <Text style={styles.navLabel}>Market</Text>
        </TouchableOpacity>

        {/* FAB */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('PostTab')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={30} color={colors.textInverse} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('MessagesTab')}
        >
          <Ionicons name="chatbubble-outline" size={24} color={colors.textMuted} />
          <Text style={styles.navLabel}>Inbox</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('ProfileTab', { screen: 'Profile' })}
        >
          <Ionicons name="person-circle-outline" size={24} color={colors.textMuted} />
          <Text style={styles.navLabel}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 100,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
  },
  headerBtn: {
    width: spacing.touchTarget,
    height: spacing.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },

  // Greeting
  greeting: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  statCard: {
    flex: 1,
    paddingVertical: spacing[4],
  },
  statNumberOrange: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.primary,
    lineHeight: typography.size['3xl'] * 1.1,
  },
  statNumberDark: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    lineHeight: typography.size['3xl'] * 1.1,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: spacing[1],
    letterSpacing: 0.5,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[6],
  },
  actionBtn: {
    flex: 1,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  seeAll: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },

  // Posting card
  postingCard: {
    width: 200,
  },
  postingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  postingIconText: {
    fontSize: typography.size.base,
  },
  postingTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  postingDate: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  viewApplicantsLink: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },

  // Candidate card
  candidateCard: {
    marginBottom: 0,
  },
  candidateName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  candidateRole: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
    marginTop: spacing[2],
  },
  skillChip: {
    backgroundColor: colors.divider,
    borderRadius: spacing.radius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  skillChipText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  candidateActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing[2],
  },
  viewBtn: {
    minHeight: spacing.touchTarget,
    justifyContent: 'flex-start',
    paddingTop: spacing[1],
  },
  viewBtnText: {
    fontSize: typography.size.xs,
    color: colors.primary,
    fontWeight: typography.weight.bold,
  },

  // Bottom nav
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: spacing[2],
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: spacing.touchTarget,
    minHeight: spacing.touchTarget,
  },
  navLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: typography.weight.medium,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: spacing[4],
  },
});

export default EmployerDashboardScreen;
