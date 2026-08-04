import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Easing,
  Dimensions,
  PanResponder,
  ScrollView,
  TouchableOpacity,
  Linking,
  BackHandler,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors} from '../theme/colors';
import {User, Globe, Folder, Mail, ChevronRight} from 'lucide-react-native';
import Svg, {Path} from 'react-native-svg';

const GithubIcon: React.FC<{color?: string; size?: number}> = ({
  color = '#0A84FF',
  size = 15,
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round">
    <Path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <Path d="M9 18c-4.51 2-5-2-7-2" />
  </Svg>
);

const INFO_ACCENT_BLUE = '#0A84FF';
const INFO_KEYWORD_GREEN = '#34C759';

interface Props {
  onGetStarted: () => void;
  onBack: () => void;
}

const {width} = Dimensions.get('window');
const SLIDER_WIDTH = width - 64;
const THUMB_SIZE = 52;
const SLIDE_THRESHOLD = SLIDER_WIDTH - THUMB_SIZE - 16;

const HomeScreen: React.FC<Props> = ({onGetStarted, onBack}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const tagsFadeAnim = useRef(new Animated.Value(0)).current;
  const tagsSlideAnim = useRef(new Animated.Value(30)).current;
  const swipeX = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const [isInfoOpen, setIsInfoOpen] = React.useState(false);
  const infoAnim = useRef(new Animated.Value(0)).current;

  const openInfoModal = () => {
    setIsInfoOpen(true);
    infoAnim.setValue(0);
    Animated.timing(infoAnim, {
      toValue: 1,
      duration: 380,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
  };

  const closeInfoModal = () => {
    Animated.timing(infoAnim, {
      toValue: 0,
      duration: 320,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
      useNativeDriver: true,
    }).start(() => setIsInfoOpen(false));
  };

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(tagsFadeAnim, {
        toValue: 1,
        duration: 800,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(tagsSlideAnim, {
        toValue: 0,
        duration: 800,
        delay: 200,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]).start();

    // Shimmer animation for the slider text
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fadeAnim, slideAnim, shimmerAnim, tagsFadeAnim, tagsSlideAnim]);

  useEffect(() => {
    const handleBackPress = () => {
      if (isInfoOpen) {
        closeInfoModal();
        return true;
      }
      onBack();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [isInfoOpen, onBack]);

  const clampedSwipeX = swipeX.interpolate({
    inputRange: [0, SLIDE_THRESHOLD],
    outputRange: [0, SLIDE_THRESHOLD],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 1,
      onPanResponderGrant: () => {
        swipeX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        const clamped = Math.max(0, Math.min(gestureState.dx, SLIDE_THRESHOLD));
        swipeX.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentX = (swipeX as any)._value || gestureState.dx;
        if (currentX >= SLIDE_THRESHOLD * 0.5 || gestureState.vx > 0.3) {
          Animated.spring(swipeX, {
            toValue: SLIDE_THRESHOLD,
            useNativeDriver: false,
            bounciness: 0,
            speed: 20,
          }).start(() => {
            onGetStarted();
          });
        } else {
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: false,
            bounciness: 4,
            speed: 20,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeX, {
          toValue: 0,
          useNativeDriver: false,
          bounciness: 4,
          speed: 20,
        }).start();
      },
    }),
  ).current;

  const textOpacity = clampedSwipeX.interpolate({
    inputRange: [0, SLIDE_THRESHOLD * 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 1, 0.4],
  });

  const homeScale = infoAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.94],
  });

  const homeTranslateX = infoAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width * 0.25],
  });

  const homeOpacity = infoAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.5],
  });

  const infoTranslateX = infoAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [width, 0],
  });

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: Animated.multiply(fadeAnim, homeOpacity),
            transform: [
              {scale: homeScale},
              {translateX: homeTranslateX},
            ],
          },
        ]}>
        {/* Top Header/Navbar */}
        <View style={styles.header}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.questionButton}
            activeOpacity={0.82}
            onPress={openInfoModal}
          >
            <Image
              source={require('../assets/question-mark.png')}
              style={styles.questionIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        {/* Center Content */}
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <View style={styles.centerContainer}>
            <View style={styles.imageWrapper}>
              {/* Glow Behind Image */}
              <View style={styles.glow} />
              <Image
                source={require('../assets/ai.png')}
                style={styles.aiImage}
                resizeMode="contain"
              />
            </View>

            <Animated.View
              style={[
                styles.textContainer,
                {transform: [{translateY: slideAnim}]},
              ]}>
              <Text style={styles.title}>Rivo Agent</Text>
              <Text style={styles.subtitle}>On-Device Intelligence</Text>
              <Text style={styles.description}>
                Use a <Text style={styles.keyword}>device-based AI model</Text> that is incredibly <Text style={styles.keyword}>fast</Text> and completely <Text style={styles.keyword}>offline</Text>. Zero <Text style={styles.keyword}>storage usage</Text> with absolute <Text style={styles.keyword}>privacy</Text>.
              </Text>
            </Animated.View>

            {/* Feature Tags */}
            <Animated.View
              style={[
                styles.tagsContainer,
                {
                  opacity: tagsFadeAnim,
                  transform: [{translateY: tagsSlideAnim}],
                },
              ]}>
              <View style={styles.tag}>
                <View style={styles.tagIcon}>
                  <View style={styles.chatDot} />
                  <View style={styles.chatDot} />
                  <View style={styles.chatDot} />
                </View>
                <Text style={styles.tagText}>Chatting</Text>
              </View>
              <View style={styles.tag}>
                <View style={styles.tagIcon}>
                  <Text style={styles.codeIcon}>{'</>'}</Text>
                </View>
                <Text style={styles.tagText}>Coding</Text>
              </View>
              <View style={styles.tag}>
                <View style={styles.tagIcon}>
                  <View style={styles.lockBody} />
                  <View style={styles.lockArch} />
                </View>
                <Text style={styles.tagText}>No Data Collection</Text>
              </View>
            </Animated.View>
          </View>
        </ScrollView>

        {/* Swipe to Get Started */}
        <Animated.View
          style={[
            styles.footer,
            {
              transform: [{translateY: slideAnim}],
              paddingBottom: Math.max(insets.bottom, 24) + 24,
            },
          ]}>
          <View style={styles.sliderTrack}>
            {/* Background Text */}
            <Animated.Text
              style={[
                styles.sliderText,
                {opacity: textOpacity},
              ]}>
              Swipe to get started
            </Animated.Text>

            {/* Draggable Thumb */}
            <Animated.View
              style={[
                styles.sliderThumb,
                {transform: [{translateX: clampedSwipeX}]},
              ]}
              {...panResponder.panHandlers}>
              <View style={styles.chevronRow}>
                <ChevronRight color="#000000" size={20} strokeWidth={3} />
                <ChevronRight color="#000000" size={20} strokeWidth={3} style={styles.chevronOverlap} />
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      </Animated.View>

      {/* Info panel overlay slide-out */}
      {isInfoOpen && (
        <Animated.View
          style={[
            styles.infoPanel,
            {
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 16,
              transform: [{translateX: infoTranslateX}],
            },
          ]}>
          <View style={styles.infoHeader}>
            <TouchableOpacity
              style={styles.infoBackButton}
              activeOpacity={0.82}
              onPress={closeInfoModal}>
              <Image source={require('../assets/back.png')} style={styles.infoBackIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.infoHeaderCopy}>
              <Text style={styles.infoEyebrow}>ABOUT RIVO</Text>
              <Text style={styles.infoTitle}>Local AI details</Text>
            </View>
          </View>

          <ScrollView
            style={styles.infoScroll}
            contentContainerStyle={styles.infoContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.infoHero}>
              <Image source={require('../assets/logo.png')} style={styles.infoLogoSmall} resizeMode="contain" />
              <View style={styles.infoHeroCopy}>
                <Text style={styles.infoHeroTitle}>Rivo Agent</Text>
                <Text style={styles.infoHeroText}>
                  We are importing models from{' '}
                  <Text style={styles.infoHighlight}>Hugging Face</Text> and all agent work is
                  done by <Text style={styles.infoHighlight}>Rivo</Text>.
                </Text>
              </View>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Developer</Text>
              
              <View style={styles.infoLine}>
                <View style={styles.infoLineIconWrap}>
                  <User color={INFO_ACCENT_BLUE} size={15} strokeWidth={2.4} />
                  <Text style={styles.infoLineLabel}>Name</Text>
                </View>
                <Text style={styles.infoLineValue}>Sanket Padhyal</Text>
              </View>

              <TouchableOpacity
                style={styles.infoLine}
                activeOpacity={0.76}
                onPress={() => Linking.openURL('https://github.com/sanketpadhyal')}>
                <View style={styles.infoLineIconWrap}>
                  <GithubIcon color={INFO_ACCENT_BLUE} size={15} />
                  <Text style={styles.infoLineLabel}>GitHub</Text>
                </View>
                <Text style={styles.infoLineValue}>github.com/sanketpadhyal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.infoLine}
                activeOpacity={0.76}
                onPress={() => Linking.openURL('https://www.sanketpadhyal.in')}>
                <View style={styles.infoLineIconWrap}>
                  <Globe color={INFO_ACCENT_BLUE} size={15} strokeWidth={2.4} />
                  <Text style={styles.infoLineLabel}>Website</Text>
                </View>
                <Text style={styles.infoLineValue}>www.sanketpadhyal.in</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.infoLine}
                activeOpacity={0.76}
                onPress={() => Linking.openURL('https://github.com/sanketpadhyal/Rivo-Agent')}>
                <View style={styles.infoLineIconWrap}>
                  <Folder color={INFO_ACCENT_BLUE} size={15} strokeWidth={2.4} />
                  <Text style={styles.infoLineLabel}>Project repo</Text>
                </View>
                <Text style={styles.infoLineValue}>sanketpadhyal/Rivo-Agent</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.infoLine}
                activeOpacity={0.76}
                onPress={() => Linking.openURL('mailto:sanketpadhyal3@gmail.com')}>
                <View style={styles.infoLineIconWrap}>
                  <Mail color={INFO_ACCENT_BLUE} size={15} strokeWidth={2.4} />
                  <Text style={styles.infoLineLabel}>Support</Text>
                </View>
                <Text style={styles.infoLineValue}>sanketpadhyal3@gmail.com</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Source Status</Text>
              <Text style={styles.infoBody}>
                This project is <Text style={styles.infoHighlight}>open source</Text>. The{' '}
                <Text style={styles.infoHighlight}>GitHub repository</Text> is{' '}
                <Text style={styles.infoHighlight}>public</Text> and maintained by the developer.
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  logo: {
    width: 48,
    height: 48,
  },
  questionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionIcon: {
    width: 20,
    height: 20,
    tintColor: '#8E8E93',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 24,
  },
  centerContainer: {
    width: '100%',
    alignItems: 'center',
  },
  imageWrapper: {
    width: width * 0.55,
    height: width * 0.55,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 26,
  },
  glow: {
    position: 'absolute',
    width: '80%',
    height: '80%',
    backgroundColor: '#190C30',
    borderRadius: 200,
    shadowColor: Colors.primary,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 1,
    shadowRadius: 60,
  },
  aiImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontFamily: 'SF-Pro-Rounded-Bold',
    color: '#FFFFFF',
    letterSpacing: 0,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    color: '#A1A1AA',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  description: {
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    color: '#71717A',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  keyword: {
    color: Colors.success,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 8,
    gap: 10,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  tagIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginRight: 8,
  },
  chatDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#A1A1AA',
    marginHorizontal: 1,
  },
  codeIcon: {
    fontSize: 9,
    fontFamily: 'SF-Pro-Rounded-Bold',
    color: '#A1A1AA',
  },
  lockBody: {
    width: 8,
    height: 6,
    backgroundColor: '#A1A1AA',
    borderRadius: 2,
    position: 'absolute',
    bottom: 5,
  },
  lockArch: {
    width: 6,
    height: 5,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#A1A1AA',
    borderBottomWidth: 0,
    position: 'absolute',
    top: 4,
  },
  tagText: {
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    color: '#D4D4D8',
    letterSpacing: 0.2,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  sliderTrack: {
    width: SLIDER_WIDTH,
    height: THUMB_SIZE + 12,
    backgroundColor: '#1A1A1A',
    borderRadius: (THUMB_SIZE + 12) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    position: 'relative',
    overflow: 'hidden',
  },
  sliderText: {
    position: 'absolute',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    color: '#71717A',
    letterSpacing: 0.5,
  },
  sliderThumb: {
    position: 'absolute',
    left: 6,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronOverlap: {
    marginLeft: -10,
  },
  infoPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    backgroundColor: '#000000',
    shadowColor: '#000000',
    shadowOffset: {width: -8, height: 0},
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 25,
  },
  infoHeader: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  infoBackButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoBackIcon: {
    width: 28,
    height: 28,
    tintColor: '#FFFFFF',
  },
  infoHeaderCopy: {
    flex: 1,
  },
  infoEyebrow: {
    color: '#8E8E93',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 1.6,
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 24,
    marginTop: 2,
  },
  infoScroll: {
    flex: 1,
  },
  infoContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 34,
  },
  infoHero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#171719',
    marginBottom: 14,
  },
  infoLogoSmall: {
    width: 46,
    height: 46,
    marginRight: 14,
  },
  infoHeroCopy: {
    flex: 1,
  },
  infoHeroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 28,
  },
  infoHeroText: {
    color: '#A1A1AA',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 20,
    marginTop: 5,
  },
  infoHighlight: {
    color: '#34C759',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  infoBody: {
    color: '#A1A1AA',
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  infoSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#151517',
  },
  infoSectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginBottom: 12,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 8,
  },
  infoLineIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  infoLineLabel: {
    color: '#7C7C84',
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  infoLineValue: {
    flex: 1,
    color: '#F4F4F5',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'right',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  infoEmoji: {
    fontSize: 14,
  },
});

export default HomeScreen;
