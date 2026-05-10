import React, { useState, useEffect, useMemo } from 'react';
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

const PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];
const EXPERIENCE_CATEGORIES = ['formal', 'contract', 'freelance', 'apprenticeship', 'community'];
const WORK_STYLES = ['collaborative', 'independent', 'flexible'];
const REMOTE_PREFS = ['high', 'medium', 'low'];
const LEARNING_PREFS = ['high', 'medium', 'low'];
const TRAIT_LEVELS = ['low', 'medium', 'high'];
const PERSONALITY_TRAITS = [
  'creativity',
  'openness',
  'agreeableness',
  'dependability',
  'resilience',
];

const EditProfileScreen = ({ route, navigation }) => {
  const initialProfile = route.params?.profile || null;
  const existingSkills = route.params?.skills || [];
  const existingExperiences = route.params?.experiences || [];
  const existingEducation = route.params?.education || [];
  const existingPreference = route.params?.preference || null;
  const existingPortfolio = initialProfile?.portfolioItems || [];

  // Stateful so that the first add-* call (which lazily creates the profile
  // via ensureProfile) updates this and subsequent calls don't re-create it.
  const [existingProfile, setExistingProfile] = useState(initialProfile);
  const [title, setTitle] = useState(initialProfile?.title || '');
  const [bio, setBio] = useState(initialProfile?.bio || '');
  const [location, setLocation] = useState(initialProfile?.location || '');
  const [skills, setSkills] = useState(existingSkills);
  const [experiences, setExperiences] = useState(existingExperiences);
  const [education, setEducation] = useState(existingEducation);
  const [portfolio, setPortfolio] = useState(existingPortfolio);
  const [saving, setSaving] = useState(false);

  // Preferences
  const [workStyle, setWorkStyle] = useState(existingPreference?.workStyle || '');
  const [remotePref, setRemotePref] = useState(existingPreference?.remotePreference || '');
  const [learningPref, setLearningPref] = useState(existingPreference?.learningWillingness || '');

  // Personality traits — stored as { trait: string, level: string }[]
  const [traitLevels, setTraitLevels] = useState(() => {
    const existing = existingPreference?.personalityTraits || [];
    const map = {};
    existing.forEach((t) => { map[t.trait] = t.level; });
    return map; // e.g. { conscientiousness: 'high', openness: 'medium' }
  });

  // Skill picker modal
  const [allSkills, setAllSkills] = useState([]);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [pendingSkill, setPendingSkill] = useState(null);
  const [pendingProficiency, setPendingProficiency] = useState('intermediate');
  // Which input method the user chose: null (chooser), 'ai', 'browse', 'custom'
  const [skillMethod, setSkillMethod] = useState(null);

  const openSkillModal = () => {
    setSkillMethod(null);
    setSkillSearch('');
    setCustomInput('');
    setPendingSkill(null);
    setShowSkillModal(true);
  };

  const closeSkillModal = () => {
    setShowSkillModal(false);
    setPendingSkill(null);
    setSkillMethod(null);
  };

  // AI skill suggestions — driven by the FULL profile context (title, bio,
  // location, experiences, education, and the skills already added). The
  // server uses each of these to widen its matching pool and to exclude
  // skills the user already has.
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  // Manual custom-skill entry (3rd input method, alongside AI + database list).
  const [customInput, setCustomInput] = useState('');
  const [customAdding, setCustomAdding] = useState(false);

  // Experience form
  const [showExpForm, setShowExpForm] = useState(false);
  const [expJobTitle, setExpJobTitle] = useState('');
  const [expCompany, setExpCompany] = useState('');
  const [expCategory, setExpCategory] = useState('formal');
  const [expStartDate, setExpStartDate] = useState('');
  const [expEndDate, setExpEndDate] = useState('');
  const [expDescription, setExpDescription] = useState('');

  // Education form
  const [showEduForm, setShowEduForm] = useState(false);
  const [eduQualification, setEduQualification] = useState('');
  const [eduInstitution, setEduInstitution] = useState('');
  const [eduField, setEduField] = useState('');
  const [eduStartYear, setEduStartYear] = useState('');
  const [eduEndYear, setEduEndYear] = useState('');

  // Portfolio form
  const [showPortfolioForm, setShowPortfolioForm] = useState(false);
  const [portTitle, setPortTitle] = useState('');
  const [portDescription, setPortDescription] = useState('');
  const [portUrl, setPortUrl] = useState('');

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      const { data } = await skillAPI.getAll();
      const list = data.skills || data.data || data || [];
      setAllSkills(Array.isArray(list) ? list : []);
    } catch {
      // Non-fatal
    }
  };

  // Snapshot of profile context sent to the AI suggester. Memoized so the
  // effect below doesn't fire on every parent re-render — only when the
  // underlying skills/experience/education arrays actually change content.
  const profileContext = useMemo(
    () => ({
      existingSkills: skills
        .map((ps) => ps.skillId?.skillName || ps.skillId?.name || ps.skillName)
        .filter(Boolean),
      experiences: experiences.map((e) => ({
        jobTitle: e.jobTitle || '',
        company: e.companyName || '',
        description: e.description || '',
      })),
      education: education.map((e) => ({
        qualification: e.qualification || '',
        fieldOfStudy: e.fieldOfStudy || '',
      })),
    }),
    [skills, experiences, education]
  );

  // Stable string fingerprint of the context so useEffect can depend on it
  // without spuriously re-firing on identical content.
  const contextSignature = useMemo(
    () =>
      JSON.stringify({
        s: [...profileContext.existingSkills].sort(),
        e: profileContext.experiences
          .map((x) => `${x.jobTitle}|${x.company}|${x.description}`)
          .sort(),
        ed: profileContext.education
          .map((x) => `${x.qualification}|${x.fieldOfStudy}`)
          .sort(),
      }),
    [profileContext]
  );

  // Debounced AI suggestions. Fires when there is enough signal anywhere in
  // the profile — title+bio OR at least one experience/education entry — so
  // a worker who lists past jobs but no bio still gets ideas.
  useEffect(() => {
    const t = title.trim();
    const b = bio.trim();
    const loc = location.trim();
    const hasTitleBio = t.length >= 3 && b.length >= 10;
    const hasOtherContext =
      profileContext.experiences.length > 0 ||
      profileContext.education.length > 0 ||
      profileContext.existingSkills.length > 0;

    if (!hasTitleBio && !hasOtherContext) {
      setSuggestions([]);
      return;
    }

    let alive = true;
    setSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await skillAPI.suggest({
          title: t,
          description: b,
          location: loc,
          existingSkills: profileContext.existingSkills,
          experiences: profileContext.experiences,
          education: profileContext.education,
        });
        if (!alive) return;
        const list = data.suggestions || [];
        setSuggestions(list);
        // Merge any newly-created external skills into allSkills so they also
        // appear in the database catalog below.
        setAllSkills((prev) => {
          const existing = new Set(prev.map((s) => String(s._id)));
          const merged = [...prev];
          for (const s of list) {
            if (!existing.has(String(s._id))) {
              merged.push({ _id: s._id, skillName: s.name });
            }
          }
          return merged;
        });
      } catch {
        if (alive) setSuggestions([]);
      } finally {
        if (alive) setSuggestLoading(false);
      }
    }, 450);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [title, bio, location, contextSignature]);

  const ensureProfile = async () => {
    if (existingProfile?._id) return existingProfile;
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a professional title.');
      return null;
    }
    const { data } = await profileAPI.createProfile({
      title: title.trim(),
      bio: bio.trim(),
      location: location.trim(),
      visibility: 'public',
    });
    const created = data.profile || data;
    setExistingProfile(created);
    return created;
  };

  const handleSaveProfile = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Professional title is required.');
      return;
    }
    setSaving(true);
    try {
      if (existingProfile?._id) {
        await profileAPI.updateProfile({
          title: title.trim(),
          bio: bio.trim(),
          location: location.trim(),
        });
      } else {
        const { data } = await profileAPI.createProfile({
          title: title.trim(),
          bio: bio.trim(),
          location: location.trim(),
          visibility: 'public',
        });
        setExistingProfile(data.profile || data);
      }
      // Save preferences if any are set
      if (workStyle || remotePref || learningPref) {
        const personalityTraits = PERSONALITY_TRAITS
          .filter((t) => traitLevels[t])
          .map((t) => ({ trait: t, level: traitLevels[t] }));

        await profileAPI.updatePreferences({
          workStyle:           workStyle || undefined,
          remotePreference:    remotePref || undefined,
          learningWillingness: learningPref || undefined,
          personalityTraits:   personalityTraits.length > 0 ? personalityTraits : undefined,
        });
      }
      Alert.alert('Saved', 'Profile saved.');
      navigation.goBack();
    } catch (err) {
      const msg =
        err.response?.data?.error || err.response?.data?.message || 'Failed to save profile.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const openSkillPicker = (skill) => {
    setPendingSkill(skill);
    setPendingProficiency('intermediate');
  };

  const confirmAddSkill = async () => {
    if (!pendingSkill) return;
    try {
      const profile = await ensureProfile();
      if (!profile) return;
      const { data } = await profileAPI.addSkill({
        skillId: pendingSkill._id || pendingSkill.id,
        proficiencyLevel: pendingProficiency,
        classification: 'primary',
      });
      const added = data.profileSkill || data;
      setSkills((prev) => [...prev, { ...added, skillId: pendingSkill }]);
      setPendingSkill(null);
      setShowSkillModal(false);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add skill.';
      Alert.alert('Error', msg);
    }
  };

  const addCustomSkill = async () => {
    const name = customInput.trim();
    if (!name) return;
    // Already in catalog (case-insensitive) → just open the proficiency picker.
    const existing = allSkills.find(
      (s) => (s.skillName || s.name || '').toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      openSkillPicker({
        _id: existing._id,
        skillName: existing.skillName || existing.name,
      });
      setCustomInput('');
      return;
    }
    setCustomAdding(true);
    try {
      const { data } = await skillAPI.addCustom(name);
      const skill = data.skill;
      setAllSkills((prev) =>
        prev.some((s) => String(s._id) === String(skill._id)) ? prev : [...prev, skill]
      );
      openSkillPicker(skill);
      setCustomInput('');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to add skill.');
    } finally {
      setCustomAdding(false);
    }
  };

  const removeSkill = async (profileSkill) => {
    try {
      await profileAPI.removeSkill(profileSkill._id);
      setSkills((prev) => prev.filter((s) => s._id !== profileSkill._id));
    } catch {
      Alert.alert('Error', 'Failed to remove skill.');
    }
  };

  const addExperience = async () => {
    if (!expJobTitle.trim() || !expStartDate.trim()) {
      Alert.alert('Error', 'Job title and start date are required.');
      return;
    }
    try {
      const profile = await ensureProfile();
      if (!profile) return;
      const { data } = await profileAPI.addExperience({
        jobTitle: expJobTitle.trim(),
        companyName: expCompany.trim(),
        category: expCategory,
        startDate: expStartDate.trim(),
        endDate: expEndDate.trim() || null,
        description: expDescription.trim(),
      });
      setExperiences((prev) => [...prev, data.experience || data]);
      setExpJobTitle('');
      setExpCompany('');
      setExpStartDate('');
      setExpEndDate('');
      setExpDescription('');
      setShowExpForm(false);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add experience.';
      Alert.alert('Error', msg);
    }
  };

  const removeExperience = async (exp) => {
    try {
      await profileAPI.deleteExperience(exp._id);
      setExperiences((prev) => prev.filter((e) => e._id !== exp._id));
    } catch {
      Alert.alert('Error', 'Failed to remove experience.');
    }
  };

  const addEducation = async () => {
    if (!eduQualification.trim() || !eduInstitution.trim() || !eduStartYear.trim()) {
      Alert.alert('Error', 'Qualification, institution and start year are required.');
      return;
    }
    const startYear = parseInt(eduStartYear, 10);
    const endYear = eduEndYear.trim() ? parseInt(eduEndYear, 10) : null;
    if (Number.isNaN(startYear)) {
      Alert.alert('Error', 'Start year must be a number.');
      return;
    }
    try {
      const profile = await ensureProfile();
      if (!profile) return;
      const { data } = await profileAPI.addEducation({
        qualification: eduQualification.trim(),
        institution: eduInstitution.trim(),
        fieldOfStudy: eduField.trim(),
        startYear,
        endYear,
      });
      setEducation((prev) => [...prev, data.education || data]);
      setEduQualification('');
      setEduInstitution('');
      setEduField('');
      setEduStartYear('');
      setEduEndYear('');
      setShowEduForm(false);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add education.';
      Alert.alert('Error', msg);
    }
  };

  const removeEducation = async (edu) => {
    try {
      await profileAPI.deleteEducation(edu._id);
      setEducation((prev) => prev.filter((e) => e._id !== edu._id));
    } catch {
      Alert.alert('Error', 'Failed to remove education.');
    }
  };

  const addPortfolioItem = async () => {
    if (!portTitle.trim()) {
      Alert.alert('Error', 'Project title is required.');
      return;
    }
    try {
      const profile = await ensureProfile();
      if (!profile) return;
      const { data } = await profileAPI.addPortfolioItem({
        title: portTitle.trim(),
        description: portDescription.trim(),
        fileUrl: portUrl.trim(),
        fileType: portUrl.trim() ? 'link' : '',
      });
      setPortfolio((prev) => [...prev, data.portfolioItem || data]);
      setPortTitle('');
      setPortDescription('');
      setPortUrl('');
      setShowPortfolioForm(false);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add portfolio item.';
      Alert.alert('Error', msg);
    }
  };

  const removePortfolioItem = async (item) => {
    try {
      await profileAPI.removePortfolioItem(item._id);
      setPortfolio((prev) => prev.filter((p) => p._id !== item._id));
    } catch {
      Alert.alert('Error', 'Failed to remove portfolio item.');
    }
  };

  const suggestionIds = new Set(suggestions.map((s) => String(s._id)));
  const filteredSkills = allSkills.filter(
    (s) =>
      (s.skillName || s.name || '').toLowerCase().includes(skillSearch.toLowerCase()) &&
      !suggestionIds.has(String(s._id))
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
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
        {/* Basic Info */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Professional Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Carpenter, Web Developer"
            placeholderTextColor="#9CA3AF"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bio <Text style={styles.optional}>(optional)</Text></Text>
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

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Location <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Kampala, Uganda"
            placeholderTextColor="#9CA3AF"
            value={location}
            onChangeText={setLocation}
          />
        </View>

        {/* Experience */}
        <View style={styles.sectionHeader}>
          <Text style={styles.label}>Experience</Text>
          <TouchableOpacity onPress={() => setShowExpForm(true)}>
            <Text style={styles.addLink}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {experiences.map((exp) => (
          <View key={exp._id} style={styles.entryCard}>
            <View style={styles.entryInfo}>
              <Text style={styles.entryTitle}>{exp.jobTitle}</Text>
              <Text style={styles.entrySubtitle}>{exp.companyName}</Text>
              {(exp.startDate || exp.endDate) && (
                <Text style={styles.entryDates}>
                  {exp.startDate ? new Date(exp.startDate).toLocaleDateString() : ''} -{' '}
                  {exp.endDate ? new Date(exp.endDate).toLocaleDateString() : 'Present'}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => removeExperience(exp)}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        {showExpForm && (
          <View style={styles.addForm}>
            <TextInput
              style={styles.input}
              placeholder="Job Title"
              placeholderTextColor="#9CA3AF"
              value={expJobTitle}
              onChangeText={setExpJobTitle}
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Company / Organization"
              placeholderTextColor="#9CA3AF"
              value={expCompany}
              onChangeText={setExpCompany}
            />
            <View style={styles.chipRow}>
              {EXPERIENCE_CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.optionChip, expCategory === c && styles.optionChipActive]}
                  onPress={() => setExpCategory(c)}
                >
                  <Text
                    style={[styles.optionText, expCategory === c && styles.optionTextActive]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.dateRow}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Start (YYYY-MM-DD)"
                placeholderTextColor="#9CA3AF"
                value={expStartDate}
                onChangeText={setExpStartDate}
              />
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="End (YYYY-MM-DD)"
                placeholderTextColor="#9CA3AF"
                value={expEndDate}
                onChangeText={setExpEndDate}
              />
            </View>
            <TextInput
              style={[styles.input, styles.textArea, { marginTop: 8 }]}
              placeholder="Description"
              placeholderTextColor="#9CA3AF"
              value={expDescription}
              onChangeText={setExpDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.formActions}>
              <TouchableOpacity onPress={() => setShowExpForm(false)}>
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton} onPress={addExperience}>
                <Text style={styles.addButtonText}>Add</Text>
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

        {education.map((edu) => (
          <View key={edu._id} style={styles.entryCard}>
            <View style={styles.entryInfo}>
              <Text style={styles.entryTitle}>{edu.qualification}</Text>
              <Text style={styles.entrySubtitle}>{edu.institution}</Text>
              {(edu.startYear || edu.endYear) && (
                <Text style={styles.entryDates}>
                  {edu.startYear}
                  {edu.endYear ? ` - ${edu.endYear}` : ''}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => removeEducation(edu)}>
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
              placeholder="Field of Study (optional)"
              placeholderTextColor="#9CA3AF"
              value={eduField}
              onChangeText={setEduField}
            />
            <View style={styles.dateRow}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Start Year"
                placeholderTextColor="#9CA3AF"
                value={eduStartYear}
                onChangeText={setEduStartYear}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="End Year (or blank)"
                placeholderTextColor="#9CA3AF"
                value={eduEndYear}
                onChangeText={setEduEndYear}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.formActions}>
              <TouchableOpacity onPress={() => setShowEduForm(false)}>
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton} onPress={addEducation}>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Portfolio */}
        <View style={[styles.sectionHeader, { marginTop: 16 }]}>
          <Text style={styles.label}>
            Portfolio <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TouchableOpacity onPress={() => setShowPortfolioForm(true)}>
            <Text style={styles.addLink}>+ Add Project</Text>
          </TouchableOpacity>
        </View>

        {portfolio.map((item, index) => (
          <View key={item._id || index} style={styles.entryCard}>
            <View style={styles.entryInfo}>
              <Text style={styles.entryTitle}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.entrySubtitle} numberOfLines={2}>{item.description}</Text>
              ) : null}
              {item.fileUrl ? (
                <Text style={styles.entryDates} numberOfLines={1}>🔗 {item.fileUrl}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => removePortfolioItem(item)}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        {showPortfolioForm && (
          <View style={styles.addForm}>
            <TextInput
              style={styles.input}
              placeholder="Project / Work Title *"
              placeholderTextColor="#9CA3AF"
              value={portTitle}
              onChangeText={setPortTitle}
            />
            <TextInput
              style={[styles.input, styles.textArea, { marginTop: 8 }]}
              placeholder="Description (what you built, your role, outcome)"
              placeholderTextColor="#9CA3AF"
              value={portDescription}
              onChangeText={setPortDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Link to work (URL, GitHub, Drive, etc.) — optional"
              placeholderTextColor="#9CA3AF"
              value={portUrl}
              onChangeText={setPortUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <View style={styles.formActions}>
              <TouchableOpacity onPress={() => setShowPortfolioForm(false)}>
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addButton} onPress={addPortfolioItem}>
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Preferences */}
        <View style={[styles.sectionHeader, { marginTop: 16 }]}>
          <Text style={styles.label}>Work Preferences</Text>
        </View>

        <View style={styles.prefCard}>
          <Text style={styles.prefLabel}>Work Style <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.chipRow}>
            {WORK_STYLES.map((style) => (
              <TouchableOpacity
                key={style}
                style={[styles.optionChip, workStyle === style && styles.optionChipActive]}
                onPress={() => setWorkStyle(style)}
              >
                <Text style={[styles.optionText, workStyle === style && styles.optionTextActive]}>
                  {style}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.prefLabel, { marginTop: 12 }]}>Remote Work Preference <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.chipRow}>
            {REMOTE_PREFS.map((pref) => (
              <TouchableOpacity
                key={pref}
                style={[styles.optionChip, remotePref === pref && styles.optionChipActive]}
                onPress={() => setRemotePref(pref)}
              >
                <Text style={[styles.optionText, remotePref === pref && styles.optionTextActive]}>
                  {pref}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.prefLabel, { marginTop: 12 }]}>Learning Willingness <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.chipRow}>
            {LEARNING_PREFS.map((pref) => (
              <TouchableOpacity
                key={pref}
                style={[styles.optionChip, learningPref === pref && styles.optionChipActive]}
                onPress={() => setLearningPref(pref)}
              >
                <Text style={[styles.optionText, learningPref === pref && styles.optionTextActive]}>
                  {pref}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Personality Traits */}
          <Text style={[styles.prefLabel, { marginTop: 16 }]}>
            Personality Traits <Text style={styles.optional}>(optional)</Text>
          </Text>
          <Text style={styles.prefHint}>
            Select a level for each trait that describes you. Used for CV generation and opportunity matching.
          </Text>
          {PERSONALITY_TRAITS.map((trait) => (
            <View key={trait} style={styles.traitRow}>
              <Text style={styles.traitName}>{trait}</Text>
              <View style={styles.traitChips}>
                {TRAIT_LEVELS.map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.traitChip,
                      traitLevels[trait] === level && styles.traitChipActive,
                    ]}
                    onPress={() =>
                      setTraitLevels((prev) => ({
                        ...prev,
                        [trait]: prev[trait] === level ? '' : level,
                      }))
                    }
                  >
                    <Text
                      style={[
                        styles.traitChipText,
                        traitLevels[trait] === level && styles.traitChipTextActive,
                      ]}
                    >
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Skills — placed last so the AI suggester sees the fully-filled
            profile (title, bio, location, experience, education, preferences)
            and can produce accurate suggestions instead of thin/vague ones. */}
        <View style={[styles.sectionHeader, { marginTop: 16 }]}>
          <Text style={styles.label}>Skills</Text>
          <TouchableOpacity onPress={openSkillModal}>
            <Text style={styles.addLink}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {skills.length === 0 ? (
          <Text style={[styles.emptyHint, { marginBottom: 8 }]}>
            No skills added yet. Tap + Add to pick from AI suggestions, the catalog, or type your own.
          </Text>
        ) : (
          <View style={styles.skillsRow}>
            {skills.map((ps) => {
              const skillName =
                ps.skillId?.skillName || ps.skillId?.name || ps.skillName || 'Skill';
              return (
                <View key={ps._id} style={styles.skillChip}>
                  <Text style={styles.skillChipText}>
                    {skillName}
                    {ps.proficiencyLevel ? ` · ${ps.proficiencyLevel}` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => removeSkill(ps)}>
                    <Ionicons name="close" size={14} color="#EA580C" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Save Profile (basic fields) */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSaveProfile}
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
              <View style={styles.modalHeaderLeft}>
                {!pendingSkill && skillMethod && (
                  <TouchableOpacity
                    onPress={() => setSkillMethod(null)}
                    style={styles.modalBackBtn}
                  >
                    <Ionicons name="chevron-back" size={22} color="#1F2937" />
                  </TouchableOpacity>
                )}
                <Text style={styles.modalTitle}>
                  {pendingSkill
                    ? `Proficiency: ${pendingSkill.skillName || pendingSkill.name}`
                    : skillMethod === 'ai'
                    ? 'AI Suggested'
                    : skillMethod === 'browse'
                    ? 'Browse Skills'
                    : skillMethod === 'custom'
                    ? 'Add Custom Skill'
                    : 'Add a Skill'}
                </Text>
              </View>
              <TouchableOpacity onPress={closeSkillModal}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>

            {!pendingSkill && skillMethod === null && (
              <View style={styles.methodChooser}>
                <Text style={styles.methodIntro}>
                  Choose how you'd like to add a skill. You can come back here to try a different way.
                </Text>

                <TouchableOpacity
                  style={styles.methodCard}
                  onPress={() => setSkillMethod('ai')}
                >
                  <View style={[styles.methodIcon, { backgroundColor: '#FFF7ED' }]}>
                    <Ionicons name="flash" size={20} color="#F97316" />
                  </View>
                  <View style={styles.methodTextBlock}>
                    <Text style={styles.methodTitle}>AI Suggested</Text>
                    <Text style={styles.methodSubtitle}>
                      Get skill ideas based on your title and bio.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.methodCard}
                  onPress={() => setSkillMethod('browse')}
                >
                  <View style={[styles.methodIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="search" size={20} color="#2563EB" />
                  </View>
                  <View style={styles.methodTextBlock}>
                    <Text style={styles.methodTitle}>Search Skills</Text>
                    <Text style={styles.methodSubtitle}>
                      Browse and pick from the existing skills catalog.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.methodCard}
                  onPress={() => setSkillMethod('custom')}
                >
                  <View style={[styles.methodIcon, { backgroundColor: '#F0FDF4' }]}>
                    <Ionicons name="create-outline" size={20} color="#16A34A" />
                  </View>
                  <View style={styles.methodTextBlock}>
                    <Text style={styles.methodTitle}>Add a Custom Skill</Text>
                    <Text style={styles.methodSubtitle}>
                      Type a skill that isn't in the catalog yet.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                </TouchableOpacity>
              </View>
            )}

            {!pendingSkill && skillMethod === 'ai' && (
              <View style={styles.aiPanel}>
                <View style={styles.aiHeaderRow}>
                  <Text style={styles.aiHeaderText}>AI SUGGESTED</Text>
                  {suggestLoading && (
                    <Text style={styles.aiThinking}>Thinking…</Text>
                  )}
                </View>
                {suggestions.length > 0 ? (
                  <View style={styles.aiPillsRow}>
                    {suggestions.map((s) => {
                      const already = skills.some(
                        (ps) => (ps.skillId?._id || ps.skillId) === s._id
                      );
                      return (
                        <TouchableOpacity
                          key={s._id}
                          disabled={already}
                          onPress={() =>
                            openSkillPicker({ _id: s._id, skillName: s.name })
                          }
                          style={[styles.aiPill, already && styles.aiPillActive]}
                        >
                          <Ionicons
                            name="flash"
                            size={11}
                            color={already ? '#FFFFFF' : '#F97316'}
                            style={{ marginRight: 4 }}
                          />
                          <Text
                            style={[
                              styles.aiPillText,
                              already && styles.aiPillTextActive,
                            ]}
                          >
                            {s.name}
                            {already ? ' ✓' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  !suggestLoading && (
                    <Text style={styles.aiEmptyText}>
                      No suggestions yet — add a Professional Title and Bio, or fill in at least one Experience or Education entry, and ideas will appear here.
                    </Text>
                  )
                )}
              </View>
            )}

            {!pendingSkill && skillMethod === 'browse' && (
              <>
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
                  style={{ flex: 1 }}
                  data={filteredSkills}
                  keyExtractor={(item) => item._id || item.id}
                  renderItem={({ item }) => {
                    const already = skills.some(
                      (s) => (s.skillId?._id || s.skillId) === item._id
                    );
                    return (
                      <TouchableOpacity
                        style={styles.modalSkillItem}
                        disabled={already}
                        onPress={() => openSkillPicker(item)}
                      >
                        <Text
                          style={[
                            styles.modalSkillText,
                            already && { color: '#9CA3AF' },
                          ]}
                        >
                          {item.skillName || item.name}
                          {already ? ' (added)' : ''}
                        </Text>
                        {!already && (
                          <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <Text style={styles.modalEmpty}>No skills found.</Text>
                  }
                />
              </>
            )}

            {!pendingSkill && skillMethod === 'custom' && (
              <View style={styles.customSkillBlock}>
                <Text style={styles.customSkillLabel}>ADD A CUSTOM SKILL</Text>
                <View style={styles.customSkillRow}>
                  <TextInput
                    style={styles.customSkillInput}
                    placeholder="e.g. Boda boda dispatching"
                    placeholderTextColor="#9CA3AF"
                    value={customInput}
                    onChangeText={setCustomInput}
                    onSubmitEditing={addCustomSkill}
                    returnKeyType="done"
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={addCustomSkill}
                    disabled={customAdding || !customInput.trim()}
                    style={[
                      styles.customSkillBtn,
                      (customAdding || !customInput.trim()) &&
                        styles.customSkillBtnDisabled,
                    ]}
                  >
                    <Text style={styles.customSkillBtnText}>
                      {customAdding ? 'Adding…' : '+ Add'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.aiEmptyText}>
                  If a matching skill already exists in the catalog, we'll use that one instead of creating a duplicate.
                </Text>
              </View>
            )}

            {pendingSkill && (
              <View style={{ padding: 20 }}>
                <Text style={[styles.label, { marginBottom: 12 }]}>
                  Choose your proficiency level
                </Text>
                <View style={styles.chipRow}>
                  {PROFICIENCY_LEVELS.map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={[
                        styles.optionChip,
                        pendingProficiency === level && styles.optionChipActive,
                      ]}
                      onPress={() => setPendingProficiency(level)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          pendingProficiency === level && styles.optionTextActive,
                        ]}
                      >
                        {level}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.saveButton, { marginTop: 20 }]}
                  onPress={confirmAddSkill}
                >
                  <Text style={styles.saveButtonText}>Add Skill</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPendingSkill(null)}
                  style={{ marginTop: 10, alignItems: 'center' }}
                >
                  <Text style={styles.cancelLink}>Back</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
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
  screenTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
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
  textArea: { minHeight: 90 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  addLink: { fontSize: 14, color: '#F97316', fontWeight: '600' },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
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
  skillChipText: { fontSize: 13, color: '#EA580C', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },
  prefCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  prefLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  prefHint: { fontSize: 12, color: '#9CA3AF', marginBottom: 8, lineHeight: 16 },
  optional: { fontSize: 12, fontWeight: '400', color: '#9CA3AF' },
  traitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  traitName: {
    fontSize: 13,
    color: '#374151',
    textTransform: 'capitalize',
    flex: 1,
  },
  traitChips: {
    flexDirection: 'row',
    gap: 4,
  },
  traitChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  traitChipActive: {
    backgroundColor: '#FFF7ED',
    borderColor: '#F97316',
  },
  traitChipText: { fontSize: 11, color: '#6B7280' },
  traitChipTextActive: { color: '#F97316', fontWeight: '600' },
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
  entryInfo: { flex: 1 },
  entryTitle: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  entrySubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  entryDates: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  addForm: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  optionChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  optionChipActive: {
    backgroundColor: '#FFF7ED',
    borderColor: '#F97316',
  },
  optionText: { fontSize: 12, color: '#6B7280', textTransform: 'capitalize' },
  optionTextActive: { color: '#F97316', fontWeight: '600' },
  dateRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  halfInput: { flex: 1 },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  cancelLink: { fontSize: 14, color: '#6B7280' },
  addButton: {
    backgroundColor: '#F97316',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  saveButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
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
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalBackBtn: {
    marginRight: 6,
    marginLeft: -6,
    padding: 2,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
  methodChooser: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  methodIntro: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
    lineHeight: 18,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodTextBlock: { flex: 1 },
  methodTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  methodSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 16 },
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
  modalSkillText: { fontSize: 15, color: '#374151' },
  modalEmpty: {
    textAlign: 'center',
    color: '#9CA3AF',
    paddingVertical: 24,
    fontSize: 14,
  },
  aiPanel: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  aiHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
    letterSpacing: 0.5,
  },
  aiThinking: { fontSize: 11, color: '#9CA3AF' },
  aiPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDBA74',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  aiPillActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  aiPillText: { fontSize: 12, color: '#EA580C', fontWeight: '500' },
  aiPillTextActive: { color: '#FFFFFF' },
  aiEmptyText: { fontSize: 11, color: '#9CA3AF' },
  customSkillBlock: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  customSkillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  customSkillRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customSkillInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
  },
  customSkillBtn: {
    backgroundColor: '#F97316',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  customSkillBtnDisabled: { opacity: 0.5 },
  customSkillBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});

export default EditProfileScreen;
