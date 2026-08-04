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
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share as NativeShare,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
  NativeModules,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  ArrowUpRight,
  Check,
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
} from 'lucide-react-native';
import Svg, {Path} from 'react-native-svg';

const GithubIcon: React.FC<{color?: string; size?: number}> = ({color = '#0A84FF', size = 15}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <Path d="M9 18c-4.51 2-5-2-7-2" />
  </Svg>
);
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import DeviceInfo from 'react-native-device-info';
import {initLlama, LlamaContext, RNLlamaOAICompatibleMessage} from 'llama.rn';
import {getModelFilePath, getSelectedInstalledModel, deleteModelFile} from '../utils/modelInstallStatus';
import {findCatalogModel} from '../data/modelCatalog';
import {getExistingDownloadTasks} from '@kesha-antonov/react-native-background-downloader';
import ProfessionalAlert from '../components/ProfessionalAlert';

interface Props {
  onBack: () => void;
}

type ChatRole = 'user' | 'assistant' | 'notice';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  interrupted?: boolean;
  isTruncated?: boolean;
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

type ResponsePhase = 'idle' | 'thinking' | 'composing';

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

const MENU_ITEMS = [
  {label: 'Fresh thread', isActive: true},
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

const isIdentityFallback = (text: string, aiName: string) => {
  const namePattern = new RegExp(`\\b(i'?m|i am)\\s+${escapeRegExp(aiName)}\\b`, 'i');
  return (
    namePattern.test(text) ||
    /\bprivate offline assistant\b/i.test(text) ||
    /\bhow can i (assist|help) you( today)?\b/i.test(text)
  );
};

const isCodeLikeResponse = (text: string) =>
  /```|#include|#define|import\s+\w+|from\s+\w+\s+import|\bint\s+|\bdouble\s+|\bfloat\s+|\bchar\s+|\bvoid\s+|\bstruct\s+|\bclass\s+|\bpublic\s+|\bprivate\s+|\bprintf\(|\bstd::|\bcout\b|\breturn\s+|\bfunction\s+|\bdef\s+|\bconst\s+|\blet\s+|\bvar\s+|\bval\s+|\bfn\s+|\bpackage\s+|\busing\s+|\bnamespace\s+|;\s*$/m.test(text);

const shouldRepairResponse = (prompt: string, response: string, aiName: string) =>
  !isCodeLikeResponse(response) &&
  !isGreetingPrompt(prompt) &&
  !/who\s+are\s+you|what\s+are\s+you|your\s+name|code|program|script|class|function|write/i.test(prompt) &&
  isIdentityFallback(response, aiName);

const sanitizeGeneratedText = (text: string) => {
  const cleaned = stripStopMarkers(text)
    .replace(/^(thinking|composing|replying)\s*(\.{1,3})?\s*[:-]?\s*/i, '')
    .trim();

  if (/^(thinking|composing|replying)\s*(\.{1,3})?$/i.test(text.trim())) {
    return '';
  }

  return cleaned;
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
  sanitizeGeneratedText(result.content || result.text || streamedText || '');

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

  const visibleText = sanitizeGeneratedText(text).trimStart();
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
        <Lightbulb color="#FFFFFF" size={19} strokeWidth={2.1} />
        <Text style={styles.thinkingText}>{`${labelBase} ${'.'.repeat(dotCount)}`}</Text>
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
  const parts = inlineText.split(/(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|`[\s\S]*?`)/g);

  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <Text key={index} style={{fontFamily: 'SF-Pro-Rounded-Bold', color: '#FFFFFF'}}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <Text key={index} style={{fontStyle: 'italic'}}>
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
  const lines = text.split('\n');

  return (
    <View style={styles.formattedTextContainer}>
      {lines.map((line, lineIndex) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <View key={lineIndex} style={styles.paragraphSpacer} />;
        }
        if (/^#+\s/.test(trimmed)) {
          const headingText = trimmed.replace(/^#+\s*/, '');
          return (
            <Text key={lineIndex} style={styles.markdownHeading}>
              {headingText}
            </Text>
          );
        }
        if (/^[-*]\s/.test(trimmed)) {
          const bulletText = trimmed.replace(/^[-*]\s*/, '');
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
}: {
  generationLabel: string;
  isLive: boolean;
  isThinkingHiding: boolean;
  item: ChatMessage;
  thinkingLines: string[];
}) => {
  const appear = useRef(new Animated.Value(0)).current;
  const messageCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const isUser = item.role === 'user';
  const isNotice = item.role === 'notice';
  const messageSegments = useMemo(
    () => (!isUser && item.text ? parseMessageSegments(item.text) : []),
    [isUser, item.text],
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
    setClipboardText(item.text);
    lightHaptic();
    setCopiedMessageId(item.id);
    if (messageCopyTimer.current) {
      clearTimeout(messageCopyTimer.current);
    }
    messageCopyTimer.current = setTimeout(() => setCopiedMessageId(null), 1300);
  }, [item.id, item.text]);

  const shareMessage = useCallback(() => {
    if (!item.text.trim()) {
      return;
    }

    lightHaptic();
    NativeShare.share({message: item.text}).catch(error => {
      console.warn('ChatScreen: failed to share text:', error);
    });
  }, [item.text]);

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
            <Sparkles color="#34C759" size={13} strokeWidth={2.2} />
            <Text style={styles.compactDividerText}>{item.text}</Text>
          </View>
          <View style={styles.compactDividerLine} />
        </View>
      ) : (
        <>
          {!isUser && (
            <View style={styles.agentGlyphSmall}>
              <Image source={logoSource} style={styles.agentLogoSmall} resizeMode="contain" />
            </View>
          )}
          <View style={[styles.messageStack, isUser && styles.userMessageStack]}>
            <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
              {shouldShowThinking && (
                <ThinkingText
                  isHiding={isThinkingHiding}
                  label={generationLabel}
                  lines={thinkingLines}
                />
              )}
              {isLive && !item.text ? null : (
                <View
                  style={[
                    styles.messageTextWrap,
                    shouldShowThinking && styles.liveMessageTextWrap,
                  ]}>
                  {isUser ? (
                    <Text style={styles.messageText}>{item.text}</Text>
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
              )}
            </View>
            {item.text.trim().length > 0 && !isLive && (
              <View style={!isUser && styles.assistantActionsContainer}>
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
    </Animated.View>
  );
});

const ChatScreen: React.FC<Props> = ({onBack}) => {
  const insets = useSafeAreaInsets();
  const {width: windowWidth} = useWindowDimensions();

  // Refs
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const composerHostRef = useRef<React.ElementRef<typeof View>>(null);
  const contextRef = useRef<LlamaContext | null>(null);
  const menuX = useRef(new Animated.Value(-380)).current;
  const infoX = useRef(new Animated.Value(windowWidth)).current;
  const infoBackgroundSlide = useRef(new Animated.Value(0)).current;
  const openInfoPanelFrameRef = useRef<number | null>(null);
  const contextX = useRef(new Animated.Value(windowWidth)).current;
  const openContextPanelFrameRef = useRef<number | null>(null);
  const sendScale = useRef(new Animated.Value(1)).current;
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

  // State
  const [activeThreadId, setActiveThreadId] = useState(createThreadId);
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [modelName, setModelName] = useState('Rivo Local');
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [_status, setStatus] = useState('Private offline');
  const [memorySummary, setMemorySummary] = useState('');
  const [userMemory, setUserMemory] = useState('');
  const [compactedCount, setCompactedCount] = useState(0);
  const [_responsePhase, setResponsePhase] = useState<ResponsePhase>('idle');
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
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isContextTransitionActive, setIsContextTransitionActive] = useState(false);
  const [localName, setLocalName] = useState('');
  const [localMemoryBullets, setLocalMemoryBullets] = useState('');
  const [maxTokens, setMaxTokens] = useState(1024);
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
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

  // Memos
  const scrimOpacity = useMemo(() => {
    return menuX.interpolate({
      inputRange: [-380, 0],
      outputRange: [0, 1],
    });
  }, [menuX]);

  const recentThreads = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_THREADS),
    [threads],
  );

  const activeCatalogModel = useMemo(
    () => findCatalogModel(activeModelId, modelName),
    [activeModelId, modelName],
  );

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
    Animated.timing(menuX, {
      toValue: isMenuOpen ? 0 : -380,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isMenuOpen, menuX]);

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

  useEffect(() => {
    if (isMenuOpen || isInfoOpen) {
      dismissComposerKeyboard();
    }
  }, [dismissComposerKeyboard, isInfoOpen, isMenuOpen]);

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

  const openContextPanel = useCallback(() => {
    dismissComposerKeyboard();

    // Parse name and other facts from current userMemory
    const currentName = extractNameFromMemory(userMemory);
    setLocalName(currentName);

    const otherBullets = userMemory
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.toLowerCase().startsWith('user name:'))
      .join('\n');
    setLocalMemoryBullets(otherBullets);

    // Populate draft AI settings from actual active values
    setLocalAiName(aiName);
    setLocalAiPersonality(aiPersonality);
    setLocalAiEmoji(aiEmoji);
    setLocalAiEmojiQuantity(aiEmojiQuantity);

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
    } catch (error) {
      console.warn('ChatScreen: mmap model load failed, retrying safer load:', error);
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
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: any) => {
      const height = e?.endCoordinates?.height ?? 0;
      if (height > 0) {
        setKeyboardHeight(height);
      }
      if (!userScrolledUpRef.current) {
        scrollToEnd(true);
      }
    };

    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToEnd]);

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
      setMessagesAndRef(nextMessagesWithNotice);
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

    const now = Date.now();
    const userMessage: ChatMessage = {
      id: `${now}_user`,
      role: 'user',
      text: prompt,
    };
    const nextUserMemory = extractUserMemory(prompt, userMemory);
    clearThinkingFadeTimer();
    setIsThinkingFading(false);
    setVisibleThinkingLineCount(1);
    if (nextUserMemory !== userMemory) {
      setUserMemory(nextUserMemory);
    }
    const rememberedName = extractNameFromMemory(nextUserMemory);
    const assistantId = `${now}_assistant`;
    userScrolledUpRef.current = false;
    isChatScrollInteractingRef.current = false;
    isChatAtBottomRef.current = true;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
    };
    let baseMessages = messagesRef.current.filter(item => item.role !== 'notice');
    const isFirstMessage = baseMessages.length === 0;
    setThinkingTrace(
      buildThinkingTrace(
        prompt,
        Boolean(nextUserMemory || memorySummary),
        isFirstMessage,
      ),
    );
    let streamedText = '';
    let lastVisibleStreamText = '';
    let didStartThinkingFade = false;
    let activeAssistantId = assistantId;
    let activeResponsePrefix = '';
    let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      let activeMemorySummary = memorySummary;

      setInput('');
      setIsGenerating(true);
      setResponsePhase('thinking');
      setStatus('Thinking');
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
        setMessagesAndRef([...messagesRef.current, compactNotice]);

        const compacted = await compactThreadMemory(context, baseMessages, nextUserMemory);
        const activeKeepMessages = isPerformanceMode ? 3 : keepMessages;
        baseMessages = compacted?.messages ?? baseMessages.slice(-activeKeepMessages);
        activeMemorySummary = compacted?.summary ?? activeMemorySummary;
        const compactedNotice: ChatMessage = {
          id: `${now}_compact_done`,
          role: 'notice',
          text: 'Context compacted. Continuing with recent memory.',
        };
        setMessagesAndRef([...baseMessages, compactedNotice]);
        await new Promise<void>(resolve => setTimeout(() => resolve(), 180));
      }

      setMessagesAndRef([...baseMessages, userMessage, assistantMessage]);
      setStatus('Composing');

      const activeKeepMessages = isPerformanceMode ? 3 : keepMessages;
      const conversationSnapshot = [...baseMessages, userMessage]
        .filter(item => item.role !== 'notice' && item.text.trim().length > 0)
        .slice(-activeKeepMessages);
      const emojiQuantityInstruction =
        aiEmojiQuantity === 'none'
          ? `EMOJI RULE: Do NOT use any emojis. Keep responses 100% text-based without emojis.`
          : aiEmojiQuantity === 'low'
          ? `EMOJI RULE: Use at most 1 emoji in the response, including signature emoji ${aiEmoji}.`
          : aiEmojiQuantity === 'high'
          ? `EMOJI RULE: HIGH EMOJI MODE. Use multiple emojis (${aiEmoji} and others) in every single sentence and response expressively! 🔥✨😊`
          : `EMOJI RULE: Use 1-2 relevant emojis naturally, including signature emoji ${aiEmoji}.`;

      const systemContent = isPerformanceMode
        ? [
            `You are ${aiName}, an offline AI assistant.`,
            `Personality: ${aiPersonality}.`,
            emojiQuantityInstruction,
            `Identity rule: your assistant name is ${aiName}. Never claim the user is ${aiName}.`,
            rememberedName ? `User is ${rememberedName}.` : '',
            nextUserMemory ? `User memory: ${nextUserMemory}.` : '',
            activeMemorySummary ? `Context summary: ${activeMemorySummary}.` : '',
          ].filter(Boolean).join(' ')
        : [
            `You are ${aiName}, a highly capable offline AI assistant companion.`,
            `Personality: ${aiPersonality}. Adopt this persona in all your replies.`,
            `Actual local model: ${modelName}.`,
            `You can answer questions, brainstorm, and write code in any programming language. Provide complete code implementations when requested.`,
            `Answer the user's questions or requests directly and thoroughly. Do not introduce yourself unless the user asks who you are.`,
            `Never use generic fallback lines like "How can I assist you today?" after the user asks a concrete question.`,
            emojiQuantityInstruction,
            `Identity rule: your assistant name is ${aiName}. Do not claim the user's name is ${aiName}.`,
            `Memory rule: if the user asks their name or identity, answer from Known user memory exactly. Never answer that the user's name is ${aiName}.`,
            rememberedName ? `The user's name is ${rememberedName}.` : '',
            `If asked who the user is, answer only from Known user memory. If unknown, say you do not know yet.`,
            `Be helpful, grounded, and natural. Do not invent names or facts.`,
            nextUserMemory ? `Known user memory: ${nextUserMemory}` : 'Known user memory: none yet.',
            activeMemorySummary ? `Compacted conversation memory:\n${activeMemorySummary}` : '',
          ].filter(Boolean).join('\n');

      const llamaMessages: RNLlamaOAICompatibleMessage[] = [
        {
          role: 'system',
          content: systemContent,
        },
        ...conversationSnapshot.map(item => ({
          role: item.role as 'user' | 'assistant',
          content: sanitizeMessageForLlama(item.text),
        })),
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
      const result = await context.completion(
        {
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
        },
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
      let finalAssistantMessages: ChatMessage[] = [
        {
          id: assistantId,
          role: 'assistant',
          text: finalText || 'I could not generate a response.',
        },
      ];

      if (!isPerformanceMode && !wasInterrupted && finalText && !isCodeLikeResponse(finalText) && shouldRepairResponse(prompt, finalText, aiName)) {
        setResponsePhase('thinking');
        setStatus('Refining');
        const firstResponseText = finalText || 'I could not generate a response.';
        const repairAssistantId = `${assistantId}_repair`;
        const responseOneMessage: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          text: `Response 1\n\n${firstResponseText}`,
        };
        const responseTwoPrefix = 'Response 2\n\n';
        streamedText = '';
        lastVisibleStreamText = '';
        activeAssistantId = repairAssistantId;
        activeResponsePrefix = responseTwoPrefix;
        if (streamFlushTimer) {
          clearTimeout(streamFlushTimer);
          streamFlushTimer = null;
        }
        updateMessagesAndRef(current =>
          [
            ...current.map(item =>
              item.id === assistantId ? responseOneMessage : item,
            ),
            {
              id: repairAssistantId,
              role: 'assistant' as const,
              text: responseTwoPrefix,
            },
          ],
        );

        const repairResult = await context.completion(
          {
            messages: [
              {
                role: 'system',
                content:
                  [
                    'Answer only the user question. No greeting. No self-introduction.',
                    'If it is factual, define or explain it directly.',
                    nextUserMemory ? `Known memory:\n${nextUserMemory}` : '',
                    activeMemorySummary ? `Conversation memory:\n${activeMemorySummary}` : '',
                  ].filter(Boolean).join('\n'),
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            n_predict: 1024,
            temperature: 0.45,
            top_p: 0.85,
            top_k: 40,
            min_p: 0.05,
            penalty_last_n: 64,
            penalty_repeat: 1.03,
            penalty_freq: 0,
            dry_multiplier: 0,
            stop: STOP_WORDS,
            force_pure_content: true,
          },
          data => {
            handleStreamToken(data);
          },
        );

        flushStream(true);
        wasInterrupted = stopRequestedRef.current || Boolean(repairResult.interrupted);
        isTruncated = Boolean(repairResult.truncated) || Boolean(repairResult.stopped_limit);
        finalText = getCompletionText(repairResult, streamedText);
        if (wasInterrupted && !finalText.trim()) {
          finalText =
            lastVisibleStreamText ||
            visibleGeneratedText(streamedText) ||
            messagesRef.current.find(item => item.id === activeAssistantId)?.text ||
            '';
        }
        finalAssistantMessages = [
          responseOneMessage,
          {
            id: repairAssistantId,
            role: 'assistant',
            text: `${responseTwoPrefix}${finalText || 'I could not generate a response.'}`,
          },
        ];
      }

      if (!wasInterrupted && isLikelyCorruptResponse(finalText)) {
        finalText = 'I got unstable output from the local model. Please tap send again and I will retry with a fresh pass.';
      } else if (!wasInterrupted && shouldRepairResponse(prompt, finalText, aiName)) {
        finalText = 'I got stuck on that reply. Ask it once more with a little more detail and I will answer directly.';
      }

      finalAssistantMessages = finalAssistantMessages.map((message, index, all) =>
        index === all.length - 1
          ? {
              ...message,
              text:
                all.length > 1
                  ? `Response ${index + 1}\n\n${finalText || 'I could not generate a response.'}`
                  : finalText || 'I could not generate a response.',
              interrupted: wasInterrupted,
              isTruncated: isTruncated,
            }
          : message,
      );
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
      scrollToEnd(true);
      if (!wasInterrupted) {
        await compactThreadMemory(context, completeMessages, nextUserMemory);
      }

      if (!wasInterrupted && isCodeLikeResponse(finalText)) {
        setIsCurrentThreadCodingLocked(true);
        const lockNotice: ChatMessage = {
          id: `${now}_coding_lock_notice`,
          role: 'notice',
          text: '⚡ Coding session completed! To maintain peak GPU speed & optimal memory compaction, please start a new thread for your next question.',
        };
        updateMessagesAndRef(current => [...current, lockNotice]);
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

  const renderMessage = useCallback(
    ({item}: {item: ChatMessage}) => (
      <MessageBubble
        item={item}
        isLive={item.id === liveAssistantId}
        isThinkingHiding={item.id === liveAssistantId && isThinkingFading}
        generationLabel="Thinking..."
        thinkingLines={item.id === liveAssistantId ? visibleThinkingLines : []}
      />
    ),
    [isThinkingFading, liveAssistantId, visibleThinkingLines],
  );

  const shouldShowEmptyOnboarding =
    hasHydrated && messages.length === 0 && (threads.length === 0 || isFreshEmptyThread);
  const shouldShowChatSkeleton =
    !hasHydrated || (messages.length === 0 && !shouldShowEmptyOnboarding);
  const composerBottomInset = Math.max(insets.bottom, 12);
  const composerBottomPadding = Platform.OS === 'android'
    ? Math.max(insets.bottom, 10)
    : insets.bottom;

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View
        style={[
          styles.mainSurface,
          {transform: [{translateX: infoBackgroundTranslateX}]},
        ]}
        collapsable={false}
        renderToHardwareTextureAndroid={Platform.OS === 'android' && isInfoTransitionActive}
        shouldRasterizeIOS={Platform.OS === 'ios' && isInfoTransitionActive}>
      <View style={[styles.header, {paddingTop: insets.top + 4}]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPressIn={dismissComposerKeyboard}
          onPress={openSideMenu}>
          <View style={styles.menuGlyph}>
            <View style={[styles.menuGlyphLine, styles.menuGlyphLineTop]} />
            <View style={[styles.menuGlyphLine, styles.menuGlyphLineMid]} />
            <View style={[styles.menuGlyphLine, styles.menuGlyphLineBottom]} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.modelButton}
          activeOpacity={0.82}
          onPressIn={dismissComposerKeyboard}
          onPress={() => {
            dismissComposerKeyboard();
            setShowModelSwitchAlert(true);
          }}>
          <View style={styles.modelMark}>
            {activeCatalogModel?.logo ? (
              <Image
                source={{uri: activeCatalogModel.logo}}
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
        onScrollBeginDrag={() => {
          userScrolledUpRef.current = true;
          isChatScrollInteractingRef.current = true;
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
          const isAtBottom =
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - AUTO_SCROLL_RESUME_THRESHOLD;
          isChatAtBottomRef.current = isAtBottom;
          if (isAtBottom && !isChatScrollInteractingRef.current) {
            userScrolledUpRef.current = false;
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
          shouldShowChatSkeleton
            ? styles.skeletonChatContent
            : shouldShowEmptyOnboarding && styles.emptyChatContent,
        ]}
        ListEmptyComponent={
          shouldShowChatSkeleton ? (
            <ChatSkeleton />
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyLogoMark}>
                <Image source={logoSource} style={styles.emptyLogo} resizeMode="contain" />
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

      <View
        ref={composerHostRef}
        style={[
          styles.composerHost,
          {
            marginBottom: Platform.OS === 'android' && keyboardHeight > 0
              ? Math.max(0, keyboardHeight - insets.bottom)
              : 0,
            paddingBottom: composerBottomPadding,
          },
        ]}>
        {isCurrentThreadCodingLocked ? (
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
          </View>
        ) : (
          <>
            <View style={styles.composer}>
              <TextInput
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                placeholder="Ask Rivo offline"
                placeholderTextColor="#B5B5B8"
                style={styles.input}
                editable={!isMenuOpen && !isInfoOpen}
                showSoftInputOnFocus={!isMenuOpen && !isInfoOpen}
                multiline
                maxLength={2500}
                onFocus={() => scrollToEnd(true, true)}
                blurOnSubmit={true}
                onSubmitEditing={() => {
                  if (!isGenerating) {
                    sendMessage();
                  }
                }}
                enterKeyHint="send"
              />
              <Animated.View style={{transform: [{scale: sendScale}]}}>
                <TouchableOpacity
                  style={styles.sendButton}
                  onPress={isGenerating ? stopGeneration : () => sendMessage()}
                  activeOpacity={0.84}>
                  {isGenerating ? (
                    <Square color="#000000" size={13} fill="#000000" />
                  ) : (
                    <SendHorizontal color="#000000" size={18} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
            <Text style={styles.disclaimerText}>Local models can make mistakes. Check twice.</Text>
          </>
        )}
      </View>
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
            paddingTop: insets.top + 16,
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
              Rivo <Text style={styles.menuBrandTextLight}>Agent</Text>
            </Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => setIsMenuOpen(false)}>
            <Image source={closeSource} style={styles.closeIcon} resizeMode="contain" />
          </TouchableOpacity>
        </View>

        <View style={styles.menuItems}>
          {MENU_ITEMS.map(({label, isActive}) => (
            <TouchableOpacity
              key={label}
              activeOpacity={0.78}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={label === 'Fresh thread' ? newChat : undefined}>
              <View style={styles.menuItemIcon}>
                <Image source={newSource} style={styles.newIcon} resizeMode="contain" />
              </View>
              <Text style={[styles.menuText, isActive && styles.menuTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.recentsTitle}>Local history</Text>
        <Text style={styles.recentsLimitText}>You can only create 7 threads.</Text>
        <View style={styles.recentsList}>
          {recentThreads.length === 0 ? (
            <Text style={styles.emptyHistory}>Your chats save here automatically.</Text>
          ) : recentThreads.map(thread => {
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
                      color={isActiveThread ? '#E4E4E7' : '#A1A1AA'}
                      size={18}
                      strokeWidth={2.4}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.profileRow}
          onPress={() => setShowLogoutConfirmAlert(true)}
          activeOpacity={0.78}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitials}>G</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName}>Guest</Text>
            <Text style={styles.profilePlan}>Device-only memory</Text>
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
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(composerBottomInset + 16, 24),
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
              <Text style={styles.contextEyebrow}>SYSTEM CORE</Text>
              <Text style={styles.contextTitle}>Neural Panel</Text>
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
                <Text style={[styles.inputLabel, { marginVertical: 0 }]}>Max reply length</Text>
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
                            ? '1024 (locked)'
                            : tokens === 256
                            ? '256 — Lite'
                            : tokens === 512
                            ? '512 — Standard'
                            : tokens === 1024
                            ? '1024 — Long'
                            : '2048 — Max'}
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
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(composerBottomInset + 16, 24),
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
  },
  header: {
    minHeight: 54,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
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
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  contextIcon: {
    width: 22,
    height: 22,
  },
  questionButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  questionIcon: {
    width: 18,
    height: 18,
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
    minHeight: 58,
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
    color: '#34C759',
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
  emptyLogoMark: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0B0B0B',
    borderWidth: 1,
    borderColor: '#202020',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 20,
    marginBottom: 20,
    overflow: 'hidden',
  },
  emptyLogo: {
    width: 41,
    height: 38,
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
    paddingHorizontal: 18,
    marginLeft: 20,
    marginTop: 20,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0B0B',
    borderWidth: 1,
    borderColor: '#202020',
    marginRight: 10,
    marginTop: 3,
    overflow: 'hidden',
  },
  agentLogoSmall: {
    width: 18,
    height: 17,
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
  markdownHeading: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginTop: 8,
    marginBottom: 4,
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
    backgroundColor: '#121316',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.3)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginHorizontal: 10,
  },
  compactDividerText: {
    color: '#34C759',
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
    width: 38,
    height: 38,
    borderRadius: 19,
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
    bottom: 0,
    width: '64%',
    minWidth: 330,
    backgroundColor: '#000000',
    paddingHorizontal: 14,
    zIndex: 20,
  },
  menuTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
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
  menuBrandTextLight: {
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  menuItems: {
    gap: 4,
    marginBottom: 26,
  },
  menuItem: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  menuItemActive: {
    backgroundColor: '#FFFFFF',
  },
  menuItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  newIcon: {
    width: 16,
    height: 16,
  },
  menuText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginLeft: 12,
  },
  menuTextActive: {
    color: '#000000',
  },
  recentsTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginBottom: 5,
    paddingHorizontal: 4,
  },
  recentsLimitText: {
    color: '#8E8E93',
    fontSize: 13,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 18,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  recentsList: {
    flex: 1,
  },
  emptyHistory: {
    color: '#8E8E93',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 21,
    paddingHorizontal: 4,
  },
  recentItem: {
    marginBottom: 4,
    borderRadius: 18,
    overflow: 'hidden',
  },
  recentItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  recentRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentMain: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 30,
    paddingRight: 8,
  },
  recentText: {
    flex: 1,
    color: '#F4F4F5',
    fontSize: 16,
    fontFamily: 'SF-Pro-Rounded-Regular',
  },
  recentTextActive: {
    color: '#FFFFFF',
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  historyDots: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3F5342',
    borderWidth: 1,
    borderColor: '#5A725D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profileInitials: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  profileCopy: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 19,
  },
  profilePlan: {
    color: '#8E8E93',
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Medium',
    lineHeight: 16,
    marginTop: 2,
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
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
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
    height: 100,
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
});

export default ChatScreen;
