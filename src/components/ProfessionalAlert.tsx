import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {AlertCircle, Cpu, HardDrive, LogOut, Power, Trash2} from 'lucide-react-native';

type AlertIconName = 'alert-circle' | 'cpu' | 'hard-drive' | 'log-out' | 'trash-2' | 'power';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  actionLabel?: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  iconName?: AlertIconName;
};

const iconMap = {
  'alert-circle': AlertCircle,
  cpu: Cpu,
  'hard-drive': HardDrive,
  'log-out': LogOut,
  'trash-2': Trash2,
  power: Power,
};

const ProfessionalAlert: React.FC<Props> = ({
  visible,
  title,
  message,
  actionLabel = 'Got it',
  onClose,
  onConfirm,
  confirmLabel,
  cancelLabel = 'Cancel',
  isDestructive = false,
  iconName = 'alert-circle',
}) => {
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;
  const resolvedIconName = iconName === 'alert-circle' && isDestructive ? 'log-out' : iconName;
  const Icon = iconMap[resolvedIconName] || AlertCircle;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.setValue(0);
      scale.setValue(0.5);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 15,
          stiffness: 280,
          mass: 0.6,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (mounted) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.5,
          duration: 180,
          easing: Easing.in(Easing.back(1.4)),
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [mounted, opacity, scale, visible]);

  const hasConfirm = typeof onConfirm === 'function';

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Animated.View style={[styles.host, {opacity}]}>
        <Animated.View style={[styles.card, {transform: [{scale}]}]}>
          <View style={[styles.iconWrap, isDestructive && styles.destructiveIconWrap]}>
            <Icon
              size={24}
              color={isDestructive ? '#FF453A' : '#FFD60A'}
              strokeWidth={2.5}
            />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {hasConfirm ? (
            <View style={styles.rowActions}>
              <TouchableOpacity activeOpacity={0.76} style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>{cancelLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.86}
                style={[styles.confirmBtn, isDestructive && styles.destructiveBtn]}
                onPress={onConfirm}>
                <Text style={[styles.confirmBtnText, isDestructive && styles.destructiveBtnText]}>
                  {confirmLabel || 'Confirm'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity activeOpacity={0.86} style={styles.action} onPress={onClose}>
              <Text style={styles.actionText}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  host: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 22,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 18},
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 214, 10, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.34)',
    marginBottom: 16,
  },
  destructiveIconWrap: {
    backgroundColor: 'rgba(255, 69, 58, 0.14)',
    borderColor: 'rgba(255, 69, 58, 0.34)',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 23,
    letterSpacing: 0,
    marginBottom: 8,
  },
  message: {
    color: '#A1A1A6',
    fontFamily: 'SF-Pro-Rounded-Semibold',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  action: {
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD60A',
  },
  actionText: {
    color: '#050505',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    letterSpacing: 0,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242426',
  },
  cancelBtnText: {
    color: '#E5E5EA',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD60A',
  },
  confirmBtnText: {
    color: '#050505',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 15,
  },
  destructiveBtn: {
    backgroundColor: '#FF453A',
  },
  destructiveBtnText: {
    color: '#FFFFFF',
  },
});

export default ProfessionalAlert;
