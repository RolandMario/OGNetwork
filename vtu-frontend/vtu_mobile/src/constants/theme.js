export const COLORS = {
  // Brand
  primary: '#0A2540', // Deep Navy Blue
  accent: '#00C897',  // Mint Teal

  // Backgrounds
  backgroundMain: '#F4F7FA', // Light Grey-Blue
  surfaceWhite: '#FFFFFF',

  // Text
  textPrimary: '#1A202C', // Near Black
  textSecondary: '#718096', // Slate Grey
  textWhite: '#FFFFFF',

  // Status
  error: '#E53E3E',
  success: '#00C897',
  border: '#E2E8F0',

  // Transparent
  transparentPrimary: 'rgba(10, 37, 64, 0.1)',
};

export const SIZES = {
  // Global sizes
  base: 8,
  font: 14,
  radius: 12, // Soft, modern feel
  padding: 24, // Generous padding for clean look

  // Font Sizes
  h1: 30,
  h2: 22,
  h3: 16,
  body1: 14,
  body2: 12,
};

export const FONTS = {
    // Assuming you link fonts like 'Inter-Bold', 'Inter-Regular'
    // For this example, we will use system fonts weighted correctly.
    bold: { fontWeight: '700' },
    semiBold: { fontWeight: '600' },
    medium: { fontWeight: '500' },
    regular: { fontWeight: '400' },
};

export const SHADOWS = {
  light: {
    shadowColor: COLORS.textPrimary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3, // Android
  },
  medium: {
    shadowColor: COLORS.textPrimary,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10, // Android
  },
};