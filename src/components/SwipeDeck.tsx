import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import VenueCard from './VenueCard';
import NativeAdCard from '../ads/NativeAdCard';
import { useTheme } from '../theme/ThemeContext';
import type { DeckItem, SwipeDirection, VenueWithId } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.32;
const FLING_VELOCITY = 800;
const OFFSCREEN_X = SCREEN_WIDTH * 1.4;

export interface SwipeDeckHandle {
  swipeLeft: () => void;
  swipeRight: () => void;
  /**
   * Pro Rewind: steps back to the previously swiped VENUE card (ad slots are
   * skipped — dismissed ads never return) and animates it back into place.
   * Returns false when there is nothing to rewind to.
   */
  rewind: () => boolean;
}

interface SwipeDeckProps {
  items: DeckItem[];
  onSwiped: (item: DeckItem, direction: SwipeDirection) => void;
  onDeckEmpty?: () => void;
  /** Upward fling on a VENUE card — opens the details sheet. Never fires for ads. */
  onSwipeUp?: (venue: VenueWithId) => void;
}

/**
 * Tinder-style gesture deck (reanimated + gesture-handler). Renders venues
 * and native ad slots. The top card tracks the finger with rotation; past-
 * threshold or fling releases fly off and report the swipe, anything else
 * springs back. The ✕/♥ buttons drive the exact same animation via the
 * imperative handle — they only ever animate OUR card view.
 *
 * Ad-card compliance: swiping an ad card dismisses it through this pan
 * gesture without any interaction reaching the ad SDK; LIKE/NOPE stamps and
 * the swipe-up gesture are disabled while an ad is on top so nothing overlays
 * or reinterprets the ad (see NativeAdCard for the full compliance notes).
 */
const SwipeDeck = forwardRef<SwipeDeckHandle, SwipeDeckProps>(function SwipeDeck(
  { items, onSwiped, onDeckEmpty, onSwipeUp },
  ref
) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Fresh deck → reset position and pointer.
  useEffect(() => {
    indexRef.current = 0;
    setIndex(0);
    translateX.value = 0;
    translateY.value = 0;
  }, [items, translateX, translateY]);

  // Called (on the JS thread) once the fly-off animation lands. Kept fresh in
  // a ref so the worklet can hold one stable callback.
  const completeSwipeRef = useRef<(direction: SwipeDirection) => void>(() => {});
  completeSwipeRef.current = (direction) => {
    const current = indexRef.current;
    const item = items[current];
    if (item) onSwiped(item, direction);
    const next = current + 1;
    indexRef.current = next;
    setIndex(next);
    translateX.value = 0;
    translateY.value = 0;
    if (next >= items.length) onDeckEmpty?.();
  };
  const completeSwipe = useCallback((direction: SwipeDirection) => {
    completeSwipeRef.current(direction);
  }, []);

  const flingOff = useCallback(
    (direction: SwipeDirection) => {
      'worklet';
      const sign = direction === 'right' ? 1 : -1;
      translateX.value = withTiming(
        sign * OFFSCREEN_X,
        { duration: 240 },
        (finished) => {
          if (finished) runOnJS(completeSwipe)(direction);
        }
      );
    },
    [translateX, completeSwipe]
  );

  useImperativeHandle(ref, () => ({
    swipeLeft: () => runOnUI(flingOff)('left'),
    swipeRight: () => runOnUI(flingOff)('right'),
    rewind: () => {
      // Walk back past any ad slots to the previous venue card.
      let target = indexRef.current - 1;
      while (target >= 0 && items[target]?.kind === 'ad') target -= 1;
      if (target < 0) return false;
      indexRef.current = target;
      setIndex(target);
      // Re-enter from off-screen with a spring — mirrors the fly-off feel.
      translateY.value = 0;
      translateX.value = -OFFSCREEN_X;
      translateX.value = withSpring(0, { damping: 18, stiffness: 140 });
      return true;
    },
  }));

  const topItem = items[index];
  const nextItem = items[index + 1];
  const topIsVenue = topItem?.kind === 'venue';

  // Horizontal-intent only: activating on ±16px of X and failing after ±28px
  // of Y leaves vertical movement free for the swipe-up details fling and
  // plain taps free for the card's media cycling.
  const pan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-28, 28])
    .onChange((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const past =
        Math.abs(event.translationX) > SWIPE_THRESHOLD ||
        Math.abs(event.velocityX) > FLING_VELOCITY;
      if (past) {
        flingOff(event.translationX >= 0 ? 'right' : 'left');
      } else {
        translateX.value = withSpring(0, { damping: 16, stiffness: 160 });
        translateY.value = withSpring(0, { damping: 16, stiffness: 160 });
      }
    });

  // Fired on the JS thread from the fling gesture; ref-based so the worklet
  // keeps one stable callback.
  const emitSwipeUpRef = useRef<() => void>(() => {});
  emitSwipeUpRef.current = () => {
    const item = items[indexRef.current];
    if (item?.kind === 'venue' && onSwipeUp) onSwipeUp(item.venue);
  };
  const emitSwipeUp = useCallback(() => emitSwipeUpRef.current(), []);

  const flingUp = Gesture.Fling()
    .direction(Directions.UP)
    .enabled(topIsVenue) // no swipe-up interaction over ad cards
    .onStart(() => {
      runOnJS(emitSwipeUp)();
    });

  const cardGesture = Gesture.Race(flingUp, pan);

  const topCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
          [-12, 0, 12]
        )}deg`,
      },
    ],
  }));

  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [16, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const nopeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -16],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  // The card beneath grows into place as the top card departs.
  const nextCardStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { scale: interpolate(progress, [0, 1], [0.94, 1]) },
        { translateY: interpolate(progress, [0, 1], [14, 0]) },
      ],
    };
  });

  if (!topItem) return null;

  return (
    <>
      {nextItem && (
        <Animated.View
          key={nextItem.id}
          style={[styles.cardWrap, nextCardStyle]}
          pointerEvents="none"
        >
          <DeckCard item={nextItem} />
        </Animated.View>
      )}
      <GestureDetector gesture={cardGesture}>
        <Animated.View key={topItem.id} style={[styles.cardWrap, topCardStyle]}>
          <DeckCard item={topItem} />
          {/* Stamps are venue-only: nothing may overlay a native ad. */}
          {topIsVenue && (
            <>
              <Animated.View
                style={[styles.stamp, styles.stampLike, { borderColor: colors.like }, likeStampStyle]}
              >
                <Text style={[styles.stampText, { color: colors.like }]}>LIKE</Text>
              </Animated.View>
              <Animated.View
                style={[styles.stamp, styles.stampNope, { borderColor: colors.nope }, nopeStampStyle]}
              >
                <Text style={[styles.stampText, { color: colors.nope }]}>NOPE</Text>
              </Animated.View>
            </>
          )}
        </Animated.View>
      </GestureDetector>
    </>
  );
});

function DeckCard({ item }: { item: DeckItem }) {
  return item.kind === 'venue' ? <VenueCard venue={item.venue} /> : <NativeAdCard />;
}

export default SwipeDeck;

const styles = StyleSheet.create({
  cardWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  stamp: {
    position: 'absolute',
    top: 28,
    borderWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stampLike: {
    left: 24,
    transform: [{ rotate: '-12deg' }],
  },
  stampNope: {
    right: 24,
    transform: [{ rotate: '12deg' }],
  },
  stampText: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
