import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { cvAPI } from '../../services/api';

const SECTIONS = [
  { key: 'experience', label: 'Work Experience', icon: 'briefcase-outline' },
  { key: 'skills', label: 'Skills & Competencies', icon: 'construct-outline' },
  { key: 'education', label: 'Education', icon: 'school-outline' },
  { key: 'communityWork', label: 'Community Work', icon: 'people-outline' },
];

const TEMPLATES = [
  { key: 'chronological', label: 'Chronological', description: 'Timeline of experience' },
  { key: 'skills_based', label: 'Skills-based', description: 'Highlights competencies' },
  { key: 'portfolio_focused', label: 'Portfolio', description: 'Showcases your work' },
];

const GenerateCVScreen = ({ navigation }) => {
  const [selectedSections, setSelectedSections] = useState({
    experience: true,
    skills: true,
    education: true,
    communityWork: false,
  });
  const [selectedTemplate, setSelectedTemplate] = useState('chronological');
  const [generating, setGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [cvId, setCvId] = useState(null);

  const toggleSection = (key) => {
    setSelectedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleGenerate = async () => {
    const includeSections = Object.keys(selectedSections).filter(
      (key) => selectedSections[key]
    );

    if (includeSections.length === 0) {
      Alert.alert('Error', 'Please select at least one section to include.');
      return;
    }

    setGenerating(true);
    setDownloadUrl(null);
    setCvId(null);

    try {
      const { data } = await cvAPI.generate({
        templateType: selectedTemplate,
        selectedData: { sections: includeSections },
      });

      const cv = data.cv || data;
      const url = cv.fileUrl || data.downloadUrl || data.url;
      const id = cv._id || data.cvId || data.id;

      if (url) {
        setDownloadUrl(url);
      }
      if (id) {
        setCvId(id);
      }

      Alert.alert('Success', 'Your CV has been generated!');
    } catch (err) {
      const msg =
        err.response?.data?.message || err.response?.data?.error || 'Failed to generate CV.';
      Alert.alert('Error', msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (downloadUrl) {
      try {
        await Linking.openURL(downloadUrl);
      } catch {
        Alert.alert('Error', 'Could not open download link.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Generate CV</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Sections to include */}
        <Text style={styles.sectionTitle}>Include Sections</Text>
        <Text style={styles.sectionSubtitle}>
          Select what to include in your CV
        </Text>

        {SECTIONS.map((section) => (
          <TouchableOpacity
            key={section.key}
            style={styles.checkItem}
            onPress={() => toggleSection(section.key)}
            activeOpacity={0.7}
          >
            <View style={styles.checkItemLeft}>
              <Ionicons name={section.icon} size={20} color="#6B7280" />
              <Text style={styles.checkItemLabel}>{section.label}</Text>
            </View>
            <Ionicons
              name={selectedSections[section.key] ? 'checkbox' : 'square-outline'}
              size={24}
              color={selectedSections[section.key] ? '#F97316' : '#D1D5DB'}
            />
          </TouchableOpacity>
        ))}

        {/* Template Picker */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Template</Text>
        <Text style={styles.sectionSubtitle}>Choose your CV design</Text>

        <View style={styles.templateRow}>
          {TEMPLATES.map((tmpl) => (
            <TouchableOpacity
              key={tmpl.key}
              style={[
                styles.templateCard,
                selectedTemplate === tmpl.key && styles.templateCardActive,
              ]}
              onPress={() => setSelectedTemplate(tmpl.key)}
            >
              <Ionicons
                name={tmpl.key === 'professional' ? 'document-outline' : 'color-palette-outline'}
                size={28}
                color={selectedTemplate === tmpl.key ? '#F97316' : '#9CA3AF'}
              />
              <Text
                style={[
                  styles.templateLabel,
                  selectedTemplate === tmpl.key && styles.templateLabelActive,
                ]}
              >
                {tmpl.label}
              </Text>
              <Text style={styles.templateDesc}>{tmpl.description}</Text>
              {selectedTemplate === tmpl.key && (
                <View style={styles.selectedIndicator}>
                  <Ionicons name="checkmark-circle" size={20} color="#F97316" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Generate Button */}
        <TouchableOpacity
          style={[styles.generateButton, generating && styles.buttonDisabled]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <View style={styles.generateRow}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.generateButtonText}>Generating...</Text>
            </View>
          ) : (
            <View style={styles.generateRow}>
              <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
              <Text style={styles.generateButtonText}>Generate CV</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Download Link */}
        {(downloadUrl || cvId) && (
          <View style={styles.downloadCard}>
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
            <View style={styles.downloadInfo}>
              <Text style={styles.downloadTitle}>CV Ready!</Text>
              <Text style={styles.downloadText}>
                Your CV has been generated successfully.
              </Text>
            </View>
            {downloadUrl && (
              <TouchableOpacity style={styles.downloadButton} onPress={handleDownload}>
                <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.downloadButtonText}>Download</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 14,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  checkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkItemLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  templateRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  templateCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  templateCardActive: {
    borderColor: '#F97316',
    backgroundColor: '#FFF7ED',
  },
  templateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
    marginBottom: 4,
  },
  templateLabelActive: {
    color: '#F97316',
  },
  templateDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  generateButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  generateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  downloadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  downloadInfo: {
    flex: 1,
  },
  downloadTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#065F46',
  },
  downloadText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default GenerateCVScreen;
