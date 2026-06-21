import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api, { BASE_URL } from '../../services/api';
import ReportBottomSheet from '../../components/ReportBottomSheet';

const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  const staticBaseUrl = BASE_URL.replace('/api', '');
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${staticBaseUrl}${cleanPath}`;
};

const UserProfileScreen = ({ route, navigation }) => {
  const { userId, userName, userAvatar, userRole } = route.params || {};
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  // Store the actual user _id from the profile
  const [reportedUserId, setReportedUserId] = useState(userId);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data } = await api.get(`/profiles/user/${userId}`);
      setProfile(data);
      // If the profile contains the user _id, use it for reporting
      if (data?.user?._id) {
        console.log('✅ Profile loaded, user _id:', data.user._id);
        setReportedUserId(data.user._id);
      } else {
        console.warn('⚠️ Profile does not contain user _id');
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
      Alert.alert('Error', 'Could not load this profile.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const avatarUrl = useMemo(() => getImageUrl(profile?.user?.avatar || userAvatar), [profile, userAvatar]);
  const displayName = profile?.user?.fullName || userName || 'User';
  const displayRole = profile?.user?.role || userRole || 'User';
  const displayTitle = profile?.profile?.title || profile?.profile?.headline || '';
  const displayLocation = profile?.profile?.location || '';
  const displayBio = profile?.profile?.bio || '';

  // ─── Handle Report ──────────────────────────────────────────────────────────
  const handleReportPress = () => {
    console.log('🔍 Reporting user with ID:', reportedUserId);
    console.log('🔍 Type of ID:', typeof reportedUserId);
    console.log('🔍 Is valid ObjectId?', /^[a-f0-9]{24}$/.test(reportedUserId));
    if (!reportedUserId) {
      Alert.alert('Error', 'User ID not found. Cannot report this profile.');
      return;
    }
    setShowReport(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileCard}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{displayName?.charAt(0)?.toUpperCase() || '?'}</Text>
              </View>
            )}

            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.role}>{displayRole?.replace('_', ' ')}</Text>
            {displayTitle ? <Text style={styles.title}>{displayTitle}</Text> : null}
            {displayLocation ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={styles.metaText}>{displayLocation}</Text>
              </View>
            ) : null}
          </View>

          {displayBio ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.bio}>{displayBio}</Text>
            </View>
          ) : null}

          {profile?.skills?.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Skills</Text>
              <View style={styles.tagsRow}>
                {profile.skills.map((item) => (
                  <View key={item._id || item.skillId?._id} style={styles.tag}>
                    <Text style={styles.tagText}>{item.skillId?.skillName || item.skillName}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {profile?.experiences?.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Experience</Text>
              {profile.experiences.map((item) => (
                <View key={item._id} style={styles.listItem}>
                  <Text style={styles.listTitle}>{item.jobTitle || item.title}</Text>
                  <Text style={styles.listMeta}>{item.companyName}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <TouchableOpacity style={styles.reportButton} onPress={handleReportPress}>
            <Ionicons name="flag-outline" size={18} color="#EF4444" />
            <Text style={styles.reportButtonText}>Report Profile</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      <ReportBottomSheet
        visible={showReport}
        onClose={() => setShowReport(false)}
        targetId={reportedUserId}   // ✅ uses the fetched _id
        targetType="user"
        targetLabel={displayName}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { width: 40, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1F2937' },
  content: { padding: 16, paddingBottom: 32 },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
  name: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 12 },
  role: { fontSize: 13, color: '#6B7280', textTransform: 'capitalize', marginTop: 2 },
  title: { fontSize: 14, color: '#111827', marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  metaText: { fontSize: 12, color: '#6B7280', marginLeft: 4 },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  bio: { fontSize: 13, color: '#4B5563', lineHeight: 20 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: '#FFF7ED',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: { fontSize: 12, color: '#F97316', fontWeight: '600' },
  listItem: { marginBottom: 10 },
  listTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  listMeta: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 8,
  },
  reportButtonText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
});

export default UserProfileScreen;