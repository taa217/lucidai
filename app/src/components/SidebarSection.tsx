import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { NavigationSection } from '../types/navigation'
import { SidebarItem } from './SidebarItem'
import { cn } from '../utils/cn'

interface SidebarSectionProps {
  section: NavigationSection
  onItemClick?: () => void
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  section,
  onItemClick
}) => {
  const [isExpanded, setIsExpanded] = useState(section.isExpanded ?? true)
  const navigate = useNavigate()

  const handleHeaderClick = () => {
    // If it's the Library section, navigate to library page
    if (section.title === 'Library') {
      navigate('/library')
      if (onItemClick) onItemClick()
      return
    }

    // Otherwise, toggle expansion if collapsible
    if (section.isCollapsible) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div className="mb-4">
      {/* Section Header */}
      <div 
        className={cn(
          "flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-gray-700",
          (section.isCollapsible || section.title === 'Library') && "cursor-pointer hover:bg-gray-50 rounded-md transition-colors"
        )}
        onClick={handleHeaderClick}
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {section.title}
        </span>
        <div className="flex items-center">
          {section.isCollapsible ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Section Items */}
      {(!section.isCollapsible || isExpanded) && (
        <div className="mt-1 space-y-1">
          {section.items.map((item) => (
            <SidebarItem
              key={item.name}
              name={item.name}
              href={item.href || '#'}
              icon={item.icon}
              isActive={false} // We'll handle this in the parent component
              onClick={onItemClick}
              className="ml-2"
            />
          ))}
        </div>
      )}
    </div>
  )
}
