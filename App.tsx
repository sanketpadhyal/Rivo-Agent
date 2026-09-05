import React, {useState, useEffect} from 'react';
import {BackHandler, View, StyleSheet, LogBox} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import HomeScreen from './src/screens/HomeScreen';
import ChatScreen from './src/screens/ChatScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import DownloadScreen from './src/screens/DownloadScreen';
import ModelReadyScreen from './src/screens/ModelReadyScreen';
import {Colors} from './src/theme/colors';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {getSelectedInstalledModel} from './src/utils/modelInstallStatus';
import ProfessionalAlert from './src/components/ProfessionalAlert';

import {getExistingDownloadTasks} from '@kesha-antonov/react-native-background-downloader';

type Screen = 'login' | 'signup' | 'home' | 'chat' | 'onboarding' | 'download' | 'modelReady';

const getPostAuthScreen = async (): Promise<Screen> => {
  const hasOnboarded = await AsyncStorage.getItem('hasOnboarded');

  try {
    const installedModel = await getSelectedInstalledModel();
    if (hasOnboarded === 'true' && installedModel) {
      return 'chat';
    }

    if (installedModel) {
      return 'modelReady';
    }

    const tasks = await getExistingDownloadTasks();
    const activeOrPausedTask = tasks.find(t => ['PENDING', 'DOWNLOADING', 'PAUSED'].includes(t.state));
    const isPausedFlag = await AsyncStorage.getItem('isDownloadPaused');
    if (activeOrPausedTask || isPausedFlag === 'true') {
      return 'download';
    }
  } catch (error) {
    console.warn('App: failed to inspect completed model download:', error);
  }

  return 'onboarding';
};

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('home');
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [showExitAlert, setShowExitAlert] = useState(false);

  useEffect(() => {
    LogBox.ignoreAllLogs(true);
  }, []);

  useEffect(() => {
    const subscriber = auth().onAuthStateChanged(async userState => {
      setUser(userState);
      if (userState) {
        const nextScreen = await getPostAuthScreen();
        setScreen(nextScreen);
      } else {
        setScreen('home');
      }
      if (initializing) setInitializing(false);
    });
    return subscriber;
  }, [initializing]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'login') {
        setScreen('home');
        return true;
      }

      if (screen === 'signup') {
        setScreen(user ? 'onboarding' : 'home');
        return true;
      }

      if (screen === 'onboarding') {
        setScreen('home');
        return true;
      }

      if (screen === 'modelReady') {
        setScreen('onboarding');
        return true;
      }

      if (screen === 'download') {
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [screen, user]);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        {screen === 'login' && (
          <LoginScreen
            onBack={() => setScreen('home')}
            onAuthComplete={async () => {
              setScreen(await getPostAuthScreen());
            }}
          />
        )}
        {screen === 'signup' && (
          <SignupScreen
            onSignup={() => setScreen('home')}
            onGoToLogin={() => setScreen('login')}
          />
        )}
        {screen === 'home' && (
          <HomeScreen
            onGetStarted={() => setScreen('login')}
            onBack={() => setShowExitAlert(true)}
          />
        )}
        {screen === 'onboarding' && (
          <OnboardingScreen
            onComplete={() => setScreen('download')}
            onModelReady={() => setScreen('modelReady')}
          />
        )}
        {screen === 'download' && (
          <DownloadScreen
            onComplete={async () => {
              const isVisionFlag = await AsyncStorage.getItem('isVisionDownload');
              const isVisionComplete = await AsyncStorage.getItem('visionModelDownloadComplete');
              if (isVisionFlag === 'true' || isVisionComplete === 'true') {
                await AsyncStorage.multiSet([
                  ['visionModelDownloadComplete', 'true'],
                  ['isVisionDownload', 'false'],
                ]);
                setScreen('chat');
              } else {
                setScreen('modelReady');
              }
            }}
            onCancel={async () => {
              const isVisionFlag = await AsyncStorage.getItem('isVisionDownload');
              await AsyncStorage.removeItem('isVisionDownload');
              if (isVisionFlag === 'true') {
                setScreen('chat');
              } else {
                setScreen('onboarding');
              }
            }}
          />
        )}
        {screen === 'modelReady' && (
          <ModelReadyScreen onComplete={() => setScreen('chat')} />
        )}
        {screen === 'chat' && (
          <ChatScreen
            onBack={() => setShowExitAlert(true)}
            onOpenDownload={() => setScreen('download')}
          />
        )}
        <ProfessionalAlert
          visible={showExitAlert}
          title="Exit Rivo Agent?"
          message="Are you sure you want to exit the application? Your local offline model status and chats are safe on your device."
          iconName="power"
          confirmLabel="Exit"
          cancelLabel="Cancel"
          isDestructive
          onClose={() => setShowExitAlert(false)}
          onConfirm={() => BackHandler.exitApp()}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
});

export default App;
