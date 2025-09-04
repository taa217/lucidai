import { LucideIcon } from 'lucide-react'

export interface NavigationItem {
  name: string
  href?: string
  icon: LucideIcon
  type?: 'link' | 'button' | 'section'
  onClick?: () => void
  children?: NavigationItem[]
  isCollapsible?: boolean
  isExpanded?: boolean
}

export interface NavigationSection {
  title: string
  items: NavigationItem[]
  isCollapsible?: boolean
  isExpanded?: boolean
}

