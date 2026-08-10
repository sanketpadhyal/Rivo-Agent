import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';

type LoaderProps = {
  size?: number;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
};

const DOTS = [0, 1, 2];

export default function Loader({
  size = 16,
  trackColor = '#89B4FA',
  style,
}: LoaderProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const dotSize = Math.max(5, Math.round(size * 0.22));
  const gap = Math.max(4, Math.round(size * 0.12));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 780,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 780,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[styles.frame, {height: size, gap}, style]}>
      {DOTS.map((dot) => {
        const offset = dot / DOTS.length;
        const inputRange = [0, offset, Math.min(offset + 0.34, 1), 1];

        return (
          <Animated.View
            key={dot}
            style={[
              styles.dot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: trackColor,
                opacity: progress.interpolate({
                  inputRange,
                  outputRange: [0.36, 0.36, 1, 0.36],
                }),
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange,
                      outputRange: [0, 0, -dotSize * 0.55, 0],
                    }),
                  },
                  {
                    scale: progress.interpolate({
                      inputRange,
                      outputRange: [0.86, 0.86, 1.12, 0.86],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    backfaceVisibility: 'hidden',
  },
});
