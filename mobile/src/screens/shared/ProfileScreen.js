import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { profileAPI } from '../../services/api';

const ProfileScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [skills, setSkills] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [education, setEducation] = useState([]);
  const [preference, setPreference] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchProfile = useCallback(async () => {
    try {
      setError(null);
      const { data } = await profileAPI.getMyProfile();
      setProfile(data.profile || null);
      setSkills(data.skills || []);
      setExperiences(data.experiences || []);
      setEducation(data.education || []);
      setPreference(data.preference || null);
    } catch (err) {
      if (err.response?.status === 404) {
        setProfile(null);
        setSkills([]);
        setExperiences([]);
        setEducation([]);
      } else {
        setError('Failed to load profile.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchProfile();
    });
    return unsubscribe;
  }, [navigation, fetchProfile]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const handleLogout = () => {
    logout();
  };

  const getInitials = () => {
    const name = user?.fullName || user?.name || 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F97316']} />
        }
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials()}</Text>
          </View>
          <Text style={styles.userName}>
            {user?.fullName || user?.name || 'User'}
          </Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {(user?.role || 'user').replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Profile Details or Create Prompt */}
        {profile ? (
          <>
            {/* Bio */}
            {profile.bio && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <View style={styles.card}>
                  <Text style={styles.bioText}>{profile.bio}</Text>
                </View>
              </View>
            )}

            {/* Skills */}
            {skills.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Skills</Text>
                <View style={styles.card}>
                  {skills.map((ps, index) => {
                    const skillName =
                      ps.skillId?.skillName || ps.skillId?.name || ps.skillName || 'Skill';
                    const proficiency = ps.proficiencyLevel || '';
                    const years = ps.numberOfYears;
                    return (
                      <View key={ps._id || index} style={styles.skillRow}>
                        <View style={styles.skillInfo}>
                          <Ionicons name="checkmark-circle" size={16} color="#F97316" />
                          <Text style={styles.skillName}>
                            {skillName}
                            {years ? ` • ${years}y` : ''}
                          </Text>
                        </View>
                        {proficiency && (
                          <Text style={styles.proficiency}>{proficiency}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Experience */}
            {experiences.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Experience</Text>
                {experiences.map((exp, index) => (
                  <View key={exp._id || index} style={styles.card}>
                    <Text style={styles.expTitle}>
                      {exp.jobTitle || exp.title || 'Role'}
                    </Text>
                    <Text style={styles.expCompany}>
                      {exp.companyName || exp.organization || exp.company || ''}
                    </Text>
                    <Text style={styles.expDates}>
                      {exp.startDate
                        ? new Date(exp.startDate).toLocaleDateString('en-UG', {
                            month: 'short',
                            year: 'numeric',
                          })
                        : ''}
                      {' - '}
                      {exp.endDate
                        ? new Date(exp.endDate).toLocaleDateString('en-UG', {
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Present'}
                    </Text>
                    {exp.description && (
                      <Text style={styles.expDescription}>{exp.description}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Education */}
            {education.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Education</Text>
                {education.map((edu, index) => (
                  <View key={edu._id || index} style={styles.card}>
                    <Text style={styles.expTitle}>
                      {edu.qualification || edu.degree || 'Qualification'}
                    </Text>
                    <Text style={styles.expCompany}>
                      {edu.institution || edu.school || ''}
                    </Text>
                    {(edu.startYear || edu.endYear) && (
                      <Text style={styles.expDates}>
                        {edu.startYear || ''}
                        {edu.endYear ? ` - ${edu.endYear}` : ''}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Preferences */}
            {preference && (preference.workStyle || preference.remotePreference || preference.learningWillingness || preference.personalityTraits?.length > 0) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Work Preferences</Text>
                <View style={styles.card}>
                  {preference.workStyle && (
                    <View style={styles.prefRow}>
                      <Text style={styles.prefKey}>Work Style</Text>
                      <Text style={styles.prefValue}>{preference.workStyle}</Text>
                    </View>
                  )}
                  {preference.remotePreference && (
                    <View style={styles.prefRow}>
                      <Text style={styles.prefKey}>Remote Work</Text>
                      <Text style={styles.prefValue}>{preference.remotePreference}</Text>
                    </View>
                  )}
                  {preference.learningWillingness && (
                    <View style={styles.prefRow}>
                      <Text style={styles.prefKey}>Learning Willingness</Text>
                      <Text style={styles.prefValue}>{preference.learningWillingness}</Text>
                    </View>
                  )}
                  {preference.personalityTraits?.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={[styles.prefKey, { marginBottom: 6 }]}>Personality Traits</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {preference.personalityTraits.map((t, i) => (
                          <View key={i} style={styles.traitBadge}>
                            <Text style={styles.traitBadgeText}>
                              {t.trait} · {t.level}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('EditProfile', { profile, skills, experiences, education, preference })}
            >
              <Ionicons name="create-outline" size={18} color="#FFFFFF" />
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.createPrompt}>
            <Ionicons name="person-add-outline" size={48} color="#D1D5DB" />
            <Text style={styles.createTitle}>Complete Your Profile</Text>
            <Text style={styles.createText}>
              Add your skills, experience, and education to get matched with opportunities.
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('EditProfile', { profile: null })}
            >
              <Text style={styles.createButtonText}>Create Profile</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color="#374151" />
            <Text style={styles.menuItemText}>Notifications</Text>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  profileHeader: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EA580C',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  bioText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  skillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  skillInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skillName: {
    fontSize: 14,
    color: '#374151',
  },
  proficiency: {
    fontSize: 12,
    color: '#F97316',
    fontWeight: '500',
  },
  expTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  expCompany: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  expDates: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  expDescription: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 6,
    lineHeight: 18,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  prefKey: {
    fontSize: 13,
    color: '#6B7280',
  },
  prefValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F97316',
    textTransform: 'capitalize',
  },
  traitBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  traitBadgeText: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  editButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  createPrompt: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  createTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 6,
  },
  createText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#F97316',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  menuSection: {
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
  },
  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
});

export default ProfileScreen;
