import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Settings, Bell, Clock, Link, Database, Key, User, Play } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsSection = 'general' | 'notifications' | 'personalization' | 'connected-apps' | 'data-controls' | 'security' | 'account'

const settingsSections = [
  { id: 'general' as SettingsSection, label: 'General', icon: Settings },
  { id: 'notifications' as SettingsSection, label: 'Notifications', icon: Bell },
  { id: 'personalization' as SettingsSection, label: 'Personalization', icon: Clock },
  { id: 'connected-apps' as SettingsSection, label: 'Connected apps', icon: Link },
  { id: 'data-controls' as SettingsSection, label: 'Data controls', icon: Database },
  { id: 'security' as SettingsSection, label: 'Security', icon: Key },
  { id: 'account' as SettingsSection, label: 'Account', icon: User },
]

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  if (!isOpen) return null

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">General</h2>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Theme</label>
          <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option>System</option>
            <option>Light</option>
            <option>Dark</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Accent color</label>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
            <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Blue</option>
              <option>Green</option>
              <option>Purple</option>
              <option>Red</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Language</label>
          <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option>Auto-detect</option>
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Spoken language</label>
          <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option>Auto-detect</option>
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
          </select>
        </div>
        <p className="text-xs text-gray-500">
          For best results, select the language you mainly speak. If it's not listed, it may still be supported via auto-detection.
        </p>

        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Voice</label>
          <div className="flex items-center gap-2">
            <button className="flex items-center justify-center w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
              <Play className="w-3 h-3 text-gray-600" />
            </button>
            <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Maple</option>
              <option>River</option>
              <option>Ocean</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneralSettings()
      case 'notifications':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
            <p className="text-gray-600">Notification settings coming soon...</p>
          </div>
        )
      case 'personalization':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Personalization</h2>
            <p className="text-gray-600">Personalization settings coming soon...</p>
          </div>
        )
      case 'connected-apps':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Connected apps</h2>
            <p className="text-gray-600">Connected apps settings coming soon...</p>
          </div>
        )
      case 'data-controls':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Data controls</h2>
            <p className="text-gray-600">Data controls settings coming soon...</p>
          </div>
        )
      case 'security':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Security</h2>
            <p className="text-gray-600">Security settings coming soon...</p>
          </div>
        )
      case 'account':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Account</h2>
            <p className="text-gray-600">Account settings coming soon...</p>
          </div>
        )
      default:
        return renderGeneralSettings()
    }
  }

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 999999 }}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-gray-600 bg-opacity-75"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl h-[600px] flex">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-10 p-2 hover:bg-gray-100 rounded-md transition-colors"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>

        {/* Left sidebar */}
        <div className="w-64 border-r border-gray-200 pt-16">
          <nav className="px-4 py-4">
            <ul className="space-y-1">
              {settingsSections.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                
                return (
                  <li key={section.id}>
                    <button
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActive 
                          ? 'bg-gray-100 text-gray-900' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {section.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>

        {/* Right content area */}
        <div className="flex-1 p-8 overflow-y-auto">
          {renderSectionContent()}
        </div>
      </div>
    </div>,
    document.body
  )
}
