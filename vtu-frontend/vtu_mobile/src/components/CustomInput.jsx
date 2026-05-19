import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';

const CustomInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  error,
  style,          // <--- New Prop: For the text input itself
  containerStyle,
  icon, // Optional right icon
  ...props
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, error && styles.inputError]}>
        <TextInput
          style={[styles.input, style]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textSecondary}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize="none"
          {...props} // <--- Spread other props here
        />
        {/* You can add an icon view here if passed via props */}
        {icon && <View style={styles.iconContainer}>{icon}</View>}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SIZES.padding * 0.8,
    
  },
  label: {
    ...FONTS.medium,
    fontSize: SIZES.body2,
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceWhite,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    height: 54, // Comfortable touch target
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    ...FONTS.regular,
    color: COLORS.textPrimary,
    fontSize: SIZES.body1,
    height: '100%',
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    ...FONTS.regular,
    fontSize: SIZES.body2 * 0.9,
    color: COLORS.error,
    marginTop: 4,
  },
  iconContainer: {
      paddingLeft: 10
  }
});

export default CustomInput;