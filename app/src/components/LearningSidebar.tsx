import React from 'react'
import { Sidebar } from './Sidebar'
import { newSessionItem, createLibrarySection, createRecentsSection } from '../config/navigation'
import { useAuth } from '../contexts/AuthContext'
import { useRecentSessions } from '../hooks/useRecentSessions'
import { useRecentDocuments } from '../hooks/useRecentDocuments'

interface LearningSidebarProps {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

export const LearningSidebar: React.FC<LearningSidebarProps> = ({ 
  sidebarOpen, 
  setSidebarOpen
}) => {
  const { user } = useAuth()
  const { sessions, loading: sessionsLoading } = useRecentSessions(user?.id || null, 10)
  const { documents, loading: documentsLoading } = useRecentDocuments(user?.id || null, 2)
  
  const userName = user?.fullName || user?.email || "User"
  const userEmail = user?.email || ""

  // Create sections from real data
  const librarySection = createLibrarySection(documents)
  const recentsSection = createRecentsSection(sessions)

  // Debug logging
  console.log('📚 LearningSidebar - Documents:', documents)
  console.log('📚 LearningSidebar - Library section:', librarySection)

  return (
    <Sidebar
      title="Lucid"
      navigation={[newSessionItem]}
      sections={[librarySection, recentsSection]}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      variant="both"
      userName={userName}
      userEmail={userEmail}
      showLogo={true}
    />
  )
}
