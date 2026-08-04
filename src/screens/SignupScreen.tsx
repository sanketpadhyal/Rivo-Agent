import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { Colors } from '../theme/colors';

interface Props {
  onSignup: () => void;
  onGoToLogin: () => void;
}

const SignupScreen: React.FC<Props> = ({ onSignup, onGoToLogin }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Signup Screen (Placeholder)</Text>
      <Button title="Sign Up" onPress={onSignup} />
      <Button title="Go to Login" onPress={onGoToLogin} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  text: {
    color: Colors.textPrimary,
    marginBottom: 20,
    fontSize: 20,
  },
});

export default SignupScreen;
