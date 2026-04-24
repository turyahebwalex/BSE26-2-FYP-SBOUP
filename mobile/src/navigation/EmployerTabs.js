import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Employer Screens
import EmployerDashboardScreen from '../screens/employer/EmployerDashboardScreen';
import PostOpportunityScreen from '../screens/employer/PostOpportunityScreen';
import ManageOpportunitiesScreen from '../screens/employer/ManageOpportunitiesScreen';
import ViewApplicationsScreen from '../screens/employer/ViewApplicationsScreen';

// Shared Screens
import MessagesScreen from '../screens/shared/MessagesScreen';
import ChatScreen from '../screens/shared/ChatScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';
import EditProfileScreen from '../screens/shared/EditProfileScreen';
import NotificationsScreen from '../screens/shared/NotificationsScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const PostStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

const screenOptions = {
  headerShown: false,
  animation: 'slide_from_right',
};

const HomeStackScreen = () => (
  <HomeStack.Navigator screenOptions={screenOptions}>
    <HomeStack.Screen name="EmployerDashboard" component={EmployerDashboardScreen} />
    <HomeStack.Screen name="ManageOpportunities" component={ManageOpportunitiesScreen} />
    <HomeStack.Screen name="ViewApplications" component={ViewApplicationsScreen} />
  </HomeStack.Navigator>
);

const PostStackScreen = () => (
  <PostStack.Navigator screenOptions={screenOptions}>
    <PostStack.Screen name="PostOpportunity" component={PostOpportunityScreen} />
  </PostStack.Navigator>
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

const EmployerTabs = () => {
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
          } else if (route.name === 'PostTab') {
            iconName = focused ? 'add-circle' : 'add-circle-outline';
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
        name="PostTab"
        component={PostStackScreen}
        options={{ tabBarLabel: 'Post' }}
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

export default EmployerTabs;
