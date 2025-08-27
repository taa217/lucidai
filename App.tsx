import React, { useState, useEffect } from 'react';
import { View, StatusBar } from 'react-native';
import * as Font from 'expo-font';

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          // Load any custom fonts here if needed
        });
        setFontsLoaded(true);
      } catch (error) {
        console.error('Font loading error:', error);
        setFontsLoaded(true); // Continue anyway
      }
    }

    loadFonts();
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#2196F3' }} />;
  }

  return (
    <>
              <StatusBar barStyle="light-content" backgroundColor="#2196F3" />
        {/* Expo Router will handle the navigation structure */}
        <View style={{ flex: 1 }} />
    </>
  );
} 