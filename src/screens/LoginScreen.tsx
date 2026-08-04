import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {Colors} from '../theme/colors';

const backSource = require('../assets/back.png');

GoogleSignin.configure({
  webClientId: '961036114831-a44bb7j0ihncpl0ghot7m66dcrkl7eng.apps.googleusercontent.com',
});

interface Props {
  onBack: () => void;
  onAuthComplete: () => void;
}

const LoginScreen: React.FC<Props> = ({onBack, onAuthComplete}) => {
  const insets = useSafeAreaInsets();
  const [googleLoading, setGoogleLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const backAnim = useRef(new Animated.Value(0)).current;
  const backScale = useRef(new Animated.Value(0.85)).current;
  const buttonSlide1 = useRef(new Animated.Value(40)).current;
  const buttonSlide2 = useRef(new Animated.Value(40)).current;
  const buttonFade1 = useRef(new Animated.Value(0)).current;
  const buttonFade2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Main content fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: true,
      }),
      // Back button
      Animated.timing(backAnim, {
        toValue: 1,
        duration: 500,
        delay: 100,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.timing(backScale, {
        toValue: 1,
        duration: 500,
        delay: 100,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
      // Button 1 (Google) staggered
      Animated.timing(buttonSlide1, {
        toValue: 0,
        duration: 500,
        delay: 200,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: true,
      }),
      Animated.timing(buttonFade1, {
        toValue: 1,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }),
      // Button 2 (Apple) staggered
      Animated.timing(buttonSlide2, {
        toValue: 0,
        duration: 500,
        delay: 350,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: true,
      }),
      Animated.timing(buttonFade2, {
        toValue: 1,
        duration: 500,
        delay: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    backAnim,
    backScale,
    buttonFade1,
    buttonFade2,
    buttonSlide1,
    buttonSlide2,
    fadeAnim,
    slideAnim,
  ]);

  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      
      if (!response.data?.idToken) {
        throw new Error('No ID token found');
      }

      // Create a Google credential with the token
      const googleCredential = auth.GoogleAuthProvider.credential(response.data.idToken);

      // Sign-in the user with the credential
      await auth().signInWithCredential(googleCredential);
      
      onAuthComplete();
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = () => {
    console.log('LoginScreen: Bypassing auth via Continue with Apple');
    onAuthComplete();
  };

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={onBack}
        activeOpacity={0.7}>
        <Animated.View
          style={[
            styles.backCircle,
            {opacity: backAnim, transform: [{scale: backScale}]},
          ]}>
          <Image source={backSource} style={styles.backIcon} resizeMode="contain" />
        </Animated.View>
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {paddingBottom: insets.bottom + 28},
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        {/* Main Content */}
        <Animated.View
          style={[
            styles.content,
            {opacity: fadeAnim, transform: [{translateY: slideAnim}]},
          ]}>
          {/* Logo + Header */}
          <View style={styles.header}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Rivo Agent</Text>
            <Text style={styles.subtitle}>Login to get started</Text>
          </View>

          {/* Auth Buttons */}
          <View style={styles.buttonsContainer}>
            {/* Google Button */}
            <Animated.View
              style={{
                opacity: buttonFade1,
                transform: [{translateY: buttonSlide1}],
                width: '100%',
                alignItems: 'center',
              }}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.authButton,
                  styles.primaryButton,
                ]}
                onPress={handleGoogleSignIn}
                disabled={googleLoading}>
                {/* Google Icon */}
                <Image
                  source={require('../assets/google.webp')}
                  style={styles.googleIcon}
                  resizeMode="contain"
                />
                <Text style={styles.primaryButtonText}>
                  Continue with Google
                </Text>
                {googleLoading && (
                  <ActivityIndicator
                    color="#000000"
                    size="small"
                    style={styles.loader}
                  />
                )}
                {/* Recommended Badge */}
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>RECOMMENDED</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Apple Button */}
            <Animated.View
              style={{
                opacity: buttonFade2,
                transform: [{translateY: buttonSlide2}],
                width: '100%',
                alignItems: 'center',
              }}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.authButton}
                onPress={handleAppleSignIn}>
                {/* Apple Icon */}
                <Image
                  source={require('../assets/apple.png')}
                  style={styles.appleIcon}
                  resizeMode="contain"
                />
                <Text style={styles.buttonText}>Continue with Apple</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Privacy Note */}
          <Text style={styles.termsText}>
            We use login simply to keep the app secure. We do not collect your data. Everything is saved in your device's cache, and once you delete the app, all data is permanently erased.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 52,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  backCircle: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    width: 28,
    height: 28,
    tintColor: '#FFFFFF',
  },
  content: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 42,
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    fontFamily: 'SF-Pro-Rounded-Bold',
    color: '#FFFFFF',
    letterSpacing: 0,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    color: '#71717A',
    letterSpacing: 0.3,
  },
  buttonsContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 14,
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    width: '100%',
    maxWidth: 300,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 18,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
    marginTop: 10,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    color: '#000000',
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    color: '#FFFFFF',
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  appleIcon: {
    width: 26,
    height: 26,
    marginRight: 12,
    tintColor: '#FFFFFF', // Ensures the apple icon is pure white if it isn't already
    transform: [{translateY: -2}], // Nudge slightly upwards
  },
  loader: {
    position: 'absolute',
    right: 22,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: Colors.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recommendedText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 0.8,
  },
  termsText: {
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    color: '#52525B',
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
    paddingHorizontal: 20,
  },
  termsLink: {
    color: '#A1A1AA',
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;
