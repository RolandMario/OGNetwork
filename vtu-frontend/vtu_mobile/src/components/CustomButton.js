import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';

const CustomButton = ({ label, onPress, isLoading, variant = 'primary', disabled }) => {
  const isPrimary = variant === 'primary';

  const containerStyles = [
    styles.container,
    isPrimary ? styles.primaryContainer : styles.secondaryContainer,
    (disabled || isLoading) && styles.disabledContainer
  ];

  const textStyles = [
    styles.label,
    isPrimary ? styles.primaryLabel : styles.secondaryLabel
  ];

  return (
    <TouchableOpacity
      style={containerStyles}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled || isLoading}
    >
      {isLoading ? (
        <ActivityIndicator color={isPrimary ? COLORS.textWhite : COLORS.primary} />
      ) : (
        <Text style={textStyles}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 54,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SIZES.padding * 0.5,
  },
  primaryContainer: {
    backgroundColor: COLORS.accent, // Teal
    // Optional: Add subtle shadow for pop
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  secondaryContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  disabledContainer: {
      opacity: 0.6,
  },
  label: {
    ...FONTS.semiBold,
    fontSize: SIZES.h3,
  },
  primaryLabel: {
    color: COLORS.textWhite,
  },
  secondaryLabel: {
    color: COLORS.primary,
  },
});

export default CustomButton;