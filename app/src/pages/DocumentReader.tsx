import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { FileText, Download, Share2, MessageSquare, Loader2, AlertCircle } from 'lucide-react'
import { documentService } from '../services/documentService'
import { apiService } from '../services/api'
import { ChatInterface } from '../components/ChatInterface'
import { Document, ChatMessage } from '../types'
import { useAuth } from '../contexts/AuthContext'

export const DocumentReader: React.FC = () => {
  const { docId } = useParams<{ docId: string }>()
  const [searchParams] = useSearchParams()
  const chatId = searchParams.get('chatId')
  const { user } = useAuth()

  const [document, setDocument] = useState<Document | null>(null)
  const [documentUrl, setDocumentUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(true)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [ingestStatus, setIngestStatus] = useState<'idle'|'queuing'|'queued'|'done'|'error'>('idle')
  const INGEST_CACHE_KEY = 'lucid_ingest_cache_v1'
  const ingestInFlightRef = React.useRef<boolean>(false)
  const lastIngestKeyRef = React.useRef<string>('')
  const lastIngestTsRef = React.useRef<number>(0)

  // Load document and chat history
  useEffect(() => {
    if (docId && user?.id) {
      loadDocument()
      if (chatId) {
        loadChatHistory()
      }
    }
  }, [docId, user?.id, chatId])

  const loadDocument = async () => {
    if (!docId || !user?.id) return

    setLoading(true)
    setError(null)

    try {
      console.log('🔍 Loading document:', { docId, userId: user.id })

      // Get document details
      const docResponse = await documentService.getDocument(docId)
      console.log('🔍 Document response:', docResponse)
      
      if (docResponse.success && docResponse.data?.document) {
        setDocument(docResponse.data.document)
      } else {
        // Fallback: try to get from user documents
        console.log('🔍 Trying fallback: get from user documents')
        const userDocsResponse = await documentService.getUserDocuments(user.id)
        console.log('🔍 User documents response:', userDocsResponse)
        
        if (userDocsResponse.success && userDocsResponse.documents) {
          const foundDoc = userDocsResponse.documents.find(doc => doc.id === docId)
          if (foundDoc) {
            setDocument(foundDoc)
          } else {
            setError('Document not found in your library')
            return
          }
        } else {
          setError('Failed to load document from library')
          return
        }
      }

      // Get document URL for viewing
      console.log('🔍 Getting document URL for:', docId)
      const urlResponse = await documentService.getDocumentUrl(docId)
      console.log('🔍 Document URL response:', urlResponse)
      
      // The API service returns the backend response directly, so check for success and url properties
      if (urlResponse.success && (urlResponse as any).url) {
        setDocumentUrl((urlResponse as any).url)
        console.log('🔍 Document URL set:', (urlResponse as any).url)
      } else if (urlResponse.success && urlResponse.data?.url) {
        // Fallback: check if it's wrapped in data property
        setDocumentUrl(urlResponse.data.url)
        console.log('🔍 Document URL set (from data):', urlResponse.data.url)
      } else {
        console.warn('🔍 No document URL received:', urlResponse)
        // Don't set error here, just don't set the URL - the UI will show the fallback
        console.log('🔍 Document preview will not be available, but document info is loaded')
      }

      // Trigger ingestion in background for chat grounding (with simple 10m cache + in-flight guard)
      if (docId && user?.id) {
        const cacheRaw = localStorage.getItem(INGEST_CACHE_KEY)
        let cache: Record<string, number> = {}
        try { cache = cacheRaw ? JSON.parse(cacheRaw) : {} } catch {}
        const key = `${user.id}:${docId}`
        const now = Date.now()
        const last = cache[key] || 0
        const TEN_MIN = 10 * 60 * 1000
        if (now - last < TEN_MIN) {
          setIngestStatus('done')
          return
        }
        if (ingestInFlightRef.current && lastIngestKeyRef.current === key) {
          // Another ingestion is already running for this doc; show queued and skip
          setIngestStatus('queued')
          return
        }
        // Development StrictMode can double-invoke effects; avoid duplicate network calls
        if (lastIngestKeyRef.current === key && now - lastIngestTsRef.current < 5000) {
          setIngestStatus('queued')
          return
        }
        setIngestStatus('queuing')
        ingestInFlightRef.current = true
        lastIngestKeyRef.current = key
        lastIngestTsRef.current = now
        apiService.ingestDocument({
          userId: user.id,
          docId,
          documentUrl: (urlResponse as any).url || urlResponse.data?.url || undefined,
          documentTitle: document?.originalFilename || undefined,
        })
        .then((res) => {
          if (res.success) {
            setIngestStatus(res.data?.queued ? 'queued' : 'done')
            cache[key] = now
            try { localStorage.setItem(INGEST_CACHE_KEY, JSON.stringify(cache)) } catch {}
            // Persist OpenAI file_id for downstream chat attachments
            try {
              const fid = (res.data?.file_id) || (res.data?.openai_file_id) || (res.data?.fileId)
              if (typeof fid === 'string' && fid) {
                localStorage.setItem(`lucid_ingest_openai_file_id_${user.id}_${docId}`, fid)
              }
            } catch {}
          } else {
            setIngestStatus('error')
          }
        })
        .catch(() => setIngestStatus('error'))
        .finally(() => { ingestInFlightRef.current = false })
      }
    } catch (err: any) {
      console.error('🔍 Failed to load document:', err)
      setError(err.message || 'Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  const loadChatHistory = async () => {
    if (!chatId) return

    try {
      const response = await apiService.getChatMessages(chatId, 100)
      if (response.success && response.data) {
        setChatMessages(response.data)
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
    }
  }

  const handleMessageSent = (message: ChatMessage) => {
    setChatMessages(prev => [...prev, message])
  }

  const handleDownload = async () => {
    if (!documentUrl) return

    try {
      const response = await fetch(documentUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = document?.originalFilename || 'document'
      window.document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      window.document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to download document:', error)
    }
  }

  const handleShare = async () => {
    if (navigator.share && document) {
      try {
        await navigator.share({
          title: document.originalFilename,
          text: `Check out this document: ${document.originalFilename}`,
          url: window.location.href
        })
      } catch (error) {
        console.error('Failed to share:', error)
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href)
        // You could show a toast notification here
        alert('Link copied to clipboard!')
      } catch (error) {
        console.error('Failed to copy to clipboard:', error)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Document</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadDocument}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Document Not Found</h3>
          <p className="text-gray-600">The requested document could not be found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Document Viewer */}
      <div className={`flex-1 flex flex-col ${showChat ? 'mr-96' : ''} transition-all duration-300 min-h-0`}>
        {/* Document Content */}
        <div className="flex-1 overflow-hidden">
          {/* Ingestion status chip */}
          {ingestStatus !== 'idle' && (
            <div className="absolute top-3 left-3 z-10">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium shadow-sm ${
                ingestStatus === 'queuing' ? 'bg-blue-50 text-blue-700' :
                ingestStatus === 'queued' ? 'bg-indigo-50 text-indigo-700' :
                ingestStatus === 'done' ? 'bg-green-50 text-green-700' :
                'bg-yellow-50 text-yellow-700'
              }`}>
                {ingestStatus === 'queuing' && 'Indexing…'}
                {ingestStatus === 'queued' && 'Document queued • indexing in background'}
                {ingestStatus === 'done' && 'Indexed for Q&A'}
                {ingestStatus === 'error' && 'Indexing delayed • will retry on ask'}
              </span>
            </div>
          )}
          {documentUrl ? (
            <iframe
              src={documentUrl}
              className="w-full h-full border-0"
              title={document.originalFilename}
              onError={() => {
                console.error('🔍 Iframe failed to load document URL:', documentUrl)
                setDocumentUrl(null)
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full overflow-y-auto">
              <div className="text-center p-6">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Document Preview Not Available
                </h3>
                <p className="text-gray-600 mb-4">
                  The document preview could not be loaded. This might be due to:
                </p>
                <ul className="text-sm text-gray-500 mb-4 text-left max-w-md mx-auto">
                  <li>• Document format not supported for preview</li>
                  <li>• Storage service configuration issue</li>
                  <li>• Document URL expired or invalid</li>
                </ul>
                <div className="space-x-2">
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
                  >
                    Download Document
                  </button>
                  <button
                    onClick={loadDocument}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200"
                  >
                    Retry Loading
                  </button>
                </div>
                {process.env.NODE_ENV === 'development' && (
                  <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-left">
                    <strong>Debug Info:</strong>
                    <br />Document ID: {docId}
                    <br />Document URL: {documentUrl || 'Not available'}
                    <br />Document Type: {document?.documentType}
                    <br />Storage Path: {document?.storagePath}
                    <br />Check browser console for detailed logs
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Chat Toggle Button */}
      <button
        onClick={() => setShowChat(!showChat)}
        className={`fixed top-4 right-4 z-50 p-3 rounded-full shadow-lg transition-all duration-200 ${
          showChat 
            ? 'bg-blue-600 text-white' 
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
        }`}
        title={showChat ? 'Hide Chat' : 'Show Chat'}
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {/* Chat Interface */}
      {showChat && (
        <div className="absolute right-0 top-0 w-96 h-full border-l border-gray-200 bg-white">
          <ChatInterface
            sessionId={chatId || ''}
            userId={user?.id || ''}
            docId={docId}
            documentTitle={document.originalFilename}
            documentUrl={documentUrl || undefined}
            initialMessages={chatMessages}
            onMessageSent={handleMessageSent}
            className="h-full"
          />
        </div>
      )}
    </div>
  )
}
