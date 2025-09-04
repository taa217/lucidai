import React from 'react'
import { Link } from 'react-router-dom'
import { LucideIcon } from 'lucide-react'
import { cn } from '../utils/cn'

interface SidebarItemProps {
  name: string
  href: string
  icon: LucideIcon
  isActive: boolean
  onClick?: () => void
  className?: string
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  name,
  href,
  icon: Icon,
  isActive,
  onClick,
  className
}) => {
  return (
    <Link
      to={href}
      onClick={onClick}
      className={cn(
        "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200",
        isActive
          ? "bg-primary-100 text-primary-700"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
        className
      )}
    >
      <Icon
        className={cn(
          "mr-3 h-5 w-5 flex-shrink-0 transition-colors duration-200",
          isActive ? "text-primary-700" : "text-gray-400 group-hover:text-gray-500"
        )}
      />
      {name}
    </Link>
  )
}

