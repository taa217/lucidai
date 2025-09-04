import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { LearningLayout } from './layouts/LearningLayout'
import { LearningInterface } from './pages/LearningInterface'
import { Library } from './pages/Library'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AuthCallback from './pages/AuthCallback'
import { FileText, History, Star, Settings, BookOpen } from 'lucide-react'
import { DocumentReader } from './pages/DocumentReader'

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/" element={
              <ProtectedRoute>
                <LearningLayout>
                  <LearningInterface />
                </LearningLayout>
              </ProtectedRoute>
            } />
            <Route path="/library" element={
              <ProtectedRoute>
                <LearningLayout>
                  <Library />
                </LearningLayout>
              </ProtectedRoute>
            } />
            <Route path="/history" element={
              <ProtectedRoute>
                <LearningLayout>
                  <PlaceholderPage 
                    title="Chat History" 
                    description="Review your previous learning conversations"
                    icon={History}
                  />
                </LearningLayout>
              </ProtectedRoute>
            } />
            <Route path="/favorites" element={
              <ProtectedRoute>
                <LearningLayout>
                  <PlaceholderPage 
                    title="Favorites" 
                    description="Access your saved learning resources"
                    icon={Star}
                  />
                </LearningLayout>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <LearningLayout>
                  <PlaceholderPage 
                    title="Settings" 
                    description="Customize your learning experience"
                    icon={Settings}
                  />
                </LearningLayout>
              </ProtectedRoute>
            } />
            <Route path="/read/:docId" element={
              <ProtectedRoute>
                <LearningLayout>
                  <DocumentReader />
                </LearningLayout>
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App
