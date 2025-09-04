import { useState, useEffect } from 'react'
import { apiService } from '../services/api'
import { ChatSession, ResearchSession, RecentSession } from '../types'

export interface UseRecentSessionsResult {
  sessions: RecentSession[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export const useRecentSessions = (userId: string | null, limit: number = 10): UseRecentSessionsResult => {
  const [sessions, setSessions] = useState<RecentSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = async () => {
    if (!userId) {
      setSessions([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch both chat and research sessions in parallel
      const [chatResponse, researchResponse] = await Promise.all([
        apiService.listChatSessions(userId, limit),
        apiService.listResearchSessions(userId, limit)
      ])

      const allSessions: RecentSession[] = []

      // Add chat sessions
      if (chatResponse.success && chatResponse.data) {
        const chatSessions: RecentSession[] = chatResponse.data.map((session: ChatSession) => ({
          id: session.id,
          userId: session.userId,
          title: session.title,
          type: 'chat' as const,
          docId: session.docId,
          messageCount: session.messageCount,
          lastMessageAt: session.lastMessageAt,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        }))
        allSessions.push(...chatSessions)
      }

      // Add research sessions
      if (researchResponse.success && researchResponse.data) {
        const researchSessions: RecentSession[] = researchResponse.data.map((session: ResearchSession) => ({
          id: session.id,
          userId: session.userId,
          title: session.title,
          type: 'research' as const,
          messageCount: session.messageCount,
          lastMessageAt: session.lastMessageAt,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        }))
        allSessions.push(...researchSessions)
      }

      // Sort by updatedAt (most recent first) and limit
      const sortedSessions = allSessions
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, limit)

      setSessions(sortedSessions)

      // Set error if both requests failed
      if (!chatResponse.success && !researchResponse.success) {
        setError('Failed to fetch recent sessions')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching sessions')
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [userId, limit])

  return {
    sessions,
    loading,
    error,
    refetch: fetchSessions
  }
}
