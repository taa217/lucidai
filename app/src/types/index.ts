// User types
export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role: 'student' | 'teacher' | 'admin'
  createdAt: Date
  updatedAt: Date
}

// Document types - export from document.ts
export * from './document'

// Chat types
export interface ChatSession {
  id: string
  userId: string
  docId?: string | null
  title: string | null
  modelProvider?: string | null
  messageCount: number
  lastMessageAt?: Date | null
  lastMessagePreview?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ChatMessage {
  id: string
  sessionId: string
  userId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: Record<string, any> | null
  createdAt: Date
  updatedAt: Date
}

// Research types
export interface ResearchSession {
  id: string
  userId: string
  title: string | null
  messageCount: number
  lastMessageAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ResearchMessage {
  id: string
  sessionId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  thoughts?: string | null
  metadata?: Record<string, any> | null
  createdAt: Date
  updatedAt: Date
  sources?: ResearchSource[]
}

export interface ResearchSource {
  id: string
  messageId: string
  url?: string | null
  title?: string | null
  domain?: string | null
  score?: number | null
  createdAt: Date
  updatedAt: Date
}

// Unified session type for recents
export interface RecentSession {
  id: string
  userId: string
  title: string | null
  type: 'chat' | 'research'
  docId?: string | null // Only for chat sessions
  messageCount: number
  lastMessageAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// Backend Document type (matches UserDocument entity)
export interface BackendDocument {
  id: string
  userId: string
  filename: string
  originalFilename: string
  fileSize: number
  mimeType: string
  documentType: string
  status: string
  uploadDate: string
  tags: string[]
  isPublic: boolean
  thumbnailPath?: string
  storagePath: string
  metadata?: Record<string, any>
  extractedText?: string
  createdAt: string
  updatedAt: string
  collections?: any[]
}

// Document API Response types
export interface DocumentApiResponse {
  success: boolean
  documents?: BackendDocument[]
  error?: string
  message?: string
}

// Form types
export interface LoginForm {
  email: string
  password: string
}

export interface RegisterForm {
  name: string
  email: string
  password: string
  confirmPassword: string
}

// Component props
export interface BaseComponentProps {
  className?: string
  children?: React.ReactNode
}

// Export slides types
export * from './slides';

// Export AI Teacher types
export * from './ai-teacher';
