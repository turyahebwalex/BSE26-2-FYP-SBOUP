import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { companyAPI, opportunityAPI } from '../../services/api';
import ReportBottomSheet from '../../components/ReportBottomSheet';

// ─── Category badge colours (matches your enum) ──────────────────────────────
const CATEGORY_COLORS = {
  formal:        { bg: '#DBEAFE', text: '#1D4ED8' },
  contract:      { bg: '#FEF3C7', text: '#92400E' },
  freelance:     { bg: '#D1FAE5', text: '#065F46' },
  apprenticeship:{ bg: '#EDE9FE', text: '#5B21B6' },
};

const EXPERIENCE_LABELS = {
  entry: 'Entry Level',
  mid:   'Mid Level',
  senior:'Senior Level',
  any:   'Any Level',
};

// ─── Small helpers ────────────────────────────────────────────────────────────
const formatPay = (range) => {
  if (!range?.min && !range?.max) return null;
  const cur = range.currency || 'UGX';
  const per = range.period ? `/${range.period}` : '';
  if (range.min && range.max)
    return `${cur} ${range.min.toLocaleString()} – ${range.max.toLocaleString()}${per}`;
  if (range.min) return `${cur} ${range.min.toLocaleString()}+${per}`;
  return `Up to ${cur} ${range.max.toLocaleString()}${per}`;
};

const formatDeadline = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const diff = Math.ceil((d - Date.now()) / 86_400_000);
  if (diff < 0)   return 'Closed';
  if (diff === 0) return 'Closes today';
  if (diff === 1) return 'Closes tomorrow';
  if (diff <= 7)  return `Closes in ${diff} days`;
  return `Deadline: ${d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────
const InfoRow = ({ icon, text, onPress, isLink }) => (
  <TouchableOpacity
    style={styles.infoRow}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={onPress ? 0.7 : 1}
  >
    <Ionicons name={icon} size={18} color="#6B7280" />
    <Text style={[styles.infoText, isLink && styles.link]} numberOfLines={1}>
      {text}
    </Text>
  </TouchableOpacity>
);

const VerificationBadge = ({ status }) => {
  const map = {
    verified:   { color: '#10B981', icon: 'checkmark-circle', label: 'Verified' },
    pending:    { color: '#F59E0B', icon: 'time',             label: 'Pending Review' },
    unverified: { color: '#9CA3AF', icon: 'help-circle',      label: 'Unverified' },
    rejected:   { color: '#EF4444', icon: 'close-circle',     label: 'Rejected' },
  };
  const cfg = map[status] || map.unverified;
  return (
    <View style={[styles.verificationBadge, { borderColor: cfg.color }]}>
      <Ionicons name={cfg.icon} size={13} color={cfg.color} />
      <Text style={[styles.verificationText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};

const PositionCard = ({ opportunity, onPress }) => {
  const cat  = CATEGORY_COLORS[opportunity.category] || CATEGORY_COLORS.formal;
  const pay  = formatPay(opportunity.compensationRange);
  const dead = formatDeadline(opportunity.deadline);
  const deadlineExpired = dead === 'Closed';

  return (
    <TouchableOpacity style={styles.positionCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.positionHeader}>
        <Text style={styles.positionTitle} numberOfLines={2}>
          {opportunity.title}
        </Text>
        <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
          <Text style={[styles.categoryText, { color: cat.text }]}>
            {opportunity.category}
          </Text>
        </View>
      </View>

      <View style={styles.positionMeta}>
        {opportunity.location ? (
          <View style={styles.metaPill}>
            <Ionicons name="location-outline" size={12} color="#6B7280" />
            <Text style={styles.metaText}>{opportunity.location}</Text>
          </View>
        ) : null}
        {opportunity.isRemote && (
          <View style={styles.metaPill}>
            <Ionicons name="wifi-outline" size={12} color="#6B7280" />
            <Text style={styles.metaText}>Remote</Text>
          </View>
        )}
        {opportunity.experienceLevel && opportunity.experienceLevel !== 'any' && (
          <View style={styles.metaPill}>
            <Ionicons name="bar-chart-outline" size={12} color="#6B7280" />
            <Text style={styles.metaText}>
              {EXPERIENCE_LABELS[opportunity.experienceLevel]}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.positionFooter}>
        {pay ? (
          <Text style={styles.payText}>{pay}</Text>
        ) : (
          <Text style={styles.payUnknown}>Pay not specified</Text>
        )}
        {dead && (
          <Text style={[styles.deadlineText, deadlineExpired && styles.deadlineExpired]}>
            {dead}
          </Text>
        )}
      </View>

      {opportunity.requiredSkills?.length > 0 && (
        <View style={styles.skillsRow}>
          {opportunity.requiredSkills.slice(0, 4).map((skill) => (
            <View key={skill._id || skill} style={styles.skillChip}>
              <Text style={styles.skillText}>{skill.skillName || skill}</Text>
            </View>
          ))}
          {opportunity.requiredSkills.length > 4 && (
            <Text style={styles.moreSkills}>
              +{opportunity.requiredSkills.length - 4} more
            </Text>
          )}
        </View>
      )}

      <View style={styles.applyRow}>
        <Text style={styles.applyLink}>View & Apply →</Text>
      </View>
    </TouchableOpacity>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
const CompanyProfileScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { companyId } = route.params || {};

  const [company,    setCompany]    = useState(null);
  const [positions,  setPositions]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [posLoading, setPosLoading] = useState(true);
  const [error,      setError]      = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showReport, setShowReport] = useState(false);   // ← report sheet

  // ── Fetch company ──────────────────────────────────────────────────────────
  const fetchCompany = useCallback(async () => {
    try {
      const { data } = await companyAPI.getOne(companyId);
      setCompany(data.company);
      setError(null);
    } catch {
      setError('Could not load company details.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // ── Fetch open positions ───────────────────────────────────────────────────
  const fetchPositions = useCallback(async () => {
    try {
      setPosLoading(true);
      const { data } = await opportunityAPI.getAll({ companyId, limit: 50 });
      setPositions(data.opportunities || []);
    } catch {
      setPositions([]);
    } finally {
      setPosLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCompany();
    fetchPositions();
  }, [fetchCompany, fetchPositions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchCompany(), fetchPositions()]);
    setRefreshing(false);
  }, [fetchCompany, fetchPositions]);

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#F97316" />
        <Text style={styles.loadingText}>Loading company…</Text>
      </View>
    );
  }

  // ─── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchCompany}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        style={[styles.container, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#F97316"
            colors={['#F97316']}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {company?.name || 'Company Profile'}
          </Text>

          {/* 3-dot menu → report */}
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setShowReport(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-vertical" size={22} color="#1F2937" />
          </TouchableOpacity>
        </View>

        {/* ── Company card ── */}
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            {company?.logoUrl ? (
              <Image
                source={{ uri: company.logoUrl }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.logoFallback}>
                <Ionicons name="business-outline" size={40} color="#F97316" />
              </View>
            )}
          </View>

          <Text style={styles.companyName}>{company?.name}</Text>

          {company?.industry ? (
            <Text style={styles.industry}>{company.industry}</Text>
          ) : null}

          {company?.location ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color="#6B7280" />
              <Text style={styles.locationText}>{company.location}</Text>
            </View>
          ) : null}

          {company?.verificationStatus && (
            <View style={{ alignItems: 'center', marginTop: 6 }}>
              <VerificationBadge status={company.verificationStatus} />
            </View>
          )}

          <View style={styles.divider} />

          {company?.contactEmail && (
            <InfoRow
              icon="mail-outline"
              text={company.contactEmail}
              onPress={() => Linking.openURL(`mailto:${company.contactEmail}`)}
            />
          )}
          {company?.contactPhone && (
            <InfoRow
              icon="call-outline"
              text={company.contactPhone}
              onPress={() => Linking.openURL(`tel:${company.contactPhone}`)}
            />
          )}
          {company?.website && (
            <InfoRow
              icon="globe-outline"
              text={company.website}
              isLink
              onPress={() => Linking.openURL(company.website)}
            />
          )}

          {company?.description ? (
            <>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{company.description}</Text>
            </>
          ) : null}

          {/* ── Subtle report link at the bottom of the company card ── */}
          <TouchableOpacity
            style={styles.reportLink}
            onPress={() => setShowReport(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="flag-outline" size={14} color="#9CA3AF" />
            <Text style={styles.reportLinkText}>Report this company</Text>
          </TouchableOpacity>
        </View>

        {/* ── Open positions ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Open Positions</Text>
            {!posLoading && positions.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{positions.length}</Text>
              </View>
            )}
          </View>

          {posLoading ? (
            <View style={styles.posLoadingContainer}>
              <ActivityIndicator size="small" color="#F97316" />
              <Text style={styles.loadingText}>Loading positions…</Text>
            </View>
          ) : positions.length === 0 ? (
            <View style={styles.emptyPositions}>
              <Ionicons name="briefcase-outline" size={36} color="#D1D5DB" />
              <Text style={styles.placeholderText}>No open positions right now.</Text>
              <Text style={styles.placeholderSub}>Check back later for new opportunities.</Text>
            </View>
          ) : (
            positions.map((opp) => (
              <PositionCard
                key={opp._id}
                opportunity={opp}
                onPress={() =>
                  navigation.navigate('OpportunityDetail', { opportunityId: opp._id })
                }
              />
            ))
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Report bottom sheet ── */}
      <ReportBottomSheet
        visible={showReport}
        onClose={() => setShowReport(false)}
        targetId={companyId}
        targetType="user"
        targetLabel={company?.name ? `"${company.name}"` : 'this company'}
      />
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    color: '#EF4444',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#F97316',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 4 },
  menuButton:  { padding: 4, width: 40, alignItems: 'flex-end' },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 8,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },

  // Company header
  iconContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  logoFallback: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 4,
  },
  industry: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  verificationText: {
    fontSize: 12,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  link: {
    color: '#F97316',
    textDecorationLine: 'underline',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  countBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F97316',
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
  },

  // Report link
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  reportLinkText: {
    fontSize: 13,
    color: '#9CA3AF',
  },

  // Positions
  posLoadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyPositions: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  placeholderText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  placeholderSub: {
    fontSize: 13,
    color: '#9CA3AF',
  },

  // Position card
  positionCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  positionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  positionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  positionMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  metaText: {
    fontSize: 11,
    color: '#6B7280',
  },
  positionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  payText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
    flex: 1,
  },
  payUnknown: {
    fontSize: 12,
    color: '#9CA3AF',
    flex: 1,
  },
  deadlineText: {
    fontSize: 12,
    color: '#6B7280',
  },
  deadlineExpired: {
    color: '#EF4444',
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 8,
  },
  skillChip: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  skillText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '500',
  },
  moreSkills: {
    fontSize: 11,
    color: '#6B7280',
    alignSelf: 'center',
  },
  applyRow: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  applyLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F97316',
  },
});

export default CompanyProfileScreen;