import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { apiService } from '../services/api'

interface CustomizeLucidModalProps {
  isOpen: boolean
  onClose: () => void
}

export const CustomizeLucidModal: React.FC<CustomizeLucidModalProps> = ({ isOpen, onClose }) => {
  const [displayName, setDisplayName] = useState('')
  const [occupation, setOccupation] = useState('')
  const [traits, setTraits] = useState('')
  const [extraNotes, setExtraNotes] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('English')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let ignore = false
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      setSaved(false)
      const resp = await apiService.getUserCustomization()
      let filled = false
      if (resp.success && resp.data) {
        setDisplayName(resp.data.displayName || '')
        setOccupation(resp.data.occupation || '')
        setTraits(resp.data.traits || '')
        setExtraNotes(resp.data.extraNotes || '')
        setPreferredLanguage(resp.data.preferredLanguage || 'English')
        filled = Boolean(
          resp.data.displayName || resp.data.occupation || resp.data.traits || resp.data.extraNotes || resp.data.preferredLanguage
        )
      }
      // If display name missing, try to prefill from profile even if language came back
      if (!filled || !displayName) {
        const prof = await apiService.getProfile()
        if (prof.success && prof.data) {
          const profile = prof.data
          setDisplayName((prev) => prev || profile.fullName || '')
        }
      }
      if (!resp.success && !ignore) setError(resp.error || 'Failed to load preferences')
      if (!ignore) setLoading(false)
    }
    fetchData()
    return () => { ignore = true }
  }, [isOpen])

  const onSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    const resp = await apiService.updateUserCustomization({
      displayName: displayName || undefined,
      occupation: occupation || undefined,
      traits: traits || undefined,
      extraNotes: extraNotes || undefined,
      preferredLanguage: preferredLanguage || undefined,
    })
    setSaving(false)
    if (!resp.success) {
      setError(resp.error || 'Failed to save')
      return
    }
    setSaved(true)
    setTimeout(() => onClose(), 600)
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 999999 }}>
      <div className="absolute inset-0 bg-gray-600 bg-opacity-75" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Customize Lucid</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {loading && <p className="text-sm text-gray-500">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700">Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                   className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Clyde" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Occupation</label>
            <input value={occupation} onChange={(e) => setOccupation(e.target.value)}
                   className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Entrepreneur, Student" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Traits</label>
            <input value={traits} onChange={(e) => setTraits(e.target.value)}
                   className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g., Innovative, Forward thinking, Formal" />
            <p className="mt-1 text-xs text-gray-500">Short comma-separated descriptors.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Extra notes</label>
            <textarea value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" rows={3} placeholder="Anything else Lucid should know" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Preferred language</label>
            <input value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)}
                   className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="English" />
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2">
          {saved && <span className="text-sm text-green-600 mr-auto">Saved</span>}
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={onSave} disabled={saving}
                  className="px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default CustomizeLucidModal


