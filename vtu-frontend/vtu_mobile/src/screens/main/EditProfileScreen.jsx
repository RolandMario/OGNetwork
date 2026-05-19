import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, FONTS } from '../../constants/theme';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';

const EditProfileScreen = ({ navigation }) => {
  const [name, setName] = useState('User Account');
  const [email, setEmail] = useState('user@example.com');
  const [phone, setPhone] = useState('07068497568');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    // Simulate API Call
    setTimeout(() => {
      setLoading(false);
      Alert.alert("Success", "Profile updated successfully");
      navigation.goBack();
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.form}>
        <CustomInput 
          label="Full Name" 
          value={name} 
          onChangeText={setName} 
          icon={<Ionicons name="person-outline" size={20} color={COLORS.gray} />}
        />
        <CustomInput 
          label="Email Address" 
          value={email} 
          editable={false} // Usually emails are not editable for security
          icon={<Ionicons name="mail-outline" size={20} color={COLORS.gray} />}
        />
        <CustomInput 
          label="Phone Number" 
          value={phone} 
          onChangeText={setPhone} 
          keyboardType="phone-pad"
          icon={<Ionicons name="call-outline" size={20} color={COLORS.gray} />}
        />

        <View style={{ marginTop: 30 }}>
          <CustomButton 
            label="Save Changes" 
            onPress={handleUpdate} 
            isLoading={loading}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundMain },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 20 
  },
  headerTitle: { ...FONTS.bold, fontSize: 18 },
  form: { padding: 20 }
});

export default EditProfileScreen;