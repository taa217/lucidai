import React from 'react'
import { SidebarHeader } from './SidebarHeader'
import { SidebarNavigation } from './SidebarNavigation'
import { SidebarFooter } from './SidebarFooter'
import { NavigationItem, NavigationSection } from '../types/navigation'
import { cn } from '../utils/cn'

export interface SidebarProps {
  title: string
  navigation?: NavigationItem[]
  sections?: NavigationSection[]
  sidebarOpen?: boolean
  setSidebarOpen?: (open: boolean) => void
  variant?: 'mobile' | 'desktop' | 'both'
  className?: string
  userName?: string
  userEmail?: string
  profilePictureUrl?: string
  showLogo?: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  title,
  navigation = [],
  sections = [],
  sidebarOpen = false,
  setSidebarOpen,
  variant = 'both',
  className,
  userName,
  userEmail,
  profilePictureUrl,
  showLogo = true,
  collapsed = false,
  onToggleCollapsed
}) => {
  const handleItemClick = () => {
    if (setSidebarOpen) {
      setSidebarOpen(false)
    }
  }

  const renderSidebarContent = () => (
    <>
      <SidebarHeader
        title={title}
        showLogo={showLogo}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      {/* Scrollable navigation content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <SidebarNavigation
          navigation={navigation}
          sections={sections}
          onItemClick={handleItemClick}
          collapsed={collapsed}
        />
      </div>
      {/* Fixed footer */}
      <SidebarFooter
        userName={userName}
        userEmail={userEmail}
        profilePictureUrl={profilePictureUrl}
        collapsed={collapsed}
      />
    </>
  )

  return (
    <>
      {/* Mobile sidebar */}
      {(variant === 'mobile' || variant === 'both') && setSidebarOpen && (
        <div className={cn(
          "fixed inset-0 z-50 lg:hidden",
          sidebarOpen ? "block" : "hidden"
        )}>
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white dark:bg-gray-800 h-full">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      {(variant === 'desktop' || variant === 'both') && (
        <div className={cn("hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col overflow-visible", collapsed ? "lg:w-16" : "lg:w-64")}>
          <div className={cn("flex flex-col h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700", className)}>
            {renderSidebarContent()}
          </div>
        </div>
      )}
    </>
  )
}
