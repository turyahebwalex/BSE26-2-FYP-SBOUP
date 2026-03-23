import 'react-native-url-polyfill/auto';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthStack from './src/navigation/AuthStack';
import WorkerTabs from './src/navigation/WorkerTabs';
import EmployerTabs from './src/navigation/EmployerTabs';
import LoadingScreen from './src/components/LoadingScreen';

const AppNavigator = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthStack />;
  }

  if (user.role === 'employer') {
    return <EmployerTabs />;
  }

  // Default to worker tabs (skilled_worker or any other role)
  return <WorkerTabs />;
};

const App = () => {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
};

export default App;
