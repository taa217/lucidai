import { 
  Plus,
  BookOpen,
  Clock,
  FileText,
  Star,
  Settings,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Search,
  File,
  Image,
  Video,
  Music,
  FileType
} from 'lucide-react'
import { NavigationItem, NavigationSection } from '../types/navigation'
import { RecentSession, Document, DocumentType } from '../types'

// Helper function to get icon for document type
const getDocumentIcon = (documentType: DocumentType) => {
  switch (documentType) {
    case DocumentType.PDF:
    case DocumentType.DOCX:
    case DocumentType.TXT:
      return FileText
    case DocumentType.EPUB:
      return BookOpen
    case DocumentType.IMAGE:
      return Image
    case DocumentType.VIDEO:
      return Video
    case DocumentType.AUDIO:
      return Music
    default:
      return File
  }
}

// New Session Button
export const newSessionItem: NavigationItem = {
  name: 'New Session',
  icon: Plus,
  type: 'link',
  href: '/'
}

// Function to create library section with recent documents
export const createLibrarySection = (documents: Document[]): NavigationSection => {
  const documentItems: NavigationItem[] = documents.map((doc) => ({
    name: doc.originalFilename,
    href: `/read/${doc.id}`,
    icon: getDocumentIcon(doc.documentType),
    type: 'link'
  }))

  // If no documents, show a placeholder
  if (documents.length === 0) {
    documentItems.push({
      name: 'No documents yet',
      href: '/library',
      icon: FileText,
      type: 'link'
    })
  }

  return {
    title: 'Library',
    isCollapsible: false, // Not collapsible
    isExpanded: true,
    items: documentItems // Only show recent documents, header is clickable
  }
}

// Default library section (fallback)
export const librarySection: NavigationSection = {
  title: 'Library',
  isCollapsible: false,
  isExpanded: true,
  items: [] // Header is clickable, no duplicate items needed
}

// Function to create recents section from unified sessions
export const createRecentsSection = (sessions: RecentSession[]): NavigationSection => {
  const recentItems: NavigationItem[] = sessions.map((session) => {
    // Determine the route based on session type
    let href: string
    let icon = MessageSquare

    if (session.type === 'chat') {
      if (session.docId) {
        // Document chat - route to read page with chat
        href = `/read/${session.docId}?chatId=${session.id}`
        icon = FileText
      } else {
        // General chat - route to main page
        href = `/?chatId=${session.id}`
        icon = MessageSquare
      }
    } else if (session.type === 'research') {
      // Research session - route to research page
      href = `/?chatId=${session.id}`
      icon = Search
    } else {
      // Fallback
      href = `/?chatId=${session.id}`
      icon = MessageSquare
    }

    // Add a small prefix to distinguish session types
    const sessionPrefix = session.type === 'research' ? '🔍 ' : ''
    const displayName = session.title || (session.type === 'research' ? 'Untitled Research' : 'Untitled Chat')

    return {
      name: `${sessionPrefix}${displayName}`,
      href,
      icon,
      type: 'link'
    }
  })

  return {
    title: 'Recents',
    isCollapsible: false,
    isExpanded: true,
    items: recentItems
  }
}

// Default recents section (fallback)
export const recentsSection: NavigationSection = {
  title: 'Recents',
  isCollapsible: false,
  isExpanded: true,
  items: []
}

// Main navigation items (for backward compatibility)
export const navigationItems: NavigationItem[] = [
  { name: 'Learn', href: '/', icon: BookOpen, type: 'link' },
  { name: 'Library', href: '/library', icon: BookOpen, type: 'link' },
  { name: 'Chat History', href: '/history', icon: Clock, type: 'link' },
  { name: 'Favorites', href: '/favorites', icon: Star, type: 'link' },
  { name: 'Settings', href: '/settings', icon: Settings, type: 'link' },
]

