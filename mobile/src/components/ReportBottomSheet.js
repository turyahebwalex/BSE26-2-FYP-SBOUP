/**
 * ReportBottomSheet
 *
 * A reusable bottom sheet that lets any authenticated user report an
 * opportunity, user, or message. Matches the backend Report model exactly.
 *
 * Usage:
 *   <ReportBottomSheet
 *     visible={showReport}
 *     onClose={() => setShowReport(false)}
 *     targetId={opportunity._id}
 *     targetType="opportunity"          // 'opportunity' | 'user' | 'message'
 *     targetLabel="this job posting"    // shown in the sheet title
 *   />
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reportAPI } from '../services/api'; // adjust path if needed

// ─── Reason options (mirrors backend enum exactly) ────────────────────────────
const REASONS = [
  {
    value: 'fraudulent_scam',
    label: 'Fraudulent / Scam',
    icon: 'warning-outline',
    description: 'This looks like a scam or fraudulent posting',
  },
  {
    value: 'spam',
    label: 'Spam',
    icon: 'mail-unread-outline',
    description: 'Repetitive, irrelevant or unsolicited content',
  },
  {
    value: 'inappropriate_content',
    label: 'Inappropriate Content',
    icon: 'ban-outline',
    description: 'Offensive, hateful or harmful material',
  },
  {
    value: 'fake_credentials',
    label: 'Fake Credentials',
    icon: 'ribbon-outline',
    description: 'Misrepresented qualifications or identity',
  },
  {
    value: 'payment_request',
    label: 'Requests Payment',
    icon: 'card-outline',
    description: 'Asking for money or personal financial info',
  },
  {
    value: 'other',
    label: 'Other',
    icon: 'ellipsis-horizontal-outline',
    description: 'Something else not listed above',
  },
];

// ─── Stages ───────────────────────────────────────────────────────────────────
const STAGE = { SELECT: 'select', DETAIL: 'detail', SUCCESS: 'success' };

const ReportBottomSheet = ({
  visible,
  onClose,
  targetId,
  targetType,
  targetLabel = 'this content',
}) => {
  const [stage, setStage]         = useState(STAGE.SELECT);
  const [reason, setReason]       = useState(null);
  const [details, setDetails]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState(null);

  const slideAnim = useRef(new Animated.Value(600)).current;

  // Reset state whenever sheet opens
  useEffect(() => {
    if (visible) {
      setStage(STAGE.SELECT);
      setReason(null);
      setDetails('');
      setError(null);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 600,
      duration: 220,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleSelectReason = (value) => {
    setReason(value);
    setStage(STAGE.DETAIL);
  };

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportAPI.create({
        targetId,
        targetType,
        reason,
        details: details.trim() || undefined,
      });
      setStage(STAGE.SUCCESS);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        'Failed to submit report. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedReason = REASONS.find((r) => r.value === reason);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* Handle */}
          <View style={styles.handle} />

          {/* ── Stage: SELECT REASON ── */}
          {stage === STAGE.SELECT && (
            <>
              <View style={styles.sheetHeader}>
                <View style={styles.reportIconWrap}>
                  <Ionicons name="flag-outline" size={22} color="#EF4444" />
                </View>
                <Text style={styles.sheetTitle}>Report {targetLabel}</Text>
                <Text style={styles.sheetSubtitle}>
                  Why are you reporting this? Your report is anonymous.
                </Text>
              </View>

              <ScrollView
                style={styles.reasonList}
                showsVerticalScrollIndicator={false}
              >
                {REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={styles.reasonRow}
                    onPress={() => handleSelectReason(r.value)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.reasonIconWrap}>
                      <Ionicons name={r.icon} size={20} color="#6B7280" />
                    </View>
                    <View style={styles.reasonTextWrap}>
                      <Text style={styles.reasonLabel}>{r.label}</Text>
                      <Text style={styles.reasonDesc}>{r.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                  </TouchableOpacity>
                ))}
                <View style={{ height: 16 }} />
              </ScrollView>
            </>
          )}

          {/* ── Stage: ADD DETAILS ── */}
          {stage === STAGE.DETAIL && (
            <>
              <View style={styles.sheetHeader}>
                {/* Back button */}
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => { setStage(STAGE.SELECT); setError(null); }}
                >
                  <Ionicons name="arrow-back" size={20} color="#6B7280" />
                </TouchableOpacity>

                <View style={styles.selectedReasonPill}>
                  <Ionicons
                    name={selectedReason?.icon}
                    size={14}
                    color="#EF4444"
                  />
                  <Text style={styles.selectedReasonText}>
                    {selectedReason?.label}
                  </Text>
                </View>

                <Text style={styles.sheetTitle}>Add more details</Text>
                <Text style={styles.sheetSubtitle}>
                Optional but helps our team investigate faster.
                </Text>
              </View>

              <View style={styles.detailBody}>
                <TextInput
                  style={styles.detailInput}
                  placeholder="Describe the issue (optional)…"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  maxLength={2000}
                  value={details}
                  onChangeText={setDetails}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{details.length} / 2000</Text>

                {error && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="flag" size={16} color="#fff" />
                      <Text style={styles.submitText}>Submit Report</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Stage: SUCCESS ── */}
          {stage === STAGE.SUCCESS && (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrap}>
                <Ionicons name="checkmark-circle" size={56} color="#10B981" />
              </View>
              <Text style={styles.successTitle}>Report Submitted</Text>
              <Text style={styles.successMsg}>
                Thank you our team will review {targetLabel} and take appropriate action.
              </Text>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={handleClose}
                activeOpacity={0.85}
              >
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },

  // Header
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  reportIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  backBtn: {
    marginBottom: 10,
    padding: 4,
    alignSelf: 'flex-start',
  },
  selectedReasonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  selectedReasonText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '600',
  },

  // Reason list
  reasonList: {
    paddingHorizontal: 20,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  reasonIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonTextWrap: {
    flex: 1,
  },
  reasonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  reasonDesc: {
    fontSize: 12,
    color: '#6B7280',
  },

  // Detail stage
  detailBody: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  detailInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 110,
    backgroundColor: '#F9FAFB',
  },
  charCount: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    flex: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Success
  successContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 28,
    gap: 12,
  },
  successIconWrap: {
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  successMsg: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  doneBtn: {
    marginTop: 8,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 40,
  },
  doneText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});

export default ReportBottomSheet;