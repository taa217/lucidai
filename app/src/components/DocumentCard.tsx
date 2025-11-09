import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Eye, Trash2, Calendar, Tag } from 'lucide-react'
import type { Document } from '../types'

interface DocumentCardProps {
  document: Document
  viewMode: 'grid' | 'list'
  onAction: (documentId: string, action: 'view' | 'download' | 'delete') => void
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  viewMode,
  onAction
}) => {
  const navigate = useNavigate()

  const openReader = () => {
    navigate(`/read/${document.id}`)
  }
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return '📄'
    if (mimeType.includes('word') || mimeType.includes('docx')) return '📝'
    if (mimeType.includes('text/plain')) return '📄'
    if (mimeType.includes('epub')) return '📚'
    if (mimeType.includes('image/')) return '🖼️'
    if (mimeType.includes('video/')) return '🎥'
    if (mimeType.includes('audio/')) return '🎵'
    return '📄'
  }

  const getDocumentTypeColor = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
    if (mimeType.includes('word') || mimeType.includes('docx')) return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'
    if (mimeType.includes('text/plain')) return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
    if (mimeType.includes('epub')) return 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300'
    if (mimeType.includes('image/')) return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
    if (mimeType.includes('video/')) return 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300'
    if (mimeType.includes('audio/')) return 'bg-pink-100 dark:bg-pink-900/20 text-pink-800 dark:text-pink-300'
    return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
  }

  if (viewMode === 'list') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={openReader}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1">
            <div className="text-2xl">{getFileIcon(document.mimeType)}</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {document.originalFilename}
              </h3>
              <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center">
                  <Calendar size={12} className="mr-1" />
                  {formatDate(document.uploadDate)}
                </span>
                <span>{formatFileSize(document.fileSize)}</span>
                <span className={`px-2 py-1 rounded-full text-xs ${getDocumentTypeColor(document.mimeType)}`}>
                  {document.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onAction(document.id, 'view')}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title="View document"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={() => onAction(document.id, 'download')}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title="Download document"
            >
              <Download size={16} />
            </button>
            <button
              onClick={() => onAction(document.id, 'delete')}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Delete document"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
        {document.tags && document.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {document.tags.slice(0, 3).map((tag: string, index: number) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                <Tag size={10} className="mr-1" />
                {tag}
              </span>
            ))}
            {document.tags.length > 3 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                +{document.tags.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={openReader}>
      <div className="flex items-start justify-between mb-3">
        <div className="text-3xl">{getFileIcon(document.mimeType)}</div>
        <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onAction(document.id, 'view')}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            title="View document"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={() => onAction(document.id, 'download')}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            title="Download document"
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => onAction(document.id, 'delete')}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Delete document"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
          {document.originalFilename}
        </h3>

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{formatFileSize(document.fileSize)}</span>
          <span className="flex items-center">
            <Calendar size={10} className="mr-1" />
            {formatDate(document.uploadDate)}
          </span>
        </div>

        <div className={`inline-block px-2 py-1 rounded-full text-xs ${getDocumentTypeColor(document.mimeType)}`}>
          {document.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
        </div>

        {document.tags && document.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {document.tags.slice(0, 2).map((tag: string, index: number) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                <Tag size={8} className="mr-1" />
                {tag}
              </span>
            ))}
            {document.tags.length > 2 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                +{document.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
