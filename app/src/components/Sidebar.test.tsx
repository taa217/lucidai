import React from 'react'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Sidebar } from '.'
import type { SidebarProps } from '.'
import { navigationItems } from '../config/navigation'

// Wrapper component to provide router context
const SidebarWrapper: React.FC<SidebarProps> = (props) => (
  <BrowserRouter>
    <Sidebar {...props} />
  </BrowserRouter>
)

describe('Sidebar Component', () => {
  it('renders without crashing', () => {
    render(
      <SidebarWrapper
        title="Test App"
        navigation={navigationItems}
        variant="desktop"
      />
    )
    
    expect(screen.getByText('Test App')).toBeInTheDocument()
  })

  it('renders navigation items', () => {
    render(
      <SidebarWrapper
        title="Test App"
        navigation={navigationItems}
        variant="desktop"
      />
    )
    
    expect(screen.getByText('Learn')).toBeInTheDocument()
    expect(screen.getByText('Documents')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders user profile in footer', () => {
    render(
      <SidebarWrapper
        title="Test App"
        navigation={navigationItems}
        variant="desktop"
        userName="Test User"
        userEmail="test@example.com"
      />
    )
    
    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })
})
