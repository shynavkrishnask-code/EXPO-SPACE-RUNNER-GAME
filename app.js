import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

// Screen dimensions — used for centering, boundaries, and detecting
// when the asteroid has fallen off the bottom of the screen.
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

// Spaceship sizing
const SHIP_WIDTH = 60;
const SHIP_HEIGHT = 40; // height of the body rectangle only
const SHIP_NOSE_HEIGHT = 20; // extra height added by the triangle nose on top
const SHIP_TOTAL_HEIGHT = SHIP_HEIGHT + SHIP_NOSE_HEIGHT; // used for collision box
const SHIP_BOTTOM_OFFSET = 140; // must match `bottom` in styles.shipWrapper

// How far the ship's TOP edge is from the TOP of the screen.
const SHIP_TOP_Y = SCREEN_HEIGHT - SHIP_BOTTOM_OFFSET - SHIP_TOTAL_HEIGHT;

const MOVE_STEP = 30; // pixels moved per button press

// Asteroid sizing and speed
const ASTEROID_SIZE = 40;
const FALL_SPEED = 6; // pixels the asteroid falls per game loop "tick"
const LOOP_INTERVAL_MS = 30; // how often the game loop updates (≈33 times/sec)

// Picks a random horizontal position for a new asteroid, making sure
// the whole asteroid stays on screen.
function getRandomAsteroidX() {
  return Math.random() * (SCREEN_WIDTH - ASTEROID_SIZE);
}

// Generate star coordinates for background parallax scrolling
const STAR_COUNT = 45;
const BACKGROUND_STARS = Array.from({ length: STAR_COUNT }).map((_, i) => ({
  id: i,
  x: Math.random() * SCREEN_WIDTH,
  y: Math.random() * SCREEN_HEIGHT,
  size: Math.random() * 2.2 + 0.8, // star size between 0.8px and 3px
  opacity: Math.random() * 0.7 + 0.3,
}));

export default function App() {
  // --- STATE ---
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const [shipX, setShipX] = useState((SCREEN_WIDTH - SHIP_WIDTH) / 2);

  // The asteroid's position is a single object holding both x and y,
  // since they always change together as part of the same falling motion.
  const [asteroid, setAsteroid] = useState({ x: getRandomAsteroidX(), y: 0 });

  // --- ANIMATIONS ---
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const flameAnim = useRef(new Animated.Value(1)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;

  // Star background scrolling loop
  useEffect(() => {
    Animated.loop(
      Animated.timing(scrollAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // Engine flame flickering loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(flameAnim, {
          toValue: 0.4,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(flameAnim, {
          toValue: 1.1,
          duration: 70,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Pulsing Start/Restart button loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(buttonPulse, {
          toValue: 1.05,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(buttonPulse, {
          toValue: 0.95,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // --- REF ---
  // Why we need a ref here:
  // The game loop below runs inside a setInterval, which "captures" the
  // value of shipX at the moment the interval was created. If shipX
  // changes later (because the player pressed Move Left/Right), the
  // running interval would still see the OLD value unless we either
  // (a) restart the interval every time shipX changes, or
  // (b) store shipX somewhere that isn't tied to the render cycle.
  // A ref (`useRef`) is a box that persists across renders and can be
  // read/written at any time WITHOUT causing a re-render. We keep
  // shipXRef always in sync with shipX, and the game loop reads from
  // the ref instead of directly from the shipX variable.
  const shipXRef = useRef(shipX);
  const savedHighScoreRef = useRef(0);

  useEffect(() => {
    shipXRef.current = shipX;
  }, [shipX]);

  // --- LOAD HIGH SCORE ON MOUNT ---
  useEffect(() => {
    const loadHighScore = async () => {
      try {
        const value = await AsyncStorage.getItem('@space_escape_high_score');
        if (value !== null) {
          const parsed = parseInt(value, 10);
          setHighScore(parsed);
          savedHighScoreRef.current = parsed;
        }
      } catch (e) {
        console.error('Failed to load high score from storage:', e);
      }
    };
    loadHighScore();
  }, []);

  // --- REAL-TIME HIGH SCORE SYNC ---
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
    }
  }, [score, highScore]);

  // --- SAVE HIGH SCORE ON GAME OVER ---
  useEffect(() => {
    if (gameOver && score > savedHighScoreRef.current) {
      const saveHighScore = async () => {
        try {
          await AsyncStorage.setItem('@space_escape_high_score', score.toString());
          savedHighScoreRef.current = score;
        } catch (e) {
          console.error('Failed to save high score to storage:', e);
        }
      };
      saveHighScore();
    }
  }, [gameOver, score]);

  // --- START / RESTART GAME ---
  function handleStartGame() {
    setScore(0);
    setShipX((SCREEN_WIDTH - SHIP_WIDTH) / 2);
    setGameOver(false);
    setAsteroid({ x: getRandomAsteroidX(), y: 0 });
    setGameStarted(true);
  }

  // --- MOVEMENT ---
  function moveLeft() {
    if (!gameStarted || gameOver) return; // ignore taps if game isn't active
    setShipX((prevX) => Math.max(0, prevX - MOVE_STEP));
  }

  function moveRight() {
    if (!gameStarted || gameOver) return;
    setShipX((prevX) => {
      const maxX = SCREEN_WIDTH - SHIP_WIDTH;
      return Math.min(maxX, prevX + MOVE_STEP);
    });
  }

  // --- GAME LOOP ---
  // This effect sets up a repeating timer (setInterval) that acts as our
  // "game loop" — a function that runs over and over, many times per
  // second, updating the game's state a little bit each time.
  useEffect(() => {
    // If the game hasn't started yet, or it's already over, don't run
    // the loop at all.
    if (!gameStarted || gameOver) {
      return;
    }

    const intervalId = setInterval(() => {
      // We use the "updater function" form of setAsteroid so we always
      // work from the true latest asteroid position, not a stale one.
      setAsteroid((prevAsteroid) => {
        const newY = prevAsteroid.y + FALL_SPEED;

        // --- COLLISION DETECTION ---
        // Two rectangles (the ship's box and the asteroid's box) are
        // "overlapping" only if ALL four of these are true at once:
        //   1. The asteroid's left edge is to the LEFT of the ship's right edge
        //   2. The asteroid's right edge is to the RIGHT of the ship's left edge
        //   3. The asteroid's top edge is ABOVE the ship's bottom edge
        //   4. The asteroid's bottom edge is BELOW the ship's top edge
        // If any one of these is false, the boxes can't possibly be
        // touching, because one is fully to the side of (or above/below)
        // the other. This is the standard "AABB" (Axis-Aligned Bounding
        // Box) collision test used in most simple 2D games.
        const shipLeft = shipXRef.current;
        const shipRight = shipLeft + SHIP_WIDTH;
        const shipTop = SHIP_TOP_Y;
        const shipBottom = SHIP_TOP_Y + SHIP_TOTAL_HEIGHT;

        const asteroidLeft = prevAsteroid.x;
        const asteroidRight = prevAsteroid.x + ASTEROID_SIZE;
        const asteroidTop = newY;
        const asteroidBottom = newY + ASTEROID_SIZE;

        const isColliding =
          asteroidLeft < shipRight &&
          asteroidRight > shipLeft &&
          asteroidTop < shipBottom &&
          asteroidBottom > shipTop;

        if (isColliding) {
          // Collision! End the game and freeze the asteroid exactly
          // where it was (don't let it keep moving after game over).
          setGameOver(true);
          return prevAsteroid;
        }

        // --- REACHED THE BOTTOM WITHOUT COLLIDING ---
        if (newY > SCREEN_HEIGHT) {
          // Reward the player for dodging it, then spawn a brand new
          // asteroid back at the top with a fresh random x position.
          setScore((prevScore) => prevScore + 1);
          return { x: getRandomAsteroidX(), y: 0 };
        }

        // Otherwise, just move the asteroid further down.
        return { x: prevAsteroid.x, y: newY };
      });
    }, LOOP_INTERVAL_MS);

    // Cleanup function: React calls this automatically whenever the
    // effect re-runs or the component unmounts. Without this, old
    // intervals would keep running in the background forever, causing
    // multiple loops to stack up and the game to speed up uncontrollably.
    return () => clearInterval(intervalId);
  }, [gameStarted, gameOver]); // re-run this effect only when these change

  // --- RENDER ---
  return (
    <LinearGradient
      colors={['#050814', '#0D0E29', '#1C0C2D']}
      style={styles.container}
    >
      {/* Drifting space stars background (parallax panels) */}
      <Animated.View
        style={[
          styles.starPanel,
          {
            transform: [{ translateY: scrollAnim }],
          },
        ]}
        pointerEvents="none"
      >
        {BACKGROUND_STARS.map((star) => (
          <View
            key={star.id}
            style={[
              styles.star,
              {
                left: star.x,
                top: star.y,
                width: star.size,
                height: star.size,
                borderRadius: star.size / 2,
                opacity: star.opacity,
              },
            ]}
          />
        ))}
      </Animated.View>

      <Animated.View
        style={[
          styles.starPanel,
          {
            transform: [
              {
                translateY: Animated.add(scrollAnim, -SCREEN_HEIGHT),
              },
            ],
          },
        ]}
        pointerEvents="none"
      >
        {BACKGROUND_STARS.map((star) => (
          <View
            key={`dup-${star.id}`}
            style={[
              styles.star,
              {
                left: star.x,
                top: star.y,
                width: star.size,
                height: star.size,
                borderRadius: star.size / 2,
                opacity: star.opacity,
              },
            ]}
          />
        ))}
      </Animated.View>

      <Text style={styles.title}>Space Escape Runner</Text>

      <View style={styles.scoreContainer}>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Score</Text>
          <Text style={styles.scoreValue}>{score}</Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Best</Text>
          <Text style={styles.highScoreValue}>{highScore}</Text>
        </View>
      </View>

      <Animated.View style={{ transform: [{ scale: buttonPulse }] }}>
        <TouchableOpacity style={styles.startButton} onPress={handleStartGame}>
          <Text style={styles.startButtonText}>
            {gameStarted ? 'Restart Game' : 'Start Game'}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Only show the falling asteroid while a game is actually in progress */}
      {gameStarted && (
        <View
          style={[
            styles.asteroid,
            { left: asteroid.x, top: asteroid.y },
          ]}
        >
          {/* Craters */}
          <View style={[styles.crater, { top: 6, left: 8, width: 8, height: 8 }]} />
          <View style={[styles.crater, { top: 18, left: 22, width: 10, height: 10 }]} />
          <View style={[styles.crater, { top: 24, left: 7, width: 6, height: 6 }]} />
          
          {/* Highlights for 3D look */}
          <View style={styles.asteroidGlow} />
        </View>
      )}

      {/* Spaceship */}
      <View style={[styles.shipWrapper, { left: shipX }]}>
        {/* Glow engine flame */}
        <Animated.View
          style={[
            styles.flameOuter,
            {
              transform: [
                { scaleY: flameAnim },
                { scaleX: Animated.multiply(flameAnim, 0.9) },
              ],
              opacity: Animated.multiply(flameAnim, 0.8),
            },
          ]}
        />
        <Animated.View
          style={[
            styles.flameInner,
            {
              transform: [
                { scaleY: flameAnim },
              ],
              opacity: flameAnim,
            },
          ]}
        />

        {/* Ship parts */}
        <View style={styles.nose} />
        <View style={styles.shipRow}>
          <View style={styles.wingLeft}>
            <View style={styles.wingAccentLeft} />
          </View>
          <View style={styles.body}>
            {/* Cockpit glass */}
            <View style={styles.cockpit} />
          </View>
          <View style={styles.wingRight}>
            <View style={styles.wingAccentRight} />
          </View>
        </View>
      </View>

      {/* Movement controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={moveLeft}>
          <Text style={styles.controlButtonText}>◀ Move Left</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton} onPress={moveRight}>
          <Text style={styles.controlButtonText}>Move Right ▶</Text>
        </TouchableOpacity>
      </View>

      {/* Game Over overlay — only appears after a collision */}
      {gameOver && (
        <View style={styles.overlay}>
          <View style={styles.gameOverBox}>
            <Text style={styles.gameOverText}>Game Over</Text>
            <Text style={styles.finalScoreText}>Final Score: {score}</Text>
            {score === highScore && score > 0 ? (
              <Text style={styles.newHighScoreText}>🎉 New High Score! 🎉</Text>
            ) : (
              <Text style={styles.highScoreText}>Best Score: {highScore}</Text>
            )}
            <Animated.View style={{ transform: [{ scale: buttonPulse }] }}>
              <TouchableOpacity style={styles.restartButton} onPress={handleStartGame}>
                <Text style={styles.startButtonText}>Restart Game</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
  },

  starPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },

  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#00E5FF',
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 229, 255, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  scoreContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
    marginTop: 24,
    backgroundColor: 'rgba(27, 31, 59, 0.5)',
    borderColor: 'rgba(0, 229, 255, 0.3)',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  scoreBox: {
    alignItems: 'center',
    flex: 1,
  },
  scoreLabel: {
    fontSize: 12,
    color: '#9AA0C3',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#00E5FF',
    marginTop: 2,
  },
  highScoreValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFD700',
    marginTop: 2,
  },

  startButton: {
    marginTop: 24,
    backgroundColor: '#00E5FF',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 30,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 8,
  },
  restartButton: {
    marginTop: 12,
    backgroundColor: '#FF4D6D',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 30,
    shadowColor: '#FF4D6D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 8,
  },
  startButtonText: {
    color: '#0B0E23',
    fontWeight: '800',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // --- Asteroid ---
  asteroid: {
    position: 'absolute',
    width: ASTEROID_SIZE,
    height: ASTEROID_SIZE,
    borderRadius: ASTEROID_SIZE / 2,
    backgroundColor: '#726D82',
    borderWidth: 2,
    borderColor: '#4A4756',
    shadowColor: '#FF3D00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 6,
  },
  crater: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: '#403D4C',
  },
  asteroidGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: ASTEROID_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },

  // --- Spaceship ---
  shipWrapper: {
    position: 'absolute',
    bottom: SHIP_BOTTOM_OFFSET,
    alignItems: 'center',
  },
  shipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nose: {
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderBottomWidth: SHIP_NOSE_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#00E5FF',
    zIndex: 2,
  },
  body: {
    width: SHIP_WIDTH - 20,
    height: SHIP_HEIGHT,
    backgroundColor: '#ECEFF1',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#00E5FF',
    zIndex: 1,
  },
  cockpit: {
    width: 14,
    height: 18,
    backgroundColor: '#00E5FF',
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'center',
    opacity: 0.8,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  wingLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderRightWidth: 16,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#FF4D6D',
    marginRight: -2,
    zIndex: 0,
  },
  wingAccentLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderRightWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#00E5FF',
    position: 'absolute',
    top: -4,
    right: -14,
  },
  wingRight: {
    width: 0,
    height: 0,
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderLeftWidth: 16,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FF4D6D',
    marginLeft: -2,
    zIndex: 0,
  },
  wingAccentRight: {
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#00E5FF',
    position: 'absolute',
    top: -4,
    left: -14,
  },
  flameOuter: {
    position: 'absolute',
    bottom: -22,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 26,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FF3D00',
  },
  flameInner: {
    position: 'absolute',
    bottom: -14,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFEA00',
  },

  // --- Controls ---
  controls: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
  },
  controlButton: {
    backgroundColor: 'rgba(27, 31, 59, 0.6)',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.5)',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  // --- Game Over overlay ---
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 8, 20, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gameOverBox: {
    backgroundColor: 'rgba(27, 31, 59, 0.75)',
    borderWidth: 2,
    borderColor: '#FF4D6D',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    shadowColor: '#FF4D6D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  gameOverText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FF4D6D',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  finalScoreText: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 12,
  },
  newHighScoreText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFD700',
    marginBottom: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
  },
  highScoreText: {
    fontSize: 18,
    color: '#9AA0C3',
    fontWeight: '600',
    marginBottom: 24,
  },
});