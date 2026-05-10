import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Asset } from 'expo-asset';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthStack from './src/navigation/AuthStack';
import WorkerTabs from './src/navigation/WorkerTabs';
import EmployerTabs from './src/navigation/EmployerTabs';
import LoadingScreen from './src/components/LoadingScreen';

// Keep the native splash up until our JS-level LoadingScreen is ready to
// take over. On restricted networks the Expo manifest can't always resolve
// the splash image URL (it tries to upload to api.expo.dev and aborts), so
// the native splash may flash blank. Pre-loading the logo via require() +
// expo-asset guarantees LoadingScreen has it cached the moment JS renders.
SplashScreen.preventAutoHideAsync().catch(() => {});

const LOGO = require('./assets/skillbridge_logo_transparent.png');

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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Asset.fromModule(LOGO).downloadAsync();
      } catch {
        // Asset is bundled by Metro from require(); even if download fails
        // (e.g. offline), it'll render correctly inside <Image>. Don't block.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hand off from native splash to our JS-level LoadingScreen as soon as the
  // logo asset is in place. Wrapped in onLayout so SplashScreen.hideAsync()
  // is only called after the first frame has been laid out — avoids the
  // flash-of-blank between native splash dismissal and React rendering.
  const onLayout = React.useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider onLayout={onLayout}>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
};

export default App;
