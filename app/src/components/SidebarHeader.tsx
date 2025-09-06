import React from 'react'
import { Brain, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

interface SidebarHeaderProps {
  title: string
  showLogo?: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  title,
  showLogo = true,
  collapsed = false,
  onToggleCollapsed
}) => {
  return (
    <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center space-x-3">
        {showLogo && (
          <div className="flex items-center justify-center w-8 h-8 bg-primary-600 rounded-lg">
            <Brain className="w-5 h-5 text-white" />
          </div>
        )}
        {!collapsed && <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>}
      </div>
      <div className="flex items-center">
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors duration-200 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        )}
      </div>
    </div>
  )
}

