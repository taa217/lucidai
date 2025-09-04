import { useState, useEffect } from 'react'
import { apiService } from '../services/api'
import { Document } from '../types'

export interface UseRecentDocumentsResult {
  documents: Document[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export const useRecentDocuments = (userId: string | null, limit: number = 2): UseRecentDocumentsResult => {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDocuments = async () => {
    if (!userId) {
      setDocuments([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiService.getUserDocuments(userId)
      
      console.log('📚 Documents response:', response)
      
      if (response.success && response.data) {
        // Sort by uploadDate (most recent first) and limit
        const sortedDocuments = response.data
          .sort((a: Document, b: Document) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
          .slice(0, limit)
        
        console.log('📚 Sorted documents:', sortedDocuments)
        setDocuments(sortedDocuments)
      } else {
        console.log('📚 No documents found or error:', response.error)
        setError(response.error || 'Failed to fetch recent documents')
        setDocuments([])
      }
    } catch (err: any) {
      console.error('📚 Error fetching documents:', err)
      setError(err.message || 'An error occurred while fetching documents')
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [userId, limit])

  return {
    documents,
    loading,
    error,
    refetch: fetchDocuments
  }
}
