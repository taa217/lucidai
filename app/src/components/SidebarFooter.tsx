import React, { useEffect, useRef, useState } from 'react'
import { LogOut, Settings, SlidersHorizontal, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { SettingsModal } from './SettingsModal'
import { CustomizeLucidModal } from './CustomizeLucidModal'

interface SidebarFooterProps {
  userName?: string
  userEmail?: string
  onCustomize?: () => void
  onSettings?: () => void
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({ 
  userName = "User Name",
  userEmail = "user@example.com",
  onCustomize,
  onSettings
}) => {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleCustomize = () => {
    if (onCustomize) onCustomize()
    setCustomizeOpen(true)
    setOpen(false)
  }

  const handleSettings = () => {
    setSettingsOpen(true)
    setOpen(false)
  }

  const handleLogout = async () => {
    setOpen(false)
    await logout()
  }

  return (
    <div className="border-t border-gray-200 p-4 relative" ref={containerRef}>
      {/* User Profile button */}
      <button
        type="button"
        className="w-full flex items-center space-x-3 group"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-center w-8 h-8 bg-gray-200 rounded-full group-hover:bg-gray-300 transition-colors">
          <User className="w-4 h-4 text-gray-600" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-900 truncate">
            {userName}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {userEmail}
          </p>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-4 right-4 mb-2 z-50 rounded-md shadow-lg border border-gray-200 bg-white">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-500">Signed in as</p>
            <p className="text-sm font-medium text-gray-900 truncate">{userEmail}</p>
          </div>
          <div className="py-1">
            <button onClick={handleCustomize} className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-gray-500" />
              Customize Lucid
            </button>
            <button onClick={handleSettings} className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-500" />
              Settings
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button onClick={handleLogout} className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 text-red-600 flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
      />

      {/* Customize Lucid Modal */}
      <CustomizeLucidModal
        isOpen={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
      />
    </div>
  )
}

