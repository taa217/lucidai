import React, { useState } from 'react'
import { Sidebar } from '.'
import { navigationItems } from '../config/navigation'

// Example of a custom navigation configuration
const customNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: navigationItems[0].icon },
  { name: 'Analytics', href: '/analytics', icon: navigationItems[1].icon },
  { name: 'Reports', href: '/reports', icon: navigationItems[2].icon },
]

export const SidebarDemo: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Sidebar Component Examples
      </h1>
      
      {/* Example 1: Basic Sidebar */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">1. Basic Sidebar (Desktop Only)</h2>
        <div className="h-96 border rounded-lg relative">
          <Sidebar
            title="Basic App"
            navigation={navigationItems}
            variant="desktop"
            userName="Demo User"
            userEmail="demo@example.com"
          />
          <div className="ml-64 p-4">
            <p className="text-gray-600">Main content area - sidebar is on the left</p>
          </div>
        </div>
      </div>

      {/* Example 2: Mobile Sidebar */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">2. Mobile Sidebar with Toggle</h2>
        <div className="h-96 border rounded-lg relative">
          <button
            onClick={() => setSidebarOpen(true)}
            className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Open Mobile Sidebar
          </button>
          <Sidebar
            title="Mobile App"
            navigation={navigationItems}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            variant="mobile"
            userName="Mobile User"
            userEmail="mobile@example.com"
          />
          <div className="p-4">
            <p className="text-gray-600">Mobile content area - click button above to open sidebar</p>
          </div>
        </div>
      </div>

      {/* Example 3: Custom Navigation */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">3. Custom Navigation Items</h2>
        <div className="h-96 border rounded-lg relative">
          <Sidebar
            title="Custom App"
            navigation={customNavigation}
            variant="desktop"
            userName="Custom User"
            userEmail="custom@example.com"
          />
          <div className="ml-64 p-4">
            <p className="text-gray-600">Custom navigation with different items</p>
            <ul className="mt-2 text-sm text-gray-500">
              {customNavigation.map(item => (
                <li key={item.name}>• {item.name}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Example 4: Both Variants */}
      <div className="border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">4. Both Mobile and Desktop</h2>
        <div className="h-96 border rounded-lg relative">
          <button
            onClick={() => setSidebarOpen(true)}
            className="mb-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 lg:hidden"
          >
            Open Mobile Sidebar
          </button>
          <Sidebar
            title="Full App"
            navigation={navigationItems}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            variant="both"
            userName="Full User"
            userEmail="full@example.com"
          />
          <div className="lg:ml-64 p-4">
            <p className="text-gray-600">
              This sidebar works on both mobile and desktop. 
              On mobile, use the button above. On desktop, it's always visible.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

