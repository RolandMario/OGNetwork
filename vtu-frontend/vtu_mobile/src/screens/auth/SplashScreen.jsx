import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Image,
} from 'react-native';

import { COLORS, FONTS } from '../../constants/theme';

// ---------------------------------------------------------------------------
// SplashScreen
//
// Logo starts large (zoomed in) and scales DOWN to its normal size,
// with a fade-in, then always requests a fresh login.
//
// Sessions NEVER survive an app close: credentials are kept in memory only
// (services/session.js), so every open starts from the Login screen.
//
// If you have a logo image, place it at:
//   src/assets/images/logo.png
// and uncomment the <Image> block below — then remove the <Text> logo block.
// ---------------------------------------------------------------------------

const SplashScreen = ({ navigation }) => {
  const scaleAnim   = useRef(new Animated.Value(2.2)).current;  // starts zoomed in (2.2x)
  const opacityAnim = useRef(new Animated.Value(0)).current;    // starts invisible
  const taglineAnim = useRef(new Animated.Value(0)).current;    // tagline fades in after

  useEffect(() => {
    // 1. Zoom-out + fade-in animation for the logo
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Tagline fades in slightly after the logo settles
    Animated.timing(taglineAnim, {
      toValue: 1,
      duration: 600,
      delay: 900,
      useNativeDriver: true,
    }).start();

    // 3. After the animation completes, request a fresh login.
    //    (Sessions are never persisted, so the user must sign in again.)
    const timer = setTimeout(() => {
      navigation.replace('Login');
    }, 2200); // total splash duration

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/*
          OPTION A — Image logo (recommended)
          Place your logo file at src/assets/images/logo.png then uncomment:

          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        */}

        {/* OPTION B — Text logo (default, no image needed) */}
        <Text style={styles.logoText}>
          OG<Text style={styles.logoAccent}>NETWORK</Text>
        </Text>
      </Animated.View>

      <Animated.Text style={[styles.tagline, { opacity: taglineAnim }]}>
        Power, Data & Bills — All in One Place
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 160,
    height: 160,
  },
  logoText: {
    ...FONTS.bold,
    fontSize: 42,
    color: COLORS.textWhite,
    letterSpacing: 1,
  },
  logoAccent: {
    color: COLORS.accent || '#F5A623',
  },
  tagline: {
    ...FONTS.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 16,
    position: 'absolute',
    bottom: 60,
  },
});

export default SplashScreen;