export interface Document {
  id: string
  userId: string
  filename: string
  originalFilename: string
  fileSize: number
  mimeType: string
  storagePath: string
  documentType: DocumentType
  status: DocumentStatus
  uploadDate: string
  tags: string[]
  isPublic: boolean
  thumbnailPath?: string
  metadata?: Record<string, any>
  extractedText?: string
  createdAt: string
  updatedAt: string
  collections?: DocumentCollection[]
}

export interface DocumentCollection {
  id: string
  userId: string
  name: string
  description?: string
  color: string
  isPublic: boolean
  createdAt: string
  updatedAt: string
  documents?: Document[]
  documentCount?: number
}

export enum DocumentType {
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
  EPUB = 'epub',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  OTHER = 'other'
}

export enum DocumentStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELETED = 'deleted'
}

export interface CreateDocumentDto {
  userId: string
  filename: string
  originalFilename: string
  fileSize: number
  mimeType: string
  storagePath: string
  tags?: string[]
  isPublic?: boolean
}

export interface UpdateDocumentDto {
  originalFilename?: string
  tags?: string[]
  isPublic?: boolean
}

export interface CreateCollectionDto {
  userId: string
  name: string
  description?: string
  color?: string
  isPublic?: boolean
}

export interface UpdateCollectionDto {
  name?: string
  description?: string
  color?: string
  isPublic?: boolean
}

export interface SearchDocumentsRequest {
  userId: string
  query: string
  limit?: number
}
