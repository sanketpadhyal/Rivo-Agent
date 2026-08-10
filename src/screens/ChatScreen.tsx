import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Share as NativeShare,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  Vibration,
  View,
  NativeModules,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Globe,
  MoreHorizontal,
  SendHorizontal,
  Share2,
  Square,
  User,
  Folder,
  Mail,
  Lightbulb,
  Smartphone,
  Cpu,
  HardDrive,
  Lock,
  Sparkles,
  Laptop,
  Zap,
  Sliders,
  Crown,
  Gauge,
  Rocket,
  Flag,
  Minimize2,
  ArrowUp,
  BrainCircuit,
  LogOut,
  Palette,
  Plus,
  X,
  Eye,
  MessageCircle,
  Trash2,
} from 'lucide-react-native';
import Svg, {Path} from 'react-native-svg';
import {launchImageLibrary} from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import DeviceInfo from 'react-native-device-info';
import {initLlama, LlamaContext, RNLlamaOAICompatibleMessage} from 'llama.rn';
import {getModelFilePath, getSelectedInstalledModel, getSelectedInstalledVisionModel, deleteModelFile, getVisionImageFilePath, hasInstalledVisionModel, seedVisionDownload, QWEN_VISION_MODEL} from '../utils/modelInstallStatus';
import {findCatalogModel, renderModelLogoSource} from '../data/modelCatalog';
import {formatVisionModelSize} from '../data/visionModelCatalog';
import {getExistingDownloadTasks} from '@kesha-antonov/react-native-background-downloader';
import ProfessionalAlert from '../components/ProfessionalAlert';
import Loader from '../components/Loader';

const GithubIcon: React.FC<{color?: string; size?: number}> = ({color = '#0A84FF', size = 15}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <Path d="M9 18c-4.51 2-5-2-7-2" />
  </Svg>
);

const requestPhotoPermissions = async () => {
  if (Platform.OS !== 'android') return true;
  try {
    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
    const permission = apiLevel >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
    
    if (!permission) return true;
    const hasPermission = await PermissionsAndroid.check(permission);
    if (hasPermission) return true;

    const granted = await PermissionsAndroid.request(permission, {
      title: 'Photo Access Needed',
      message: 'Rivo needs permission to access your photo gallery so you can select images to analyze with Vision.',
      buttonPositive: 'Allow',
      buttonNegative: 'Cancel',
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('ChatScreen: photo permission request error:', err);
    return true;
  }
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return 'Image attached';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const sanitizeVisionOutput = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/<\|box_start\|>/g, '')
    .replace(/<\|box_end\|>/g, '')
    .replace(/<\|ref_start\|>/g, '')
    .replace(/<\|ref_end\|>/g, '')
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/\(\d{1,4}\s*,\s*\d{1,4}\)\s*,?\s*/g, '')
    .replace(/\[VISUAL ANALYSIS OF ATTACHED IMAGE \([^)]+\)\]:\n?/g, '')
    .replace(/\[VISION SYSTEM NOTICE\]:\s*/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
};

/** Extracts a numeric parameter size (in billions) from the model name for tier-based optimizations. */
const getModelSizeB = (name: string): number => {
  const match = name.match(/(\d+(?:\.\d+)?)\s*B/i);
  if (match) return parseFloat(match[1]);
  // Handle 'Mini' / 'Mini' variants as ~3.8B (Phi 3.5 Mini)
  if (/mini/i.test(name)) return 3.8;
  return 3; // safe default for unknown models
};

/** Trims a vision analysis string to fit within a target word budget for smaller models. */
const trimVisionForModel = (visionText: string, modelSizeB: number): string => {
  if (!visionText || modelSizeB >= 7) return visionText; // Large models get full text
  // Strip the header wrapper if present — we re-add a leaner one later
  let text = visionText
    .replace(/\[VISUAL ANALYSIS OF ATTACHED IMAGE \([^)]+\)\]:\n?/, '')
    .replace(/\[CURRENT PHOTO OBSERVATION\]:\s*/i, '')
    .trim();
  const wordBudget = modelSizeB <= 1 ? 60 : modelSizeB <= 2 ? 100 : 160;
  const words = text.split(/\s+/);
  if (words.length > wordBudget) {
    text = words.slice(0, wordBudget).join(' ') + '...';
  }
  return text;
};

const makeVisionUnavailableNotice = (fileName: string, reason?: string) =>
  `[VISION SYSTEM NOTICE]: An image named "${fileName}" is attached, but local pixel scanning is unavailable${reason ? `: ${reason}` : ''}. A complete Qwen2-VL package requires both the main model and its mmproj projector. Please reinstall the Qwen2-VL vision model from the Vision Catalog in settings.`;

const generateVisionAnalysisForPrompt = async (
  imageUri: string,
  fileName: string,
  userQuery: string,
  mainContext?: LlamaContext | null,
  onProgress?: (text: string) => void,
): Promise<string> => {
  const visionModelInfo = await getSelectedInstalledVisionModel();
  const visionName = visionModelInfo?.name || 'Vision AI Engine';
  const isVisionInstalled = Boolean(visionModelInfo?.isInstalled) && await hasInstalledVisionModel().catch(() => false);
  let imagePath: string;
  try {
    imagePath = await getVisionImageFilePath(imageUri, fileName);
  } catch (error) {
    console.warn('generateVisionAnalysisForPrompt: failed to prepare image for vision:', error);
    return makeVisionUnavailableNotice(fileName, 'the selected image could not be read by the local vision runtime');
  }
  let accumulatedVisionText = '';

  const handleVisionData = (data: CompletionTokenUpdate) => {
    const chunk = coerceString(data.token) || coerceString(data.content);
    if (chunk) {
      accumulatedVisionText += chunk;
      const clean = sanitizeVisionOutput(accumulatedVisionText);
      onProgress?.(clean || accumulatedVisionText);
    } else {
      const acc = coerceString(data.accumulated_text);
      if (acc && acc.length > accumulatedVisionText.length) {
        accumulatedVisionText = acc;
        const clean = sanitizeVisionOutput(accumulatedVisionText);
        onProgress?.(clean || accumulatedVisionText);
      }
    }
  };

  // Case 1: If mainContext itself is multimodal / vision enabled
  if (mainContext) {
    const isMainMultimodal = await mainContext.isMultimodalEnabled?.().catch(() => false);
    if (isMainMultimodal) {
      try {
        const visionPrompt = `<|im_start|>user\n<__media__>\nWhat is inside this image? Describe the main subject, people, emotional facial expressions (crying, happy, sad), background, and text in detail.\n<|im_end|>\n<|im_start|>assistant\n`;
        const result = await mainContext.completion(
          {
            prompt: visionPrompt,
            media_paths: [imagePath],
            n_predict: 320,
            temperature: 0.2,
            top_p: 0.9,
            stop: STOP_WORDS,
          },
          handleVisionData,
        ).catch(e => {
          console.warn('generateVisionAnalysisForPrompt: mainContext vision completion failed:', e);
          return null;
        });

        let rawText = (result?.text || (result as any)?.content || accumulatedVisionText || '').trim();
        const fullText = sanitizeVisionOutput(rawText);
        if (fullText) {
          return `[VISUAL ANALYSIS OF ATTACHED IMAGE (${visionName.toUpperCase()})]:\n${fullText}`;
        }
      } catch (e) {
        console.warn('generateVisionAnalysisForPrompt: mainContext vision error:', e);
      }
    }
  }

  // Case 2: Dedicated Vision Model is installed (e.g. SmolVLM, Moondream, Qwen2-VL, etc.)
  if (isVisionInstalled && visionModelInfo?.fileName) {
    let dedicatedVisionCtx: LlamaContext | null = null;
    try {
      const resolvedVisionPath = visionModelInfo.filePath || getModelFilePath(visionModelInfo.fileName);
      const modelUri = resolvedVisionPath.startsWith('file://') ? resolvedVisionPath : `file://${resolvedVisionPath}`;
      const resolvedMmprojPath = visionModelInfo.mmprojPath || (visionModelInfo.mmprojFileName ? getModelFilePath(visionModelInfo.mmprojFileName) : null);
      const mmprojPath = resolvedMmprojPath ? (resolvedMmprojPath.startsWith('file://') ? resolvedMmprojPath : `file://${resolvedMmprojPath}`) : null;

      dedicatedVisionCtx = await initLlama({
        model: modelUri,
        n_ctx: 2048,
        n_batch: 64,
        n_threads: 2,
        n_gpu_layers: 0,
        ctx_shift: false,
        use_mmap: true,
        use_mlock: false,
      }).catch(e => {
        console.warn('generateVisionAnalysisForPrompt: failed to load dedicated vision model context:', e);
        return null;
      });

      if (dedicatedVisionCtx) {
        let isMultimodalActive = await dedicatedVisionCtx.isMultimodalEnabled?.().catch(() => false);
        if (!isMultimodalActive && typeof dedicatedVisionCtx.initMultimodal === 'function') {
          if (mmprojPath) {
            let multimodalStarted = await dedicatedVisionCtx.initMultimodal({
              path: mmprojPath,
              use_gpu: true,
              image_max_tokens: 512,
            }).catch(e => {
              console.warn('generateVisionAnalysisForPrompt: initMultimodal failed on vision model:', e);
              return false;
            });
            // Some Android devices cannot initialize the projector on their
            // GPU backend. Retry on CPU before declaring vision unavailable.
            if (!multimodalStarted) {
              multimodalStarted = await dedicatedVisionCtx.initMultimodal({
                path: mmprojPath,
                use_gpu: false,
                image_max_tokens: 512,
              }).catch(e => {
                console.warn('generateVisionAnalysisForPrompt: CPU initMultimodal fallback failed:', e);
                return false;
              });
            }
            isMultimodalActive = await dedicatedVisionCtx.isMultimodalEnabled?.().catch(() => false);
          } else {
            console.warn('generateVisionAnalysisForPrompt: vision model has no mmproj file; multimodal disabled.');
          }
        }

        if (!isMultimodalActive) {
          await dedicatedVisionCtx.release().catch(() => {});
          dedicatedVisionCtx = null;
          return makeVisionUnavailableNotice(fileName, 'the vision projector could not be initialized');
        }

        // llama.rn replaces <__media__> with the model's image embeddings.
        // It must be inside the user turn; using Qwen's literal <image> token
        // made the runtime append the real image after the assistant turn.
        const visionPrompt = `<|im_start|>user\n<__media__>\nDescribe what is in this image in detail. List the main subject, people, emotional facial expressions (e.g. crying, happy, sad), background, and text.\n<|im_end|>\n<|im_start|>assistant\n`;
        
        const completionOptions: any = {
          prompt: visionPrompt,
          n_predict: 320,
          temperature: 0.2,
          top_p: 0.9,
          stop: VISION_STOP_WORDS,
        };

        completionOptions.media_paths = [imagePath];

        const result = await dedicatedVisionCtx.completion(
          completionOptions,
          handleVisionData,
        ).catch(e => {
          console.warn('generateVisionAnalysisForPrompt: dedicated vision completion failed:', e);
          return null;
        });

        let rawText = (result?.text || (result as any)?.content || accumulatedVisionText || '').trim();
        let cleanText = sanitizeVisionOutput(rawText);

        if (!cleanText || cleanText.length < 5 || rawText.includes('<|box_start|>')) {
          const retryResult = await dedicatedVisionCtx.completion({
            prompt: `<|im_start|>user\n<__media__>\nWhat is this image?\n<|im_end|>\n<|im_start|>assistant\nThis image shows`,
            media_paths: [imagePath],
            n_predict: 256,
            temperature: 0.4,
            stop: VISION_STOP_WORDS,
          }).catch(() => null);
          const retryRaw = (retryResult?.text || (retryResult as any)?.content || '').trim();
          if (retryRaw) {
            const formatted = retryRaw.toLowerCase().startsWith('this image shows') ? retryRaw : `This image shows ${retryRaw}`;
            cleanText = sanitizeVisionOutput(formatted);
          }
        }

        // Safely release dedicated vision context after extraction
        await dedicatedVisionCtx.release().catch(() => {});
        dedicatedVisionCtx = null;

        const realOutput = cleanText || (rawText && !rawText.includes('<|box_start|>') ? rawText : '');
        if (realOutput) {
          return `[VISUAL ANALYSIS OF ATTACHED IMAGE (${visionName.toUpperCase()})]:\n${realOutput}`;
        }
      }
    } catch (err) {
      console.warn('generateVisionAnalysisForPrompt dedicated vision error:', err);
      if (dedicatedVisionCtx) {
        await (dedicatedVisionCtx as LlamaContext).release().catch(() => {});
      }
    }

    const realOutput = accumulatedVisionText || '';
    if (realOutput) {
      return `[VISUAL ANALYSIS OF ATTACHED IMAGE (${visionName.toUpperCase()})]:\n${realOutput}`;
    }
  }

  // Case 3: No Vision Model active/installed — return explicit instruction to LLM so it never hallucinates
  return makeVisionUnavailableNotice(
    fileName,
    isVisionInstalled ? 'the vision model returned no usable analysis' : undefined,
  );
};

interface Props {
  onBack: () => void;
  onOpenDownload?: () => void;
}

type ChatRole = 'user' | 'assistant' | 'notice';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  attachedImageUri?: string;
  interrupted?: boolean;
  isTruncated?: boolean;
  thoughtTimeMs?: number;
  totalTimeMs?: number;
  visionText?: string;
  isScanningVision?: boolean;
  visionModelName?: string;
  visionLabel?: string;
};

type MessageSegment =
  | {type: 'text'; content: string}
  | {type: 'code'; content: string; language: string};

type StoredThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  summary?: string;
  compactedCount?: number;
  userMemory?: string;
  isCodingLocked?: boolean;
};

type ResponsePhase = 'idle' | 'setting_up' | 'thinking' | 'composing';

type CompletionTextResult = {
  content?: string;
  interrupted?: boolean;
  text?: string;
};

type CompletionTokenUpdate = {
  token?: unknown;
  content?: unknown;
  accumulated_text?: unknown;
};

const CHAT_THREADS_KEY = 'rivo.chat.threads.v1';
const ACTIVE_THREAD_KEY = 'rivo.chat.activeThreadId.v1';
const MAX_THREADS = 7;
const STREAM_FLUSH_MS = 48; // Optimized from 16ms to prevent bridge congestion and keep UI buttery smooth
const SCROLL_THROTTLE_MS = 48; // Matched to stream flush rate to reduce scroll rendering overhead
const AUTO_SCROLL_RESUME_THRESHOLD = 90;
const RESTORE_SCROLL_DELAYS = [0, 80, 180, 320];
const ANDROID_KEYBOARD_RECHECK_DELAYS = [80, 180, 320];
const ANDROID_KEYBOARD_GAP = 8;
const ANDROID_KEYBOARD_RESIZE_TOLERANCE = 24;
const INFO_ACCENT_BLUE = '#0A84FF';
const INFO_KEYWORD_GREEN = '#34C759';
const logoSource = require('../assets/logo.png');
const questionMarkSource = require('../assets/question-mark.png');
const backSource = require('../assets/back.png');
const closeSource = require('../assets/close.png');
const newSource = require('../assets/new.png');
const contextSource = require('../assets/context.png');
const DEVELOPER_GITHUB_URL = 'https://github.com/sanketpadhyal';
const PROJECT_REPO_URL = 'https://github.com/sanketpadhyal/Rivo-Agent';
const SUPPORT_EMAIL = 'sanketpadhyal3@gmail.com';

const STOP_WORDS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<|endoftext|>',
];

const VISION_STOP_WORDS = [
  ...STOP_WORDS,
  '<|box_start|>',
  '<|box_end|>',
  '<|object_ref_start|>',
  '<|object_ref_end|>',
];

const ASCII_SYMBOL_PATTERN = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;
const LONG_SYMBOL_RUN_PATTERN = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]{8,}/;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripStopMarkers = (text: string) =>
  STOP_WORDS.reduce((current, stopWord) => (
    current.replace(new RegExp(escapeRegExp(stopWord), 'g'), '')
  ), text);

const sanitizeMessageForLlama = (text: string) => {
  if (!text) return '';
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
};

const formatUserMemoryForPrompt = (rawMemory: string): string => {
  if (!rawMemory || !rawMemory.trim()) {
    return 'None specified.';
  }
  return rawMemory
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      if (/^(the user|user|they|he|she)\b/i.test(line)) {
        return `- ${line}`;
      }
      const lower = line.toLowerCase();
      if (
        lower.startsWith('is ') ||
        lower.startsWith('likes ') ||
        lower.startsWith('wants ') ||
        lower.startsWith('prefers ') ||
        lower.startsWith('has ') ||
        lower.startsWith('uses ') ||
        lower.startsWith('works ') ||
        lower.startsWith('loves ')
      ) {
        return `- The user ${line}`;
      }
      return `- The user: ${line}`;
    })
    .join('\n');
};

const MENU_ITEMS = [
  {label: 'Fresh thread', isActive: true},
];

const EFFORT_PRESETS = [
  {id: 'light', label: 'Light', tokens: 256, desc: 'Quick & direct answers • 256 tokens', IconComponent: Rocket, color: '#FFD60A'},
  {id: 'medium', label: 'Medium', tokens: 512, desc: 'Balanced step-by-step reasoning • 512 tokens', IconComponent: Gauge, color: '#30B0C7'},
  {id: 'high', label: 'High', tokens: 1024, desc: 'Deep logic & complex coding • 1024 tokens', IconComponent: Cpu, color: '#BF5AF2'},
  {id: 'ultra', label: 'Ultra', tokens: 2048, desc: 'Exhaustive analysis & architecture • 2048 tokens', IconComponent: Crown, color: '#FF9F0A'},
];

const lightHaptic = () => {
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(10);
    } else {
      Vibration.vibrate(8);
    }
  } catch (error) {
    console.warn('ChatScreen: haptic feedback failed:', error);
  }
};

const streamHaptic = () => {
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(4);
    } else {
      Vibration.vibrate(3);
    }
  } catch (error) {
    // Ignore stream haptic failures
  }
};

const SEND_BUTTON_COLORS = [
  {hex: '#FFFFFF', name: 'Classic White'},
  {hex: '#34C759', name: 'Emerald Green'},
  {hex: '#0A84FF', name: 'Ocean Blue'},
  {hex: '#FF9500', name: 'Sunset Orange'},
  {hex: '#AF52DE', name: 'Neon Purple'},
  {hex: '#FF2D55', name: 'Crimson Red'},
  {hex: '#64D2FF', name: 'Cyan Blue'},
];

const INPUT_TEXT_COLORS = [
  {hex: '#FFFFFF', name: 'Crisp White'},
  {hex: '#30D158', name: 'Mint Green'},
  {hex: '#64D2FF', name: 'Ice Blue'},
  {hex: '#FF9500', name: 'Amber Orange'},
  {hex: '#A855F7', name: 'Violet Purple'},
  {hex: '#F2F2F7', name: 'Soft Gray'},
  {hex: '#FF3B30', name: 'Hot Red'},
];

const USER_BUBBLE_COLORS = [
  {hex: '#0AA550', name: 'Rivo Green'},
  {hex: '#262629', name: 'Dark Gray'},
  {hex: '#0A84FF', name: 'Ocean Blue'},
  {hex: '#FF9500', name: 'Sunset Orange'},
  {hex: '#AF52DE', name: 'Neon Purple'},
  {hex: '#FF2D55', name: 'Crimson Red'},
  {hex: '#00B4D8', name: 'Cyan Blue'},
];

const getContrastColor = (hex: string): string => {
  if (!hex) return '#000000';
  const cleanHex = hex.toUpperCase();
  if (cleanHex === '#FFFFFF' || cleanHex === '#F2F2F7' || cleanHex === '#64D2FF') {
    return '#000000';
  }
  return '#FFFFFF';
};

const AnimatedColorSwatch = React.memo(({
  hex,
  isSelected,
  onPress,
}: {
  hex: string;
  isSelected: boolean;
  onPress: () => void;
}) => {
  const scaleAnim = useRef(new Animated.Value(isSelected ? 1.18 : 1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isSelected ? 1.18 : 1,
      friction: 6,
      tension: 180,
      useNativeDriver: true,
    }).start();
  }, [isSelected, scaleAnim]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.88,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: isSelected ? 1.18 : 1,
        friction: 6,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      hitSlop={{top: 4, bottom: 4, left: 4, right: 4}}>
      <Animated.View
        style={[
          styles.colorSwatchCircle,
          {
            backgroundColor: hex,
            transform: [{scale: scaleAnim}],
          },
          isSelected && styles.colorSwatchSelected,
          isSelected && {borderColor: hex.toUpperCase() === '#FFFFFF' ? '#0A84FF' : '#FFFFFF'},
        ]}>
        {isSelected && (
          <Check
            color={getContrastColor(hex)}
            size={12}
            strokeWidth={3.2}
          />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
});

const setClipboardText = (text: string) => {
  const clipboard = NativeModules.RivoClipboard as
    | {setString?: (value: string) => Promise<boolean>}
    | undefined;

  clipboard?.setString?.(text).catch(error => {
    console.warn('ChatScreen: failed to copy text:', error);
  });
};

const createThreadId = () => `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const cleanFactValue = (value: string) =>
  value
    .trim()
    .replace(/[?.!,].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const titleCaseWords = (value: string) =>
  value
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const previewPrompt = (value: string) => {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 86 ? `${clean.slice(0, 83)}...` : clean;
};

const buildThinkingTrace = (prompt: string, hasMemory: boolean, isFirstMessage = false) => [
  `Understanding your question: "${previewPrompt(prompt)}"`,
  hasMemory
    ? 'Checking saved local memory and recent chat context.'
    : 'Checking recent chat context on this device.',
  'Identifying the main topic, intent, and useful details.',
  ...(isFirstMessage
    ? ['Waking up: Loading local model files into your device RAM/GPU (this first message may take longer to initialize, subsequent replies will be fast)...']
    : []),
  'Choosing the clearest structure for the reply.',
  'Starting the local response stream.',
];

const appendMemoryFact = (existing: string, fact: string) => {
  const cleanFact = fact.trim();
  if (!cleanFact) {
    return existing;
  }

  const facts = existing
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
  const factKey = cleanFact.toLowerCase();
  const filteredFacts = facts.filter(item => {
    if (factKey.startsWith('user name:')) {
      return !item.toLowerCase().startsWith('user name:');
    }
    return item.toLowerCase() !== factKey;
  });

  return [...filteredFacts, cleanFact].join('\n');
};

const extractUserMemory = (text: string, existing = '') => {
  let nextMemory = existing;
  const patterns = [
    /\bmy name is\s+([a-zA-Z][a-zA-Z\s]{1,40})/i,
    /\bmyself\s+([a-zA-Z][a-zA-Z\s]{1,40})/i,
    /\bi am\s+([A-Z][a-zA-Z\s]{1,40})/,
    /\bi'm\s+([A-Z][a-zA-Z\s]{1,40})/,
    /\bcall me\s+([a-zA-Z][a-zA-Z\s]{1,40})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const name = cleanFactValue(match?.[1] ?? '');
    if (name && name.length <= 40 && !/^(veg|vegetarian|a|an|the|rivo|assistant)$/i.test(name)) {
      nextMemory = appendMemoryFact(nextMemory, `User name: ${titleCaseWords(name)}.`);
      break;
    }
  }

  if (/\b(i\s+am|i'm)\s+(veg|vegetarian)\b/i.test(text) || /\bi\s*(hate|dislike|don't like|do not like)\s+meats?\b/i.test(text)) {
    nextMemory = appendMemoryFact(nextMemory, 'User is vegetarian and dislikes meat.');
  }

  const hateMatch = text.match(/\bi\s*(hate|dislike|don't like|do not like)\s+([^.,!?]{2,46})/i);
  const hateValue = cleanFactValue(hateMatch?.[2] ?? '');
  if (hateValue && !/^(you|it|this|that)$/i.test(hateValue)) {
    nextMemory = appendMemoryFact(nextMemory, `User dislikes ${hateValue}.`);
  }

  const likeMatch = text.match(/\bi\s*(like|love|prefer)\s+([^.,!?]{2,46})/i);
  const likeValue = cleanFactValue(likeMatch?.[2] ?? '');
  if (likeValue && !/^(you|it|this|that)$/i.test(likeValue)) {
    nextMemory = appendMemoryFact(nextMemory, `User likes ${likeValue}.`);
  }

  return nextMemory;
};

const BYTES_PER_GB = 1000 * 1000 * 1000;
const MARKET_RAM_TIERS = [1, 2, 3, 4, 6, 8, 12, 16, 18, 24, 32];

const normalizeWhitespace = (value?: string | null) => value?.replace(/\s+/g, ' ').trim() ?? '';

const getDisplayDeviceName = async () => {
  const [deviceName, rawModel, isEmulator] = await Promise.all([
    DeviceInfo.getDeviceName().catch(() => ''),
    Promise.resolve(DeviceInfo.getModel()).catch(() => ''),
    DeviceInfo.isEmulator().catch(() => false),
  ]);

  if (isEmulator) {
    return 'Android Virtual Device';
  }

  return normalizeWhitespace(deviceName) || normalizeWhitespace(rawModel) || 'This device';
};

const getMarketedRamGB = (bytes: number) => {
  const decimalRam = bytes / BYTES_PER_GB;
  const nearestTier = MARKET_RAM_TIERS.reduce((nearest, tier) => (
    Math.abs(tier - decimalRam) < Math.abs(nearest - decimalRam) ? tier : nearest
  ), MARKET_RAM_TIERS[0]);

  if (Math.abs(nearestTier - decimalRam) / nearestTier <= 0.18) {
    return nearestTier;
  }

  return Math.max(1, Math.round(decimalRam));
};

const extractNameFromMemory = (memory: string) => {
  const match = memory.match(/User name:\s*([^.\n]+)/i);
  return match?.[1]?.trim() || '';
};

const isGreetingPrompt = (text: string) =>
  /^(hi|hello|hey|yo|hiya|sup|hola|namaste|good\s+(morning|afternoon|evening))(?:\s+(rivo|bro|buddy|there|sir))?[!.?\s]*$/i.test(text.trim());

const isIdentityFallback = (response: string, aiName: string) => {
  const trimmed = response.trim();
  return (
    trimmed.startsWith('Hello!') ||
    trimmed.startsWith('Hi!') ||
    /\bhow can i (assist|help) you( today)?\b/i.test(response)
  );
};

const formatThoughtTime = (ms?: number) => {
  if (!ms || ms <= 0) return null;
  const sec = ms / 1000;
  return `Thought for ${sec.toFixed(1).replace(/\.0$/, '')}s`;
};

const isCodeLikeResponse = (text: string) => {
  if (!text) return false;
  const contentOnly = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  if (!contentOnly) return false;
  return /```[a-z]*\n[\s\S]*?\n```/i.test(contentOnly) || /```[\s\S]{12,}```/i.test(contentOnly);
};

const shouldRepairResponse = (prompt: string, response: string, aiName: string) =>
  !isCodeLikeResponse(response) &&
  !isGreetingPrompt(prompt) &&
  !/who\s+are\s+you|what\s+are\s+you|your\s+name|code|program|script|class|function|write/i.test(prompt) &&
  isIdentityFallback(response, aiName);

const stripEnclosingQuotes = (text: string): string => {
  if (!text) return text;
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('```')) return text;

  const isQuoteChar = (ch: string) => ch === '"' || ch === '“' || ch === '”' || ch === "'";

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if (isQuoteChar(first) && isQuoteChar(last) && trimmed.length >= 2) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner.length > 0 && !inner.startsWith('```')) {
      return inner;
    }
  }

  if ((trimmed.startsWith('"') || trimmed.startsWith('“')) && !trimmed.startsWith('```')) {
    const doubleQuoteCount = (trimmed.match(/["“”]/g) || []).length;
    if (doubleQuoteCount === 1) {
      return trimmed.slice(1).trimStart();
    }
    if (doubleQuoteCount === 2 && isQuoteChar(last)) {
      return trimmed.slice(1, -1).trim();
    }
  }

  return text;
};

const sanitizeGeneratedText = (text: string) => {
  const cleaned = stripStopMarkers(text)
    .replace(/^(thinking|composing|replying)\s*(\.{1,3})?\s*[:-]?\s*/i, '')
    .trim();

  if (/^(thinking|composing|replying)\s*(\.{1,3})?$/i.test(text.trim())) {
    return '';
  }

  return stripEnclosingQuotes(cleaned);
};

const coerceString = (value: unknown) => (typeof value === 'string' ? value : '');

const getStreamTextFromUpdate = (
  data: CompletionTokenUpdate,
  currentText: string,
) => {
  const accumulatedText = sanitizeGeneratedText(coerceString(data.accumulated_text));
  if (accumulatedText && accumulatedText.length >= currentText.length) {
    return accumulatedText;
  }

  const parsedContent = sanitizeGeneratedText(coerceString(data.content));
  if (
    parsedContent &&
    parsedContent.length > currentText.length &&
    parsedContent.startsWith(sanitizeGeneratedText(currentText))
  ) {
    return parsedContent;
  }

  const token = coerceString(data.token);
  return token ? currentText + token : currentText;
};

const getCompletionText = (result: CompletionTextResult, streamedText: string) =>
  stripEnclosingQuotes(sanitizeGeneratedText(result.content || result.text || streamedText || ''));

const isLikelyCorruptResponse = (text: string) => {
  if (isCodeLikeResponse(text)) {
    return false;
  }
  if (!text || isCodeLikeResponse(text)) {
    return false;
  }
  const withoutCode = text.replace(/```[\s\S]*?```/g, '').trim();
  const compact = withoutCode.replace(/\s+/g, '');
  if (compact.length < 18) {
    return false;
  }

  const symbols = compact.match(ASCII_SYMBOL_PATTERN)?.length ?? 0;
  const letters = compact.match(/[A-Za-z]/g)?.length ?? 0;
  const uppercase = compact.match(/[A-Z]/g)?.length ?? 0;
  const digits = compact.match(/\d/g)?.length ?? 0;
  const words = withoutCode.match(/[A-Za-z]{2,}/g) ?? [];
  const vowelWords = words.filter(word => /[aeiou]/i.test(word)).length;
  const startsWithSymbolNoise = /^[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]{2,}/.test(withoutCode);
  const symbolRatio = symbols / compact.length;
  const uppercaseRatio = letters ? uppercase / letters : 0;
  const alnumRatio = (letters + digits) / compact.length;

  if (LONG_SYMBOL_RUN_PATTERN.test(compact)) {
    return true;
  }

  if (startsWithSymbolNoise && symbolRatio > 0.2 && withoutCode.length > 24) {
    return true;
  }

  if (symbolRatio > 0.34 && uppercaseRatio > 0.45 && withoutCode.length > 28) {
    return true;
  }

  if (symbolRatio > 0.28 && alnumRatio < 0.7 && words.length <= 3 && withoutCode.length > 24) {
    return true;
  }

  if (symbolRatio > 0.22 && words.length >= 3 && vowelWords / words.length < 0.45 && withoutCode.length > 40) {
    return true;
  }

  return false;
};

const visibleGeneratedText = (text: string) => {
  const normalized = text.trim().toLowerCase();
  const loaderWords = ['thinking', 'thinking...', 'composing', 'composing...', 'replying', 'replying...'];
  if (normalized && loaderWords.some(word => word.startsWith(normalized))) {
    return '';
  }

  const visibleText = stripEnclosingQuotes(sanitizeGeneratedText(text)).trimStart();
  return isLikelyCorruptResponse(visibleText) ? '' : visibleText;
};

const serializeMessages = (items: ChatMessage[], aiName: string) =>
  items
    .filter(item => item.role !== 'notice')
    .map(item => `${item.role === 'user' ? 'User' : aiName}: ${item.text}`)
    .join('\n');

const makeTitle = (messages: ChatMessage[]) => {
  const firstUser = messages.find(message => message.role === 'user' && message.text.trim());
  if (!firstUser) {
    return 'New local thread';
  }

  const clean = firstUser.text.replace(/\s+/g, ' ').trim();
  return clean.length > 34 ? `${clean.slice(0, 34)}...` : clean;
};

const normalizeCodeLanguage = (value: string) =>
  value
    .trim()
    .replace(/[^\w#+.-]/g, '')
    .toLowerCase();

const detectCodeLanguage = (code: string, hintedLanguage = '') => {
  const hint = normalizeCodeLanguage(hintedLanguage);
  if (hint) {
    return hint;
  }

  const trimmed = code.trim();
  if (/^\s*</.test(trimmed)) {
    return 'html';
  }
  if (/\b(import|export|const|let|function|=>|interface|type)\b/.test(trimmed)) {
    return /:\s*[A-Z_a-z][\w<>,\s[\]|]*/.test(trimmed) || /\binterface\b|\btype\b/.test(trimmed)
      ? 'typescript'
      : 'javascript';
  }
  if (/\b(def|import|from|print)\b/.test(trimmed)) {
    return 'python';
  }
  if (/^\s*[{[]/.test(trimmed)) {
    return 'json';
  }
  if (/\bSELECT\b|\bFROM\b|\bWHERE\b/i.test(trimmed)) {
    return 'sql';
  }
  if (/\b(class|public|static|void)\b/.test(trimmed)) {
    return 'java';
  }
  if (/^\s*(npm|yarn|pnpm|cd|git|curl)\b/m.test(trimmed)) {
    return 'bash';
  }

  return 'code';
};

const parseMessageSegments = (text: string): MessageSegment[] => {
  if (!text) return [];
  const cleanText = text.replace(/^Response \d+\n+/i, '');
  const segments: MessageSegment[] = [];
  const fencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(cleanText)) !== null) {
    const before = cleanText.slice(lastIndex, match.index);
    if (before && before.trim().length > 0) {
      segments.push({type: 'text', content: before});
    }

    const language = detectCodeLanguage(match[2], match[1]);
    segments.push({
      type: 'code',
      content: match[2].replace(/\n$/, ''),
      language,
    });
    lastIndex = fencePattern.lastIndex;
  }

  const after = cleanText.slice(lastIndex);
  if (after) {
    const danglingFence = after.match(/```([^\n`]*)\n?([\s\S]*)$/);
    if (danglingFence && danglingFence.index !== undefined) {
      const before = after.slice(0, danglingFence.index);
      if (before && before.trim().length > 0) {
        segments.push({type: 'text', content: before});
      }

      const code = danglingFence[2].replace(/\n$/, '');
      segments.push({
        type: 'code',
        content: code,
        language: detectCodeLanguage(code, danglingFence[1]),
      });
    } else if (after.trim().length > 0) {
      segments.push({type: 'text', content: after});
    }
  }

  return segments.length ? segments : [{type: 'text', content: cleanText}];
};

type ParsedThoughtResult = {
  thoughtText: string;
  contentText: string;
  isStreamingThought: boolean;
};

const parseThoughtAndContent = (rawText: string): ParsedThoughtResult => {
  if (!rawText) {
    return {thoughtText: '', contentText: '', isStreamingThought: false};
  }

  const thinkMatch = rawText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (!thinkMatch) {
    return {thoughtText: '', contentText: stripEnclosingQuotes(rawText), isStreamingThought: false};
  }

  const thoughtText = thinkMatch[1].trim();
  const hasClosedTag = /<\/think>/i.test(rawText);

  if (hasClosedTag) {
    const closingIdx = rawText.search(/<\/think>/i);
    const afterClosing = closingIdx !== -1 ? rawText.slice(closingIdx + 8) : '';
    const contentText = afterClosing.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return {thoughtText, contentText: stripEnclosingQuotes(contentText), isStreamingThought: false};
  }

  return {thoughtText, contentText: '', isStreamingThought: true};
};

const ThoughtAccordion = React.memo(({
  thoughtText,
  isStreamingThought,
  thoughtTimeMs,
  isLive,
  onToggle,
}: {
  thoughtText: string;
  isStreamingThought: boolean;
  thoughtTimeMs?: number;
  isLive?: boolean;
  onToggle?: () => void;
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(Boolean(isStreamingThought));
  const scrollViewRef = useRef<ScrollView>(null);
  const previousThoughtLength = useRef<number>(thoughtText.length);
  const userToggledRef = useRef<boolean>(false);

  useEffect(() => {
    if (!userToggledRef.current) {
      if (isStreamingThought) {
        setIsExpanded(true);
      } else {
        setIsExpanded(false);
      }
    }
  }, [isStreamingThought, isLive]);



  useEffect(() => {
    if (isExpanded) {
      if (scrollViewRef.current && thoughtText.length > previousThoughtLength.current) {
        previousThoughtLength.current = thoughtText.length;
        scrollViewRef.current.scrollToEnd({animated: true});
      }
    }
  }, [thoughtText, isExpanded]);

  const toggleExpand = useCallback(() => {
    lightHaptic();
    userToggledRef.current = true;
    setIsExpanded(prev => {
      const next = !prev;
      onToggle?.();
      setTimeout(() => {
        onToggle?.();
      }, 50);
      setTimeout(() => {
        onToggle?.();
      }, 150);
      setTimeout(() => {
        onToggle?.();
      }, 300);
      return next;
    });
  }, [onToggle]);

  const headerLabel = useMemo(() => {
    if (isStreamingThought) {
      return 'Thinking...';
    }
    if (thoughtTimeMs && thoughtTimeMs > 0) {
      const sec = (thoughtTimeMs / 1000).toFixed(1).replace(/\.0$/, '');
      return `Thought for ${sec}s`;
    }
    return 'Thought for a moment';
  }, [isStreamingThought, thoughtTimeMs]);

  if (!thoughtText.trim() && !isStreamingThought) {
    return null;
  }

  return (
    <View style={[styles.thoughtAccordionContainer, !isExpanded && styles.thoughtAccordionCollapsed]}>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={toggleExpand}
        style={styles.thoughtAccordionHeader}>
        <View style={styles.thoughtAccordionHeaderLeft}>
          <Lightbulb color={isStreamingThought ? '#FFFFFF' : '#98989E'} size={14} strokeWidth={isStreamingThought ? 2.3 : 2.2} />
          <Text style={[styles.thoughtAccordionLabel, !isStreamingThought && {color: '#98989E'}]}>{headerLabel}</Text>
        </View>
        <View style={styles.thoughtAccordionHeaderRight}>
          {isExpanded ? (
            <ChevronUp color={isStreamingThought ? '#FFFFFF' : '#8E8E93'} size={15} strokeWidth={isStreamingThought ? 2.2 : 2} />
          ) : (
            <ChevronDown color={isStreamingThought ? '#FFFFFF' : '#8E8E93'} size={15} strokeWidth={isStreamingThought ? 2.2 : 2} />
          )}
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.thoughtAccordionBody}>
          <ScrollView
            ref={scrollViewRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            style={styles.thoughtAccordionScroll}
            contentContainerStyle={styles.thoughtAccordionScrollContent}
            onContentSizeChange={() => {
              scrollViewRef.current?.scrollToEnd({animated: true});
              onToggle?.();
            }}>
            <Text selectable style={styles.thoughtAccordionText}>
              {thoughtText || 'Analyzing context...'}
            </Text>
          </ScrollView>
        </View>
      )}
    </View>
  );
});

const VisionCapsuleTag = React.memo(({
  isScanning,
  visionModelName,
}: {
  isScanning: boolean;
  visionModelName?: string;
}) => {
  const modelLabel = visionModelName || 'Vision Engine';

  return (
    <View style={[styles.visionCapsuleContainer, isScanning && styles.visionCapsuleScanning]}>
      <Text style={[styles.visionCapsuleText, isScanning && {color: '#34C759'}]}>
        {isScanning ? `Scanning photo with ${modelLabel}...` : `Analyzed with ${modelLabel}`}
      </Text>
    </View>
  );
});

const ThinkingText = ({
  isHiding,
  label,
  lines,
}: {
  isHiding: boolean;
  label: string;
  lines: string[];
}) => {
  const progress = useRef(new Animated.Value(isHiding ? 0 : 1)).current;
  const [dotCount, setDotCount] = useState(1);
  const labelBase = label.replace(/\.+$/, '');

  const isSettingUp =
    labelBase.toLowerCase().includes('setting up') ||
    labelBase.toLowerCase().includes('initializ') ||
    labelBase.toLowerCase().includes('preparing');

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isHiding ? 0 : 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isHiding, progress]);

  useEffect(() => {
    const timer = setInterval(() => {
      setDotCount(current => (current % 3) + 1);
    }, 560);

    return () => clearInterval(timer);
  }, []);

  const animatedStyle = useMemo(
    () => ({
      maxHeight: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 350],
      }),
      opacity: progress,
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [-8, 0],
          }),
        },
      ],
    }),
    [progress],
  );

  return (
    <Animated.View style={[styles.thinkingTextWrap, animatedStyle]}>
      <View style={styles.thinkingTitleRow}>
        {isSettingUp ? (
          <Sliders color="#FFFFFF" size={18} strokeWidth={2.2} />
        ) : (
          <Lightbulb color="#FFFFFF" size={19} strokeWidth={2.1} />
        )}
        <Text style={[styles.thinkingText, isSettingUp && { color: '#0A84FF' }]}>
          {`${labelBase} ${'.'.repeat(dotCount)}`}
        </Text>
      </View>
      <View style={styles.thinkingTrace}>
        {lines.map((line, index) => {
          const isFirstMessageNotice = line.toLowerCase().includes('first message');
          return (
            <Text
              key={`${line}_${index}`}
              style={[
                styles.thinkingTraceLine,
                index === lines.length - 1 && styles.thinkingTraceLineActive,
                isFirstMessageNotice && {color: '#34C759'},
              ]}>
              {line}
            </Text>
          );
        })}
      </View>
    </Animated.View>
  );
};

const ChatSkeleton = () => (
  <View style={styles.skeletonHost}>
    <View style={styles.skeletonAssistantRow}>
      <View style={styles.skeletonGlyph} />
      <View style={styles.skeletonAssistantBubble}>
        <View style={[styles.skeletonLine, styles.skeletonLineLong]} />
        <View style={[styles.skeletonLine, styles.skeletonLineMedium]} />
      </View>
    </View>
    <View style={styles.skeletonUserRow}>
      <View style={styles.skeletonUserBubble} />
    </View>
    <View style={styles.skeletonAssistantRow}>
      <View style={styles.skeletonGlyph} />
      <View style={styles.skeletonAssistantBubble}>
        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
        <View style={[styles.skeletonLine, styles.skeletonLineLong]} />
        <View style={[styles.skeletonLine, styles.skeletonLineMedium]} />
      </View>
    </View>
  </View>
);

const CopyStatusIcon = ({copied}: {copied: boolean}) => {
  const progress = useRef(new Animated.Value(copied ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: copied ? 1 : 0,
      damping: 15,
      stiffness: 260,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  }, [copied, progress]);

  const copyOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const checkOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const copyScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.72],
  });
  const checkScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  return (
    <View style={styles.copyIconStage}>
      <Animated.View
        style={[
          styles.copyIconLayer,
          {opacity: copyOpacity, transform: [{scale: copyScale}]},
        ]}>
        <Copy color="#8E8E93" size={15} strokeWidth={2.3} />
      </Animated.View>
      <Animated.View
        style={[
          styles.copyIconLayer,
          {opacity: checkOpacity, transform: [{scale: checkScale}]},
        ]}>
        <Check color="#B7FF2A" size={15} strokeWidth={2.5} />
      </Animated.View>
    </View>
  );
};

const renderInlineParts = (inlineText: string, baseStyle?: any) => {
  if (!inlineText) return null;
  const parts = inlineText.split(/(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|_[\s\S]*?_|`[\s\S]*?`)/g);

  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <Text key={index} style={{fontFamily: 'SF-Pro-Rounded-Bold', color: '#FFFFFF'}}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <Text key={index} style={{fontStyle: 'italic', color: '#E4E4E7'}}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <Text key={index} style={styles.inlineCodePill}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={index} style={baseStyle}>{part}</Text>;
  });
};

const FormattedText = memo(({text, baseStyle}: {text: string; baseStyle: any}) => {
  if (!text) return null;
  const cleanContent = stripEnclosingQuotes(text);
  const lines = cleanContent.split('\n');

  return (
    <View style={styles.formattedTextContainer}>
      {lines.map((line, lineIndex) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <View key={lineIndex} style={styles.paragraphSpacer} />;
        }
        if (/^#\s/.test(trimmed)) {
          const headingText = trimmed.replace(/^#\s*/, '');
          return (
            <View key={lineIndex} style={styles.markdownH1}>
              <Text style={styles.markdownH1Text}>
                {renderInlineParts(headingText, styles.markdownH1Text)}
              </Text>
            </View>
          );
        }
        if (/^##\s/.test(trimmed)) {
          const headingText = trimmed.replace(/^##\s*/, '');
          return (
            <View key={lineIndex} style={styles.markdownH2}>
              <Text style={styles.markdownH2Text}>
                {renderInlineParts(headingText, styles.markdownH2Text)}
              </Text>
            </View>
          );
        }
        if (/^###+\s/.test(trimmed)) {
          const headingText = trimmed.replace(/^###+\s*/, '');
          return (
            <View key={lineIndex} style={styles.markdownH3}>
              <Text style={styles.markdownH3Text}>
                {renderInlineParts(headingText, styles.markdownH3Text)}
              </Text>
            </View>
          );
        }
        if (/^>\s?/.test(trimmed)) {
          const quoteText = trimmed.replace(/^>\s?/, '');
          return (
            <View key={lineIndex} style={styles.blockquoteContainer}>
              <Text style={styles.blockquoteText}>
                {renderInlineParts(quoteText, [baseStyle, styles.blockquoteText])}
              </Text>
            </View>
          );
        }
        const numberMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numberMatch) {
          const num = numberMatch[1];
          const itemText = numberMatch[2];
          return (
            <View key={lineIndex} style={styles.listRow}>
              <Text style={styles.listNumber}>{num}.</Text>
              <Text style={styles.listContent}>
                {renderInlineParts(itemText, baseStyle)}
              </Text>
            </View>
          );
        }
        if (/^[-*•]\s/.test(trimmed)) {
          const bulletText = trimmed.replace(/^[-*•]\s*/, '');
          return (
            <View key={lineIndex} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletContent}>
                {renderInlineParts(bulletText, baseStyle)}
              </Text>
            </View>
          );
        }
        return (
          <Text key={lineIndex} style={[baseStyle, styles.paragraphText]}>
            {renderInlineParts(line, baseStyle)}
          </Text>
        );
      })}
    </View>
  );
});

const MessageBubble = memo(({
  generationLabel,
  isLive,
  isThinkingHiding,
  item,
  thinkingLines,
  modelLogo,
  onToggleThought,
  userBubbleColor,
}: {
  generationLabel: string;
  isLive: boolean;
  isThinkingHiding: boolean;
  item: ChatMessage;
  thinkingLines: string[];
  modelLogo?: any;
  onToggleThought?: () => void;
  userBubbleColor?: string;
}) => {
  const appear = useRef(new Animated.Value(0)).current;
  const messageCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [showReportAlert, setShowReportAlert] = useState<boolean>(false);
  const isUser = item.role === 'user';
  const isNotice = item.role === 'notice';
  const parsedResult = useMemo(
    () =>
      !isUser && item.text
        ? parseThoughtAndContent(item.text)
        : {thoughtText: '', contentText: item.text, isStreamingThought: false},
    [isUser, item.text],
  );
  const messageSegments = useMemo(
    () =>
      !isUser && parsedResult.contentText
        ? parseMessageSegments(parsedResult.contentText)
        : [],
    [isUser, parsedResult.contentText],
  );
  const shouldShowThinking =
    isLive && thinkingLines.length > 0 && (!item.text || isThinkingHiding);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  useEffect(
    () => () => {
      if (messageCopyTimer.current) {
        clearTimeout(messageCopyTimer.current);
      }
      if (codeCopyTimer.current) {
        clearTimeout(codeCopyTimer.current);
      }
    },
    [],
  );

  const copyMessage = useCallback(() => {
    const textToCopy = isUser ? item.text : (parsedResult.contentText || item.text);
    setClipboardText(textToCopy);
    lightHaptic();
    setCopiedMessageId(item.id);
    if (messageCopyTimer.current) {
      clearTimeout(messageCopyTimer.current);
    }
    messageCopyTimer.current = setTimeout(() => setCopiedMessageId(null), 1300);
  }, [isUser, item.id, item.text, parsedResult.contentText]);

  const shareMessage = useCallback(() => {
    const textToShare = isUser ? item.text : (parsedResult.contentText || item.text);
    if (!textToShare.trim()) {
      return;
    }

    lightHaptic();
    NativeShare.share({message: textToShare}).catch(error => {
      console.warn('ChatScreen: failed to share text:', error);
    });
  }, [isUser, item.text, parsedResult.contentText]);

  const reportMessage = useCallback(() => {
    lightHaptic();
    setShowReportAlert(true);
  }, []);

  const openRivoIssuesPage = useCallback(() => {
    const url = 'https://github.com/sanketpadhyal/Rivo-Agent-Application/issues';
    Linking.openURL(url).catch(error => {
      console.warn('ChatScreen: failed to open GitHub issues page:', error);
    });
  }, []);

  const copyCode = useCallback((code: string, index: number) => {
    setClipboardText(code);
    lightHaptic();
    setCopiedCodeIndex(index);
    if (codeCopyTimer.current) {
      clearTimeout(codeCopyTimer.current);
    }
    codeCopyTimer.current = setTimeout(() => setCopiedCodeIndex(null), 1300);
  }, []);

  return (
    <Animated.View
      style={[
        styles.messageRow,
        isUser && styles.userMessageRow,
        {
          opacity: appear,
          transform: [
            {
              translateY: appear.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}>
      {isNotice ? (
        <View style={styles.compactDivider}>
          <View style={styles.compactDividerLine} />
          <View style={styles.compactDividerBadge}>
            <Minimize2 color="#BF5AF2" size={13} strokeWidth={2.2} />
            <Text style={styles.compactDividerText}>{item.text}</Text>
          </View>
          <View style={styles.compactDividerLine} />
        </View>
      ) : (
        <>
          {!isUser && (
            <View style={styles.agentGlyphSmall}>
              {modelLogo ? (
                <Image source={renderModelLogoSource(modelLogo)} style={styles.modelLogoSmall} resizeMode="contain" />
              ) : (
                <Image source={logoSource} style={styles.agentLogoSmall} resizeMode="contain" />
              )}
            </View>
          )}
          <View style={[styles.messageStack, isUser && styles.userMessageStack]}>
            <View style={[
              styles.messageBubble,
              isUser ? [styles.userBubble, userBubbleColor ? {backgroundColor: userBubbleColor} : null] : styles.assistantBubble,
              isUser && item.attachedImageUri ? styles.userImageBubbleCard : null,
            ]}>
              {shouldShowThinking && !parsedResult.thoughtText && (
                <ThinkingText
                  isHiding={isThinkingHiding}
                  label={generationLabel}
                  lines={thinkingLines}
                />
              )}
              {!isUser && Boolean(item.isScanningVision) && (
                <VisionCapsuleTag
                  isScanning={true}
                  visionModelName={item.visionModelName}
                />
              )}
              {!isUser && Boolean(parsedResult.thoughtText) && (
                <ThoughtAccordion
                  thoughtText={parsedResult.thoughtText}
                  isStreamingThought={parsedResult.isStreamingThought}
                  thoughtTimeMs={item.thoughtTimeMs}
                  isLive={isLive}
                  onToggle={onToggleThought}
                />
              )}
              {isLive && !parsedResult.contentText && !parsedResult.thoughtText ? null : (
                (parsedResult.contentText || isUser) ? (
                  <View
                    style={[
                      styles.messageTextWrap,
                      shouldShowThinking && styles.liveMessageTextWrap,
                    ]}>
                    {isUser ? (
                      <View style={item.attachedImageUri ? styles.userImageMessageWrapper : null}>
                        {item.attachedImageUri ? (
                          <View style={styles.userImageFrame}>
                            <Image
                              source={{uri: item.attachedImageUri}}
                              style={styles.userBubbleImage}
                              resizeMode="cover"
                            />
                            {item.visionLabel && false ? (
                              <View style={styles.imageBadgeChip}>
                                <Check color="#34C759" size={10} strokeWidth={2.8} />
                                <Text style={styles.imageBadgeText} numberOfLines={1}>
                                  {item.visionLabel}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                        {item.text ? (
                          <Text style={[styles.messageText, item.attachedImageUri && styles.userImageCaptionText]}>
                            {item.text}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      messageSegments.map((segment, index) =>
                        segment.type === 'code' ? (
                          <View key={`code_${index}`} style={styles.codeBlock}>
                            <View style={styles.codeBlockHeader}>
                              <View style={styles.codeHeaderLeft}>
                                <Text style={styles.codeLanguage}>{segment.language}</Text>
                              </View>
                              <TouchableOpacity
                                activeOpacity={0.78}
                                style={styles.codeCopyButtonRow}
                                onPress={() => copyCode(segment.content, index)}>
                                <CopyStatusIcon copied={copiedCodeIndex === index} />
                                <Text style={styles.codeCopyText}>
                                  {copiedCodeIndex === index ? 'Copied!' : 'Copy code'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              style={styles.codeScroll}>
                              <View style={styles.codeEditorSurface}>
                                {segment.content.split('\n').map((line, lineIndex) => (
                                  <View key={`${index}_${lineIndex}`} style={styles.codeLineRow}>
                                    <Text style={styles.codeLineNumber}>
                                      {lineIndex + 1}
                                    </Text>
                                    <Text selectable style={styles.codeText}>
                                      {line || ' '}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </ScrollView>
                          </View>
                        ) : (
                          <FormattedText
                            key={`text_${index}`}
                            text={segment.content}
                            baseStyle={[styles.messageText, styles.assistantTextSegment]}
                          />
                        ),
                      )
                    )}
                    {!isUser && item.interrupted && (
                      <Text style={styles.interruptedText}>Interrupted</Text>
                    )}
                  </View>
                ) : null
              )}
            </View>
            {item.text.trim().length > 0 && !isLive && (
              <View style={!isUser && styles.assistantActionsContainer}>
                {!isUser && Boolean(formatThoughtTime(item.thoughtTimeMs)) && !parsedResult.thoughtText && (
                  <Text style={styles.thoughtTimeText}>{formatThoughtTime(item.thoughtTimeMs)}</Text>
                )}
                <View style={[styles.messageActions, isUser && styles.userMessageActions]}>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    style={styles.messageActionButton}
                    onPress={copyMessage}>
                    <CopyStatusIcon copied={copiedMessageId === item.id} />
                  </TouchableOpacity>
                  {!isUser && (
                    <TouchableOpacity
                      activeOpacity={0.78}
                      style={styles.messageActionButton}
                      onPress={shareMessage}>
                      <Share2 color="#8E8E93" size={15} strokeWidth={2.3} />
                    </TouchableOpacity>
                  )}
                  {!isUser && (
                    <TouchableOpacity
                      activeOpacity={0.78}
                      style={styles.reportActionButton}
                      onPress={reportMessage}>
                      <Flag color="#8E8E93" size={14} strokeWidth={2.2} />
                      <Text style={styles.reportActionText}>Report</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!isUser && item.isTruncated && (
                  <Text style={styles.truncatedNoticeText}>
                    ⚠️ Response truncated. Try increasing tokens from settings for a complete answer.
                  </Text>
                )}
              </View>
            )}
          </View>
        </>
      )}

      <ProfessionalAlert
        visible={showReportAlert}
        title="Help improve Rivo?"
        message="Would you help Rivo Agent improve by reporting this response on GitHub? You'll be taken to the issues page."
        confirmLabel="Yes, report"
        cancelLabel="Not now"
        iconName="flag"
        onClose={() => setShowReportAlert(false)}
        onConfirm={() => {
          setShowReportAlert(false);
          openRivoIssuesPage();
        }}
      />
    </Animated.View>
  );
});

const ChatScreen: React.FC<Props> = ({onBack, onOpenDownload}) => {
  const insets = useSafeAreaInsets();
  const {width: windowWidth} = useWindowDimensions();

  // Refs
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const composerHostRef = useRef<React.ElementRef<typeof View>>(null);
  const contextRef = useRef<LlamaContext | null>(null);
  const menuX = useRef(new Animated.Value(-windowWidth)).current;
  const menuBackgroundSlide = useRef(new Animated.Value(0)).current;
  const infoX = useRef(new Animated.Value(windowWidth)).current;
  const infoBackgroundSlide = useRef(new Animated.Value(0)).current;
  const openInfoPanelFrameRef = useRef<number | null>(null);
  const contextX = useRef(new Animated.Value(windowWidth)).current;
  const openContextPanelFrameRef = useRef<number | null>(null);
  const sendScale = useRef(new Animated.Value(1)).current;
  const emptyLogoPulseAnim = useRef(new Animated.Value(0)).current;
  const performanceToggleAnim = useRef(new Animated.Value(0)).current;
  const contextPulseAnim = useRef(new Animated.Value(1)).current;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadsRef = useRef<StoredThread[]>([]);
  const didInitialScrollRef = useRef(false);
  const pendingRestoreScrollRef = useRef(false);
  const generationLockRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const justStoppedRef = useRef(false);
  const didFeelReplyStartRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const restoreScrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastScrollAtRef = useRef(0);
  const lastStreamHapticAtRef = useRef(0);
  const thinkingRevealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkingFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isChatScrollInteractingRef = useRef(false);
  const isChatAtBottomRef = useRef(true);
  const isContentOverflowingRef = useRef(false);
  const androidKeyboardLiftRef = useRef(0);
  const userScrolledUpRef = useRef(false);
  const layoutDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const effortPopoverAnim = useRef(new Animated.Value(0)).current;
  const androidKeyboardOffsetAnim = useRef(new Animated.Value(0)).current;

  // State
  const [activeThreadId, setActiveThreadId] = useState(() => createThreadId());
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [modelName, setModelName] = useState('Rivo Local');
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [_status, setStatus] = useState('Private offline');
  const [memorySummary, setMemorySummary] = useState('');
  const [userMemory, setUserMemory] = useState('');
  const [compactedCount, setCompactedCount] = useState(0);
  const [responsePhase, setResponsePhase] = useState<ResponsePhase>('idle');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isInfoTransitionActive, setIsInfoTransitionActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isFreshEmptyThread, setIsFreshEmptyThread] = useState(false);
  const [pendingDeleteThread, setPendingDeleteThread] = useState<StoredThread | null>(null);
  const [showModelSwitchAlert, setShowModelSwitchAlert] = useState(false);
  const [showThreadLimitAlert, setShowThreadLimitAlert] = useState(false);
  const [showLocalAccessAlert, setShowLocalAccessAlert] = useState(false);
  const [showLogoutConfirmAlert, setShowLogoutConfirmAlert] = useState(false);
  const [showInstallVisionAlert, setShowInstallVisionAlert] = useState(false);
  const [showDeleteVisionAlert, setShowDeleteVisionAlert] = useState(false);
  const [visionInstalledForMenu, setVisionInstalledForMenu] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isContextTransitionActive, setIsContextTransitionActive] = useState(false);
  const [localName, setLocalName] = useState('');
  const [localMemoryBullets, setLocalMemoryBullets] = useState('');
  const [maxTokens, setMaxTokens] = useState(1024);
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [isEffortPopoverOpen, setIsEffortPopoverOpen] = useState(false);
  const [keepMessages, setKeepMessages] = useState(16);
  const [aiName, setAiName] = useState('Rivo');
  const [aiPersonality, setAiPersonality] = useState('helpful, intelligent, friendly');
  const [aiEmoji, setAiEmoji] = useState('✨');
  const [aiEmojiQuantity, setAiEmojiQuantity] = useState<'none' | 'low' | 'medium' | 'high'>('medium');
  const [localAiName, setLocalAiName] = useState('Rivo');
  const [localAiPersonality, setLocalAiPersonality] = useState('helpful, intelligent, friendly');
  const [localAiEmoji, setLocalAiEmoji] = useState('✨');
  const [localAiEmojiQuantity, setLocalAiEmojiQuantity] = useState<'none' | 'low' | 'medium' | 'high'>('medium');
  const [deviceSpecs, setDeviceSpecs] = useState({
    modelName: 'Detecting...',
    ramGB: 0,
    ramLabel: 'Detecting RAM...',
  });
  const [thinkingTrace, setThinkingTrace] = useState<string[]>([]);
  const [visibleThinkingLineCount, setVisibleThinkingLineCount] = useState(1);
  const [isThinkingFading, setIsThinkingFading] = useState(false);
  const [isCurrentThreadCodingLocked, setIsCurrentThreadCodingLocked] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isAndroidKeyboardVisible, setIsAndroidKeyboardVisible] = useState(false);
  const [androidKeyboardLift, setAndroidKeyboardLift] = useState(0);
  const [sendButtonColor, setSendButtonColor] = useState('#FFFFFF');
  const [inputTextColor, setInputTextColor] = useState('#FFFFFF');
  const [userBubbleColor, setUserBubbleColor] = useState('#0AA550');
  const [attachedImage, setAttachedImage] = useState<{
    uri: string;
    fileName?: string;
    fileSize?: number;
    isScanning?: boolean;
    visionSummary?: string;
    shortLabel?: string;
  } | null>(null);
  const attachedImageRef = useRef(attachedImage);
  useEffect(() => { attachedImageRef.current = attachedImage; }, [attachedImage]);

  const [isVisionResultSheetOpen, setIsVisionResultSheetOpen] = useState(false);
  const visionSheetAnim = useRef(new Animated.Value(0)).current;
  const [copiedVisionToast, setCopiedVisionToast] = useState(false);

  const openVisionResultSheet = useCallback(() => {
    lightHaptic();
    setIsVisionResultSheetOpen(true);
    visionSheetAnim.setValue(0);
    Animated.timing(visionSheetAnim, {
      toValue: 1,
      duration: 380,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [visionSheetAnim]);

  const closeVisionResultSheet = useCallback(() => {
    lightHaptic();
    Animated.timing(visionSheetAnim, {
      toValue: 0,
      duration: 280,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
      useNativeDriver: true,
    }).start(() => setIsVisionResultSheetOpen(false));
  }, [visionSheetAnim]);

  const changeSendButtonColor = useCallback((color: string) => {
    lightHaptic();
    setSendButtonColor(color);
    AsyncStorage.setItem('rivo.styling.sendButtonColor', color);
  }, []);

  const changeInputTextColor = useCallback((color: string) => {
    lightHaptic();
    setInputTextColor(color);
    AsyncStorage.setItem('rivo.styling.inputTextColor', color);
  }, []);

  const changeUserBubbleColor = useCallback((color: string) => {
    lightHaptic();
    setUserBubbleColor(color);
    AsyncStorage.setItem('rivo.styling.userBubbleColor', color);
  }, []);

  const dismissComposerKeyboard = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    requestAnimationFrame(() => {
      inputRef.current?.blur();
      Keyboard.dismiss();
    });
    setTimeout(() => {
      inputRef.current?.blur();
      Keyboard.dismiss();
    }, 80);
  }, []);

  const closeEffortPopover = useCallback(() => {
    lightHaptic();
    Animated.timing(effortPopoverAnim, {
      toValue: 0,
      duration: 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start(() => {
      setIsEffortPopoverOpen(false);
    });
  }, [effortPopoverAnim]);

  const toggleEffortPopover = useCallback(() => {
    lightHaptic();
    dismissComposerKeyboard();
    setIsEffortPopoverOpen(prev => {
      const next = !prev;
      effortPopoverAnim.stopAnimation();
      Animated.timing(effortPopoverAnim, {
        toValue: next ? 1 : 0,
        duration: next ? 320 : 260,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }).start();
      return next;
    });
  }, [dismissComposerKeyboard, effortPopoverAnim]);


  const currentEffortLabel = useMemo(() => {
    if (isPerformanceMode) return 'Fast (1024)';
    if (maxTokens <= 256) return 'Light (256)';
    if (maxTokens <= 512) return 'Medium (512)';
    if (maxTokens <= 1024) return 'High (1024)';
    return 'Ultra (2048)';
  }, [isPerformanceMode, maxTokens]);

  const scrimOpacity = useMemo(() => {
    return menuX.interpolate({
      inputRange: [-windowWidth, 0],
      outputRange: [0, 1],
    });
  }, [menuX, windowWidth]);

  const emptyLogoGlowScale = useMemo(
    () =>
      emptyLogoPulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.15],
      }),
    [emptyLogoPulseAnim],
  );

  const emptyLogoGlowOpacity = useMemo(
    () =>
      emptyLogoPulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.22, 0.65],
      }),
    [emptyLogoPulseAnim],
  );

  const emptyLogoScale = useMemo(
    () =>
      emptyLogoPulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.03],
      }),
    [emptyLogoPulseAnim],
  );

  const recentThreads = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_THREADS),
    [threads],
  );

  const activeCatalogModel = useMemo(
    () => findCatalogModel(activeModelId, modelName),
    [activeModelId, modelName],
  );

  const profileDisplayName = useMemo(() => {
    if (localName && localName.trim()) {
      return localName.trim();
    }
    const currentUser = auth().currentUser;
    if (currentUser?.displayName && currentUser.displayName.trim()) {
      return currentUser.displayName.trim();
    }
    if (currentUser?.email) {
      return currentUser.email.split('@')[0];
    }
    return 'Guest';
  }, [localName]);

  const hasCodingContentInThread = useMemo(() => {
    if (isCurrentThreadCodingLocked) return true;
    return messages.some(
      msg =>
        (msg.role === 'assistant' && isCodeLikeResponse(msg.text)) ||
        (msg.role === 'notice' && msg.text.includes('Coding session')),
    );
  }, [isCurrentThreadCodingLocked, messages]);

  // Callbacks
  const setMessagesAndRef = useCallback((nextMessages: ChatMessage[]) => {
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
  }, []);

  const updateMessagesAndRef = useCallback((
    updater: (currentMessages: ChatMessage[]) => ChatMessage[],
  ) => {
    setMessages(currentMessages => {
      const nextMessages = updater(currentMessages);
      messagesRef.current = nextMessages;
      return nextMessages;
    });
  }, []);

  // Effects
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearRestoreScrollTimers = useCallback(() => {
    restoreScrollTimersRef.current.forEach(clearTimeout);
    restoreScrollTimersRef.current = [];
  }, []);

  const clearThinkingFadeTimer = useCallback(() => {
    if (thinkingFadeTimerRef.current) {
      clearTimeout(thinkingFadeTimerRef.current);
      thinkingFadeTimerRef.current = null;
    }
  }, []);

  const requestRestoreScrollToEnd = useCallback(() => {
    if (!pendingRestoreScrollRef.current) {
      return;
    }

    clearRestoreScrollTimers();
    RESTORE_SCROLL_DELAYS.forEach((delay, index) => {
      const timer = setTimeout(() => {
        if (!pendingRestoreScrollRef.current) {
          return;
        }

        listRef.current?.scrollToEnd({animated: false});
        if (index === RESTORE_SCROLL_DELAYS.length - 1) {
          didInitialScrollRef.current = true;
          pendingRestoreScrollRef.current = false;
        }
      }, delay);
      restoreScrollTimersRef.current.push(timer);
    });
  }, [clearRestoreScrollTimers]);

  useEffect(() => {
    const hydrate = async () => {
      const [
        storedThreads,
        storedActiveId,
        storedModelName,
        storedModelId,
        storedAiName,
        storedAiPersonality,
        storedAiEmoji,
        storedAiEmojiQuantity,
        storedMaxTokens,
        storedKeepMessages,
        storedIsPerfMode,
        storedUserName,
        storedUserMemoryBullets,
        storedSendButtonColor,
        storedInputTextColor,
        storedUserBubbleColor,
      ] = await Promise.all([
        AsyncStorage.getItem(CHAT_THREADS_KEY),
        AsyncStorage.getItem(ACTIVE_THREAD_KEY),
        AsyncStorage.getItem('downloadedModelName'),
        AsyncStorage.getItem('downloadedModelId'),
        AsyncStorage.getItem('rivo.neural.aiName'),
        AsyncStorage.getItem('rivo.neural.aiPersonality'),
        AsyncStorage.getItem('rivo.neural.aiEmoji'),
        AsyncStorage.getItem('rivo.neural.aiEmojiQuantity'),
        AsyncStorage.getItem('rivo.neural.maxTokens'),
        AsyncStorage.getItem('rivo.neural.keepMessages'),
        AsyncStorage.getItem('rivo.neural.isPerformanceMode'),
        AsyncStorage.getItem('rivo.neural.userName'),
        AsyncStorage.getItem('rivo.neural.userMemoryBullets'),
        AsyncStorage.getItem('rivo.styling.sendButtonColor'),
        AsyncStorage.getItem('rivo.styling.inputTextColor'),
        AsyncStorage.getItem('rivo.styling.userBubbleColor'),
      ]);

      const parsedThreads: StoredThread[] = storedThreads ? JSON.parse(storedThreads) : [];
      const sortedThreads = [...parsedThreads].sort((a, b) => b.updatedAt - a.updatedAt);
      const storedActiveThread = storedActiveId
        ? parsedThreads.find(thread => thread.id === storedActiveId)
        : undefined;
      const activeThread = storedActiveThread ?? sortedThreads[0];
      const nextActiveId = activeThread?.id ?? createThreadId();

      pendingRestoreScrollRef.current = Boolean(activeThread?.messages.length);
      didInitialScrollRef.current = false;
      threadsRef.current = parsedThreads;
      setThreads(parsedThreads);
      setActiveThreadId(nextActiveId);
      setMessagesAndRef(activeThread?.messages ?? []);
      setMemorySummary(activeThread?.summary ?? '');
      setUserMemory(activeThread?.userMemory ?? '');
      setCompactedCount(activeThread?.compactedCount ?? 0);
      setIsCurrentThreadCodingLocked(Boolean(activeThread?.isCodingLocked));
      setIsFreshEmptyThread(false);
      if (storedModelName || storedModelId) {
        // Cross-reference catalog so the name is always the canonical display name
        const catalogEntry = findCatalogModel(storedModelId, storedModelName);
        const resolvedName =
          (catalogEntry && catalogEntry.name) || storedModelName || 'Rivo Local';
        setModelName(resolvedName);
        if (storedModelId || catalogEntry?.id) {
          setActiveModelId(storedModelId || catalogEntry?.id || null);
        }
      }

      // Hydrate AI character states
      if (storedAiName) {
        setAiName(storedAiName);
        setLocalAiName(storedAiName);
      }
      if (storedAiPersonality) {
        setAiPersonality(storedAiPersonality);
        setLocalAiPersonality(storedAiPersonality);
      }
      if (storedAiEmoji) {
        setAiEmoji(storedAiEmoji);
        setLocalAiEmoji(storedAiEmoji);
      }
      if (storedAiEmojiQuantity) {
        setAiEmojiQuantity(storedAiEmojiQuantity as 'none' | 'low' | 'medium' | 'high');
        setLocalAiEmojiQuantity(storedAiEmojiQuantity as 'none' | 'low' | 'medium' | 'high');
      }

      // Hydrate About You user profile states
      if (storedUserName) {
        setLocalName(storedUserName);
      }
      if (storedUserMemoryBullets) {
        setLocalMemoryBullets(storedUserMemoryBullets);
      }
      if (storedSendButtonColor) {
        setSendButtonColor(storedSendButtonColor);
      }
      if (storedInputTextColor) {
        setInputTextColor(storedInputTextColor);
      }
      if (storedUserBubbleColor) {
        setUserBubbleColor(storedUserBubbleColor);
      }

      // Hydrate optimization settings if they exist
      if (storedMaxTokens) {
        const val = Number(storedMaxTokens);
        setMaxTokens(val < 512 ? 1024 : val);
      }
      if (storedKeepMessages) {
        setKeepMessages(Number(storedKeepMessages));
      }
      if (storedIsPerfMode) {
        const isPerf = storedIsPerfMode === 'true';
        setIsPerformanceMode(isPerf);
        performanceToggleAnim.setValue(isPerf ? 1 : 0);
      }
      
      // Fetch device hardware specifications
      try {
        const [totalMemory, deviceModel] = await Promise.all([
          DeviceInfo.getTotalMemory().catch(() => 0),
          getDisplayDeviceName().catch(() => 'This device'),
        ]);
        const ramGB = getMarketedRamGB(totalMemory);
        setDeviceSpecs({
          modelName: deviceModel,
          ramGB,
          ramLabel: ramGB > 0 ? `${ramGB}GB RAM` : 'Unknown RAM',
        });
        
        // Dynamic generation token recommendation (ONLY if no stored user preference exists!)
        if (!storedMaxTokens || !storedKeepMessages) {
          if (ramGB >= 8) {
            if (!storedMaxTokens) setMaxTokens(1024);
            if (!storedKeepMessages) setKeepMessages(16);
          } else if (ramGB >= 4) {
            if (!storedMaxTokens) setMaxTokens(512);
            if (!storedKeepMessages) setKeepMessages(8);
          } else {
            if (!storedMaxTokens) setMaxTokens(256);
            if (!storedKeepMessages) setKeepMessages(4);
          }
        }
      } catch (err) {
        console.warn('ChatScreen: failed to fetch device specs:', err);
      }

      setHasHydrated(true);
    };

    hydrate().catch(error => {
      console.warn('ChatScreen: failed to hydrate chat storage:', error);
      setHasHydrated(true);
    });

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
      if (thinkingRevealTimerRef.current) {
        clearInterval(thinkingRevealTimerRef.current);
      }
      clearThinkingFadeTimer();
      clearRestoreScrollTimers();
      contextRef.current?.release();
      contextRef.current = null;
    };
  }, [clearRestoreScrollTimers, clearThinkingFadeTimer, setMessagesAndRef, performanceToggleAnim]);

  useEffect(() => {
    if (thinkingRevealTimerRef.current) {
      clearInterval(thinkingRevealTimerRef.current);
      thinkingRevealTimerRef.current = null;
    }

    if (!isGenerating || thinkingTrace.length <= 1) {
      return;
    }

    thinkingRevealTimerRef.current = setInterval(() => {
      setVisibleThinkingLineCount(current => {
        if (current >= thinkingTrace.length) {
          if (thinkingRevealTimerRef.current) {
            clearInterval(thinkingRevealTimerRef.current);
            thinkingRevealTimerRef.current = null;
          }
          return current;
        }

        return current + 1;
      });
    }, 620);

    return () => {
      if (thinkingRevealTimerRef.current) {
        clearInterval(thinkingRevealTimerRef.current);
        thinkingRevealTimerRef.current = null;
      }
    };
  }, [isGenerating, thinkingTrace.length]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    Animated.timing(performanceToggleAnim, {
      toValue: isPerformanceMode ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isPerformanceMode, performanceToggleAnim]);

  useEffect(() => {
    contextPulseAnim.setValue(1.08);
    Animated.spring(contextPulseAnim, {
      toValue: 1,
      friction: 8,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [keepMessages, isPerformanceMode, messages.length, contextPulseAnim]);

  useEffect(() => {
    androidKeyboardLiftRef.current = androidKeyboardLift;
  }, [androidKeyboardLift]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(menuX, {
        toValue: isMenuOpen ? 0 : -windowWidth,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(menuBackgroundSlide, {
        toValue: isMenuOpen ? 1 : 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    if (isMenuOpen) {
      hasInstalledVisionModel().then(installed => setVisionInstalledForMenu(installed)).catch(() => {});
    }
  }, [isMenuOpen, menuX, menuBackgroundSlide, windowWidth]);

  useEffect(() => {
    if (isMenuOpen || isInfoOpen || isContextOpen || isEffortPopoverOpen) {
      dismissComposerKeyboard();
    }
  }, [dismissComposerKeyboard, isInfoOpen, isMenuOpen, isContextOpen, isEffortPopoverOpen]);


  const openSideMenu = useCallback(() => {
    dismissComposerKeyboard();
    setIsMenuOpen(true);
  }, [dismissComposerKeyboard]);

  const openInfoPanel = useCallback(() => {
    dismissComposerKeyboard();
    // Stop any running close animation
    infoX.stopAnimation();
    infoBackgroundSlide.stopAnimation();
    if (openInfoPanelFrameRef.current) {
      cancelAnimationFrame(openInfoPanelFrameRef.current);
      openInfoPanelFrameRef.current = null;
    }
    infoX.setValue(windowWidth);
    infoBackgroundSlide.setValue(0);
    setIsInfoTransitionActive(true);
    setIsInfoOpen(true);
    // Defer to next rAF so React state (isInfoOpen=true) commits before animation
    openInfoPanelFrameRef.current = requestAnimationFrame(() => {
      openInfoPanelFrameRef.current = null;
      Animated.parallel([
        Animated.timing(infoX, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(infoBackgroundSlide, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({finished}) => {
        if (finished) setIsInfoTransitionActive(false);
      });
    });
  }, [dismissComposerKeyboard, infoBackgroundSlide, infoX, windowWidth]);

  const closeInfoPanel = useCallback(() => {
    if (openInfoPanelFrameRef.current) {
      cancelAnimationFrame(openInfoPanelFrameRef.current);
      openInfoPanelFrameRef.current = null;
    }
    setIsInfoTransitionActive(true);
    Animated.parallel([
      Animated.timing(infoX, {
        toValue: windowWidth,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(infoBackgroundSlide, {
        toValue: 0,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      setIsInfoTransitionActive(false);
      if (finished) setIsInfoOpen(false);
    });
  }, [infoBackgroundSlide, infoX, windowWidth]);

  const preScanAttachedImage = useCallback(async (imageUri: string, fileName: string) => {
    try {
      const rawSummary = await generateVisionAnalysisForPrompt(
        imageUri,
        fileName,
        'Describe photo subjects, emotional expressions, objects, text and scene details in plain English',
        contextRef.current,
        (partialText) => {
          setAttachedImage(prev => {
            if (!prev || prev.uri !== imageUri) return prev;
            return {
              ...prev,
              visionSummary: partialText,
            };
          });
        },
      );

      // Keep the system marker intact: the attachment UI uses it to show the
      // correct "install/retry" action instead of misleadingly offering a
      // successful-looking result to copy.
      const finalSummary = rawSummary.includes('[VISION SYSTEM NOTICE]')
        ? rawSummary
        : sanitizeVisionOutput(rawSummary) || rawSummary || '';

      let shortLabel = 'Vision Ready';
      if (finalSummary && !finalSummary.includes('[VISION SYSTEM NOTICE]')) {
        const cleanLines = finalSummary
          .replace(/\[VISUAL ANALYSIS OF ATTACHED IMAGE \([^)]+\)\]:\n?/, '')
          .split('\n')
          .map(l => l.replace(/^[-*•\d.]+\s*/, '').trim())
          .filter(l => l.length > 2);
        const firstSentence = cleanLines[0] || '';
        if (firstSentence) {
          shortLabel = firstSentence.length > 36 ? firstSentence.slice(0, 33) + '...' : firstSentence;
        }
      } else if (finalSummary && finalSummary.includes('[VISION SYSTEM NOTICE]')) {
        shortLabel = 'Vision Offline';
      }

      setAttachedImage(prev => {
        if (!prev || prev.uri !== imageUri) return prev;
        return {
          ...prev,
          isScanning: false,
          visionSummary: finalSummary,
          shortLabel,
        };
      });
    } catch (err) {
      console.warn('ChatScreen: preScanAttachedImage error:', err);
      setAttachedImage(prev => {
        if (!prev || prev.uri !== imageUri) return prev;
        return {
          ...prev,
          isScanning: false,
          visionSummary: 'Visual pixel scan completed.',
          shortLabel: 'Ready',
        };
      });
    }
  }, []);

  const handleAttachPress = useCallback(async () => {
    dismissComposerKeyboard();
    lightHaptic();
    const installedVision = await getSelectedInstalledVisionModel();
    if (!installedVision || !installedVision.isInstalled) {
      // No vision model yet — ask the user before kicking off the download flow.
      setShowInstallVisionAlert(true);
      return;
    }

    const hasPermission = await requestPhotoPermissions();
    if (!hasPermission) {
      return;
    }

    launchImageLibrary({mediaType: 'photo', selectionLimit: 1, quality: 0.8}, response => {
      if (response.didCancel) {
        return;
      }
      if (response.errorCode || response.errorMessage) {
        console.warn('ChatScreen: ImagePicker error:', response.errorCode, response.errorMessage);
        return;
      }
      const asset = response.assets?.[0];
      if (asset?.uri) {
        const uri = asset.uri;
        const fileName = asset.fileName || 'photo.jpg';
        setAttachedImage({
          uri,
          fileName,
          fileSize: asset.fileSize,
          isScanning: true,
        });
        preScanAttachedImage(uri, fileName);
      }
    });
  }, [dismissComposerKeyboard, preScanAttachedImage]);

  const handleConfirmInstallVision = useCallback(async () => {
    setShowInstallVisionAlert(false);
    try {
      await seedVisionDownload();
      onOpenDownload?.();
    } catch (error) {
      console.warn('ChatScreen: failed to seed vision download:', error);
    }
  }, [onOpenDownload]);

  const handleDeleteVisionModel = useCallback(async () => {
    setShowDeleteVisionAlert(false);
    try {
      const visionInfo = await getSelectedInstalledVisionModel();
      if (visionInfo?.fileName) {
        await deleteModelFile(visionInfo.fileName);
      }
      if (visionInfo?.mmprojFileName) {
        await deleteModelFile(visionInfo.mmprojFileName);
      }
      await AsyncStorage.multiRemove([
        'selectedVisionModelId',
        'selectedVisionModelName',
        'selectedVisionModelFileName',
        'selectedVisionModelSizeBytes',
        'selectedVisionModelMmprojFileName',
        'selectedVisionModelMmprojSizeBytes',
        'selectedVisionModelDownloadUrl',
        'selectedVisionModelMmprojDownloadUrl',
        'visionModelDownloadComplete',
        'isVisionDownload',
      ]);
      setVisionInstalledForMenu(false);
    } catch (err) {
      console.warn('ChatScreen: failed to delete vision model:', err);
    }
  }, []);

  const openContextPanel = useCallback(() => {
    dismissComposerKeyboard();

    contextX.stopAnimation();
    infoBackgroundSlide.stopAnimation();
    if (openContextPanelFrameRef.current) {
      cancelAnimationFrame(openContextPanelFrameRef.current);
      openContextPanelFrameRef.current = null;
    }
    contextX.setValue(windowWidth);
    infoBackgroundSlide.setValue(0);
    setIsContextTransitionActive(true);
    setIsContextOpen(true);
    openContextPanelFrameRef.current = requestAnimationFrame(() => {
      openContextPanelFrameRef.current = null;
      Animated.parallel([
        Animated.timing(contextX, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(infoBackgroundSlide, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({finished}) => {
        if (finished) setIsContextTransitionActive(false);
      });
    });
  }, [
    dismissComposerKeyboard,
    contextX,
    infoBackgroundSlide,
    windowWidth,
    userMemory,
    aiName,
    aiPersonality,
    aiEmoji,
    aiEmojiQuantity,
  ]);

  const closeContextPanel = useCallback(() => {
    if (openContextPanelFrameRef.current) {
      cancelAnimationFrame(openContextPanelFrameRef.current);
      openContextPanelFrameRef.current = null;
    }
    setIsContextTransitionActive(true);
    Animated.parallel([
      Animated.timing(contextX, {
        toValue: windowWidth,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(infoBackgroundSlide, {
        toValue: 0,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      setIsContextTransitionActive(false);
      if (finished) setIsContextOpen(false);
    });
  }, [contextX, infoBackgroundSlide, windowWidth]);

  const confirmLogoutAndWipe = useCallback(async () => {
    setShowLogoutConfirmAlert(false);

    try {
      if (isGenerating) {
        await contextRef.current?.stopCompletion();
      }
      await contextRef.current?.clearCache();

      generationLockRef.current = false;
      stopRequestedRef.current = false;
      setIsGenerating(false);
      setResponsePhase('idle');
      clearThinkingFadeTimer();
      setThinkingTrace([]);
      setVisibleThinkingLineCount(1);
      setIsThinkingFading(false);

      // Get the model file names before clearing AsyncStorage
      const [selectedFileName, downloadedFileName] = await Promise.all([
        AsyncStorage.getItem('selectedModelFileName'),
        AsyncStorage.getItem('downloadedModelFileName'),
      ]);

      // Stop downloader tasks to prevent any active downloads from continuing
      try {
        const tasks = await getExistingDownloadTasks();
        for (const task of tasks) {
          console.log('ChatScreen: stopping active download task on logout:', task.id);
          await task.stop().catch(err => console.warn('ChatScreen: failed to stop task:', err));
        }
      } catch (dlError) {
        console.warn('ChatScreen: failed to clear downloader tasks:', dlError);
      }

      // Delete the local model files from disk
      if (selectedFileName) {
        console.log('ChatScreen: deleting local model file:', selectedFileName);
        await deleteModelFile(selectedFileName);
      }
      if (downloadedFileName && downloadedFileName !== selectedFileName) {
        console.log('ChatScreen: deleting local downloaded model file:', downloadedFileName);
        await deleteModelFile(downloadedFileName);
      }

      await AsyncStorage.clear();

      const user = auth().currentUser;
      if (user) {
        try {
          await user.delete();
        } catch (deleteError) {
          console.warn('ChatScreen: account delete failed, falling back to sign out:', deleteError);
          await auth().signOut();
        }
      } else {
        await auth().signOut();
      }
    } catch (error) {
      console.warn('ChatScreen: logout cleanup failed:', error);
      await auth().signOut().catch(signOutError => {
        console.warn('ChatScreen: sign out failed:', signOutError);
      });
    }
  }, [clearThinkingFadeTimer, isGenerating]);

  useEffect(() => {
    const nextName = localName.trim();
    const nameLine = nextName ? `User name: ${nextName}.` : '';
    const bulletLines = localMemoryBullets
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n');
    const nextMemory = [nameLine, bulletLines].filter(Boolean).join('\n');

    setUserMemory(current => (current === nextMemory ? current : nextMemory));
  }, [localMemoryBullets, localName]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const cleanedAiName = localAiName.trim() || 'Rivo';
    const cleanedAiPersonality = localAiPersonality.trim() || 'helpful, intelligent, friendly';
    const cleanedAiEmoji = localAiEmoji.trim() || '✨';
    const nextAiEmojiQuantity = localAiEmojiQuantity;

    setAiName(current => (current === cleanedAiName ? current : cleanedAiName));
    setAiPersonality(current => (current === cleanedAiPersonality ? current : cleanedAiPersonality));
    setAiEmoji(current => (current === cleanedAiEmoji ? current : cleanedAiEmoji));
    setAiEmojiQuantity(current => (current === nextAiEmojiQuantity ? current : nextAiEmojiQuantity));

    const persistTimer = setTimeout(() => {
      AsyncStorage.multiSet([
        ['rivo.neural.aiName', cleanedAiName],
        ['rivo.neural.aiPersonality', cleanedAiPersonality],
        ['rivo.neural.aiEmoji', cleanedAiEmoji],
        ['rivo.neural.aiEmojiQuantity', nextAiEmojiQuantity],
        ['rivo.neural.userName', localName],
        ['rivo.neural.userMemoryBullets', localMemoryBullets],
        ['rivo.neural.maxTokens', String(maxTokens)],
        ['rivo.neural.keepMessages', String(keepMessages)],
        ['rivo.neural.isPerformanceMode', String(isPerformanceMode)],
      ]).catch(err => {
        console.warn('ChatScreen: failed to save global neural settings:', err);
      });
    }, 120);

    return () => clearTimeout(persistTimer);
  }, [
    hasHydrated,
    isPerformanceMode,
    keepMessages,
    localAiEmoji,
    localAiEmojiQuantity,
    localAiName,
    localAiPersonality,
    localName,
    localMemoryBullets,
    maxTokens,
  ]);

  const openInfoLink = useCallback((url: string) => {
    Linking.openURL(url).catch(error => {
      console.warn('ChatScreen: failed to open info link:', error);
    });
  }, []);

  useEffect(() => {
    if (!hasHydrated || isGenerating) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      const currentThreads = threadsRef.current;
      const previousActiveThread = currentThreads.find(thread => thread.id === activeThreadId);
      const didThreadContentChange =
        !previousActiveThread ||
        previousActiveThread.messages !== messages ||
        previousActiveThread.summary !== memorySummary ||
        previousActiveThread.compactedCount !== compactedCount ||
        previousActiveThread.userMemory !== userMemory;

      if (messages.length && !didThreadContentChange) {
        await AsyncStorage.setItem(ACTIVE_THREAD_KEY, activeThreadId);
        return;
      }

      const updatedThreads = messages.length
        ? [
            {
              id: activeThreadId,
              title: previousActiveThread?.title ?? makeTitle(messages),
              updatedAt: didThreadContentChange ? Date.now() : previousActiveThread.updatedAt,
              messages,
              summary: memorySummary,
              compactedCount,
              userMemory,
              isCodingLocked: isCurrentThreadCodingLocked,
            },
            ...currentThreads.filter(thread => thread.id !== activeThreadId),
          ].slice(0, MAX_THREADS)
        : currentThreads.filter(thread => thread.id !== activeThreadId);

      threadsRef.current = updatedThreads;
      setThreads(updatedThreads);
      await AsyncStorage.multiSet([
        [CHAT_THREADS_KEY, JSON.stringify(updatedThreads)],
        [ACTIVE_THREAD_KEY, activeThreadId],
      ]);
    }, 350);
  }, [activeThreadId, compactedCount, hasHydrated, isGenerating, memorySummary, messages, userMemory]);

  const ensureModel = useCallback(async () => {
    if (contextRef.current) {
      return contextRef.current;
    }

    const installedModel = await getSelectedInstalledModel();
    if (!installedModel) {
      throw new Error('No downloaded model found. Install a model first.');
    }

    setIsModelLoading(true);
    setStatus('Warming engine');
    setModelName(installedModel.model.name);

    const modelPath = installedModel.filePath ?? getModelFilePath(installedModel.fileName);
    const modelUri = `file://${modelPath}`;
    const baseModelParams = {
      model: modelUri,
      n_gpu_layers: 0,
      use_mlock: false,
    };

    let context: LlamaContext;
    try {
      context = await initLlama(
        {
          ...baseModelParams,
          n_ctx: 2048,
          n_batch: 128,
          n_threads: 3,
          use_mmap: true,
        },
        progress => setStatus(`Warming ${Math.round(progress * 100)}%`),
      );
    } catch (error: any) {
      console.warn('ChatScreen: model load failed, retrying safer load:', error);
      if (error?.message?.includes('JSI')) {
        await new Promise(resolve => setTimeout(() => resolve(null), 600));
      }
      setStatus('Retrying engine');
      context = await initLlama(
        {
          ...baseModelParams,
          n_ctx: 1024,
          n_batch: 64,
          n_threads: 2,
          use_mmap: false,
        },
        progress => setStatus(`Retrying ${Math.round(progress * 100)}%`),
      );
    }

    contextRef.current = context;
    setStatus('Private offline');
    setIsModelLoading(false);
    return context;
  }, []);

  const scrollToEnd = useCallback((animated = true, force = false) => {
    if (force) {
      userScrolledUpRef.current = false;
    }
    if (!force && userScrolledUpRef.current) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastScrollAtRef.current < SCROLL_THROTTLE_MS) {
      return;
    }

    lastScrollAtRef.current = now;
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      // Content-size updates can schedule this callback just before a drag
      // starts. Never let that stale request pull the list from under a swipe.
      if (!force && (userScrolledUpRef.current || isChatScrollInteractingRef.current)) {
        return;
      }
      listRef.current?.scrollToEnd({animated});
    });
  }, []);

  const handleListLayoutSettled = useCallback(() => {
    if (!hasHydrated || didInitialScrollRef.current || messages.length === 0) {
      return;
    }
    if (pendingRestoreScrollRef.current) {
      requestRestoreScrollToEnd();
      return;
    }
    if (layoutDebounceRef.current) {
      clearTimeout(layoutDebounceRef.current);
    }
    layoutDebounceRef.current = setTimeout(() => {
      if (!didInitialScrollRef.current) {
        listRef.current?.scrollToEnd({animated: true});
        didInitialScrollRef.current = true;
      }
    }, 150);
  }, [hasHydrated, messages.length, requestRestoreScrollToEnd]);

  useEffect(() => {
    if (hasHydrated && messages.length > 0 && pendingRestoreScrollRef.current) {
      requestRestoreScrollToEnd();
    }
  }, [hasHydrated, messages.length, requestRestoreScrollToEnd]);

  const handleChatContentSizeChange = useCallback(() => {
    handleListLayoutSettled();
    if (isGenerating && !userScrolledUpRef.current && !isChatScrollInteractingRef.current) {
      scrollToEnd(false);
    }
  }, [handleListLayoutSettled, isGenerating, scrollToEnd]);

  const handleChatScrollInteractionEnd = useCallback(() => {
    isChatScrollInteractingRef.current = false;
    if (isChatAtBottomRef.current) {
      userScrolledUpRef.current = false;
      if (isGenerating) {
        scrollToEnd(false);
      }
    }
  }, [isGenerating, scrollToEnd]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(emptyLogoPulseAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(emptyLogoPulseAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [emptyLogoPulseAnim]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: any) => {
      const height = e?.endCoordinates?.height ?? 0;
      if (height > 0) {
        setKeyboardHeight(height);
        if (Platform.OS === 'android') {
          Animated.timing(androidKeyboardOffsetAnim, {
            toValue: Math.max(0, height + 16),
            duration: e?.duration || 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
        }
      }
      if (!userScrolledUpRef.current) {
        scrollToEnd(true);
      }
    };

    const onHide = (e: any) => {
      setKeyboardHeight(0);
      if (Platform.OS === 'android') {
        Animated.timing(androidKeyboardOffsetAnim, {
          toValue: 0,
          duration: e?.duration || 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      }
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [androidKeyboardOffsetAnim, insets.bottom, scrollToEnd]);

  const pulseSend = useCallback(() => {
    Animated.sequence([
      Animated.timing(sendScale, {
        toValue: 0.9,
        duration: 70,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(sendScale, {
        toValue: 1,
        damping: 12,
        stiffness: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [sendScale]);

  const compactThreadMemory = useCallback(async (
    context: LlamaContext,
    completeMessages: ChatMessage[],
    nextUserMemory: string,
  ) => {
    const compactableMessages = completeMessages.filter(item => item.role !== 'notice');
    const activeCompactLimit = isPerformanceMode ? 10 : 40;
    if (compactableMessages.length < activeCompactLimit) {
      return {messages: compactableMessages, summary: memorySummary};
    }

    const activeKeepMessages = isPerformanceMode ? 3 : keepMessages;
    const olderMessages = compactableMessages.slice(0, -activeKeepMessages);
    const recentMessages = compactableMessages.slice(-activeKeepMessages);
    setStatus('Context Compact Pending...');

    try {
      const result = await context.completion({
        messages: [
          {
            role: 'system',
            content:
              'Compact this chat into durable memory for a local assistant. Keep facts, user preferences, names, goals, decisions, and open tasks. Do not invent anything. Use tight bullet notes.',
          },
          {
            role: 'user',
            content: [
              memorySummary ? `Previous memory:\n${memorySummary}` : '',
              nextUserMemory ? `Known user memory:\n${nextUserMemory}` : '',
              `Conversation to compact:\n${serializeMessages(olderMessages, aiName)}`,
            ].filter(Boolean).join('\n\n'),
          },
        ],
        n_predict: 220,
        temperature: 0.15,
        top_p: 0.8,
        top_k: 30,
        penalty_repeat: 1.15,
        stop: STOP_WORDS,
        force_pure_content: true,
      });

      const compactedSummary = getCompletionText(result, '');
      const nextSummary = compactedSummary || memorySummary;
      setMemorySummary(nextSummary);
      setCompactedCount(current => current + olderMessages.length);

      const noticeMessage: ChatMessage = {
        id: `${Date.now()}_compact_success`,
        role: 'notice',
        text: `Context Compacted (Success • ${olderMessages.length} msgs)`,
      };

      const nextMessagesWithNotice = [noticeMessage, ...recentMessages];
      userScrolledUpRef.current = false;
      isChatAtBottomRef.current = true;
      setMessagesAndRef(nextMessagesWithNotice);
      scrollToEnd(true, true);
      setTimeout(() => {
        scrollToEnd(true, true);
      }, 100);
      setStatus('Context Compacted (Success)');
      return {messages: nextMessagesWithNotice, summary: nextSummary};
    } catch (error) {
      console.warn('ChatScreen: compaction failed:', error);
      setStatus('Memory kept raw');
      return {messages: compactableMessages, summary: memorySummary};
    }
  }, [memorySummary, setMessagesAndRef, isPerformanceMode, keepMessages, aiName]);

  const sendMessage = useCallback(async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? input).trim();
    if (!prompt || generationLockRef.current) {
      return;
    }
    generationLockRef.current = true;
    stopRequestedRef.current = false;
    didFeelReplyStartRef.current = false;
    setIsFreshEmptyThread(false);
    lightHaptic();

    pulseSend();

    const currentAttachedImage = attachedImageRef.current;
    if (currentAttachedImage) {
      setAttachedImage(null);
    }

    const now = Date.now();
    const userMessage: ChatMessage = {
      id: `${now}_user`,
      role: 'user',
      text: prompt,
      attachedImageUri: currentAttachedImage?.uri,
      visionLabel: currentAttachedImage?.shortLabel,
    };
    const nextUserMemory = extractUserMemory(prompt, userMemory);
    clearThinkingFadeTimer();
    setIsThinkingFading(false);
    setVisibleThinkingLineCount(1);
    if (nextUserMemory !== userMemory) {
      setUserMemory(nextUserMemory);
    }
    const rememberedName = extractNameFromMemory(nextUserMemory);
    const visionModelInfo = await getSelectedInstalledVisionModel();
    const assistantId = `${now}_assistant`;
    userScrolledUpRef.current = false;
    isChatScrollInteractingRef.current = false;
    isChatAtBottomRef.current = true;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      isScanningVision: Boolean(currentAttachedImage && !currentAttachedImage.visionSummary),
      visionModelName: visionModelInfo?.name || 'Vision AI Engine',
    };
    let baseMessages = messagesRef.current.filter(item => item.role !== 'notice');
    const isFirstMessage = baseMessages.length === 0;

    if (currentAttachedImage) {
      setThinkingTrace(
        currentAttachedImage.visionSummary
          ? [
              'Applying cached vision analysis...',
              'Reasoning with local AI engine...',
            ]
          : [
              'Analyzing image with Vision model...',
              'Extracting visual features & context...',
              'Synthesizing multimodal understanding...',
              'Reasoning with local AI engine...',
            ],
      );
    } else {
      setThinkingTrace(
        buildThinkingTrace(
          prompt,
          Boolean(nextUserMemory || memorySummary),
          isFirstMessage,
        ),
      );
    }
    let streamedText = '';
    let lastVisibleStreamText = '';
    let didStartThinkingFade = false;
    let activeAssistantId = assistantId;
    let activeResponsePrefix = '';
    let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const generationStartTime = Date.now();
    let firstTokenTime = 0;
    let thinkEndTime = 0;

    try {
      let activeMemorySummary = memorySummary;

      setInput('');
      setIsGenerating(true);
      setResponsePhase('setting_up');
      setStatus('Setting up');
      setMessagesAndRef([...messagesRef.current, userMessage, assistantMessage]);
      scrollToEnd(true);
      const context = await ensureModel();

      // Allow native context to fully reset after a recent stop
      if (justStoppedRef.current) {
        justStoppedRef.current = false;
        await new Promise<void>(resolve => setTimeout(resolve, 100));
      }

      const activeCompactLimit = isPerformanceMode ? 10 : 40;
      if (baseMessages.length >= activeCompactLimit) {
        const compactNotice: ChatMessage = {
          id: `${now}_compact_notice`,
          role: 'notice',
          text: 'Compacting context...',
        };
        userScrolledUpRef.current = false;
        isChatAtBottomRef.current = true;
        setMessagesAndRef([...messagesRef.current, compactNotice]);
        scrollToEnd(true, true);

        const compacted = await compactThreadMemory(context, baseMessages, nextUserMemory);
        const activeKeepMessages = isPerformanceMode ? 3 : keepMessages;
        baseMessages = compacted?.messages ?? baseMessages.slice(-activeKeepMessages);
        activeMemorySummary = compacted?.summary ?? activeMemorySummary;
        const compactedNotice: ChatMessage = {
          id: `${now}_compact_done`,
          role: 'notice',
          text: 'Context compacted. Continuing with recent memory.',
        };
        userScrolledUpRef.current = false;
        isChatAtBottomRef.current = true;
        setMessagesAndRef([...baseMessages, compactedNotice, userMessage, assistantMessage]);
        scrollToEnd(true, true);
        await new Promise<void>(resolve => setTimeout(() => resolve(), 180));
      } else {
        setMessagesAndRef([...baseMessages, userMessage, assistantMessage]);
      }
      userScrolledUpRef.current = false;
      isChatAtBottomRef.current = true;
      scrollToEnd(true, true);
      setTimeout(() => {
        scrollToEnd(true, true);
      }, 80);
      setStatus('Composing');

      const activeKeepMessages = isPerformanceMode ? 3 : keepMessages;
      const conversationSnapshot = [...baseMessages, userMessage]
        .filter(item => item.role !== 'notice' && item.text.trim().length > 0)
        .slice(-activeKeepMessages);

      const currentAiName = localAiName.trim() || aiName || 'Rivo';
      const currentPersonality = localAiPersonality.trim() || aiPersonality || 'helpful, intelligent, friendly';
      const currentEmojiQty = localAiEmojiQuantity || aiEmojiQuantity || 'medium';
      const currentUserName = localName.trim() || rememberedName || '';
      const currentMemoryText = localMemoryBullets.trim() || nextUserMemory || '';

      const emojiQuantityInstruction =
        currentEmojiQty === 'none'
          ? `Do not use any emojis in your response. Keep text emoji-free.`
          : currentEmojiQty === 'low'
          ? `Include 1-2 friendly emojis in your reply (e.g. 😊).`
          : currentEmojiQty === 'high'
          ? `Include 4-6 expressive emojis naturally throughout your response (e.g. 😊, 🚀, 💡, 💻).`
          : `Include 2-3 friendly emojis in your reply (e.g. 😊, 👍).`;

      const thinkingDirective = isPerformanceMode
        ? 'Fast Mode: Provide quick, direct, concise responses.'
        : maxTokens <= 256
        ? 'Light Mode: Be fast, direct, and concise.'
        : maxTokens <= 512
        ? 'Medium Mode: Provide balanced step-by-step reasoning.'
        : maxTokens <= 1024
        ? 'High Mode: Exercise deep reasoning and thorough logic.'
        : 'Ultra Mode: Apply maximum analytical effort and exhaustive reasoning.';

      const systemContent = isPerformanceMode
        ? [
            `You are ${currentAiName}, an offline AI assistant.`,
            `Personality: ${currentPersonality}.`,
            `CRITICAL IDENTITY FACTS:`,
            `- The founder, owner, creator, and developer of Rivo (and Rivo Agent) is Sanket Padhyal.`,
            `- If asked about the owner, founder, creator, or who made Rivo, you MUST state that Sanket Padhyal is the owner and founder of Rivo.`,
            currentUserName ? `You are speaking with ${currentUserName}.` : '',
            currentMemoryText ? `Known facts about ${currentUserName || 'the user'}:\n${formatUserMemoryForPrompt(currentMemoryText)}` : '',
            `Instructions:`,
            `- Reply directly to the user's message in clean Markdown text.`,
            `- Do not wrap your response in quotation marks or preamble text.`,
            `- ${emojiQuantityInstruction}`,
            `- ${thinkingDirective}`,
          ].filter(Boolean).join('\n')
        : [
            `You are ${currentAiName}, a highly capable offline AI companion running locally on ${modelName}.`,
            `Personality and vibe: ${currentPersonality}.`,
            `CRITICAL IDENTITY FACTS:`,
            `- The founder, owner, creator, and developer of Rivo (and Rivo Agent) is Sanket Padhyal.`,
            `- If asked who owns, created, founded, or developed Rivo, you MUST state clearly that Sanket Padhyal is the owner, founder, and creator of Rivo.`,
            currentUserName
              ? `You are talking to ${currentUserName}. Address the user as ${currentUserName}.`
              : `You are talking to the user.`,
            currentMemoryText
              ? `Known facts about ${currentUserName || 'the user'}:\n${formatUserMemoryForPrompt(currentMemoryText)}`
              : '',
            `Instructions:`,
            `- Write your reasoning and response strictly in clear English.`,
            `- Answer directly and naturally in clean Markdown text (headers # ##, bold text, bullet points, code blocks).`,
            `- NEVER enclose your output in quotation marks ("...") or echo these system instructions.`,
            `- ${emojiQuantityInstruction}`,
            `- ${thinkingDirective}`,
            activeMemorySummary ? `Conversation context:\n${activeMemorySummary}` : '',
            currentAttachedImage ? (getModelSizeB(modelName) <= 2
              ? `Image context: An image observation is included in the user message. Answer based only on what is described.`
              : `Multimodal context: Answer based strictly on the verifiable image observation.`
            ) : '',
          ].filter(Boolean).join('\n\n');

      let visualContextPrefix = '';
      if (currentAttachedImage) {
        if (currentAttachedImage.visionSummary) {
          visualContextPrefix = currentAttachedImage.visionSummary;
        } else {
          setStatus('Scanning image with Vision model...');
          visualContextPrefix = await generateVisionAnalysisForPrompt(
            currentAttachedImage.uri,
            currentAttachedImage.fileName || 'photo.jpg',
            prompt,
            context,
            (partialVisionText) => {
              updateMessagesAndRef(current =>
                current.map(msg =>
                  msg.id === activeAssistantId
                    ? {...msg, visionText: partialVisionText, isScanningVision: true}
                    : msg,
                ),
              );
            },
          );
        }

        const cleanVisionText = visualContextPrefix
          .replace(/\[VISION MODEL ANALYSIS \([^)]+\)\]:\nVisual Content Description:\n/, '')
          .replace(/\[VISION SYSTEM NOTICE\]: /, '');

        updateMessagesAndRef(current =>
          current.map(msg =>
            msg.id === activeAssistantId
              ? {...msg, visionText: cleanVisionText, isScanningVision: false}
              : msg,
          ),
        );
      }

      const llamaMessages: RNLlamaOAICompatibleMessage[] = [
        {
          role: 'system',
          content: systemContent,
        },
        ...conversationSnapshot.map(item => {
          const cleanContent = item.role === 'assistant'
            ? (parseThoughtAndContent(item.text).contentText || item.text)
            : item.text;
          
          let contentToSend = sanitizeMessageForLlama(cleanContent);
          if (item.id === userMessage.id && visualContextPrefix) {
            const sizeB = getModelSizeB(modelName);
            const trimmed = trimVisionForModel(visualContextPrefix, sizeB);
            contentToSend = sizeB <= 2
              ? `[Image]: ${trimmed}\n\n${cleanContent}`
              : `[CURRENT PHOTO OBSERVATION]: ${trimmed}\n\nUser Request: ${cleanContent}`;
          }

          return {
            role: item.role as 'user' | 'assistant',
            content: contentToSend,
          };
        }),
      ];

      const flushStream = (force = false) => {
        if (streamFlushTimer) {
          clearTimeout(streamFlushTimer);
          streamFlushTimer = null;
        }

        const nextVisibleText = visibleGeneratedText(streamedText);
        if (!force && nextVisibleText === lastVisibleStreamText) {
          return;
        }

        lastVisibleStreamText = nextVisibleText;
        setResponsePhase('composing');
        if (nextVisibleText.trim() && !didStartThinkingFade) {
          didStartThinkingFade = true;
          setIsThinkingFading(true);
          clearThinkingFadeTimer();
          thinkingFadeTimerRef.current = setTimeout(() => {
            setThinkingTrace([]);
            setIsThinkingFading(false);
            thinkingFadeTimerRef.current = null;
          }, 260);
        }
        updateMessagesAndRef(current =>
          current.map(item =>
            item.id === activeAssistantId
              ? {...item, text: `${activeResponsePrefix}${nextVisibleText}`}
              : item,
          ),
        );
      };

      const scheduleStreamFlush = () => {
        if (streamFlushTimer) {
          return;
        }
        streamFlushTimer = setTimeout(() => flushStream(), STREAM_FLUSH_MS);
      };

      const handleStreamToken = (data: CompletionTokenUpdate) => {
        const nextStreamedText = getStreamTextFromUpdate(data, streamedText);
        if (nextStreamedText === streamedText) {
          return;
        }

        if (!firstTokenTime) {
          firstTokenTime = Date.now();
        }

        if (/<\/think>/i.test(nextStreamedText) && !thinkEndTime) {
          thinkEndTime = Date.now();
        }

        setResponsePhase('thinking');
        setStatus('Thinking');
        streamedText = nextStreamedText;
        if (!didFeelReplyStartRef.current) {
          didFeelReplyStartRef.current = true;
          lightHaptic();
        } else {
          const nowHaptic = Date.now();
          if (nowHaptic - lastStreamHapticAtRef.current > 110) {
            lastStreamHapticAtRef.current = nowHaptic;
            streamHaptic();
          }
        }
        scheduleStreamFlush();
      };

      const activeMaxTokens = isPerformanceMode ? Math.min(maxTokens, 1024) : maxTokens;
      const completionOptions: any = {
        messages: llamaMessages,
        n_predict: activeMaxTokens,
        temperature: 0.65,
        top_p: 0.9,
        top_k: 40,
        min_p: 0.05,
        penalty_last_n: 64,
        penalty_repeat: 1.03,
        penalty_freq: 0,
        dry_multiplier: 0,
        stop: STOP_WORDS,
        force_pure_content: true,
      };

      if (currentAttachedImage?.uri) {
        const imagePath = currentAttachedImage.uri.replace('file://', '');
        try {
          // Only pass raw media_paths to mainContext if main model is natively a Vision model (e.g. Qwen2-VL)
          const isMainVisionModel = modelName.toLowerCase().includes('qwen2-vl') || modelName.toLowerCase().includes('vision');
          if (isMainVisionModel) {
            const isVisionAvailable = await hasInstalledVisionModel().catch(() => false);
            if (isVisionAvailable) {
              const installedVision = await getSelectedInstalledVisionModel();
              if (installedVision?.fileName) {
                const mmprojPath = installedVision.mmprojFileName
                  ? `file://${getModelFilePath(installedVision.mmprojFileName)}`
                  : null;
                let isAlreadyEnabled = await context.isMultimodalEnabled?.().catch(() => false);
                if (!isAlreadyEnabled && typeof context.initMultimodal === 'function' && mmprojPath) {
                  await context.initMultimodal({
                    path: mmprojPath,
                    use_gpu: true,
                    image_max_tokens: 512,
                  }).catch(e => {
                    console.warn('ChatScreen: initMultimodal info:', e);
                    return false;
                  });
                }
              }
            }

            const isMultimodalActive = await context.isMultimodalEnabled?.().catch(() => false);
            if (isMultimodalActive) {
              completionOptions.media_paths = [imagePath];
            }
          }
        } catch (visionErr) {
          console.warn('ChatScreen: vision init error:', visionErr);
        }
      }

      const result = await context.completion(
        completionOptions,
        data => {
          handleStreamToken(data);
        },
      );

      flushStream(true);
      lightHaptic();
      let wasInterrupted = stopRequestedRef.current || Boolean(result.interrupted);
      let isTruncated = Boolean(result.truncated) || Boolean(result.stopped_limit);
      let finalText = getCompletionText(result, streamedText);
      if (wasInterrupted && !finalText.trim()) {
        finalText =
          lastVisibleStreamText ||
          visibleGeneratedText(streamedText) ||
          messagesRef.current.find(item => item.id === activeAssistantId)?.text ||
          '';
      }

      // Guard against emoji-only responses (e.g. model outputting just "✨" or "🔥😊")
      const trimmedFinal = finalText.trim();
      const hasLettersOrDigits = /[a-zA-Z0-9\u0600-\u06FF\u0900-\u097F\u0400-\u04FF\u4E00-\u9FFF]/.test(trimmedFinal);
      if (trimmedFinal && !hasLettersOrDigits) {
        finalText = `Hello! ${trimmedFinal} How can I help you today?`;
      }

      if (/<\/think>/i.test(finalText) && !thinkEndTime) {
        thinkEndTime = Date.now();
      }

      const hasThoughtTags = /<think>[\s\S]*?(?:<\/think>|$)/i.test(finalText);
      const thoughtDuration = (thinkEndTime > 0 && hasThoughtTags)
        ? (thinkEndTime - generationStartTime)
        : (hasThoughtTags ? (Date.now() - generationStartTime) : undefined);
      const totalDuration = Date.now() - generationStartTime;

      let finalAssistantMessages: ChatMessage[] = [
        {
          id: assistantId,
          role: 'assistant',
          text: finalText || 'I could not generate a response.',
          thoughtTimeMs: thoughtDuration,
          totalTimeMs: totalDuration,
        },
      ];

      if (!wasInterrupted && isLikelyCorruptResponse(finalText)) {
        finalText = 'I got unstable output from the local model. Please tap send again and I will retry with a fresh pass.';
      }

      finalAssistantMessages = [
        {
          id: assistantId,
          role: 'assistant',
          text: finalText || 'I could not generate a response.',
          thoughtTimeMs: thoughtDuration,
          totalTimeMs: totalDuration,
          interrupted: wasInterrupted,
          isTruncated: isTruncated,
        },
      ];
      const completeMessages = [
        ...baseMessages,
        userMessage,
        ...finalAssistantMessages,
      ];
      updateMessagesAndRef(current =>
        current.map(item => {
          const finalMessage = finalAssistantMessages.find(message => message.id === item.id);
          return finalMessage ?? item;
        }),
      );
      setStatus('Private offline');
      setResponsePhase('idle');
      if (!wasInterrupted) {
        lightHaptic();
      }
      scrollToEnd(true, true);
      setTimeout(() => {
        scrollToEnd(true, true);
      }, 100);
      if (!wasInterrupted) {
        await compactThreadMemory(context, completeMessages, nextUserMemory);
      }

      if (isCodeLikeResponse(finalText)) {
        setIsCurrentThreadCodingLocked(true);
      }
    } catch (error) {
      if (stopRequestedRef.current) {
        if (streamFlushTimer) {
          clearTimeout(streamFlushTimer);
          streamFlushTimer = null;
        }
        const interruptedVisibleText = visibleGeneratedText(streamedText);
        const interruptedText = `${activeResponsePrefix}${interruptedVisibleText}`.trim();
        updateMessagesAndRef(current =>
          current
            .map(item => {
              if (item.id === activeAssistantId) {
                const preservedText = item.text.trim() || interruptedText;
                return {
                  ...item,
                  text: preservedText || 'Generation stopped.',
                  interrupted: true,
                };
              }

              if (activeAssistantId !== assistantId && item.id === assistantId && item.text.trim()) {
                return {...item, interrupted: true};
              }

              return item;
            })
            .filter(item => (
              item.role !== 'assistant' ||
              item.id === activeAssistantId ||
              item.text.trim().length > 0
            )),
        );
        if (isCodeLikeResponse(interruptedText)) {
          setIsCurrentThreadCodingLocked(true);
        }
        setStatus('Private offline');
        setResponsePhase('idle');
        return;
      }

      const message = error instanceof Error ? error.message : 'Model failed to respond.';
      updateMessagesAndRef(current =>
        current.map(item =>
          item.id === assistantId
            ? {...item, text: `Local model error: ${message}`}
            : item,
        ),
      );
      setStatus('Model unavailable');
      setResponsePhase('idle');
    } finally {
      generationLockRef.current = false;
      stopRequestedRef.current = false;
      setIsGenerating(false);
      setIsModelLoading(false);
      setResponsePhase('idle');
      clearThinkingFadeTimer();
      setThinkingTrace([]);
      setVisibleThinkingLineCount(1);
      setIsThinkingFading(false);
      // Safety net: ensure no assistant message was left blank
      updateMessagesAndRef(current =>
        current.map(item =>
          item.role === 'assistant' && !item.text.trim()
            ? {...item, text: 'Generation stopped.', interrupted: true}
            : item,
        ),
      );
    }
  }, [
    clearThinkingFadeTimer,
    compactThreadMemory,
    ensureModel,
    input,
    memorySummary,
    modelName,
    pulseSend,
    scrollToEnd,
    setMessagesAndRef,
    updateMessagesAndRef,
    userMemory,
    isPerformanceMode,
    maxTokens,
    keepMessages,
    aiName,
    aiPersonality,
    aiEmoji,
    aiEmojiQuantity,
  ]);

  const sendFirstHi = useCallback(() => {
    setInput('hi');
    requestAnimationFrame(() => sendMessage('hi'));
  }, [sendMessage]);

  const newChat = useCallback(async () => {
    if (threadsRef.current.length >= MAX_THREADS && messages.length > 0) {
      setIsMenuOpen(false);
      setShowThreadLimitAlert(true);
      return;
    }
    clearRestoreScrollTimers();
    pendingRestoreScrollRef.current = false;
    didInitialScrollRef.current = true;
    userScrolledUpRef.current = false;
    const nextId = createThreadId();
    setActiveThreadId(nextId);
    setMessagesAndRef([]);
    setMemorySummary('');
    setUserMemory('');
    setCompactedCount(0);
    setIsCurrentThreadCodingLocked(false);
    setIsFreshEmptyThread(true);
    setInput('');
    setIsMenuOpen(false);
    setStatus('Private offline');
    lightHaptic();
  }, [clearRestoreScrollTimers, setMessagesAndRef, messages.length]);

  const loadThread = useCallback((thread: StoredThread) => {
    clearRestoreScrollTimers();
    pendingRestoreScrollRef.current = Boolean(thread.messages.length);
    didInitialScrollRef.current = false;
    userScrolledUpRef.current = false;
    setActiveThreadId(thread.id);
    setMessagesAndRef(thread.messages);
    setMemorySummary(thread.summary ?? '');
    setUserMemory(thread.userMemory ?? '');
    setCompactedCount(thread.compactedCount ?? 0);
    setIsCurrentThreadCodingLocked(Boolean(thread.isCodingLocked));
    setIsFreshEmptyThread(false);
    setIsMenuOpen(false);
    AsyncStorage.setItem(ACTIVE_THREAD_KEY, thread.id);
  }, [clearRestoreScrollTimers, setMessagesAndRef]);

  const confirmDeleteThread = useCallback(async () => {
    if (!pendingDeleteThread) {
      return;
    }

    const remainingThreads = threadsRef.current.filter(
      thread => thread.id !== pendingDeleteThread.id,
    );

    threadsRef.current = remainingThreads;
    setThreads(remainingThreads);
    setPendingDeleteThread(null);

    let nextActiveId = activeThreadId;
    if (pendingDeleteThread.id === activeThreadId) {
      const nextThread = [...remainingThreads].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (nextThread) {
        nextActiveId = nextThread.id;
        clearRestoreScrollTimers();
        pendingRestoreScrollRef.current = nextThread.messages.length > 0;
        didInitialScrollRef.current = false;
        setActiveThreadId(nextThread.id);
        setMessagesAndRef(nextThread.messages);
        setMemorySummary(nextThread.summary ?? '');
        setUserMemory(nextThread.userMemory ?? '');
        setCompactedCount(nextThread.compactedCount ?? 0);
      } else {
        nextActiveId = createThreadId();
        pendingRestoreScrollRef.current = false;
        didInitialScrollRef.current = true;
        clearRestoreScrollTimers();
        setActiveThreadId(nextActiveId);
        setMessagesAndRef([]);
        setMemorySummary('');
        setUserMemory('');
        setCompactedCount(0);
        setIsFreshEmptyThread(false);
      }
    }

    clearThinkingFadeTimer();
    setThinkingTrace([]);
    setVisibleThinkingLineCount(1);
    setIsThinkingFading(false);

    await AsyncStorage.multiSet([
      [CHAT_THREADS_KEY, JSON.stringify(remainingThreads)],
      [ACTIVE_THREAD_KEY, nextActiveId],
    ]);
  }, [
    activeThreadId,
    clearRestoreScrollTimers,
    clearThinkingFadeTimer,
    pendingDeleteThread,
    setMessagesAndRef,
  ]);

  const stopGeneration = useCallback(async () => {
    if (stopRequestedRef.current) {
      return;
    }

    stopRequestedRef.current = true;
    justStoppedRef.current = true;
    try {
      await contextRef.current?.stopCompletion();
      await contextRef.current?.clearCache();
    } catch (error) {
      console.warn('ChatScreen: failed to stop completion:', error);
      generationLockRef.current = false;
      setIsGenerating(false);
      setResponsePhase('idle');
    }
    clearThinkingFadeTimer();
    setThinkingTrace([]);
    setVisibleThinkingLineCount(1);
    setIsThinkingFading(false);
    setStatus('Private offline');
  }, [clearThinkingFadeTimer]);

  const handleChatBack = useCallback(() => {
    if (pendingDeleteThread) {
      setPendingDeleteThread(null);
      return true;
    }

    if (showModelSwitchAlert) {
      setShowModelSwitchAlert(false);
      return true;
    }

    if (showThreadLimitAlert) {
      setShowThreadLimitAlert(false);
      return true;
    }

    if (showLocalAccessAlert) {
      setShowLocalAccessAlert(false);
      return true;
    }

    if (showLogoutConfirmAlert) {
      setShowLogoutConfirmAlert(false);
      return true;
    }

    if (isContextOpen) {
      closeContextPanel();
      return true;
    }

    if (isInfoOpen) {
      closeInfoPanel();
      return true;
    }

    if (isMenuOpen) {
      setIsMenuOpen(false);
      return true;
    }

    if (inputRef.current?.isFocused()) {
      Keyboard.dismiss();
      return true;
    }

    onBack();
    return true;
  }, [
    closeContextPanel,
    closeInfoPanel,
    isContextOpen,
    isInfoOpen,
    isMenuOpen,
    onBack,
    pendingDeleteThread,
    showLocalAccessAlert,
    showLogoutConfirmAlert,
    showModelSwitchAlert,
    showThreadLimitAlert,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleChatBack);
    return () => subscription.remove();
  }, [handleChatBack]);

  const liveAssistantId = useMemo(() => {
    if (!isGenerating) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i].id;
      }
    }
    return null;
  }, [isGenerating, messages]);
  const visibleThinkingLines = useMemo(
    () => thinkingTrace.slice(0, Math.min(visibleThinkingLineCount, thinkingTrace.length)),
    [thinkingTrace, visibleThinkingLineCount],
  );

  const activeGenerationLabel = responsePhase === 'setting_up' ? 'Setting up...' : 'Thinking...';

  const handleToggleThought = useCallback(() => {
    scrollToEnd(true, false);
  }, [scrollToEnd]);

  const renderMessage = useCallback(
    ({item}: {item: ChatMessage}) => (
      <MessageBubble
        item={item}
        isLive={item.id === liveAssistantId}
        isThinkingHiding={item.id === liveAssistantId && isThinkingFading}
        generationLabel={activeGenerationLabel}
        thinkingLines={item.id === liveAssistantId ? visibleThinkingLines : []}
        modelLogo={activeCatalogModel?.logo}
        onToggleThought={handleToggleThought}
        userBubbleColor={userBubbleColor}
      />
    ),
    [isThinkingFading, liveAssistantId, activeGenerationLabel, visibleThinkingLines, activeCatalogModel?.logo, handleToggleThought, userBubbleColor],
  );

  const shouldShowEmptyOnboarding =
    hasHydrated && messages.length === 0 && (threads.length === 0 || isFreshEmptyThread);
  const shouldShowChatSkeleton =
    !hasHydrated || (messages.length === 0 && !shouldShowEmptyOnboarding);
  const composerBottomInset = Math.max(insets.bottom, 12);
  const composerBottomPadding = Platform.OS === 'android'
    ? (keyboardHeight > 0 ? 8 : Math.max(insets.bottom, 10))
    : (keyboardHeight > 0 ? 0 : insets.bottom);

  const switchBg = performanceToggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#3A3A3C', '#B7FF25'],
  });

  const thumbTranslate = performanceToggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20],
  });

  const lockedSettingsOpacity = performanceToggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.45],
  });



  const infoBackgroundTranslateX = infoBackgroundSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -Math.min(windowWidth * 0.22, 88)],
    extrapolate: 'clamp',
  });

  const menuBackgroundTranslateX = menuBackgroundSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -Math.min(windowWidth * 0.16, 56)],
    extrapolate: 'clamp',
  });

  const menuBackgroundScale = menuBackgroundSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.94],
    extrapolate: 'clamp',
  });

  const menuBackgroundBorderRadius = menuBackgroundSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 18],
    extrapolate: 'clamp',
  });

  const combinedTranslateX = Animated.add(infoBackgroundTranslateX, menuBackgroundTranslateX);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View
        style={[
          styles.mainSurface,
          {
            borderRadius: menuBackgroundBorderRadius,
            transform: [
              {translateX: combinedTranslateX},
              {scale: menuBackgroundScale},
            ],
          },
          isEffortPopoverOpen && { zIndex: 9999, elevation: 9999 },
        ]}
        collapsable={false}
        renderToHardwareTextureAndroid={Platform.OS === 'android' && (isInfoTransitionActive || isContextTransitionActive || isMenuOpen)}
        shouldRasterizeIOS={Platform.OS === 'ios' && (isInfoTransitionActive || isContextTransitionActive || isMenuOpen)}>
        {isEffortPopoverOpen && (
          <Pressable
            style={styles.popoverFullOverlay}
            onPress={closeEffortPopover}
          />
        )}
      <View style={[styles.header, {paddingTop: Platform.OS === 'android' ? Math.max(insets.top - 6, 2) : insets.top}]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPressIn={dismissComposerKeyboard}
          onPress={openSideMenu}>
          <View style={styles.menuGlyph}>
            <ChevronLeft color="#F4F4F5" size={20} strokeWidth={2.5} style={{marginRight: 1}} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.modelButton}
          activeOpacity={1}
          onPress={dismissComposerKeyboard}>
          <View style={styles.modelMark}>
            {activeCatalogModel?.logo ? (
              <Image
                source={renderModelLogoSource(activeCatalogModel.logo)}
                style={styles.modelLogoImage}
                resizeMode="cover"
              />
            ) : (
              <Cpu color="#34C759" size={16} strokeWidth={2.2} />
            )}
          </View>
          <View style={styles.modelCopy}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Rivo
            </Text>
            <Text style={styles.modelSubline} numberOfLines={1}>
              {activeCatalogModel?.name || modelName}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
        {isModelLoading && <ActivityIndicator color="#FFFFFF" size="small" />}
        <TouchableOpacity
          style={styles.contextButton}
          activeOpacity={0.82}
          onPressIn={dismissComposerKeyboard}
          onPress={openContextPanel}>
          <Image source={contextSource} style={styles.contextIcon} resizeMode="contain" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.questionButton}
          activeOpacity={0.82}
          onPressIn={dismissComposerKeyboard}
          onPress={openInfoPanel}>
          <Image source={questionMarkSource} style={styles.questionIcon} resizeMode="contain" />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        style={styles.chatList}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        onContentSizeChange={handleChatContentSizeChange}
        onLayout={handleListLayoutSettled}
        onScrollBeginDrag={e => {
          isChatScrollInteractingRef.current = true;
          const {layoutMeasurement, contentOffset, contentSize} = e.nativeEvent;
          const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
          if (distanceFromBottom > 50) {
            userScrolledUpRef.current = true;
          }
          if (scrollFrameRef.current !== null) {
            cancelAnimationFrame(scrollFrameRef.current);
            scrollFrameRef.current = null;
          }
        }}
        onScrollEndDrag={handleChatScrollInteractionEnd}
        onMomentumScrollEnd={handleChatScrollInteractionEnd}
        onScroll={e => {
          const {layoutMeasurement, contentOffset, contentSize} = e.nativeEvent;
          isContentOverflowingRef.current = contentSize.height > layoutMeasurement.height + 20;
          const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
          const isAtBottom = distanceFromBottom <= AUTO_SCROLL_RESUME_THRESHOLD;
          isChatAtBottomRef.current = isAtBottom;
          if (isAtBottom) {
            userScrolledUpRef.current = false;
          } else if (isChatScrollInteractingRef.current && distanceFromBottom > 70) {
            userScrolledUpRef.current = true;
          }
        }}
        scrollEventThrottle={16}
        // Keeping every old row mounted makes large conversations progressively
        // harder for iOS to scroll. Let FlatList recycle rows outside its window.
        removeClippedSubviews
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        updateCellsBatchingPeriod={50}
        windowSize={21}
        contentContainerStyle={[
          styles.chatContent,
          {paddingTop: (Platform.OS === 'android' ? Math.max(insets.top - 6, 2) : insets.top) + 48},
          shouldShowChatSkeleton
            ? styles.skeletonChatContent
            : shouldShowEmptyOnboarding && styles.emptyChatContent,
        ]}
        ListEmptyComponent={
          shouldShowChatSkeleton ? (
            <ChatSkeleton />
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyLogoHost}>
                <Animated.View
                  style={[
                    styles.emptyLogoGlowRing,
                    {
                      transform: [{scale: emptyLogoGlowScale}],
                      opacity: emptyLogoGlowOpacity,
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.emptyLogoMark,
                    {
                      transform: [{scale: emptyLogoScale}],
                    },
                  ]}>
                  {activeCatalogModel?.logo ? (
                    <Image
                      source={renderModelLogoSource(activeCatalogModel.logo)}
                      style={styles.emptyModelLogo}
                      resizeMode="contain"
                    />
                  ) : (
                    <Image source={logoSource} style={styles.emptyLogo} resizeMode="contain" />
                  )}
                </Animated.View>
              </View>
              <View style={styles.promptStack}>
                <Text style={styles.emptyTitle}>What should we solve?</Text>
                <Text style={styles.emptySubtitle}>Local model, local memory, no cloud handoff.</Text>
              </View>
              <View style={styles.emptyAlertPanel}>
                <Text style={styles.emptyAlertText}>
                  This runs on your <Text style={styles.emptyAlertBuzz}>GPU</Text> and{' '}
                  <Text style={styles.emptyAlertBuzz}>RAM</Text>. If any{' '}
                  <Text style={styles.emptyAlertBuzz}>lag</Text> comes, do not worry.
                </Text>
                <Text style={styles.emptyAlertMeta}>
                  The first message may take longer, so please wait. Afterwards, it will reply fast according to your device.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.firstHiButton}
                onPress={sendFirstHi}>
                <Text style={styles.firstHiButtonText}>Send your first hi</Text>
                <ArrowUpRight color="#FFFFFF" size={19} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      <Animated.View
        ref={composerHostRef}
        style={[
          styles.composerHost,
          {
            marginBottom: Platform.OS === 'android' ? androidKeyboardOffsetAnim : 0,
            paddingBottom: composerBottomPadding,
            zIndex: isEffortPopoverOpen ? 10000 : 1,
            elevation: isEffortPopoverOpen ? 10000 : 1,
          },
        ]}>
        {hasCodingContentInThread ? (
          <View style={styles.lockedComposerContainer}>
            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.startNewThreadButton}
              onPress={newChat}>
              <Smartphone color="#000000" size={17} strokeWidth={2.3} />
              <Text style={styles.startNewThreadButtonText}>Start New Thread</Text>
              <ArrowUpRight color="#000000" size={18} strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={styles.lockedDisclaimerText}>
              Thread locked for code optimization & peak GPU speed.
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                lightHaptic();
                setIsCurrentThreadCodingLocked(false);
              }}
              style={{ marginTop: 6, paddingVertical: 2 }}>
              <Text style={[styles.lockedDisclaimerText, { color: '#0A84FF', textDecorationLine: 'underline' }]}>
                Unlock & continue in this thread
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View
              onStartShouldSetResponder={() => true}
              style={[styles.unifiedComposerCard, isPerformanceMode && styles.unifiedComposerCardFast, isEffortPopoverOpen && { zIndex: 10000, elevation: 10000 }]}>
              <TouchableOpacity
                activeOpacity={0.82}
                onPressIn={dismissComposerKeyboard}
                onPress={toggleEffortPopover}
                style={[styles.composerHeaderPanel, isPerformanceMode && styles.composerHeaderPanelFast]}>
                <View style={styles.composerHeaderLeft}>
                  <Sliders color={isPerformanceMode ? '#34C759' : '#98989E'} size={13} strokeWidth={2.2} />
                  <Text style={[styles.composerHeaderText, isPerformanceMode && styles.composerHeaderTextFast]}>
                    {`${modelName || 'Rivo'} • ${currentEffortLabel}`}
                  </Text>
                </View>
                {isEffortPopoverOpen ? (
                  <ChevronUp color={isPerformanceMode ? '#34C759' : '#8E8E93'} size={14} strokeWidth={2.2} />
                ) : (
                  <ChevronDown color={isPerformanceMode ? '#34C759' : '#8E8E93'} size={14} strokeWidth={2.2} />
                )}
              </TouchableOpacity>

              {isEffortPopoverOpen && (
                <Animated.View
                  onStartShouldSetResponder={() => true}
                  style={[
                    styles.inlineEffortPanel,
                    {
                      opacity: effortPopoverAnim,
                      transform: [
                        {
                          translateY: effortPopoverAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-6, 0],
                          }),
                        },
                      ],
                    },
                  ]}>
                  <View style={styles.popoverHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Sliders color="#0A84FF" size={14} strokeWidth={2.2} />
                      <Text style={styles.popoverTitle}>Reasoning Effort & Tokens</Text>
                    </View>
                    <Text style={styles.popoverSubtitle}>Rivo Engine</Text>
                  </View>

                  <View style={styles.popoverMenuGroup}>
                    {EFFORT_PRESETS.map(preset => {
                      const isSelected = !isPerformanceMode && maxTokens === preset.tokens;
                      return (
                        <TouchableOpacity
                          key={preset.label}
                          activeOpacity={0.78}
                          style={[
                            styles.popoverMenuItem,
                            isSelected && styles.popoverMenuItemSelected,
                          ]}
                          onPress={() => {
                            lightHaptic();
                            setMaxTokens(preset.tokens);
                            if (isPerformanceMode) {
                              setIsPerformanceMode(false);
                            }
                          }}>
                          <View style={styles.popoverMenuLeft}>
                            <View style={[styles.popoverIconBox, isSelected && { backgroundColor: `${preset.color}1E` }]}>
                              <preset.IconComponent
                                color={isSelected ? preset.color : '#8E8E93'}
                                size={14}
                                strokeWidth={2.2}
                              />
                            </View>
                            <View style={{flex: 1}}>
                              <Text
                                style={[
                                  styles.popoverMenuLabel,
                                  isSelected && styles.popoverMenuLabelSelected,
                                ]}>
                                {preset.label}
                              </Text>
                              <Text style={styles.popoverMenuDesc}>{preset.desc}</Text>
                            </View>
                          </View>
                          {isSelected && <Check color="#0A84FF" size={16} strokeWidth={2.8} style={{ marginRight: 2 }} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.popoverFooterRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.popoverFastRow}
                      onPress={() => {
                        lightHaptic();
                        setIsPerformanceMode(prev => !prev);
                      }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Zap color={isPerformanceMode ? '#34C759' : '#8E8E93'} size={15} strokeWidth={2.2} />
                        <View style={{flex: 1}}>
                          <Text style={styles.popoverFastTitle}>Fast Chat Mode</Text>
                          <Text style={styles.popoverFastDesc}>Faster generation with 1024 token limit</Text>
                        </View>
                      </View>
                      <View style={[styles.miniSwitch, isPerformanceMode && styles.miniSwitchActive]}>
                        <View style={[styles.miniSwitchThumb, isPerformanceMode && styles.miniSwitchThumbActive]} />
                      </View>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}

              {attachedImage && (
                <View style={styles.attachmentPreviewContainer}>
                  <Image source={{uri: attachedImage.uri}} style={styles.attachmentThumbnail} />
                  <View style={styles.attachmentTextGroup}>
                    <Text style={styles.attachmentTitle} numberOfLines={1}>
                      {attachedImage.fileName || 'Photo attachment'}
                    </Text>
                    {attachedImage.isScanning ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Loader size={16} trackColor="#89B4FA" />
                        <Text style={[styles.attachmentSubtitle, { color: '#89B4FA' }]}>
                          Scanning image...
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <Check color="#34C759" size={11} strokeWidth={2.8} />
                        <Text style={styles.attachmentSubtitle} numberOfLines={1}>
                          {formatFileSize(attachedImage.fileSize)} •
                        </Text>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={openVisionResultSheet}
                          style={styles.viewVisionLinkBtn}>
                          <Text style={styles.viewVisionLinkText}>View Vision Result</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.removeAttachmentBtn}
                    activeOpacity={0.78}
                    onPress={() => setAttachedImage(null)}>
                    <X color="#8E8E93" size={16} strokeWidth={2.4} />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.composerInnerRow}>
                <TouchableOpacity
                  style={styles.attachButton}
                  activeOpacity={0.7}
                  onPress={handleAttachPress}>
                  <Plus color="#FFFFFF" size={18} strokeWidth={2.4} />
                </TouchableOpacity>
                <TextInput
                  ref={inputRef}
                  value={input}
                  onChangeText={setInput}
                  placeholder="ask rivo agent"
                  placeholderTextColor="#B5B5B8"
                  style={[styles.input, {color: inputTextColor}]}
                  editable={!isMenuOpen && !isInfoOpen}
                  multiline
                  onFocus={() => {
                    if (isChatAtBottomRef.current) {
                      scrollToEnd(true);
                    }
                  }}
                  onPressIn={() => {
                    if (isChatAtBottomRef.current) {
                      scrollToEnd(true);
                    }
                  }}
                  onKeyPress={(e: any) => {
                    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                      if (!isGenerating && !attachedImage?.isScanning && input.trim()) {
                        e.preventDefault?.();
                        sendMessage();
                      }
                    }
                  }}
                  onSubmitEditing={() => {
                    if (!isGenerating && !attachedImage?.isScanning && input.trim()) {
                      sendMessage();
                    }
                  }}
                  submitBehavior="submit"
                  blurOnSubmit={false}
                  returnKeyType="send"
                  enterKeyHint="send"
                />
                <Animated.View style={{transform: [{scale: sendScale}]}}>
                  <TouchableOpacity
                    disabled={attachedImage?.isScanning}
                    style={[
                      styles.sendButton,
                      {backgroundColor: sendButtonColor},
                      attachedImage?.isScanning && { opacity: 0.38, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
                    ]}
                    onPress={isGenerating ? stopGeneration : () => sendMessage()}
                    activeOpacity={0.84}>
                    {isGenerating ? (
                      <Square color={getContrastColor(sendButtonColor)} size={12} fill={getContrastColor(sendButtonColor)} />
                    ) : (
                      <ArrowUp color={getContrastColor(sendButtonColor)} size={18} strokeWidth={2.8} />
                    )}
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </View>
            <Text style={styles.disclaimerText}>Local models can make mistakes. Check twice.</Text>
          </>
        )}
      </Animated.View>
      </Animated.View>

      <Animated.View
        pointerEvents={isMenuOpen ? 'auto' : 'none'}
        style={[styles.scrimContainer, {opacity: scrimOpacity}]}>
        <Pressable style={{flex: 1}} onPress={() => setIsMenuOpen(false)}>
          <View style={styles.scrim} />
        </Pressable>
      </Animated.View>
      <Animated.View
        style={[
          styles.sideMenu,
          {
            paddingTop: Platform.OS === 'android' ? Math.max(insets.top + 10, 24) : Math.max(insets.top + 10, 20),
            paddingBottom: Math.max(composerBottomInset + 14, 24),
            transform: [{translateX: menuX}],
          },
        ]}>
        <View style={styles.menuTop}>
          <View style={styles.menuBrand}>
            <View style={styles.menuBrandIcon}>
              <Image source={logoSource} style={styles.menuBrandLogo} resizeMode="contain" />
            </View>
            <Text style={styles.menuBrandText}>
              Rivo <Text style={styles.menuBrandTextYellow}>Agent</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeMenuButton}
            activeOpacity={0.78}
            onPress={() => setIsMenuOpen(false)}>
            <ChevronRight color="#F4F4F5" size={18} strokeWidth={2.5} style={{marginLeft: 1}} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.menuScrollView}
          contentContainerStyle={styles.menuScrollViewContent}
          showsVerticalScrollIndicator={false}
          bounces={true}>
          
          {/* Fresh Thread Action Button */}
          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.newChatButton}
            onPress={newChat}>
            <View style={styles.newChatIconBadge}>
              <Plus color="#FFFFFF" size={16} strokeWidth={2.8} />
            </View>
            <Text style={styles.newChatText}>Fresh thread</Text>
          </TouchableOpacity>

          {/* Custom Theme & Accent Panel */}
          <View style={styles.themeCustomizerCard}>
            <View style={styles.themeHeaderRow}>
              <View style={styles.themeHeaderTitleGroup}>
                <Palette color="#FFFFFF" size={15} strokeWidth={2.2} />
                <Text style={styles.themeTitleText}>Appearance & Colors</Text>
                <View style={styles.themeLivePreviewRow}>
                  <View style={[styles.themePreviewDot, {backgroundColor: userBubbleColor}]} />
                  <View style={[styles.themePreviewDot, {backgroundColor: sendButtonColor}]} />
                </View>
              </View>
              {(sendButtonColor !== '#FFFFFF' || userBubbleColor !== '#0AA550') && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.themeResetButton}
                  onPress={() => {
                    changeSendButtonColor('#FFFFFF');
                    changeUserBubbleColor('#0AA550');
                  }}>
                  <Text style={styles.themeResetText}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* User Message Bubble Color Selector */}
            <View style={styles.themeSection}>
              <Text style={styles.themeSubLabel}>USER MESSAGE BUBBLE</Text>
              <View style={styles.colorSwatchesRow}>
                {USER_BUBBLE_COLORS.map(color => {
                  const isSelected = userBubbleColor.toLowerCase() === color.hex.toLowerCase();
                  return (
                    <AnimatedColorSwatch
                      key={`bubble-${color.hex}`}
                      hex={color.hex}
                      isSelected={isSelected}
                      onPress={() => changeUserBubbleColor(color.hex)}
                    />
                  );
                })}
              </View>
            </View>

            {/* Send Button Color Selector */}
            <View style={styles.themeSection}>
              <Text style={styles.themeSubLabel}>SEND BUTTON ACCENT</Text>
              <View style={styles.colorSwatchesRow}>
                {SEND_BUTTON_COLORS.map(color => {
                  const isSelected = sendButtonColor.toLowerCase() === color.hex.toLowerCase();
                  return (
                    <AnimatedColorSwatch
                      key={`send-${color.hex}`}
                      hex={color.hex}
                      isSelected={isSelected}
                      onPress={() => changeSendButtonColor(color.hex)}
                    />
                  );
                })}
              </View>
            </View>
          </View>

          {/* History Header & List */}
          <View style={styles.historyHeaderRow}>
            <Text style={styles.recentsTitle}>Local history</Text>
            <View style={styles.recentsCountBadge}>
              <Text style={styles.recentsCountText}>
                <Text style={styles.recentsCountActiveNum}>{recentThreads.length}</Text>
                <Text style={styles.recentsCountMuted}> / {MAX_THREADS} threads</Text>
              </Text>
            </View>
          </View>
          
          <View style={styles.recentsList}>
            {recentThreads.length === 0 ? (
              <Text style={styles.emptyHistory}>Your chats save here automatically.</Text>
            ) : (
              recentThreads.map(thread => {
                const isActiveThread = thread.id === activeThreadId;

                return (
                  <View
                    key={thread.id}
                    style={[
                      styles.recentItem,
                      isActiveThread && styles.recentItemActive,
                    ]}>
                    <View style={styles.recentRow}>
                      <TouchableOpacity
                        activeOpacity={0.78}
                        style={styles.recentMain}
                        onPress={() => loadThread(thread)}>
                        <MessageCircle
                          color={isActiveThread ? '#FFFFFF' : '#8E8E93'}
                          size={17}
                          strokeWidth={2}
                          style={{marginRight: 10}}
                        />
                        <Text
                          style={[
                            styles.recentText,
                            isActiveThread && styles.recentTextActive,
                          ]}
                          numberOfLines={1}>
                          {thread.title}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.78}
                        style={styles.historyDots}
                        onPress={() => setPendingDeleteThread(thread)}>
                        <MoreHorizontal
                          color={isActiveThread ? '#E4E4E7' : '#71717A'}
                          size={18}
                          strokeWidth={2.4}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        {visionInstalledForMenu && (
          <TouchableOpacity
            style={styles.deleteVisionRow}
            activeOpacity={0.78}
            onPress={() => setShowDeleteVisionAlert(true)}>
            <View style={styles.deleteVisionIconWrap}>
              <Image
                source={require('../assets/models/qwen.png')}
                style={styles.profileModelLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.deleteVisionCopy}>
              <Text style={styles.deleteVisionText}>Delete Vision Model</Text>
              <Text style={styles.deleteVisionSubtext}>Remove from device storage</Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.profileRow}
          onPress={() => setShowLogoutConfirmAlert(true)}
          activeOpacity={0.78}>
          <View style={styles.profileIconWrap}>
            {activeCatalogModel?.logo ? (
              <Image
                source={renderModelLogoSource(activeCatalogModel.logo)}
                style={styles.profileModelLogo}
                resizeMode="contain"
              />
            ) : (
              <BrainCircuit color="#34C759" size={22} strokeWidth={2.2} />
            )}
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>{profileDisplayName}</Text>
            <View style={styles.profileStatusRow}>
              <Text style={styles.profilePlan}>100% Local Memory • No Cloud</Text>
            </View>
          </View>
          <View style={styles.logoutIconBox}>
            <LogOut color="#A1A1AA" size={17} strokeWidth={2.2} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {isContextOpen && (
        <Animated.View
          collapsable={false}
          renderToHardwareTextureAndroid={Platform.OS === 'android' && isContextTransitionActive}
          shouldRasterizeIOS={Platform.OS === 'ios' && isContextTransitionActive}
          style={[
            styles.contextPanel,
            {
              paddingTop: Platform.OS === 'android' ? Math.max(insets.top - 6, 2) : insets.top,
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{translateX: contextX}],
            },
          ]}>
          <View style={styles.contextHeader}>
            <TouchableOpacity
              style={styles.contextBackButton}
              activeOpacity={0.82}
              onPress={closeContextPanel}>
              <Image source={backSource} style={styles.contextBackIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.contextHeaderCopy}>
              <Text style={styles.contextTitle}>
                Neural <Text style={{color: '#B7FF25'}}>Panel</Text>
              </Text>
            </View>
          </View>
          
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.contextScroll} bounces={true} showsVerticalScrollIndicator={false}>

            {/* Device Card */}
            <View style={styles.contextSpecsCard}>
              <View style={styles.specsHeaderRow}>
                <Smartphone color="#8E8E93" size={14} strokeWidth={2.5} />
                <Text style={styles.specsCardTitle}>Your Device</Text>
              </View>
              <Text style={styles.specsDeviceModel}>{deviceSpecs.modelName}</Text>
              <View style={styles.specsBadgesRow}>
                <View style={styles.specsBadge}>
                  <Cpu color="#34C759" size={11} strokeWidth={2.5} style={{marginRight: 4}} />
                  <Text style={styles.specsBadgeText}>{deviceSpecs.ramLabel}</Text>
                </View>
                <View style={styles.specsBadge}>
                  <HardDrive color="#34C759" size={11} strokeWidth={2.5} style={{marginRight: 4}} />
                  <Text style={styles.specsBadgeText}>Local Engine</Text>
                </View>
              </View>
            </View>

            {/* AI Character */}
            <View style={styles.contextSection}>
              <Text style={styles.contextSectionTitle}>AI Assistant</Text>
              <Text style={styles.contextSectionDesc}>Personalise the name and vibe of your AI.</Text>

              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={localAiName}
                onChangeText={setLocalAiName}
                placeholder="Rivo"
                placeholderTextColor="#636366"
              />

              <Text style={styles.inputLabel}>Personality</Text>
              <TextInput
                style={styles.textInput}
                value={localAiPersonality}
                onChangeText={setLocalAiPersonality}
                placeholder="helpful, intelligent, friendly"
                placeholderTextColor="#636366"
              />

              <Text style={styles.inputLabel}>Emoji usage</Text>
              <View style={styles.segmentedControlRow}>
                {(['none', 'low', 'medium', 'high'] as const).map(qty => {
                  const isSelected = localAiEmojiQuantity === qty;
                  return (
                    <TouchableOpacity
                      key={qty}
                      activeOpacity={0.82}
                      style={[styles.segmentMiniBtn, isSelected && styles.segmentMiniBtnActive]}
                      onPress={() => {
                        setLocalAiEmojiQuantity(qty);
                        lightHaptic();
                      }}>
                      <Text style={[styles.segmentMiniText, isSelected && styles.segmentMiniTextActive]}>
                        {qty === 'medium' ? 'MED' : qty.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* User Profile */}
            <View style={styles.contextSection}>
              <Text style={styles.contextSectionTitle}>About You</Text>
              <Text style={styles.contextSectionDesc}>Help the AI remember who you are.</Text>

              <Text style={styles.inputLabel}>Your name</Text>
              <TextInput
                style={styles.textInput}
                value={localName}
                onChangeText={setLocalName}
                placeholder="Guest"
                placeholderTextColor="#636366"
              />

              <Text style={styles.inputLabel}>Facts to remember (one per line)</Text>
              <TextInput
                style={[styles.textInput, styles.multilineInput]}
                value={localMemoryBullets}
                onChangeText={setLocalMemoryBullets}
                placeholder={'Likes coffee\nDislikes ads'}
                placeholderTextColor="#636366"
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Performance */}
            <View style={styles.contextSection}>
              <Text style={styles.contextSectionTitle}>Speed & Memory</Text>
              <Text style={styles.contextSectionDesc}>Tune how the AI uses your device memory.</Text>

              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.toggleRow, isPerformanceMode && styles.toggleRowActive]}
                onPress={() => {
                  setIsPerformanceMode(!isPerformanceMode);
                  lightHaptic();
                }}>
                <View style={{flex: 1}}>
                  <Text style={styles.toggleLabel}>Fast Mode</Text>
                  <Text style={styles.toggleDesc}>
                    Shorter memory, faster replies. Great for low-RAM devices.
                  </Text>
                </View>
                <Animated.View style={[styles.toggleSwitch, { backgroundColor: switchBg }]}>
                  <Animated.View style={[
                    styles.toggleThumb,
                    { transform: [{ translateX: thumbTranslate }] },
                    isPerformanceMode && { backgroundColor: '#000000' }
                  ]} />
                </Animated.View>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 }}>
                <Text style={[styles.inputLabel, { marginVertical: 0 }]}>Max reply tokens</Text>
                {isPerformanceMode && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Lock color="#B7FF25" size={10} strokeWidth={2.5} />
                    <Text style={{ color: '#B7FF25', fontSize: 9, fontFamily: 'SF-Pro-Rounded-Bold', letterSpacing: 0.5 }}>LOCKED</Text>
                  </View>
                )}
              </View>
              <Animated.View
                style={{ opacity: lockedSettingsOpacity }}
                pointerEvents={isPerformanceMode ? 'none' : 'auto'}>
                <View style={styles.segmentedControl}>
                  {[256, 512, 1024, 2048].map(tokens => {
                    const isSelected = isPerformanceMode ? tokens === 1024 : maxTokens === tokens;
                    const isRecommended =
                      !isPerformanceMode && (
                        (deviceSpecs.ramGB >= 8 && tokens === 1024) ||
                        (deviceSpecs.ramGB < 8 && deviceSpecs.ramGB >= 4 && tokens === 512) ||
                        (deviceSpecs.ramGB < 4 && tokens === 256)
                      );
                    return (
                      <TouchableOpacity
                        key={tokens}
                        activeOpacity={0.82}
                        style={[styles.segmentBtn, isSelected && styles.segmentBtnActive]}
                        onPress={() => {
                          setMaxTokens(tokens);
                          lightHaptic();
                        }}>
                        <Text style={[styles.segmentText, isSelected && styles.segmentTextActive]}>
                          {tokens === 1024 && isPerformanceMode
                            ? '1024 Tokens (locked)'
                            : tokens === 256
                            ? '256 Tokens — Light'
                            : tokens === 512
                            ? '512 Tokens — Medium'
                            : tokens === 1024
                            ? '1024 Tokens — High'
                            : '2048 Tokens — Ultra'}
                        </Text>
                        {isRecommended && (
                          <View style={[styles.recBadge, isSelected && styles.recBadgeActive]}>
                            <Text style={[styles.recBadgeText, isSelected && styles.recBadgeTextActive]}>BEST FOR YOU</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Animated.View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 }}>
                <Text style={[styles.inputLabel, { marginVertical: 0 }]}>Chat history to keep</Text>
                {isPerformanceMode && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Lock color="#B7FF25" size={10} strokeWidth={2.5} />
                    <Text style={{ color: '#B7FF25', fontSize: 9, fontFamily: 'SF-Pro-Rounded-Bold', letterSpacing: 0.5 }}>LOCKED</Text>
                  </View>
                )}
              </View>
              <Animated.View
                style={{ opacity: lockedSettingsOpacity }}
                pointerEvents={isPerformanceMode ? 'none' : 'auto'}>
                <View style={styles.segmentedControl}>
                  {[4, 8, 16, 24].map(size => {
                    const isSelected = isPerformanceMode ? size === 4 : keepMessages === size;
                    const isRecommended =
                      !isPerformanceMode && (
                        (deviceSpecs.ramGB >= 8 && size === 16) ||
                        (deviceSpecs.ramGB < 8 && deviceSpecs.ramGB >= 4 && size === 8) ||
                        (deviceSpecs.ramGB < 4 && size === 4)
                      );
                    return (
                      <TouchableOpacity
                        key={size}
                        activeOpacity={0.82}
                        style={[styles.segmentBtn, isSelected && styles.segmentBtnActive]}
                        onPress={() => {
                          setKeepMessages(size);
                          lightHaptic();
                        }}>
                        <Text style={[styles.segmentText, isSelected && styles.segmentTextActive]}>
                          {size === 4 && isPerformanceMode
                            ? '3 messages (locked)'
                            : size === 4
                            ? '4 messages'
                            : size === 8
                            ? '8 messages'
                            : size === 16
                            ? '16 messages'
                            : '24 messages'}
                        </Text>
                        {isRecommended && (
                          <View style={[styles.recBadge, isSelected && styles.recBadgeActive]}>
                            <Text style={[styles.recBadgeText, isSelected && styles.recBadgeTextActive]}>BEST FOR YOU</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Animated.View>
            </View>

            {/* Context Status */}
            <View style={styles.contextSection}>
              <Text style={styles.contextSectionTitle}>Current Usage</Text>
              <Text style={styles.contextSectionDesc}>How much memory the chat is using right now.</Text>
              <View style={styles.cacheStats}>
                <Animated.View style={{ transform: [{ scale: contextPulseAnim }] }}>
                  <Text style={styles.cacheStatText}>
                    Messages in context: <Text style={{color: '#FFFFFF'}}>{messages.length} / {isPerformanceMode ? 3 : keepMessages}</Text>
                  </Text>
                </Animated.View>
                <Text style={styles.cacheStatText}>
                  Summarised history: <Text style={{color: '#FFFFFF'}}>{compactedCount} messages</Text>
                </Text>
              </View>
            </View>
          </ScrollView>

        </Animated.View>
      )}
      {isInfoOpen && (
        <Animated.View
          collapsable={false}
          renderToHardwareTextureAndroid={Platform.OS === 'android' && isInfoTransitionActive}
          shouldRasterizeIOS={Platform.OS === 'ios' && isInfoTransitionActive}
          style={[
            styles.infoPanel,
            {
              paddingTop: Platform.OS === 'android' ? Math.max(insets.top - 6, 2) : insets.top,
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{translateX: infoX}],
            },
          ]}>
          <View style={styles.infoHeader}>
            <TouchableOpacity
              style={styles.infoBackButton}
              activeOpacity={0.82}
              onPress={closeInfoPanel}>
              <Image source={backSource} style={styles.infoBackIcon} resizeMode="contain" />
            </TouchableOpacity>
              <Text style={styles.infoTitle}>
                Local <Text style={{color: '#D4FF00'}}>AI details</Text>
              </Text>
          </View>

          <ScrollView
            style={styles.infoScroll}
            contentContainerStyle={styles.infoContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.infoHero}>
              <Image source={logoSource} style={styles.infoLogo} resizeMode="contain" />
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
                onPress={() => openInfoLink(DEVELOPER_GITHUB_URL)}>
                <View style={styles.infoLineIconWrap}>
                  <GithubIcon color={INFO_ACCENT_BLUE} size={15} />
                  <Text style={styles.infoLineLabel}>GitHub</Text>
                </View>
                <Text style={styles.infoLineValue}>github.com/sanketpadhyal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.infoLine}
                activeOpacity={0.76}
                onPress={() => openInfoLink('https://www.sanketpadhyal.in')}>
                <View style={styles.infoLineIconWrap}>
                  <Globe color={INFO_ACCENT_BLUE} size={15} strokeWidth={2.4} />
                  <Text style={styles.infoLineLabel}>Website</Text>
                </View>
                <Text style={styles.infoLineValue}>www.sanketpadhyal.in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.infoLine}
                activeOpacity={0.76}
                onPress={() => openInfoLink(PROJECT_REPO_URL)}>
                <View style={styles.infoLineIconWrap}>
                  <Folder color={INFO_ACCENT_BLUE} size={15} strokeWidth={2.4} />
                  <Text style={styles.infoLineLabel}>Project repo</Text>
                </View>
                <Text style={styles.infoLineValue}>sanketpadhyal/Rivo-Agent</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.infoLine}
                activeOpacity={0.76}
                onPress={() => openInfoLink(`mailto:${SUPPORT_EMAIL}`)}>
                <View style={styles.infoLineIconWrap}>
                  <Mail color={INFO_ACCENT_BLUE} size={15} strokeWidth={2.4} />
                  <Text style={styles.infoLineLabel}>Support</Text>
                </View>
                <Text style={styles.infoLineValue}>{SUPPORT_EMAIL}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Source Status</Text>
              <Text style={styles.infoBody}>
                This project is{' '}
                <Text style={styles.infoHighlight}>open source</Text>. The{' '}
                <Text style={styles.infoHighlight}>GitHub repository</Text> is{' '}
                <Text style={styles.infoHighlight}>public</Text> and maintained by the developer.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Hugging Face & Local Execution</Text>
              <Text style={styles.infoBody}>
                <Text style={styles.infoHighlight}>Rivo</Text> imports state-of-the-art{' '}
                <Text style={styles.infoHighlight}>AI models</Text> directly from{' '}
                <Text style={styles.infoHighlight}>Hugging Face</Text> using the optimized{' '}
                <Text style={styles.infoHighlight}>GGUF</Text> format. Once imported, models are
                executed entirely <Text style={styles.infoHighlight}>offline</Text> on your device
                using our custom inference engine, ensuring maximum{' '}
                <Text style={styles.infoHighlight}>privacy</Text> and{' '}
                <Text style={styles.infoHighlight}>zero latency</Text>.
                {'\n\n'}
                <Text style={styles.infoHighlight}>Hugging Face</Text> is a trademark of Hugging
                Face, Inc. All imported models remain the property of their original creators and
                are subject to their respective copyright and licensing terms.
              </Text>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.infoSectionTitle}>Current Model Details</Text>
              <Text style={styles.infoBody}>
                You are currently running <Text style={styles.infoHighlight}>{modelName}</Text>. This model executes locally on your device's neural engine, providing fully offline, instantaneous responses without transmitting any data over the internet.
              </Text>
            </View>
          </ScrollView>
        </Animated.View>
      )}
      <ProfessionalAlert
        visible={showInstallVisionAlert}
        title="No vision model installed"
        message={`${QWEN_VISION_MODEL.name} is required to analyze images (${formatVisionModelSize(
          QWEN_VISION_MODEL.byteSize + QWEN_VISION_MODEL.mmprojByteSize,
        )}). Install it now?`}
        cancelLabel="No"
        confirmLabel="Yes, install"
        iconName="eye"
        onClose={() => setShowInstallVisionAlert(false)}
        onConfirm={handleConfirmInstallVision}
      />
      <ProfessionalAlert
        visible={showDeleteVisionAlert}
        title="Delete Vision Model?"
        message="This will remove the vision model from your device. You can re-install it later."
        cancelLabel="Cancel"
        confirmLabel="Delete"
        isDestructive
        iconName="trash-2"
        onClose={() => setShowDeleteVisionAlert(false)}
        onConfirm={handleDeleteVisionModel}
      />
      <ProfessionalAlert
        visible={showModelSwitchAlert}
        title="Model locked"
        message="You can't switch models from here."
        actionLabel="Got it"
        iconName="cpu"
        onClose={() => setShowModelSwitchAlert(false)}
      />
      <ProfessionalAlert
        visible={showThreadLimitAlert}
        title="Thread limit"
        message="You can only create 7 threads. Delete an old thread to start a new one."
        actionLabel="Got it"
        onClose={() => setShowThreadLimitAlert(false)}
      />
      <ProfessionalAlert
        visible={showLocalAccessAlert}
        title="Local mode"
        message="You can't access this because Rivo is running locally on this device."
        actionLabel="Got it"
        iconName="hard-drive"
        onClose={() => setShowLocalAccessAlert(false)}
      />
      <ProfessionalAlert
        visible={showLogoutConfirmAlert}
        title="Confirm Log Out"
        message="Are you sure you want to log out? This will cause your account to get deleted and all data to be erased from local caches. You will also need to download new models again."
        boldSuffix="This will not delete your vision model."
        cancelLabel="No"
        confirmLabel="Yes"
        isDestructive
        iconName="power"
        onClose={() => setShowLogoutConfirmAlert(false)}
        onConfirm={confirmLogoutAndWipe}
      />
      <ProfessionalAlert
        visible={Boolean(pendingDeleteThread)}
        title="Delete this chat?"
        message={`"${pendingDeleteThread?.title ?? 'This chat'}" will be removed from local history. This cannot be undone.`}
        cancelLabel="Cancel"
        confirmLabel="Delete"
        isDestructive
        iconName="trash-2"
        onClose={() => setPendingDeleteThread(null)}
        onConfirm={confirmDeleteThread}
      />

      {/* Vision Result Full Smooth Bottom Sheet Panel */}
      {isVisionResultSheetOpen && (
        <Animated.View style={[styles.visionSheetOverlay, { opacity: visionSheetAnim }]}>
          <Pressable style={{ flex: 1 }} onPress={closeVisionResultSheet} />
          <Animated.View
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
            style={[
              styles.visionSheetCard,
              {
                transform: [
                  {
                    translateY: visionSheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [450, 0],
                    }),
                  },
                ],
              },
            ]}>
            <View style={styles.visionSheetHandleBar} />
            <View style={styles.visionSheetHeader}>
              <View style={styles.visionSheetTitleGroup}>
                <Eye color="#89B4FA" size={18} strokeWidth={2.2} />
                <View>
                  <Text style={styles.visionSheetTitle}>Vision Model Extraction</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.visionSheetCloseBtn}
                activeOpacity={0.8}
                onPress={closeVisionResultSheet}>
                <X color="#8E8E93" size={16} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.visionSheetScroll}
              contentContainerStyle={styles.visionSheetScrollContent}
              showsVerticalScrollIndicator={false}>
              <Text style={styles.visionSheetBodyText}>
                {attachedImage?.visionSummary || 'No visual data extracted.'}
              </Text>
            </ScrollView>

            <View style={styles.visionSheetFooter}>
              {attachedImage?.visionSummary?.includes('[VISION SYSTEM NOTICE]') ? (
                <TouchableOpacity
                  activeOpacity={0.82}
                  style={[styles.copyVisionResultBtn, { backgroundColor: '#34C759' }]}
                  onPress={() => {
                    closeVisionResultSheet();
                    handleConfirmInstallVision();
                  }}>
                  <Eye color="#FFFFFF" size={16} strokeWidth={2.5} />
                  <Text style={styles.copyVisionResultText}>Install Qwen2-VL Vision Model</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.82}
                  style={[
                    styles.copyVisionResultBtn,
                    copiedVisionToast && {backgroundColor: '#34C759'},
                  ]}
                  onPress={() => {
                    lightHaptic();
                    setClipboardText(attachedImage?.visionSummary || '');
                    setCopiedVisionToast(true);
                    setTimeout(() => setCopiedVisionToast(false), 2000);
                  }}>
                  {copiedVisionToast ? (
                    <Check color="#FFFFFF" size={15} strokeWidth={2.5} />
                  ) : (
                    <Copy color="#FFFFFF" size={15} strokeWidth={2.5} />
                  )}
                  <Text style={styles.copyVisionResultText}>
                    {copiedVisionToast ? 'Copied!' : 'Copy Full Observation'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  mainSurface: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(4, 4, 6, 0.94)',
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    width: 16,
    height: 16,
  },
  menuGlyph: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: '#28282C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFFFFF',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  menuGlyphLine: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F4F4F5',
    marginVertical: 2,
  },
  menuGlyphLineTop: {
    width: 14,
    alignSelf: 'flex-start',
    marginLeft: 9,
  },
  menuGlyphLineMid: {
    width: 18,
  },
  menuGlyphLineBottom: {
    width: 11,
    alignSelf: 'flex-end',
    marginRight: 9,
    backgroundColor: '#34C759',
  },
  modelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    maxWidth: '74%',
  },
  modelMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#141518',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  modelLogoImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  modelCopy: {
    maxWidth: 190,
    marginRight: 6,
    marginBottom: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 25,
  },
  modelSubline: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    marginTop: 1,
  },
  headerSpacer: {
    flex: 1,
  },
  contextButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  contextIcon: {
    width: 28,
    height: 28,
  },
  questionButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  questionIcon: {
    width: 33,
    height: 33,
  },
  infoPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    backgroundColor: '#060608',
    shadowColor: '#000000',
    shadowOffset: {width: -8, height: 0},
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 30,
  },
  infoHeader: {
    minHeight: 48,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
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
    color: '#0A84FF',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 26,
    marginTop: 1,
  },
  infoScroll: {
    flex: 1,
  },
  infoContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },
  infoHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111114',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 16,
    marginBottom: 2,
  },
  infoLogo: {
    width: 52,
    height: 52,
    marginRight: 14,
    borderRadius: 14,
  },
  infoHeroCopy: {
    flex: 1,
  },
  infoHeroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 26,
  },
  infoHeroText: {
    color: '#8E8E93',
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 19,
    marginTop: 4,
  },
  infoSection: {
    backgroundColor: '#111114',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoSectionTitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  infoLineIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  infoLineLabel: {
    color: '#8E8E93',
    fontSize: 14,
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
  infoBody: {
    color: '#A1A1AA',
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  infoHighlight: {
    color: INFO_KEYWORD_GREEN,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  chatList: {
    flex: 1,
    width: '100%',
  },
  chatContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 24,
  },
  skeletonChatContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  skeletonHost: {
    width: '100%',
    paddingBottom: 12,
  },
  skeletonAssistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 10,
  },
  skeletonUserRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 10,
  },
  skeletonGlyph: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#202020',
    marginRight: 10,
    marginTop: 3,
  },
  skeletonAssistantBubble: {
    width: '68%',
    paddingTop: 3,
  },
  skeletonUserBubble: {
    width: '46%',
    height: 42,
    borderRadius: 21,
    backgroundColor: '#202023',
  },
  skeletonLine: {
    height: 13,
    borderRadius: 7,
    backgroundColor: '#1D1D20',
    marginBottom: 10,
  },
  skeletonLineLong: {
    width: '100%',
  },
  skeletonLineMedium: {
    width: '72%',
  },
  skeletonLineShort: {
    width: '48%',
  },
  emptyChatContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  emptyState: {
    width: '100%',
    paddingBottom: 10,
  },
  emptyLogoHost: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
    marginBottom: 16,
  },
  emptyLogoGlowRing: {
    position: 'absolute',
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  emptyLogoMark: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0B0B0B',
    borderWidth: 1,
    borderColor: '#26262A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emptyLogo: {
    width: 41,
    height: 38,
  },
  emptyModelLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  promptStack: {
    marginLeft: 20,
    marginBottom: 18,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  emptySubtitle: {
    color: '#8E8E93',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    marginTop: 7,
  },
  emptyAlertPanel: {
    marginLeft: 20,
    marginRight: 20,
    borderLeftWidth: 2,
    borderLeftColor: '#0AA550',
    paddingLeft: 14,
    paddingVertical: 2,
    marginTop: 16,
    marginBottom: 20,
  },
  emptyAlertText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 25,
  },
  emptyAlertBuzz: {
    color: '#B7FF2A',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  emptyAlertMeta: {
    color: '#8E8E93',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 20,
    marginTop: 9,
  },
  firstHiButton: {
    height: 48,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0AA550',
    borderRadius: 24,
    paddingHorizontal: 20,
    marginLeft: 20,
    marginTop: 4,
  },
  firstHiButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginRight: 8,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 9,
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  agentGlyphSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0B0B',
    borderWidth: 1,
    borderColor: '#202020',
    marginRight: 10,
    marginTop: 2,
    overflow: 'hidden',
  },
  agentLogoSmall: {
    width: 22,
    height: 21,
  },
  modelLogoSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  messageStack: {
    maxWidth: '86%',
    alignItems: 'flex-start',
  },
  userMessageStack: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '100%',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: '#0AA550',
    borderTopRightRadius: 10,
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Regular',
    lineHeight: 23,
  },
  assistantTextSegment: {
    marginBottom: 8,
  },
  messageTextWrap: {
    overflow: 'hidden',
  },
  liveMessageTextWrap: {
    marginTop: 10,
  },
  codeBlock: {
    minWidth: 260,
    maxWidth: '100%',
    backgroundColor: '#090A0E',
    borderWidth: 1,
    borderColor: '#242730',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 8,
  },
  codeBlockHeader: {
    minHeight: 38,
    backgroundColor: '#13151A',
    borderBottomWidth: 1,
    borderBottomColor: '#242730',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 8,
  },
  codeHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeLanguage: {
    color: '#34C759',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  codeCopyButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeCopyText: {
    color: '#8E8E93',
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  codeScroll: {
    maxWidth: '100%',
    maxHeight: 360,
  },
  codeEditorSurface: {
    paddingVertical: 10,
    paddingRight: 16,
  },
  codeLineRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  codeLineNumber: {
    width: 36,
    color: '#4A4E58',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
    paddingLeft: 8,
    paddingRight: 8,
    textAlign: 'right',
  },
  codeText: {
    color: '#F4F4F5',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: '#1E2128',
  },
  formattedTextContainer: {
    width: '100%',
  },
  paragraphText: {
    marginBottom: 4,
  },
  paragraphSpacer: {
    height: 6,
  },
  markdownH1: {
    marginTop: 10,
    marginBottom: 6,
  },
  markdownH1Text: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 24,
  },
  markdownH2: {
    marginTop: 8,
    marginBottom: 4,
  },
  markdownH2Text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 22,
  },
  markdownH3: {
    marginTop: 6,
    marginBottom: 4,
  },
  markdownH3Text: {
    color: '#E4E4E7',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 20,
  },
  blockquoteContainer: {
    borderLeftWidth: 3,
    borderLeftColor: '#34C759',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 4,
  },
  blockquoteText: {
    color: '#D4D4D8',
    fontStyle: 'italic',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    paddingLeft: 2,
  },
  listNumber: {
    color: '#34C759',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginRight: 6,
    lineHeight: 22,
  },
  listContent: {
    flex: 1,
    color: '#E4E4E7',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Regular',
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    paddingLeft: 2,
  },
  bulletDot: {
    color: '#34C759',
    fontSize: 14,
    marginRight: 8,
    lineHeight: 22,
  },
  bulletContent: {
    flex: 1,
    color: '#E4E4E7',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Regular',
    lineHeight: 22,
  },
  inlineCodePill: {
    color: '#34C759',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  messageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  userMessageActions: {
    alignSelf: 'flex-end',
  },
  assistantActionsContainer: {
    alignItems: 'flex-start',
    width: '100%',
  },
  thoughtTimeText: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    marginTop: 6,
    marginBottom: 2,
  },
  truncatedNoticeText: {
    color: '#FF9500',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    marginTop: 4,
    paddingHorizontal: 8,
    lineHeight: 15,
    opacity: 0.9,
  },
  messageActionButton: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  reportActionButton: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 4,
    marginTop: 2,
  },
  reportActionText: {
    color: '#8E8E93',
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Medium',
  },
  copyIconStage: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyIconLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thinkingTextWrap: {
    width: '100%',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    paddingVertical: 2,
  },
  thoughtAccordionContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  thoughtAccordionCollapsed: {
    alignSelf: 'flex-start',
    width: undefined,
  },
  thoughtAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  thoughtAccordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thoughtAccordionLabel: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    letterSpacing: 0.2,
  },
  thoughtAccordionHeaderRight: {
    padding: 2,
  },
  thoughtAccordionBody: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  thoughtAccordionScroll: {
    maxHeight: 145,
  },
  thoughtAccordionScrollContent: {
    paddingBottom: 2,
  },
  thoughtAccordionText: {
    color: '#A1A1A6',
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  visionCapsuleContainer: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 132, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(10, 132, 255, 0.25)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
    gap: 6,
  },
  visionCapsuleScanning: {
    backgroundColor: 'rgba(52, 199, 89, 0.08)',
    borderColor: 'rgba(52, 199, 89, 0.25)',
  },
  visionCapsuleText: {
    color: '#0A84FF',
    fontSize: 12.5,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    letterSpacing: 0.1,
  },
  thinkingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  thinkingText: {
    color: '#F4F4F5',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 23,
  },
  thinkingTrace: {
    gap: 7,
  },
  thinkingTraceLine: {
    color: '#6F6F76',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 20,
  },
  thinkingTraceLineActive: {
    color: '#AFAFB6',
  },
  interruptedText: {
    color: '#FF453A',
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 18,
    marginTop: 6,
  },
  compactDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
    paddingHorizontal: 12,
  },
  compactDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  compactDividerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(191, 90, 242, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(191, 90, 242, 0.35)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginHorizontal: 10,
  },
  compactDividerText: {
    color: '#BF5AF2',
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    letterSpacing: 0.2,
  },
  composerHost: {
    paddingHorizontal: 16,
    paddingTop: 2,
    backgroundColor: '#000000',
  },
  lockedComposerContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  startNewThreadButton: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 4,
  },
  startNewThreadButtonText: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  lockedDisclaimerText: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    textAlign: 'center',
    marginTop: 8,
  },
  composer: {
    minHeight: 48,
    maxHeight: 128,
    borderRadius: 24,
    backgroundColor: '#202023',
    borderWidth: 1,
    borderColor: '#2E2E31',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 5,
    paddingVertical: 5,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 96,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Regular',
    includeFontPadding: false,
    paddingHorizontal: 0,
    paddingTop: 6,
    paddingBottom: 6,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimerText: {
    color: '#7C7C84',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  scrimContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 15,
  },
  sideMenu: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: '#0A0A0C',
    paddingHorizontal: 16,
    zIndex: 20,
  },
  menuScrollView: {
    width: '100%',
  },
  menuScrollViewContent: {
    paddingBottom: 20,
  },
  closeMenuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: '#28282C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFFFFF',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  newChatButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  newChatIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0AA550',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginLeft: 10,
  },
  newChatTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.25)',
  },
  newChatTagText: {
    color: '#34C759',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  themeCustomizerCard: {
    backgroundColor: '#141416',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#242428',
  },
  themeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  themeHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  themePaletteIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeLivePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  themePreviewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  themeTitleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 0.2,
  },
  themeResetButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
  },
  themeResetText: {
    color: '#34C759',
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  themeSection: {
    marginTop: 10,
  },
  themeSubLabel: {
    color: '#71717A',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  colorSwatchesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flexWrap: 'wrap',
  },
  colorSwatchCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  colorSwatchSelected: {
    borderWidth: 2.5,
    shadowColor: '#FFFFFF',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  menuTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 16,
  },
  menuBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBrandIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0B0B0B',
    borderWidth: 1,
    borderColor: '#202020',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  menuBrandLogo: {
    width: 24,
    height: 22,
  },
  menuBrandText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  menuBrandTextYellow: {
    color: '#D4FF00',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  recentsTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  recentsCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141416',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#28282C',
    gap: 6,
  },
  recentsCountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  recentsCountText: {
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Medium',
  },
  recentsCountActiveNum: {
    color: '#FFFFFF',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  recentsCountMuted: {
    color: '#71717A',
    fontFamily: 'SF-Pro-Rounded-Medium',
  },
  recentsList: {
    flex: 1,
  },
  emptyHistory: {
    color: '#71717A',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Medium',
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  recentItem: {
    marginBottom: 4,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  recentItemActive: {
    backgroundColor: '#1A1A1E',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recentRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentMain: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 8,
  },
  recentText: {
    flex: 1,
    color: '#A1A1AA',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Regular',
  },
  recentTextActive: {
    color: '#FFFFFF',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  historyDots: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteVisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242428',
    backgroundColor: '#141416',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  deleteVisionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  deleteVisionCopy: {
    flex: 1,
    justifyContent: 'center',
  },
  deleteVisionText: {
    color: '#FF453A',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  deleteVisionSubtext: {
    color: '#71717A',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Medium',
    marginTop: 1,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#242428',
    backgroundColor: '#141416',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  profileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  profileCopy: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  profileStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  profileStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
    marginRight: 5,
  },
  profilePlan: {
    color: '#71717A',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Medium',
  },
  logoutIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileModelLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  profileTag: {
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2F',
    backgroundColor: '#15161A',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTagText: {
    color: '#C6C6CC',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 0.5,
  },
  contextPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    backgroundColor: '#060608',
    shadowColor: '#000000',
    shadowOffset: {width: -8, height: 0},
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 30,
  },
  contextHeader: {
    minHeight: 48,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  contextBackButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contextBackIcon: {
    width: 28,
    height: 28,
    tintColor: '#FFFFFF',
  },
  contextHeaderCopy: {
    flex: 1,
  },
  contextEyebrow: {
    color: '#34C759',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  contextTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'SF-Pro-Rounded-Bold',
    lineHeight: 26,
    marginTop: 1,
  },
  contextScroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 28 : 24,
    gap: 12,
  },
  contextSpecsCard: {
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18,
    padding: 16,
  },
  specsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  specsCardTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  specsDeviceModel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginBottom: 10,
  },
  specsBadgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  specsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  specsBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  contextSection: {
    backgroundColor: '#111114',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  contextSectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginBottom: 2,
  },
  contextSectionDesc: {
    color: '#8E8E93',
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 17,
    marginBottom: 12,
  },
  inputLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginBottom: 6,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#FFFFFF',
    fontFamily: 'SF-Pro-Rounded-Semibold',
    marginBottom: 14,
  },
  multilineInput: {
    height: 72,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  segmentedControlRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    padding: 3,
    height: 44,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segmentMiniBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segmentMiniBtnActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  segmentMiniText: {
    color: '#8E8E93',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Bold',
    letterSpacing: 0.5,
  },
  segmentMiniTextActive: {
    color: '#000000',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    gap: 12,
  },
  toggleRowActive: {
    borderColor: '#FFFFFF',
  },
  toggleLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginBottom: 3,
  },
  toggleDesc: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 15,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3A3A3C',
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: '#FFFFFF',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbActive: {
    transform: [{translateX: 20}],
    backgroundColor: '#000000',
  },
  segmentedControl: {
    flexDirection: 'column',
    gap: 8,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  segmentText: {
    color: '#A1A1AA',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  segmentTextActive: {
    color: '#000000',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  recBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recBadgeText: {
    color: '#000000',
    fontSize: 9,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  recBadgeActive: {
    backgroundColor: '#000000',
  },
  recBadgeTextActive: {
    color: '#FFFFFF',
  },
  cacheStats: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cacheStatText: {
    color: '#8E8E93',
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    marginVertical: 2,
  },
  quickBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
    zIndex: 10,
  },
  quickBarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickBarChipText: {
    color: '#D1D1D6',
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    letterSpacing: 0.1,
  },
  quickBarFastToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  quickBarFastToggleActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  quickBarFastToggleText: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  quickBarFastToggleTextActive: {
    color: '#000000',
  },
  popoverFullOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 100,
  },
  popoverFullBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  effortPopoverCard: {
    position: 'absolute',
    bottom: 82,
    left: 12,
    right: 12,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: 10,
    zIndex: 999,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  popoverHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  popoverTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  popoverSubtitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    letterSpacing: 0.2,
  },
  popoverMenuGroup: {
    gap: 3,
  },
  popoverMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  popoverMenuItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  popoverMenuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 6,
  },
  popoverIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popoverMenuLabel: {
    color: '#E5E5EA',
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  popoverMenuLabelSelected: {
    color: '#FFFFFF',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  popoverMenuDesc: {
    color: '#8E8E93',
    fontSize: 10.5,
    fontFamily: 'SF-Pro-Rounded-Medium',
    marginTop: 1,
  },
  popoverFooterRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  popoverFastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popoverFastTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  popoverFastDesc: {
    color: '#8E8E93',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  miniSwitch: {
    width: 34,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3A3A3C',
    padding: 2,
    justifyContent: 'center',
  },
  miniSwitchActive: {
    backgroundColor: '#34C759',
  },
  miniSwitchThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  miniSwitchThumbActive: {
    transform: [{ translateX: 16 }],
  },
  unifiedComposerCard: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 22,
    overflow: 'hidden',
  },
  unifiedComposerCardFast: {
    borderColor: '#34C759',
  },
  inlineEffortPanel: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  composerHeaderPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  composerHeaderPanelFast: {
    backgroundColor: 'rgba(52, 199, 89, 0.08)',
    borderBottomColor: 'rgba(52, 199, 89, 0.25)',
  },
  composerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  composerHeaderText: {
    color: '#D1D1D6',
    fontSize: 12.5,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    letterSpacing: 0.1,
  },
  composerHeaderTextFast: {
    color: '#34C759',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  attachButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  composerInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 4,
    minHeight: 46,
  },
  userImageBubbleCard: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
    maxWidth: 275,
    borderRadius: 20,
  },
  userImageMessageWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  userImageFrame: {
    position: 'relative',
    width: 275,
    height: 185,
    backgroundColor: '#090A0E',
    overflow: 'hidden',
  },
  userBubbleImage: {
    width: '100%',
    height: '100%',
  },
  imageBadgeChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  imageBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  userImageCaptionText: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#FFFFFF',
  },
  attachmentPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262629',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 2,
  },
  attachmentThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#1C1C1E',
  },
  attachmentTextGroup: {
    flex: 1,
  },
  attachmentTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  attachmentSubtitle: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    marginTop: 2,
  },
  removeAttachmentBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  viewVisionLinkBtn: {
    paddingVertical: 1,
    paddingHorizontal: 2,
    marginLeft: 2,
  },
  viewVisionLinkText: {
    color: '#89B4FA',
    fontSize: 11,
    fontFamily: 'SF-Pro-Rounded-Bold',
    textDecorationLine: 'underline',
  },
  visionSheetOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 99999,
    elevation: 99999,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  visionSheetCard: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 24,
  },
  visionSheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  visionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
  },
  visionSheetTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  visionSheetTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  visionSheetSubtitle: {
    color: '#89B4FA',
    fontSize: 11.5,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    marginTop: 1,
  },
  visionSheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visionSheetScroll: {
    maxHeight: 280,
  },
  visionSheetScrollContent: {
    paddingVertical: 8,
  },
  visionSheetBodyText: {
    color: '#D1D1D6',
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  visionSheetFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  copyVisionResultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A84FF',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  copyVisionResultText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
});

export default ChatScreen;
