import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { profileAPI, skillAPI } from '../../services/api';

const EditProfileScreen = ({ route, navigation }) => {
  const existingProfile = route.params?.profile;

  const [bio, setBio] = useState(existingProfile?.bio || '');
  const [skills, setSkills] = useState(existingProfile?.skills || []);
  const [experience, setExperience] = useState(existingProfile?.experience || []);
  const [education, setEducation] = useState(existingProfile?.education || []);
  const [saving, setSaving] = useState(false);

  // Skill picker modal
  const [allSkills, setAllSkills] = useState([]);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');

  // Add experience form
  const [showExpForm, setShowExpForm] = useState(false);
  const [expTitle, setExpTitle] = useState('');
  const [expCompany, setExpCompany] = useState('');
  const [expStartDate, setExpStartDate] = useState('');
  const [expEndDate, setExpEndDate] = useState('');

  // Add education form
  const [showEduForm, setShowEduForm] = useState(false);
  const [eduQualification, setEduQualification] = useState('');
  const [eduInstitution, setEduInstitution] = useState('');
  const [eduYear, setEduYear] = useState('');

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      const { data } = await skillAPI.getAll();
      const list = data.skills || data.data || data || [];
      setAllSkills(Array.isArray(list) ? list : []);
    } catch {
      // Skills can be typed manually
    }
  };

  const toggleSkill = (skill) => {
    const skillName = skill.name || skill.skill || skill;
    const exists = skills.find((s) => {
      const sName = typeof s === 'string' ? s : s.name || s.skill;
      return sName === skillName;
    });
    if (exists) {
      setSkills((prev) =>
        prev.filter((s) => {
          const sName = typeof s === 'string' ? s : s.name || s.skill;
          return sName !== skillName;
        })
      );
    } else {
      setSkills((prev) => [
        ...prev,
        { name: skillName, skill: skill._id || skill.id || skillName, proficiency: 'intermediate' },
      ]);
    }
  };

  const removeSkill = (index) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const addExperience = () => {
    if (!expTitle.trim() || !expCompany.trim()) {
      Alert.alert('Error', 'Please enter a title and company.');
      return;
    }
    setExperience((prev) => [
      ...prev,
      {
        title: expTitle.trim(),
        company: expCompany.trim(),
        startDate: expStartDate.trim() || undefined,
        endDate: expEndDate.trim() || undefined,
      },
    ]);
    setExpTitle('');
    setExpCompany('');
    setExpStartDate('');
    setExpEndDate('');
    setShowExpForm(false);
  };

  const removeExperience = (index) => {
    setExperience((prev) => prev.filter((_, i) => i !== index));
  };

  const addEducation = () => {
    if (!eduQualification.trim() || !eduInstitution.trim()) {
      Alert.alert('Error', 'Please enter a qualification and institution.');
      return;
    }
    setEducation((prev) => [
      ...prev,
      {
        qualification: eduQualification.trim(),
        institution: eduInstitution.trim(),
        year: eduYear.trim() || undefined,
      },
    ]);
    setEduQualification('');
    setEduInstitution('');
    setEduYear('');
    setShowEduForm(false);
  };

  const removeEducation = (index) => {
    setEducation((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        bio: bio.trim(),
        skills: skills.map((s) => {
          if (typeof s === 'string') return { name: s };
          return s;
        }),
        experience,
        education,
      };

      if (existingProfile) {
        await profileAPI.updateProfile(payload);
      } else {
        await profileAPI.createProfile(payload);
      }

      Alert.alert('Success', 'Profile saved successfully!');
      navigation.goBack();
    } catch (err) {
      const msg =
        err.response?.data?.message || err.response?.data?.error || 'Failed to save profile.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredSkills = allSkills.filter((s) => {
    const name = (s.name || s.skill || '').toLowerCase();
    return name.includes(skillSearch.toLowerCase());
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>
          {existingProfile ? 'Edit Profile' : 'Create Profile'}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Bio */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Tell us about yourself..."
            placeholderTextColor="#9CA3AF"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Skills */}
        <View style={styles.sectionHeader}>
          <Text style={styles.label}>Skills</Text>
          <TouchableOpacity onPress={() => setShowSkillModal(true)}>
            <Text style={styles.addLink}>+ Add Skills</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.skillsRow}>
          {skills.map((skill, index) => {
            const name =
              typeof skill === 'string' ? skill : skill.name || skill.skill || '';
            return (
              <View key={index} style={styles.skillChip}>
                <Text style={styles.skillChipText}>{name}</Text>
                <TouchableOpacity onPress={() => removeSkill(index)}>
                  <Ionicons name="close" size={14} color="#EA580C" />
                </TouchableOpacity>
              </View>
            );
          })}
          {skills.length === 0 && (
            <Text style={styles.emptyHint}>No skills added yet.</Text>
          )}
        </View>

        {/* Experience */}
        <View style={styles.sectionHeader}>
          <Text style={styles.label}>Experience</Text>
          <TouchableOpacity onPress={() => setShowExpForm(true)}>
            <Text style={styles.addLink}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {experience.map((exp, index) => (
          <View key={index} style={styles.entryCard}>
            <View style={styles.entryInfo}>
              <Text style={styles.entryTitle}>{exp.title}</Text>
              <Text style={styles.entrySubtitle}>{exp.company}</Text>
              {(exp.startDate || exp.endDate) && (
                <Text style={styles.entryDates}>
                  {exp.startDate || ''} - {exp.endDate || 'Present'}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => removeExperience(index)}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        {showExpForm && (
          <View style={styles.addForm}>
            <TextInput
              style={styles.input}
              placeholder="Title / Position"
              placeholderTextColor="#9CA3AF"
              value={expTitle}
              onChangeText={setExpTitle}
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Company / Organization"
              placeholderTextColor="#9CA3AF"
              value={expCompany}
              onChangeText={setExpCompany}
            />
            <View style={styles.dateRow}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Start (YYYY-MM)"
                placeholderTextColor="#9CA3AF"
                value={expStartDate}
                onChangeText={setExpStartDate}
              />
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="End (YYYY-MM)"
                placeholderTextColor="#9CA3AF"
                value={expEndDate}
                onChangeText={setExpEndDate}
              />
            </View>
            <View style={styles.formActions}>
              <TouchableOpacity onPress={() => setShowExpForm(false)}>
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton} onPress={addExperience}>
                <Text style={styles.addButtonText}>Add Experience</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Education */}
        <View style={[styles.sectionHeader, { marginTop: 16 }]}>
          <Text style={styles.label}>Education</Text>
          <TouchableOpacity onPress={() => setShowEduForm(true)}>
            <Text style={styles.addLink}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {education.map((edu, index) => (
          <View key={index} style={styles.entryCard}>
            <View style={styles.entryInfo}>
              <Text style={styles.entryTitle}>{edu.qualification || edu.degree}</Text>
              <Text style={styles.entrySubtitle}>{edu.institution || edu.school}</Text>
              {edu.year && <Text style={styles.entryDates}>{edu.year}</Text>}
            </View>
            <TouchableOpacity onPress={() => removeEducation(index)}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        {showEduForm && (
          <View style={styles.addForm}>
            <TextInput
              style={styles.input}
              placeholder="Qualification / Degree"
              placeholderTextColor="#9CA3AF"
              value={eduQualification}
              onChangeText={setEduQualification}
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Institution"
              placeholderTextColor="#9CA3AF"
              value={eduInstitution}
              onChangeText={setEduInstitution}
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Year (e.g. 2023)"
              placeholderTextColor="#9CA3AF"
              value={eduYear}
              onChangeText={setEduYear}
              keyboardType="numeric"
            />
            <View style={styles.formActions}>
              <TouchableOpacity onPress={() => setShowEduForm(false)}>
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton} onPress={addEducation}>
                <Text style={styles.addButtonText}>Add Education</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Profile</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Skill Picker Modal */}
      <Modal visible={showSkillModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Skills</Text>
              <TouchableOpacity onPress={() => setShowSkillModal(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearch}>
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search skills..."
                placeholderTextColor="#9CA3AF"
                value={skillSearch}
                onChangeText={setSkillSearch}
              />
            </View>

            <FlatList
              data={filteredSkills}
              keyExtractor={(item) =>
                item._id || item.id || item.name || Math.random().toString()
              }
              renderItem={({ item }) => {
                const name = item.name || item.skill || '';
                const isSelected = skills.some((s) => {
                  const sName = typeof s === 'string' ? s : s.name || s.skill;
                  return sName === name;
                });
                return (
                  <TouchableOpacity
                    style={styles.modalSkillItem}
                    onPress={() => toggleSkill(item)}
                  >
                    <Text style={styles.modalSkillText}>{name}</Text>
                    <Ionicons
                      name={isSelected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isSelected ? '#F97316' : '#D1D5DB'}
                    />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>No skills found.</Text>
              }
            />

            <TouchableOpacity
              style={styles.modalDoneButton}
              onPress={() => setShowSkillModal(false)}
            >
              <Text style={styles.modalDoneText}>
                Done ({skills.length} selected)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    minHeight: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  addLink: {
    fontSize: 14,
    color: '#F97316',
    fontWeight: '600',
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  skillChipText: {
    fontSize: 13,
    color: '#EA580C',
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  entryInfo: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  entrySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  entryDates: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  addForm: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  halfInput: {
    flex: 1,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  cancelLink: {
    fontSize: 14,
    color: '#6B7280',
  },
  addButton: {
    backgroundColor: '#F97316',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    marginHorizontal: 20,
    marginVertical: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#1F2937',
    paddingVertical: 0,
  },
  modalSkillItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  modalSkillText: {
    fontSize: 15,
    color: '#374151',
  },
  modalEmpty: {
    textAlign: 'center',
    color: '#9CA3AF',
    paddingVertical: 24,
    fontSize: 14,
  },
  modalDoneButton: {
    backgroundColor: '#F97316',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDoneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default EditProfileScreen;
