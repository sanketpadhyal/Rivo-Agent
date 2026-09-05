jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-device-info', () =>
  require('react-native-device-info/jest/react-native-device-info-mock')
);

jest.mock('@react-native-firebase/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('@react-native-firebase/auth', () => {
  const authInstance = {
    currentUser: null,
    signInWithCredential: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn(callback => {
      callback(null);
      return jest.fn();
    }),
  };
  const auth = () => authInstance;
  auth.GoogleAuthProvider = {
    credential: jest.fn(),
  };
  return auth;
});

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({ data: { idToken: 'test-token' } }),
    signOut: jest.fn().mockResolvedValue(null),
    getCurrentUser: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('@kesha-antonov/react-native-background-downloader', () => ({
  directories: {
    documents: '/mock/documents',
  },
  download: jest.fn().mockReturnValue({
    begin: jest.fn().mockReturnThis(),
    progress: jest.fn().mockReturnThis(),
    done: jest.fn().mockReturnThis(),
    error: jest.fn().mockReturnThis(),
    pause: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(),
  }),
  getExistingDownloadTasks: jest.fn().mockResolvedValue([]),
  checkForExistingDownloads: jest.fn().mockResolvedValue([]),
}));

jest.mock('llama.rn', () => ({
  initLlama: jest.fn().mockResolvedValue({
    release: jest.fn(),
    completion: jest.fn(),
    stopCompletion: jest.fn(),
    tokenize: jest.fn(),
    detokenize: jest.fn(),
  }),
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const insets = { top: 0, left: 0, right: 0, bottom: 0 };
  return {
    SafeAreaProvider: ({ children }) => React.createElement(View, null, children),
    SafeAreaView: ({ children, style }) => React.createElement(View, { style }, children),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockSvg = props => React.createElement(View, props);
  return {
    __esModule: true,
    default: MockSvg,
    Svg: MockSvg,
    Path: MockSvg,
    Circle: MockSvg,
    Rect: MockSvg,
    Line: MockSvg,
    Polygon: MockSvg,
    Polyline: MockSvg,
    G: MockSvg,
    Text: MockSvg,
    TSpan: MockSvg,
    Defs: MockSvg,
    Use: MockSvg,
    Symbol: MockSvg,
    ClipPath: MockSvg,
    LinearGradient: MockSvg,
    RadialGradient: MockSvg,
    Stop: MockSvg,
    Mask: MockSvg,
    Pattern: MockSvg,
  };
});

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_, prop) => {
        if (prop === '__esModule') return true;
        const MockIcon = props => React.createElement(View, props);
        MockIcon.displayName = String(prop);
        return MockIcon;
      },
    }
  );
});
