import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, Download, Eye, Calendar, Tag, Grid, List, Upload } from 'lucide-react'
import { documentService } from '../services/documentService'
import { DocumentCard } from '../components/DocumentCard'
import { UploadModal } from '../components/UploadModal'
import { useAuth } from '../contexts/AuthContext'
import type { Document } from '../types'

export const Library: React.FC = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<Document[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date')
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

  // Get current user ID from auth context
  const getCurrentUserId = () => {
    return user?.id || null
  }

  // Fetch user documents
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const userId = getCurrentUserId()
      
      console.log('🔍 Debug - Fetching documents for user:', userId)
      console.log('🔍 Debug - User object:', user)
      
      if (!userId) {
        setError('User not authenticated')
        return
      }

      const response = await documentService.getUserDocuments(userId)
      console.log('🔍 Debug - Document service response:', response)
      
      if (response.success) {
        // Document service now returns the correct format
        const documents = response.documents || []
        setDocuments(documents)
        setFilteredDocuments(documents)
        console.log('🔍 Debug - Documents loaded:', documents.length)
      } else {
        setError(response.error || 'Failed to fetch documents')
      }
    } catch (err) {
      setError('An error occurred while fetching documents')
      console.error('Error fetching documents:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Search documents (frontend search)
  const searchDocuments = useCallback((query: string) => {
    if (!query.trim()) {
      setFilteredDocuments(documents)
      return
    }

    const searchTerm = query.toLowerCase().trim()
    
    const filtered = documents.filter(doc => {
      // Search in filename
      const filenameMatch = doc.originalFilename.toLowerCase().includes(searchTerm)
      
      // Search in tags
      const tagsMatch = doc.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      
      // Search in document type
      const typeMatch = doc.documentType.toLowerCase().includes(searchTerm)
      
      // Search in mime type
      const mimeMatch = doc.mimeType.toLowerCase().includes(searchTerm)
      
      // Search in file size (e.g., "large", "small", "mb", "kb")
      const sizeMatch = 
        (searchTerm.includes('large') && doc.fileSize > 10 * 1024 * 1024) || // > 10MB
        (searchTerm.includes('small') && doc.fileSize < 1024 * 1024) || // < 1MB
        (searchTerm.includes('mb') && doc.fileSize > 1024 * 1024) || // > 1MB
        (searchTerm.includes('kb') && doc.fileSize < 1024 * 1024) // < 1MB
      
      // Search in status
      const statusMatch = doc.status.toLowerCase().includes(searchTerm)
      
      return filenameMatch || tagsMatch || typeMatch || mimeMatch || sizeMatch || statusMatch
    })

    setFilteredDocuments(filtered)
    console.log(`🔍 Frontend search for "${query}": found ${filtered.length} documents`)
  }, [documents])

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchDocuments(searchQuery)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, searchDocuments])

  // Sort documents
  const sortDocuments = useCallback((docs: Document[], sortType: string) => {
    return [...docs].sort((a, b) => {
      switch (sortType) {
        case 'name':
          return a.originalFilename.localeCompare(b.originalFilename)
        case 'size':
          return b.fileSize - a.fileSize
        case 'date':
        default:
          return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
      }
    })
  }, [])

  // Update filtered documents when sort changes
  useEffect(() => {
    setFilteredDocuments(sortDocuments(filteredDocuments, sortBy))
  }, [sortBy, sortDocuments])

  // Load documents on component mount
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setFilteredDocuments(documents)
  }

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode)
  }

  const handleSortChange = (sortType: 'date' | 'name' | 'size') => {
    setSortBy(sortType)
  }

  const handleDocumentAction = (documentId: string, action: 'view' | 'download' | 'delete') => {
    if (action === 'view') {
      navigate(`/read/${documentId}`)
      return
    }
    console.log(`Action: ${action} on document: ${documentId}`)
  }

  const handleUploadSuccess = () => {
    // Refresh the documents list after successful upload
    fetchDocuments()
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-2 text-gray-600">
          {authLoading ? 'Authenticating...' : 'Loading documents...'}
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-red-500 mb-4">
          <FileText size={48} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Documents</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={fetchDocuments}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Library</h1>
            <p className="text-gray-600">
              Manage and organize your uploaded documents
            </p>
          </div>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Upload size={20} />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* Search and Controls */}
      <div className="mb-6 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by filename, tags, type, size (e.g., pdf, large, small)..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Sort Options */}
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as 'date' | 'name' | 'size')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleViewModeChange('grid')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-primary-100 text-primary-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Grid size={20} />
            </button>
            <button
              onClick={() => handleViewModeChange('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary-100 text-primary-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <List size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Documents Grid/List */}
      {filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="text-gray-400 mb-4">
            <FileText size={64} />
          </div>
                     <h3 className="text-lg font-semibold text-gray-900 mb-2">
             {searchQuery ? 'No documents found' : 'No documents yet'}
           </h3>
           <p className="text-gray-600 mb-4">
             {searchQuery
               ? `No documents match "${searchQuery}". Try different keywords or check your spelling.`
               : 'Upload your first document to get started'}
           </p>
           {searchQuery ? (
             <button
               onClick={handleClearSearch}
               className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
             >
               Clear Search
             </button>
           ) : (
             <button 
               onClick={() => setIsUploadModalOpen(true)}
               className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
             >
               Upload Document
             </button>
           )}
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
              : 'space-y-4'
          }
        >
          {filteredDocuments.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              viewMode={viewMode}
              onAction={handleDocumentAction}
            />
          ))}
        </div>
      )}

             {/* Results Summary */}
       {filteredDocuments.length > 0 && (
         <div className="mt-8 text-center text-sm text-gray-600">
           {searchQuery ? (
             <>
               Found {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''} for "{searchQuery}"
               {filteredDocuments.length < documents.length && (
                 <span className="ml-2 text-gray-500">
                   (of {documents.length} total)
                 </span>
               )}
             </>
           ) : (
             `Showing ${filteredDocuments.length} document${filteredDocuments.length !== 1 ? 's' : ''}`
           )}
         </div>
       )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />
    </div>
  )
}
