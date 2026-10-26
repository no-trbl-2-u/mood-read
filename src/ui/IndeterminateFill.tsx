import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useReduceMotion } from "./motion";
import { colors, motion } from "./theme";

// The fill of a progress track whose total is not known yet (A25): a short bar that slides along it, so a running
// download never reads as full or as stuck. With reduce-motion on it sits still at the start of the track.
const SEGMENT = 0.35;

export function IndeterminateFill() {
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion || width === 0) return;
    x.setValue(0);
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: motion.indeterminateSweep, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, width, x]);

  const segment = width * SEGMENT;
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-segment, width] });
  return (
    <View testID="indeterminate-fill" style={styles.fill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.segment, { width: `${SEGMENT * 100}%` }, !reduceMotion && { transform: [{ translateX }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { height: "100%", width: "100%", overflow: "hidden" },
  segment: { height: "100%", backgroundColor: colors.accent },
});
