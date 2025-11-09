import React, { useEffect, useRef, useState } from 'react'
import { LogOut, Settings, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { SettingsModal } from './SettingsModal'
import { CustomizeLucidModal } from './CustomizeLucidModal'
import { cn } from '../utils/cn'

interface SidebarFooterProps {
  userName?: string
  userEmail?: string
  profilePictureUrl?: string
  onCustomize?: () => void
  onSettings?: () => void
  collapsed?: boolean
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  userName = "User Name",
  userEmail = "user@example.com",
  profilePictureUrl,
  onCustomize,
  onSettings,
  collapsed = false
}) => {
  const { logout } = useAuth()
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
    <div className="border-t border-gray-200 dark:border-gray-700 p-4 relative" ref={containerRef}>
      {/* User Profile button */}
      <button
        type="button"
        className="w-full flex items-center space-x-3 group"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-center w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full group-hover:bg-gray-300 dark:group-hover:bg-gray-500 transition-colors overflow-hidden">
          {profilePictureUrl ? (
            <img
              src={profilePictureUrl}
              alt={userName}
              className="w-full h-full object-cover rounded-full"
              onError={(e) => {
                // Fallback to first letter if image fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.innerHTML = `<span class="text-sm font-medium text-gray-600 dark:text-gray-300">${userName.charAt(0).toUpperCase()}</span>`;
                }
              }}
            />
          ) : (
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {userName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {userName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {userEmail}
            </p>
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn(
          "absolute bottom-full mb-2 z-50 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800",
          collapsed ? "left-2 w-64" : "left-4 right-4"
        )}>
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-600">
            <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{userEmail}</p>
          </div>
          <div className="py-1">
            <button onClick={handleCustomize} className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              Customize Lucid
            </button>
            <button onClick={handleSettings} className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              Settings
            </button>
            <div className="my-1 border-t border-gray-100 dark:border-gray-600" />
            <button onClick={handleLogout} className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 flex items-center gap-2">
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

