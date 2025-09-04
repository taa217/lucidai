import React from 'react'
import { X, Brain } from 'lucide-react'

interface SidebarHeaderProps {
  title: string
  onClose?: () => void
  showCloseButton?: boolean
  showLogo?: boolean
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  title,
  onClose,
  showCloseButton = false,
  showLogo = true
}) => {
  return (
    <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200">
      <div className="flex items-center space-x-3">
        {showLogo && (
          <div className="flex items-center justify-center w-8 h-8 bg-primary-600 rounded-lg">
            <Brain className="w-5 h-5 text-white" />
          </div>
        )}
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      </div>
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
        >
          <X size={24} />
        </button>
      )}
    </div>
  )
}

