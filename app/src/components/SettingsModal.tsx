import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Settings, User, Mail, Calendar, Shield, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsSection = 'general' | 'account'

const settingsSections = [
  { id: 'general' as SettingsSection, label: 'General', icon: Settings },
  { id: 'account' as SettingsSection, label: 'Account', icon: User },
]

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const { user, logout, isAuthenticated } = useAuth()
  const { theme, setTheme, actualTheme } = useTheme()

  if (!isOpen) return null

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">General</h2>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Current: {theme} ({actualTheme} mode)
            </p>
          </div>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>
    </div>
  )

  const renderAccountSettings = () => {
    if (!isAuthenticated || !user) {
      return (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Account</h2>
          <div className="text-center py-8">
            <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Please sign in to view your account details</p>
          </div>
        </div>
      )
    }

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    }

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Account</h2>

        {/* Profile Picture and Basic Info */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <div className="flex items-center space-x-4">
            {user.profilePictureUrl ? (
              <img
                src={user.profilePictureUrl}
                alt="Profile"
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {user.fullName || user.email}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Account Details */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Shield className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Verified</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {user.emailVerified ? 'Verified' : 'Not verified'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Member Since</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{formatDate(user.createdAt)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Updated</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{formatDate(user.updatedAt)}</p>
                </div>
              </div>
            </div>
          </div>

          {user.organizationName && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <User className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Organization</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{user.organizationName}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Account Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Account Actions</h3>
          <div className="space-y-3">
            <button
              onClick={logout}
              className="w-full flex items-center justify-center px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneralSettings()
      case 'account':
        return renderAccountSettings()
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
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl h-[600px] flex">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-10 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        {/* Left sidebar */}
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 pt-16">
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
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
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
        <div className="flex-1 p-8 overflow-y-auto bg-white dark:bg-gray-900">
          {renderSectionContent()}
        </div>
      </div>
    </div>,
    document.body
  )
}
