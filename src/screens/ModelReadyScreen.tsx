import React, {useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ScrollView,
  TouchableOpacity,
  Easing,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CheckCircle, LockKeyhole, ServerOff, WifiOff, ArrowRight} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIVACY_POINTS = [
  {
    title: 'Runs 100% Offline',
    caption: 'Replies are generated locally on this device.',
    Icon: WifiOff,
    color: '#0A84FF',
    bg: 'rgba(10, 132, 255, 0.12)',
    border: 'rgba(10, 132, 255, 0.2)',
  },
  {
    title: 'Zero Server Tracking',
    caption: 'No remote session logs for local chats.',
    Icon: ServerOff,
    color: '#FF9500',
    bg: 'rgba(255, 149, 0, 0.12)',
    border: 'rgba(255, 149, 0, 0.2)',
  },
  {
    title: 'Max Privacy',
    caption: 'Your model and chats stay in local storage.',
    Icon: LockKeyhole,
    color: '#34C759',
    bg: 'rgba(52, 199, 89, 0.12)',
    border: 'rgba(52, 199, 89, 0.2)',
  },
];

const ModelReadyScreen = ({onComplete}: {onComplete: () => void}) => {
  const insets = useSafeAreaInsets();
  
  const [modelName, setModelName] = React.useState('Your AI');

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem('selectedModelName').then(name => {
      if(name) setModelName(name);
    });

    // Premium spring animation on success
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      })
    ]).start();

    // Breathing glow animation loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.85,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Pulsing button scale loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.025,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scaleAnim, fadeAnim, glowAnim, pulseAnim]);

  const handleStartChat = async () => {
    // Mark setup as complete
    await AsyncStorage.setItem('hasOnboarded', 'true');
    // Go to Chat Screen
    onComplete();
  };

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        <View style={styles.content}>
          <Animated.View style={[styles.iconContainer, {transform: [{scale: scaleAnim}]}]}>
            <CheckCircle color="#0A84FF" size={58} strokeWidth={2.2} />
          </Animated.View>

          <Animated.View style={[styles.textContainer, {opacity: fadeAnim, transform: [{translateY: fadeAnim.interpolate({inputRange: [0, 1], outputRange: [18, 0]})}]}]}>
            <Text style={styles.title}>Model Downloaded</Text>
            <Text style={styles.subtitle}>
              {modelName} is saved to secure local storage.
            </Text>
            
            <View style={styles.infoBox}>
              {PRIVACY_POINTS.map(({title, caption, Icon, color, bg, border}, index) => (
                <View
                  style={[
                    styles.infoRow,
                    index < PRIVACY_POINTS.length - 1 && styles.infoRowDivider,
                  ]}
                  key={title}>
                  <View style={[styles.infoIconWrap, {backgroundColor: bg, borderColor: border}]}>
                    <Icon color={color} size={16} strokeWidth={2.4} />
                  </View>
                  <View style={styles.infoCopy}>
                    <Text style={styles.infoTitle}>{title}</Text>
                    <Text style={styles.infoCaption}>{caption}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        </View>
      </ScrollView>

      <Animated.View
        style={[
          styles.footer,
          {
            opacity: fadeAnim,
            paddingBottom: Math.max(insets.bottom + 14, 24),
            transform: [{scale: pulseAnim}],
          },
        ]}
      >
        <View style={styles.buttonWrapper}>
          <Animated.View style={[styles.buttonGlow, {opacity: glowAnim}]} />
          <TouchableOpacity
            style={styles.button}
            onPress={handleStartChat}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>Continue to Chat</Text>
              <ArrowRight color="#000000" size={18} strokeWidth={2.5} style={styles.buttonIcon} />
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>
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
    backgroundColor: '#000000',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: '#000000',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 22,
    backgroundColor: '#000000',
  },
  iconContainer: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(10, 132, 255, 0.2)',
  },
  textContainer: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 25,
    color: '#FFFFFF',
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    fontFamily: 'SF-Pro-Rounded-Semibold',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  infoBox: {
    backgroundColor: '#101012',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    width: '100%',
    maxWidth: 390,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 12},
    shadowOpacity: 0.24,
    shadowRadius: 20,
    elevation: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingVertical: 8,
  },
  infoRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(52,199,89,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoCopy: {
    flex: 1,
    justifyContent: 'center',
  },
  infoTitle: {
    color: '#E5E5EA',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 19,
  },
  infoCaption: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 15,
    marginTop: 3,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 8,
    backgroundColor: '#000000',
  },
  buttonWrapper: {
    width: '100%',
    position: 'relative',
  },
  buttonGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.9,
    shadowRadius: 22,
    elevation: 8,
  },
  button: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFFFFF',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  buttonIcon: {
    marginLeft: 8,
  },
});

export default ModelReadyScreen;
