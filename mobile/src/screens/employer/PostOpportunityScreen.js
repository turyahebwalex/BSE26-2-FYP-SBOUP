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
import { opportunityAPI, skillAPI } from '../../services/api';

const TYPES = [
  { key: 'formal', label: 'Formal' },
  { key: 'contract', label: 'Contract' },
  { key: 'freelance', label: 'Freelance' },
  { key: 'apprenticeship', label: 'Apprenticeship' },
];

const EXPERIENCE_LEVELS = [
  { key: 'entry', label: 'Entry Level' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'senior', label: 'Senior' },
  { key: 'expert', label: 'Expert' },
];

const PostOpportunityScreen = ({ navigation }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('formal');
  const [location, setLocation] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [compensationMin, setCompensationMin] = useState('');
  const [compensationMax, setCompensationMax] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('entry');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Skill picker
  const [allSkills, setAllSkills] = useState([]);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [loadingSkills, setLoadingSkills] = useState(false);

  // Type dropdown
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showExpDropdown, setShowExpDropdown] = useState(false);

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    setLoadingSkills(true);
    try {
      const { data } = await skillAPI.getAll();
      const list = data.skills || data.data || data || [];
      setAllSkills(Array.isArray(list) ? list : []);
    } catch {
      // Skills can also be typed manually
    } finally {
      setLoadingSkills(false);
    }
  };

  const toggleSkill = (skill) => {
    const skillId = skill._id || skill.id || skill.name;
    const exists = selectedSkills.find(
      (s) => (s._id || s.id || s.name) === skillId
    );
    if (exists) {
      setSelectedSkills((prev) =>
        prev.filter((s) => (s._id || s.id || s.name) !== skillId)
      );
    } else {
      setSelectedSkills((prev) => [...prev, skill]);
    }
  };

  const removeSkill = (skillId) => {
    setSelectedSkills((prev) =>
      prev.filter((s) => (s._id || s.id || s.name) !== skillId)
    );
  };

  const filteredSkills = allSkills.filter((s) => {
    const name = (s.name || s.skill || '').toLowerCase();
    return name.includes(skillSearch.toLowerCase());
  });

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        type,
        location: location.trim() || 'Uganda',
        requiredSkills: selectedSkills.map((s) => s._id || s.id || s.name),
        experienceLevel,
      };

      if (compensationMin || compensationMax) {
        payload.compensation = {};
        if (compensationMin) payload.compensation.min = parseInt(compensationMin, 10);
        if (compensationMax) payload.compensation.max = parseInt(compensationMax, 10);
      }

      if (deadline.trim()) {
        payload.deadline = deadline.trim();
      }

      await opportunityAPI.create(payload);
      Alert.alert('Success', 'Opportunity posted successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Reset form
            setTitle('');
            setDescription('');
            setType('formal');
            setLocation('');
            setSelectedSkills([]);
            setCompensationMin('');
            setCompensationMax('');
            setExperienceLevel('entry');
            setDeadline('');
          },
        },
      ]);
    } catch (err) {
      const msg =
        err.response?.data?.message || err.response?.data?.error || 'Failed to post opportunity.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Post Opportunity</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Senior Web Developer"
            placeholderTextColor="#9CA3AF"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the role, responsibilities, requirements..."
            placeholderTextColor="#9CA3AF"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        {/* Type Dropdown */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Type</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setShowTypeDropdown(!showTypeDropdown)}
          >
            <Text style={styles.dropdownText}>
              {TYPES.find((t) => t.key === type)?.label || 'Select type'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#6B7280" />
          </TouchableOpacity>
          {showTypeDropdown && (
            <View style={styles.dropdownMenu}>
              {TYPES.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.dropdownItem,
                    type === t.key && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    setType(t.key);
                    setShowTypeDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      type === t.key && styles.dropdownItemTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Location */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Kampala, Uganda"
            placeholderTextColor="#9CA3AF"
            value={location}
            onChangeText={setLocation}
          />
        </View>

        {/* Required Skills */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Required Skills</Text>
          <View style={styles.selectedSkillsRow}>
            {selectedSkills.map((skill) => {
              const skillId = skill._id || skill.id || skill.name;
              const skillName = skill.name || skill.skill || skillId;
              return (
                <View key={skillId} style={styles.selectedSkillChip}>
                  <Text style={styles.selectedSkillText}>{skillName}</Text>
                  <TouchableOpacity onPress={() => removeSkill(skillId)}>
                    <Ionicons name="close" size={14} color="#EA580C" />
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity
              style={styles.addSkillButton}
              onPress={() => setShowSkillModal(true)}
            >
              <Ionicons name="add" size={16} color="#F97316" />
              <Text style={styles.addSkillText}>Add Skills</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Compensation */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Compensation (UGX)</Text>
          <View style={styles.compensationRow}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Min"
              placeholderTextColor="#9CA3AF"
              value={compensationMin}
              onChangeText={setCompensationMin}
              keyboardType="numeric"
            />
            <Text style={styles.dashText}>-</Text>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Max"
              placeholderTextColor="#9CA3AF"
              value={compensationMax}
              onChangeText={setCompensationMax}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Experience Level */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Experience Level</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setShowExpDropdown(!showExpDropdown)}
          >
            <Text style={styles.dropdownText}>
              {EXPERIENCE_LEVELS.find((e) => e.key === experienceLevel)?.label || 'Select'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#6B7280" />
          </TouchableOpacity>
          {showExpDropdown && (
            <View style={styles.dropdownMenu}>
              {EXPERIENCE_LEVELS.map((e) => (
                <TouchableOpacity
                  key={e.key}
                  style={[
                    styles.dropdownItem,
                    experienceLevel === e.key && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    setExperienceLevel(e.key);
                    setShowExpDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      experienceLevel === e.key && styles.dropdownItemTextActive,
                    ]}
                  >
                    {e.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Deadline */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Application Deadline</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
            value={deadline}
            onChangeText={setDeadline}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.submitRow}>
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Post Opportunity</Text>
            </View>
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

            {loadingSkills ? (
              <ActivityIndicator
                color="#F97316"
                size="large"
                style={{ marginTop: 24 }}
              />
            ) : (
              <FlatList
                data={filteredSkills}
                keyExtractor={(item) => item._id || item.id || item.name || Math.random().toString()}
                renderItem={({ item }) => {
                  const skillId = item._id || item.id || item.name;
                  const isSelected = selectedSkills.some(
                    (s) => (s._id || s.id || s.name) === skillId
                  );
                  return (
                    <TouchableOpacity
                      style={styles.modalSkillItem}
                      onPress={() => toggleSkill(item)}
                    >
                      <Text style={styles.modalSkillText}>
                        {item.name || item.skill || skillId}
                      </Text>
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
            )}

            <TouchableOpacity
              style={styles.modalDoneButton}
              onPress={() => setShowSkillModal(false)}
            >
              <Text style={styles.modalDoneText}>
                Done ({selectedSkills.length} selected)
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
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
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
    fontWeight: '500',
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
    minHeight: 120,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  dropdownText: {
    fontSize: 15,
    color: '#1F2937',
  },
  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemActive: {
    backgroundColor: '#FFF7ED',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#374151',
  },
  dropdownItemTextActive: {
    color: '#F97316',
    fontWeight: '600',
  },
  selectedSkillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedSkillChip: {
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
  selectedSkillText: {
    fontSize: 13,
    color: '#EA580C',
    fontWeight: '500',
  },
  addSkillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#F97316',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderStyle: 'dashed',
  },
  addSkillText: {
    fontSize: 13,
    color: '#F97316',
    fontWeight: '500',
  },
  compensationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  dashText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  submitButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
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

export default PostOpportunityScreen;
