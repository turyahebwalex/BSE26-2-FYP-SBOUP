import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Worker Screens
import WorkerDashboardScreen from '../screens/worker/WorkerDashboardScreen';
import DiscoverScreen from '../screens/worker/DiscoverScreen';
import OpportunityDetailScreen from '../screens/worker/OpportunityDetailScreen';
import ApplicationsScreen from '../screens/worker/ApplicationsScreen';
import GenerateCVScreen from '../screens/worker/GenerateCVScreen';
import LearningScreen from '../screens/worker/LearningScreen';

// Shared Screens
import MessagesScreen from '../screens/shared/MessagesScreen';
import ChatScreen from '../screens/shared/ChatScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';
import EditProfileScreen from '../screens/shared/EditProfileScreen';
import NotificationsScreen from '../screens/shared/NotificationsScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const DiscoverStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

const screenOptions = {
  headerShown: false,
  animation: 'slide_from_right',
};

const HomeStackScreen = () => (
  <HomeStack.Navigator screenOptions={screenOptions}>
    <HomeStack.Screen name="WorkerDashboard" component={WorkerDashboardScreen} />
    <HomeStack.Screen name="OpportunityDetail" component={OpportunityDetailScreen} />
    <HomeStack.Screen name="Applications" component={ApplicationsScreen} />
    <HomeStack.Screen name="GenerateCV" component={GenerateCVScreen} />
    <HomeStack.Screen name="Learning" component={LearningScreen} />
  </HomeStack.Navigator>
);

const DiscoverStackScreen = () => (
  <DiscoverStack.Navigator screenOptions={screenOptions}>
    <DiscoverStack.Screen name="DiscoverMain" component={DiscoverScreen} />
    <DiscoverStack.Screen name="OpportunityDetail" component={OpportunityDetailScreen} />
  </DiscoverStack.Navigator>
);

const MessagesStackScreen = () => (
  <MessagesStack.Navigator screenOptions={screenOptions}>
    <MessagesStack.Screen name="MessagesMain" component={MessagesScreen} />
    <MessagesStack.Screen name="Chat" component={ChatScreen} />
  </MessagesStack.Navigator>
);

const ProfileStackScreen = () => (
  <ProfileStack.Navigator screenOptions={screenOptions}>
    <ProfileStack.Screen name="Profile" component={ProfileScreen} />
    <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
    <ProfileStack.Screen name="Notifications" component={NotificationsScreen} />
  </ProfileStack.Navigator>
);

const WorkerTabs = () => {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#F97316',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingBottom: insets.bottom,
          paddingTop: 6,
          height: 56 + insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'HomeTab') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Discover') {
            iconName = focused ? 'compass' : 'compass-outline';
          } else if (route.name === 'MessagesTab') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'ProfileTab') {
            iconName = focused ? 'person' : 'person-outline';
          }
          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverStackScreen}
        options={{ tabBarLabel: 'Discover' }}
      />
      <Tab.Screen
        name="MessagesTab"
        component={MessagesStackScreen}
        options={{ tabBarLabel: 'Messages' }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

export default WorkerTabs;
