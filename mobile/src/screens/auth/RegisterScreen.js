import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../../services/api';

const OTP_LENGTH = 6;

const RegisterScreen = ({ navigation }) => {
  // Registration form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // OTP related state
  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [tempUserData, setTempUserData] = useState(null);

  // Refs for OTP input boxes
  const otpRefs = useRef([]);

  // ── OTP input handlers ──────────────────────────────────────
  const handleOtpChange = (text, index) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const getOtpCode = () => otpDigits.join('');

  // ── Send OTP to Email ─────────────────────────────────────
  const sendOtpToEmail = async (userEmail) => {
    try {
      const response = await fetch(`${BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Send OTP error:', error);
      return false;
    }
  };

  // ── Step 1: Validate form & send OTP ────────────────────────
  const handleSendOtp = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setOtpSending(true);
    const sent = await sendOtpToEmail(email.trim().toLowerCase());
    setOtpSending(false);

    if (sent) {
      // Store user data temporarily (role fixed to skilled_worker)
      setTempUserData({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phoneNumber: phone.trim(),
        password,
        role: 'skilled_worker',
      });
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      setStep('otp');
      Alert.alert('Verification Code', `OTP sent to ${email}. Please check your inbox.`);
    } else {
      Alert.alert('Error', 'Failed to send OTP. Please try again later.');
    }
  };

  // ── Resend OTP ─────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (!tempUserData?.email) return;
    
    setOtpSending(true);
    const sent = await sendOtpToEmail(tempUserData.email);
    setOtpSending(false);
    
    if (sent) {
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      Alert.alert('OTP Resent', `A new code has been sent to ${tempUserData.email}.`);
    } else {
      Alert.alert('Error', 'Could not resend OTP. Please try again.');
    }
  };

  // ── Step 2: Verify OTP and complete registration ────────────
  const handleVerifyOtp = async () => {
    const code = getOtpCode();
    if (code.length < OTP_LENGTH) {
      Alert.alert('Error', `Please enter all ${OTP_LENGTH} digits.`);
      return;
    }

    setOtpVerifying(true);
    try {
      const response = await fetch(`${BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: tempUserData.email,
          otp: code,
          userData: tempUserData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Registration Failed', data.error || 'Invalid OTP or server error.');
        setOtpVerifying(false);
        return;
      }

      if (data.accessToken && data.refreshToken) {
        await AsyncStorage.setItem('accessToken', data.accessToken);
        await AsyncStorage.setItem('refreshToken', data.refreshToken);
        Alert.alert('Success', 'Account created successfully! Please log in.');
        navigation.replace('Login');
      } else {
        Alert.alert('Success', 'Registration successful. Please log in.');
        navigation.navigate('Login');
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleBackToForm = () => {
    setStep('form');
    setOtpDigits(Array(OTP_LENGTH).fill(''));
  };

  // ── Render: Registration Form ─────────────────────────────
  const renderForm = () => (
    <>
      <View style={styles.brandSection}>
        <Text style={styles.brandName}>SkillBridge</Text>
        <Text style={styles.tagline}>Create Your Account</Text>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.heading}>Sign Up</Text>
        <Text style={styles.subheading}>Join the skill-based opportunity platform</Text>

        {/* Full Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Enter your full name" 
            placeholderTextColor="#9CA3AF" 
            value={fullName} 
            onChangeText={setFullName} 
            autoCapitalize="words" 
          />
        </View>

        {/* Email */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Enter your email" 
            placeholderTextColor="#9CA3AF" 
            value={email} 
            onChangeText={setEmail} 
            keyboardType="email-address" 
            autoCapitalize="none" 
            autoCorrect={false} 
          />
        </View>

        {/* Phone Number (Optional) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number (Optional)</Text>
          <TextInput 
            style={styles.input} 
            placeholder="+256 7XX XXX XXX" 
            placeholderTextColor="#9CA3AF" 
            value={phone} 
            onChangeText={setPhone} 
            keyboardType="phone-pad" 
          />
        </View>

        {/* Password */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput 
              style={styles.passwordInput} 
              placeholder="At least 8 characters" 
              placeholderTextColor="#9CA3AF" 
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry={!showPassword} 
              autoCapitalize="none" 
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
              <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Confirm Password */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Re-enter your password" 
            placeholderTextColor="#9CA3AF" 
            value={confirmPassword} 
            onChangeText={setConfirmPassword} 
            secureTextEntry={!showPassword} 
            autoCapitalize="none" 
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.registerButton, (loading || otpSending) && styles.buttonDisabled]}
          onPress={handleSendOtp}
          disabled={loading || otpSending}
        >
          {otpSending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.registerButtonText}>Continue → Verify Email</Text>}
        </TouchableOpacity>

        {/* Login Link */}
        <View style={styles.loginRow}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  // ── Render: OTP Verification Screen ────────────────────────
  const renderOtpScreen = () => (
    <View style={styles.otpWrapper}>
      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={handleBackToForm}>
        <Ionicons name="chevron-back" size={24} color="#1F2937" />
      </TouchableOpacity>

      {/* Title */}
      <Text style={styles.otpTitle}>Verify your account</Text>

      {/* Instructions */}
      <Text style={styles.otpSub}>We sent you a verification code to</Text>
      <Text style={styles.otpEmail}>{tempUserData?.email}</Text>

      {/* OTP Input Boxes */}
      <View style={styles.digitRow}>
        {Array(OTP_LENGTH).fill(0).map((_, i) => (
          <TextInput
            key={i}
            ref={(el) => (otpRefs.current[i] = el)}
            style={[styles.digitBox, otpDigits[i] ? styles.digitBoxFilled : null]}
            value={otpDigits[i]}
            onChangeText={(t) => handleOtpChange(t, i)}
            onKeyPress={(e) => handleOtpKeyPress(e, i)}
            keyboardType="number-pad"
            maxLength={1}
            textAlign="center"
            selectTextOnFocus
          />
        ))}
      </View>

      {/* Expiry Notice */}
      <Text style={styles.expiryText}>Code expires in 10 minutes</Text>

      {/* Resend Button */}
      <TouchableOpacity onPress={handleResendOtp} disabled={otpSending} style={styles.resendButton}>
        <Text style={styles.resendLink}>
          {otpSending ? 'Sending...' : "Didn't receive the code? Resend"}
        </Text>
      </TouchableOpacity>

      {/* Verify Button */}
      <TouchableOpacity
        style={[styles.signUpButton, otpVerifying && styles.buttonDisabled]}
        onPress={handleVerifyOtp}
        disabled={otpVerifying}
      >
        {otpVerifying
          ? <ActivityIndicator color="#FFFFFF" />
          : <Text style={styles.signUpButtonText}>Verify & Sign Up</Text>
        }
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === 'form' ? renderForm() : renderOtpScreen()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 24 },

  // Brand Section
  brandSection: { alignItems: 'center', marginBottom: 24 },
  brandName: { fontSize: 32, fontWeight: '700', color: '#F97316' },
  tagline: { fontSize: 14, color: '#6B7280', marginTop: 4 },

  // Form Card
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 24,
  },
  heading: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#6B7280', marginBottom: 20 },

  // Input Fields
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    color: '#1F2937', backgroundColor: '#FFFFFF',
  },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, backgroundColor: '#FFFFFF',
  },
  passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1F2937' },
  eyeButton: { paddingHorizontal: 14, paddingVertical: 12 },
  eyeText: { fontSize: 13, color: '#F97316', fontWeight: '500' },

  // Buttons
  registerButton: {
    backgroundColor: '#F97316', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.7 },
  registerButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

  loginRow: { flexDirection: 'row', justifyContent: 'center' },
  loginText: { fontSize: 14, color: '#6B7280' },
  loginLink: { fontSize: 14, color: '#F97316', fontWeight: '600' },

  // OTP Screen
  otpWrapper: { flex: 1, paddingTop: 8, paddingHorizontal: 4 },
  backButton: { width: 36, height: 36, justifyContent: 'center', marginBottom: 28 },
  otpTitle: { fontSize: 24, fontWeight: '700', color: '#1F2937', textAlign: 'center', marginBottom: 14 },
  otpSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  otpEmail: { fontSize: 16, fontWeight: '600', color: '#F97316', textAlign: 'center', marginTop: 4, marginBottom: 8 },

  // OTP Input Boxes
  digitRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28, marginBottom: 14, gap: 8 },
  digitBox: {
    flex: 1, aspectRatio: 1, borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 10,
    fontSize: 20, fontWeight: '600', color: '#1F2937', backgroundColor: '#FFFFFF', textAlign: 'center',
  },
  digitBoxFilled: { borderColor: '#F97316', backgroundColor: '#FFF7ED' },

  expiryText: { fontSize: 13, color: '#6B7280', marginBottom: 14, textAlign: 'center' },
  resendButton: { alignItems: 'center', marginBottom: 32, marginTop: 8 },
  resendLink: { fontSize: 14, color: '#F97316', fontWeight: '500' },

  signUpButton: { backgroundColor: '#F97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  signUpButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});

export default RegisterScreen;