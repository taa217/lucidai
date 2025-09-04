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
  showLogo?: boolean
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
  showLogo = true
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
        onClose={setSidebarOpen ? () => setSidebarOpen(false) : undefined}
        showCloseButton={!!setSidebarOpen}
        showLogo={showLogo}
      />
      {/* Scrollable navigation content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <SidebarNavigation 
          navigation={navigation}
          sections={sections}
          onItemClick={handleItemClick}
        />
      </div>
      {/* Fixed footer */}
      <SidebarFooter 
        userName={userName}
        userEmail={userEmail}
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
          <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white h-full">
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      {(variant === 'desktop' || variant === 'both') && (
        <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
          <div className={cn("flex flex-col h-full bg-white border-r border-gray-200", className)}>
            {renderSidebarContent()}
          </div>
        </div>
      )}
    </>
  )
}
