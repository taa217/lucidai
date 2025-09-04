import React from 'react'
import { useLocation } from 'react-router-dom'
import { SidebarItem } from './SidebarItem'
import { SidebarSection } from './SidebarSection'
import { NavigationItem, NavigationSection } from '../types/navigation'
import { cn } from '../utils/cn'

interface SidebarNavigationProps {
  navigation?: NavigationItem[]
  sections?: NavigationSection[]
  onItemClick?: () => void
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  navigation = [],
  sections = [],
  onItemClick
}) => {
  const location = useLocation()

  const handleItemClick = (item: NavigationItem) => {
    if (item.type === 'button' && item.onClick) {
      item.onClick()
    }
    if (onItemClick) {
      onItemClick()
    }
  }

  return (
    <nav className="px-3 py-4 space-y-4">
      {/* Regular navigation items */}
      {navigation.length > 0 && (
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = item.href ? location.pathname === item.href : false
            
            if (item.type === 'button') {
              return (
                <button
                  key={item.name}
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "group flex w-full items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200",
                    "bg-primary-600 text-white hover:bg-primary-700"
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </button>
              )
            }

            return (
              <SidebarItem
                key={item.name}
                name={item.name}
                href={item.href || '#'}
                icon={item.icon}
                isActive={isActive}
                onClick={onItemClick}
              />
            )
          })}
        </div>
      )}

      {/* Navigation sections */}
      {sections.map((section) => (
        <SidebarSection
          key={section.title}
          section={section}
          onItemClick={onItemClick}
        />
      ))}
    </nav>
  )
}

