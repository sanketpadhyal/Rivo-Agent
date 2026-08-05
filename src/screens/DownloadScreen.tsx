import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Platform,
  PermissionsAndroid,
  ScrollView,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import { FileCode, Activity, Cpu, ShieldCheck, FileText, Trash2, X, Pause, Play, Folder } from 'lucide-react-native';
import ProfessionalAlert from '../components/ProfessionalAlert';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  getExistingDownloadTasks,
  createDownloadTask,
  completeHandler,
  setConfig,
} from '@kesha-antonov/react-native-background-downloader';
import type {DownloadTask} from '@kesha-antonov/react-native-background-downloader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {findCatalogModel, getModelDownloadUrl, getModelTaskId, renderModelLogoSource} from '../data/modelCatalog';
import {
  getInstalledModelFilePath,
  getModelDownloadFilePath,
  markModelInstalled,
} from '../utils/modelInstallStatus';

type SelectedDownload = {
  id: string;
  name: string;
  desc: string;
  logo?: any;
  fileName: string;
  byteSize: number;
  minRam: number;
  downloadUrl: string;
};

const getAndroidVersion = () =>
  typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);

const normalizeFilePath = (path?: string | null) => path?.replace(/^file:\/\//, '');
const CONNECT_STALL_RESTART_MS = 30000;
const DOWNLOAD_PROGRESS_MIN_BYTES = 64 * 1024;
const DOWNLOAD_HEADERS = {
  Accept: 'application/octet-stream',
  'User-Agent': 'RivoApp/1.0',
};

type DownloadTaskWithDestination = DownloadTask & {
  destination?: string | null;
};

const getDownloadTaskDestination = (task?: DownloadTask | null) => {
  const taskWithDestination = task as DownloadTaskWithDestination | undefined;
  return normalizeFilePath(
    taskWithDestination?.downloadParams?.destination ?? taskWithDestination?.destination,
  );
};

const formatDownloadSpeed = (bytesPerSecond: number) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return '0 KB/s';
  }

  if (bytesPerSecond < 1024 * 1024) {
    const kilobytes = bytesPerSecond / 1024;
    return `${kilobytes < 100 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB/s`;
  }

  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
};

const requestAndroidDownloadPermissions = async () => {
  if (Platform.OS !== 'android' || getAndroidVersion() < 33) {
    return;
  }

  const notificationPermission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (!notificationPermission) {
    return;
  }

  try {
    const granted = await PermissionsAndroid.request(notificationPermission, {
      title: 'Download notification',
      message: 'Rivo shows model download progress while the engine installs.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    console.log('DownloadScreen: Android notification permission status:', granted);
  } catch (err) {
    console.warn('DownloadScreen: notification permission request error:', err);
  }
};

const DownloadScreen = ({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel?: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const activeTaskRef = useRef<DownloadTask | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showCancelAlert, setShowCancelAlert] = useState(false);
  const [showPauseAlert, setShowPauseAlert] = useState(false);
  const [showResumeAlert, setShowResumeAlert] = useState(false);
  const [showFailedAlert, setShowFailedAlert] = useState(false);

  const handleConfirmFailed = async () => {
    setShowFailedAlert(false);
    console.log('DownloadScreen: user acknowledged download failure');
    try {
      await AsyncStorage.removeItem('isDownloadPaused');
      let task = activeTaskRef.current;
      if (!task && selectedDownload) {
        const safeTaskId = getModelTaskId(selectedDownload);
        const tasks = await getExistingDownloadTasks();
        task = tasks.find(t => t.id === safeTaskId) || null;
      }
      if (task) {
        await task.stop();
      }
    } catch (e) {
      console.warn('DownloadScreen: error cleaning up failed task:', e);
    }
    if (onCancel) {
      onCancel();
    } else {
      onComplete();
    }
  };

  const handleConfirmCancel = async () => {
    setShowCancelAlert(false);
    console.log('DownloadScreen: user confirmed cancel download');
    try {
      await AsyncStorage.removeItem('isDownloadPaused');
      let task = activeTaskRef.current;
      if (!task && selectedDownload) {
        const safeTaskId = getModelTaskId(selectedDownload);
        const tasks = await getExistingDownloadTasks();
        task = tasks.find(t => t.id === safeTaskId) || null;
      }
      if (task) {
        console.log('DownloadScreen: stopping download task on user cancel');
        await task.stop();
      }
    } catch (error) {
      console.warn('DownloadScreen: error stopping task on cancel:', error);
    }
    if (onCancel) {
      onCancel();
    } else {
      onComplete();
    }
  };

  const handleConfirmPause = async () => {
    setShowPauseAlert(false);
    console.log('DownloadScreen: user confirmed pause download');
    try {
      let task = activeTaskRef.current;
      if (!task && selectedDownload) {
        const safeTaskId = getModelTaskId(selectedDownload);
        const tasks = await getExistingDownloadTasks();
        task = tasks.find(t => t.id === safeTaskId) || null;
      }
      if (task) {
        await task.pause();
        await AsyncStorage.setItem('isDownloadPaused', 'true');
        setIsPaused(true);
        setSpeed('Paused');
      }
    } catch (error) {
      console.warn('DownloadScreen: error pausing task:', error);
    }
  };

  const handleConfirmResume = async () => {
    setShowResumeAlert(false);
    console.log('DownloadScreen: user confirmed resume download');
    try {
      let task = activeTaskRef.current;
      if (!task && selectedDownload) {
        const safeTaskId = getModelTaskId(selectedDownload);
        const tasks = await getExistingDownloadTasks();
        task = tasks.find(t => t.id === safeTaskId) || null;
      }
      if (task) {
        await task.resume();
        await AsyncStorage.setItem('isDownloadPaused', 'false');
        setIsPaused(false);
        setSpeed('Resuming');
      }
    } catch (error) {
      console.warn('DownloadScreen: error resuming task:', error);
    }
  };
  
  const haloAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(haloAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [haloAnim]);


  const [selectedDownload, setSelectedDownload] = useState<SelectedDownload | null>(null);
  
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('selectedModelId'),
      AsyncStorage.getItem('selectedModelName'),
      AsyncStorage.getItem('selectedModelFileName'),
      AsyncStorage.getItem('selectedModelSizeBytes'),
      AsyncStorage.getItem('selectedModelDownloadUrl'),
    ]).then(([storedId, storedName, storedFileName, storedSizeBytes, storedDownloadUrl]) => {
      const catalogModel = findCatalogModel(storedId, storedName);
      const fileName = storedFileName || catalogModel.fileName;
      const model = {
        id: catalogModel.id,
        name: catalogModel.name,
        desc: catalogModel.desc,
        logo: catalogModel.logo,
        fileName,
        byteSize: Number(storedSizeBytes) || catalogModel.byteSize,
        minRam: catalogModel.minRam,
        downloadUrl: storedDownloadUrl || getModelDownloadUrl({...catalogModel, fileName}),
      };

      console.log('DownloadScreen: loaded selected model:', model);
      setSelectedDownload(model);
      setDownloadPath(getModelDownloadFilePath(fileName));
    });
  }, []);

  const [downloadPath, setDownloadPath] = useState('');
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(1);
  const [speed, setSpeed] = useState('Preparing');
  
  const lastTimeRef = useRef(Date.now());
  const lastBytesRef = useRef(0);
  const didRestartStalledTaskRef = useRef(false);

  useEffect(() => {
    if (selectedDownload === null) {
      console.log('DownloadScreen: selected model is not loaded yet, skipping download start');
      return;
    }

    let cancelled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStallTimer = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    didRestartStalledTaskRef.current = false;

    const startDownload = async () => {
      clearStallTimer();
      console.log('DownloadScreen: starting download flow for model:', selectedDownload);
      setSpeed('Preparing');

      setConfig({
        allowsCellularAccess: true,
        progressInterval: 500,
        progressMinBytes: DOWNLOAD_PROGRESS_MIN_BYTES,
        showNotificationsEnabled: true,
        notificationsGrouping: {
          enabled: true,
          mode: 'summaryOnly',
          texts: {
            downloadTitle: 'Rivo model',
            downloadStarting: 'Starting model download...',
            downloadProgress: 'Downloading model... {progress}%',
            downloadPaused: 'Paused',
            downloadFinished: 'Model ready',
            groupTitle: 'Rivo model',
            groupText: 'Installing offline engine',
          },
        },
      });

      await requestAndroidDownloadPermissions();

      // 2. Check for existing background tasks first
      const tasks = await getExistingDownloadTasks();
      console.log('DownloadScreen: found existing tasks count:', tasks.length);
      tasks.forEach(t => {
        console.log(
          `DownloadScreen: existing task -> id: ${t.id}, state: ${t.state}, bytes: ${t.bytesDownloaded}/${t.bytesTotal}`,
        );
      });

      // Include the exact file name so old placeholder/test downloads cannot be reused.
      const safeTaskId = getModelTaskId(selectedDownload);
      const legacyTaskId = `model_dl_${selectedDownload.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const finishInstalledModel = async (sizeBytes?: number) => {
        const installedPath = await getInstalledModelFilePath(
          selectedDownload,
          selectedDownload.fileName,
        );
        if (!installedPath) {
          throw new Error('Downloaded model file could not be verified.');
        }

        await markModelInstalled(selectedDownload, selectedDownload.fileName, sizeBytes);
      };

      const legacyTask = tasks.find(task => task.id === legacyTaskId);
      if (legacyTask && legacyTask.id !== safeTaskId && legacyTask.state !== 'DONE') {
        console.log('DownloadScreen: stopping legacy placeholder task:', legacyTask.id);
        try {
          await legacyTask.stop();
        } catch (e) {
          console.warn('DownloadScreen: error stopping legacy task:', e);
        }
      }

      let activeTask = tasks.find(task => task.id === safeTaskId);
      const destination = getModelDownloadFilePath(selectedDownload.fileName);
      const taskDestination = getDownloadTaskDestination(activeTask);
      const activeTaskHasBytes = (activeTask?.bytesDownloaded || 0) > 0;

      if (
        activeTask &&
        activeTask.state !== 'DONE' &&
        ((taskDestination && taskDestination !== destination) ||
          (!taskDestination && !activeTaskHasBytes))
      ) {
        console.log(
          'DownloadScreen: stopping stale task with old destination:',
          taskDestination ?? 'unknown',
          '->',
          destination,
        );
        try {
          await activeTask.stop();
        } catch (e) {
          console.warn('DownloadScreen: error stopping stale task:', e);
        }
        activeTask = undefined;
      }

      if (
        activeTask &&
        activeTask.state !== 'DONE' &&
        activeTask.state !== 'PENDING' &&
        (activeTask.bytesDownloaded || 0) <= 0
      ) {
        console.log(
          'DownloadScreen: stopping zero-byte stale task before restart:',
          safeTaskId,
          activeTask.state,
        );
        try {
          await activeTask.stop();
        } catch (e) {
          console.warn('DownloadScreen: error stopping zero-byte stale task:', e);
        }
        activeTask = undefined;
      }

      if (activeTask?.state === 'DONE') {
        const installedPath = await getInstalledModelFilePath(
          selectedDownload,
          selectedDownload.fileName,
        );
        if (!installedPath) {
          console.log('DownloadScreen: DONE task exists but model file is missing, recreating:', safeTaskId);
          try {
            await activeTask.stop();
          } catch (e) {
            console.warn('DownloadScreen: error clearing missing DONE task:', e);
          }
          activeTask = undefined;
        }
      }

      if (activeTask?.state === 'DONE') {
        console.log('DownloadScreen: task is already complete, opening model ready screen:', safeTaskId);
        setProgress(1);
        setDownloadedBytes(activeTask.bytesDownloaded || selectedDownload.byteSize);
        setTotalBytes(activeTask.bytesTotal || selectedDownload.byteSize);
        setSpeed('Complete');
        await finishInstalledModel(activeTask.bytesTotal || selectedDownload.byteSize);
        completeHandler(safeTaskId);
        onComplete();
        return;
      }
      
      if (!activeTask || activeTask.state === 'FAILED') {
        if (activeTask) {
          console.log('DownloadScreen: activeTask was in state:', activeTask.state, '- stopping and re-creating');
          try {
            activeTask.stop(); // clear old task
          } catch (e) {
            console.warn('DownloadScreen: error stopping old task:', e);
          }
        }
        console.log('DownloadScreen: creating new download task for id:', safeTaskId);
        activeTask = createDownloadTask({
          id: safeTaskId,
          url: selectedDownload.downloadUrl,
          destination,
          headers: DOWNLOAD_HEADERS,
          isAllowedOverRoaming: true,
          isAllowedOverMetered: true,
          maxRedirects: 10,
          metadata: {
            modelId: selectedDownload.id,
            modelName: selectedDownload.name,
          },
        });
      } else {
        console.log('DownloadScreen: reusing existing active task:', safeTaskId, 'in state:', activeTask.state);
      }

      activeTaskRef.current = activeTask;
      console.log('DownloadScreen: attaching listeners to task. State is:', activeTask.state);
      lastTimeRef.current = Date.now();
      lastBytesRef.current = activeTask.bytesDownloaded || 0;
      if (activeTask.state === 'PAUSED') {
        setIsPaused(true);
        setSpeed('Paused');
      } else {
        setSpeed(activeTask.bytesDownloaded > 0 ? 'Resuming' : 'Preparing');
      }
      
      activeTask.begin(({expectedBytes}) => {
        console.log('DownloadScreen: Task begin - expected bytes:', expectedBytes);
        if (cancelled) {
          return;
        }
        setSpeed('Starting');
        setTotalBytes(expectedBytes || selectedDownload.byteSize);
      }).progress(({bytesDownloaded, bytesTotal}) => {
        if (cancelled) {
          return;
        }

        if (bytesDownloaded > 0) {
          clearStallTimer();
        }

        const expectedBytes = bytesTotal || selectedDownload.byteSize;
        const percent = expectedBytes > 0 ? bytesDownloaded / expectedBytes : 0;
        // Log every 10% to prevent flooding logcat, or log the first progress
        if (Math.floor(percent * 10) % 2 === 0 || percent < 0.05) {
          console.log(`DownloadScreen: progress -> ${Math.floor(percent * 100)}% (${bytesDownloaded}/${expectedBytes})`);
        }
        setProgress(percent);
        setDownloadedBytes(bytesDownloaded);
        setTotalBytes(expectedBytes);

        if (bytesDownloaded <= 0) {
          setSpeed('Starting');
          return;
        }

        // Calculate Speed
        const now = Date.now();
        const timeDiff = (now - lastTimeRef.current) / 1000; // in seconds
        if (bytesDownloaded < lastBytesRef.current) {
          lastBytesRef.current = bytesDownloaded;
          lastTimeRef.current = now;
          setSpeed('0 KB/s');
          return;
        }

        if (timeDiff > 0.5) { // update speed every 0.5s
          const bytesDiff = Math.max(bytesDownloaded - lastBytesRef.current, 0);
          setSpeed(formatDownloadSpeed(bytesDiff / timeDiff));
          
          lastTimeRef.current = now;
          lastBytesRef.current = bytesDownloaded;
        }
      }).done(({bytesDownloaded, bytesTotal}) => {
        console.log('DownloadScreen: Task done callback triggered!');
        AsyncStorage.removeItem('isDownloadPaused');
        if (!cancelled) {
          setProgress(1);
          setDownloadedBytes(bytesDownloaded);
          setTotalBytes(bytesTotal || selectedDownload.byteSize);
          setSpeed('Verifying');
        }
        completeHandler(safeTaskId);
        finishInstalledModel(bytesTotal || selectedDownload.byteSize)
          .then(() => {
            clearStallTimer();
            if (!cancelled) {
              setSpeed('Complete');
              onComplete();
            }
          })
          .catch(error => {
            console.error('DownloadScreen: downloaded model verification failed:', error);
            if (!cancelled) {
              setSpeed('Verification failed');
            }
          });
      }).error((error) => {
        clearStallTimer();
        console.error('DownloadScreen: Task error callback triggered:', error);
        if (!cancelled) {
          setSpeed('Failed');
          setShowFailedAlert(true);
        }
      });

      const storedPaused = await AsyncStorage.getItem('isDownloadPaused');
      if (activeTask.state === 'FAILED') {
        console.log('DownloadScreen: task state is FAILED, showing failure alert');
        setSpeed('Failed');
        setShowFailedAlert(true);
      } else if (activeTask.state === 'PAUSED' || storedPaused === 'true') {
        console.log('DownloadScreen: task is paused by user, maintaining paused state:', safeTaskId);
        const existingProgress = activeTask.bytesTotal > 0 ? activeTask.bytesDownloaded / activeTask.bytesTotal : 0;
        setProgress(existingProgress);
        setDownloadedBytes(activeTask.bytesDownloaded || 0);
        setTotalBytes(activeTask.bytesTotal || selectedDownload.byteSize);
        setIsPaused(true);
        setSpeed('Paused');
      } else if (activeTask.state === 'PENDING') {
        console.log('DownloadScreen: task is pending, starting now:', safeTaskId);
        setSpeed('Starting');
        activeTask.start();
      } else if (activeTask.bytesTotal > 0) {
        const existingProgress = activeTask.bytesDownloaded / activeTask.bytesTotal;
        setProgress(existingProgress);
        setDownloadedBytes(activeTask.bytesDownloaded);
        setTotalBytes(activeTask.bytesTotal);
        setSpeed(activeTask.bytesDownloaded > 0 ? 'Downloading' : 'Starting');
      }

      stallTimer = setTimeout(() => {
        const currentBytes = activeTask?.bytesDownloaded || lastBytesRef.current || 0;
        if (
          cancelled ||
          didRestartStalledTaskRef.current ||
          activeTask?.state === 'DONE' ||
          currentBytes > 0
        ) {
          return;
        }

        didRestartStalledTaskRef.current = true;
        console.log('DownloadScreen: no bytes received after connect timeout, recreating task:', safeTaskId);
        setSpeed('Restarting');
        setDownloadedBytes(0);
        setProgress(0);

        Promise.resolve(activeTask?.stop())
          .catch(error => {
            console.warn('DownloadScreen: error stopping stalled task:', error);
          })
          .finally(() => {
            if (!cancelled) {
              startDownload().catch(error => {
                console.error('DownloadScreen: stalled download restart failed:', error);
                setSpeed('Failed');
              });
            }
          });
      }, CONNECT_STALL_RESTART_MS);
    };

    startDownload().catch(error => {
      console.error('DownloadScreen: download flow failed:', error);
      setSpeed('Failed');
    });

    return () => {
      cancelled = true;
      clearStallTimer();
      // We do NOT pause/cancel the download on unmount. 
      // It stays running in the OS background daemon!
    };
  }, [onComplete, selectedDownload]);

  // Formatting helpers
  const formatBytes = (bytes: number) => (bytes / 1000 / 1000 / 1000).toFixed(2);
  const downloadedGB = formatBytes(downloadedBytes);
  const totalGB = formatBytes(totalBytes > 1 ? totalBytes : selectedDownload?.byteSize ?? 0);
  const percentText = `${Math.min(progress * 100, 100).toFixed(2)}`;
  const [percentWhole, percentDecimal] = percentText.split('.');
  const selectedFileName = selectedDownload?.fileName ?? 'Preparing model file';
  const quantization = selectedFileName.match(/(Q\d_[A-Z]_[A-Z]|Q\d_[A-Z]|IQ\d_[A-Z])/)?.[0] ?? 'Optimized GGUF';
  const ramLabel = selectedDownload?.minRam ? `${selectedDownload.minRam}GB+ RAM` : 'All RAM tiers';
  const installDetails = [
    {label: 'Format', value: 'GGUF'},
    {label: 'Quantization', value: quantization},
    {label: 'RAM target', value: ramLabel},
    {label: 'Mode', value: 'Offline local agent'},
  ];

  return (
    <View style={[styles.container, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.headerTitle}>Downloading Model</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gifStage}>
          <Image 
            source={require('../assets/mxj-files-watermelon-23023.gif')} 
            style={styles.gifImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.titleRow}>
          {selectedDownload?.logo ? (
            <Image
              source={renderModelLogoSource(selectedDownload.logo)}
              style={styles.modelTitleLogo}
              resizeMode="contain"
            />
          ) : null}
          <Text style={styles.title}>{selectedDownload?.name ?? 'AI Engine'}</Text>
        </View>
        <Text style={styles.subtitle}>
          {selectedDownload?.desc ?? 'Optimized neural network for private on-device use.'}
        </Text>

        <View style={styles.progressContainer}>
          <View style={styles.statsRow}>
            <Text style={styles.statsText}>{downloadedGB} GB / {totalGB} GB</Text>
            <Text style={[styles.speedText, isPaused && styles.speedPausedText]}>
              {isPaused ? 'Paused' : speed}
            </Text>
          </View>

          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, isPaused && styles.progressBarFillPaused, {width: `${Math.min(progress * 100, 100)}%`}]} />
          </View>
          
          <Text style={styles.percentageText}>
            <Text style={styles.percentageWhole}>{percentWhole}</Text>
            <Text style={styles.percentageDecimal}>.{percentDecimal}%</Text>
          </Text>

          <View style={styles.cardActionsRow}>
            <TouchableOpacity
              style={[styles.cardActionBtn, isPaused ? styles.cardResumeBtn : styles.cardPauseBtn]}
              activeOpacity={0.78}
              onPress={() => {
                if (isPaused) {
                  setShowResumeAlert(true);
                } else {
                  setShowPauseAlert(true);
                }
              }}>
              {isPaused ? (
                <>
                  <Play color="#34C759" size={15} strokeWidth={2.5} style={{marginRight: 6}} />
                  <Text style={styles.cardResumeText}>Resume</Text>
                </>
              ) : (
                <>
                  <Pause color="#FF9500" size={15} strokeWidth={2.5} style={{marginRight: 6}} />
                  <Text style={styles.cardPauseText}>Pause</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cardActionBtn, styles.cardCancelBtn]}
              activeOpacity={0.78}
              onPress={() => setShowCancelAlert(true)}>
              <Trash2 color="#FF453A" size={15} strokeWidth={2.5} style={{marginRight: 6}} />
              <Text style={styles.cardCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Installing local engine</Text>
          <Text style={styles.infoBody}>
            Rivo stores this model on your device and runs it offline after setup. The download continues in the background, even if you close the app.
          </Text>

          <View style={styles.detailGrid}>
            {installDetails.map(item => {
              // Custom Lucide Icon mapping
              let IconComponent = FileCode;
              let iconColor = '#0A84FF'; // Default neon blue
              let bgTint = '#121C2B'; // Solid deep navy
              let borderTint = 'rgba(10, 132, 255, 0.22)';

              if (item.label === 'Quantization') {
                IconComponent = Activity;
                iconColor = '#34C759'; // Neon green
                bgTint = '#122417'; // Solid deep green
                borderTint = 'rgba(52, 199, 89, 0.22)';
              } else if (item.label === 'RAM target') {
                IconComponent = Cpu;
                iconColor = '#FF9500'; // Amber/orange
                bgTint = '#241C12'; // Solid deep orange/amber
                borderTint = 'rgba(255, 149, 0, 0.22)';
              } else if (item.label === 'Mode') {
                IconComponent = ShieldCheck;
                iconColor = '#AF52DE'; // Purple
                bgTint = '#20152B'; // Solid deep purple
                borderTint = 'rgba(175, 82, 222, 0.22)';
              }

              return (
                <View style={[styles.detailItem, { backgroundColor: bgTint, borderColor: borderTint }]} key={item.label}>
                  <View style={styles.detailItemHeader}>
                    <IconComponent color={iconColor} size={15} strokeWidth={2.5} style={{marginRight: 6}} />
                    <Text style={styles.detailLabel}>{item.label}</Text>
                  </View>
                  <Text style={styles.detailValue}>{item.value}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.fileBlock}>
            <View style={styles.fileHeaderRow}>
              <FileText color="#0A84FF" size={15} strokeWidth={2.5} style={{marginRight: 6}} />
              <Text style={styles.fileLabel}>Model file</Text>
            </View>
            <Text style={styles.fileName} numberOfLines={2}>{selectedFileName}</Text>

            {downloadPath ? (
              <View style={styles.pathRow}>
                <View style={styles.pathHeaderRow}>
                  <Folder color="#0A84FF" size={13} strokeWidth={2.5} style={{marginRight: 6}} />
                  <Text style={styles.pathLabel}>Storage path (pwd)</Text>
                </View>
                <Text style={styles.pathText} numberOfLines={3} selectable={true}>
                  {downloadPath}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <ProfessionalAlert
        visible={showCancelAlert}
        title="Cancel Download?"
        message="Are you sure you want to stop downloading this model? Download progress will be removed."
        iconName="trash-2"
        confirmLabel="Yes"
        cancelLabel="No"
        isDestructive={true}
        onClose={() => setShowCancelAlert(false)}
        onConfirm={handleConfirmCancel}
      />

      <ProfessionalAlert
        visible={showPauseAlert}
        title="Pause Download?"
        message="Are you sure you want to pause downloading this model? You can resume anytime."
        iconName="alert-circle"
        confirmLabel="Yes"
        cancelLabel="No"
        isDestructive={false}
        onClose={() => setShowPauseAlert(false)}
        onConfirm={handleConfirmPause}
      />

      <ProfessionalAlert
        visible={showResumeAlert}
        title="Resume Download?"
        message="Do you want to resume downloading this model?"
        iconName="cpu"
        confirmLabel="Yes"
        cancelLabel="No"
        isDestructive={false}
        onClose={() => setShowResumeAlert(false)}
        onConfirm={handleConfirmResume}
      />

      <ProfessionalAlert
        visible={showFailedAlert}
        title="Download Failed"
        message="The model download could not be completed. Please select a model to try again."
        iconName="alert-circle"
        confirmLabel="Select Model"
        isDestructive={false}
        onClose={handleConfirmFailed}
        onConfirm={handleConfirmFailed}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    height: 54,
  },
  logo: {
    width: 30,
    height: 30,
    marginRight: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  cancelDownloadBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.25)',
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 18,
    marginBottom: 6,
  },
  cancelDownloadText: {
    color: '#FF453A',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 28,
    backgroundColor: '#000000',
  },
  gifStage: {
    width: 240,
    height: 120,
    marginTop: -8,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  modelTitleLogo: {
    width: 26,
    height: 26,
    borderRadius: 6,
    marginRight: 10,
  },
  title: {
    fontSize: 25,
    color: '#FFFFFF',
    fontFamily: 'SF-Pro-Rounded-Bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    fontFamily: 'SF-Pro-Rounded-Semibold',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 14,
  },
  progressContainer: {
    width: '100%',
    backgroundColor: '#121418',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    marginBottom: 16,
    shadowColor: '#FFFFFF',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  statsText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  speedText: {
    color: '#B7FF25',
    fontSize: 15,
    fontFamily: 'SF-Pro-Rounded-Heavy',
    textShadowColor: 'rgba(183, 255, 37, 0.4)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 6,
  },
  speedPausedText: {
    color: '#FF9500',
    textShadowColor: 'rgba(255, 149, 0, 0.4)',
  },
  progressBarBg: {
    width: '100%',
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0A84FF',
    borderRadius: 5,
    shadowColor: '#0A84FF',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  progressBarFillPaused: {
    backgroundColor: '#FF9500',
    shadowColor: '#FF9500',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    gap: 12,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardPauseBtn: {
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    borderColor: 'rgba(255, 149, 0, 0.28)',
  },
  cardResumeBtn: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    borderColor: 'rgba(52, 199, 89, 0.28)',
  },
  cardCancelBtn: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderColor: 'rgba(255, 69, 58, 0.28)',
  },
  cardPauseText: {
    color: '#FF9500',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  cardResumeText: {
    color: '#34C759',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  cardCancelText: {
    color: '#FF453A',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  percentageText: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  percentageWhole: {
    color: '#FFFFFF',
    fontSize: 36,
    fontFamily: 'SF-Pro-Rounded-Heavy',
  },
  percentageDecimal: {
    color: '#D1D1D6',
    fontSize: 24,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  infoSection: {
    width: '100%',
    backgroundColor: '#121214',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 2,
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'SF-Pro-Rounded-Bold',
    marginBottom: 8,
  },
  infoBody: {
    color: '#A1A1AA',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Semibold',
    lineHeight: 20,
    marginBottom: 18,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  detailItem: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  detailItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
  fileBlock: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 14,
  },
  fileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  fileLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  fileName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'SF-Pro-Rounded-Semibold',
  },
  pathRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  pathHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pathLabel: {
    color: '#8E8E93',
    fontSize: 10,
    fontFamily: 'SF-Pro-Rounded-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  pathText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'SF-Pro-Rounded-Medium',
    lineHeight: 17,
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
});

export default DownloadScreen;
