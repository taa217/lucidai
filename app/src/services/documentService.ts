import { apiService } from './api'
import type { 
  Document, 
  DocumentCollection, 
  CreateDocumentDto, 
  UpdateDocumentDto,
  CreateCollectionDto,
  UpdateCollectionDto,
  SearchDocumentsRequest,
  DocumentApiResponse,
  BackendDocument
} from '../types'

// Helper function to map backend document to frontend document
const mapBackendDocumentToFrontend = (backendDoc: BackendDocument): Document => {
  return {
    id: backendDoc.id,
    userId: backendDoc.userId,
    filename: backendDoc.filename,
    originalFilename: backendDoc.originalFilename,
    fileSize: backendDoc.fileSize,
    mimeType: backendDoc.mimeType,
    storagePath: backendDoc.storagePath,
    documentType: backendDoc.documentType as any,
    status: backendDoc.status as any,
    uploadDate: backendDoc.uploadDate,
    tags: backendDoc.tags,
    isPublic: backendDoc.isPublic,
    thumbnailPath: backendDoc.thumbnailPath,
    metadata: backendDoc.metadata,
    extractedText: backendDoc.extractedText,
    createdAt: backendDoc.createdAt,
    updatedAt: backendDoc.updatedAt,
    collections: backendDoc.collections
  }
}

export const documentService = {
  /**
   * Get all documents for a user
   */
  async getUserDocuments(userId: string): Promise<{ success: boolean; documents?: Document[]; error?: string }> {
    console.log('🔍 Debug - DocumentService: Getting documents for user:', userId)
    const response = await apiService.get<{ documents: BackendDocument[] }>(`documents/user/${userId}`)
    console.log('🔍 Debug - DocumentService: Raw API response:', response)
    
    // Transform the response to match our expected format
    if (response.success) {
      const backendDocuments = (response as any).documents || response.data?.documents || []
      const frontendDocuments = backendDocuments.map(mapBackendDocumentToFrontend)
      return {
        success: true,
        documents: frontendDocuments
      }
    } else {
      return {
        success: false,
        error: response.error
      }
    }
  },

  /**
   * Get a single document
   */
  async getDocument(documentId: string) {
    console.log('🔍 DocumentService: Getting document:', documentId)
    const response = await apiService.get<{ document: Document }>(`documents/${documentId}`)
    console.log('🔍 DocumentService: Document response:', response)
    return response
  },

  /**
   * Get a signed URL for a document
   */
  async getDocumentUrl(documentId: string) {
    console.log('🔍 DocumentService: Getting document URL:', documentId)
    const response = await apiService.get<{ url: string }>(`documents/${documentId}/url`)
    console.log('🔍 DocumentService: Document URL response:', response)
    return response
  },

  /**
   * Upload a new document
   */
  async uploadDocument(file: File, tags: string[] = [], isPublic: boolean = false) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('tags', JSON.stringify(tags))
    formData.append('isPublic', isPublic.toString())

    // Use direct axios call for multipart upload
    const token = localStorage.getItem('workos_access_token') || localStorage.getItem('authToken')
    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/documents/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })

    const data = await response.json()
    return {
      success: response.ok,
      data: data,
      error: response.ok ? undefined : data.message || 'Upload failed'
    }
  },

  /**
   * Update a document
   */
  async updateDocument(documentId: string, updateData: UpdateDocumentDto) {
    return apiService.put<{ document: Document }>(`documents/${documentId}`, updateData)
  },

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string) {
    return apiService.delete<{ message: string }>(`documents/${documentId}`)
  },

  /**
   * Search documents
   */
  async searchDocuments(userId: string, query: string, limit: number = 10): Promise<{ success: boolean; documents?: Document[]; error?: string }> {
    const response = await apiService.post<{ documents: BackendDocument[] }>('documents/search', {
      userId,
      query,
      limit
    })
    
    if (response.success) {
      const backendDocuments = (response as any).documents || response.data?.documents || []
      const frontendDocuments = backendDocuments.map(mapBackendDocumentToFrontend)
      return {
        success: true,
        documents: frontendDocuments
      }
    } else {
      return {
        success: false,
        error: response.error
      }
    }
  },

  /**
   * Get all collections for a user
   */
  async getUserCollections(userId: string) {
    return apiService.get<{ collections: DocumentCollection[] }>(`documents/collections/user/${userId}`)
  },

  /**
   * Get a single collection
   */
  async getCollection(collectionId: string) {
    return apiService.get<{ collection: DocumentCollection }>(`documents/collections/${collectionId}`)
  },

  /**
   * Create a new collection
   */
  async createCollection(createData: CreateCollectionDto) {
    return apiService.post<{ collection: DocumentCollection }>('documents/collections', createData)
  },

  /**
   * Update a collection
   */
  async updateCollection(collectionId: string, updateData: UpdateCollectionDto) {
    return apiService.put<{ collection: DocumentCollection }>(`documents/collections/${collectionId}`, updateData)
  },

  /**
   * Delete a collection
   */
  async deleteCollection(collectionId: string) {
    return apiService.delete<{ message: string }>(`documents/collections/${collectionId}`)
  },

  /**
   * Add document to collection
   */
  async addDocumentToCollection(collectionId: string, documentId: string) {
    return apiService.post<{ message: string }>(`documents/collections/${collectionId}/documents`, {
      documentId
    })
  },

  /**
   * Remove document from collection
   */
  async removeDocumentFromCollection(collectionId: string, documentId: string) {
    return apiService.delete<{ message: string }>(`documents/collections/${collectionId}/documents/${documentId}`)
  },

  /**
   * Get documents in a collection
   */
  async getCollectionDocuments(collectionId: string) {
    return apiService.get<{ documents: Document[] }>(`documents/collections/${collectionId}/documents`)
  }
}
