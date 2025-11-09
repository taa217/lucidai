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
  collapsed?: boolean
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  name,
  href,
  icon: Icon,
  isActive,
  onClick,
  className,
  collapsed = false
}) => {
  return (
    <Link
      to={href}
      onClick={onClick}
      className={cn(
        "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200",
        isActive
          ? "bg-accent-100 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300"
          : "text-secondary-500 dark:text-secondary-300 hover:bg-accent-50 dark:hover:bg-accent-900/10 hover:text-accent-600 dark:hover:text-accent-400",
        className
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 flex-shrink-0 transition-colors duration-200",
          !collapsed && "mr-3",
          isActive ? "text-accent-700 dark:text-accent-300" : "text-secondary-400 dark:text-secondary-500 group-hover:text-accent-600 dark:group-hover:text-accent-400"
        )}
      />
      {!collapsed && name}
    </Link>
  )
}

