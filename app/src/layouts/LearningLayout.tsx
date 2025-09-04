import React from 'react'
import { Menu } from 'lucide-react'
import { LearningSidebar } from '../components/LearningSidebar'
import { BaseComponentProps } from '../types'

interface LearningLayoutProps extends BaseComponentProps {}

export const LearningLayout: React.FC<LearningLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 bg-white rounded-md shadow-md hover:bg-gray-50 transition-colors duration-200"
        >
          <Menu className="h-6 w-6 text-gray-600" />
        </button>
      </div>

      {/* Sidebar */}
      <LearningSidebar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={setSidebarOpen} 
      />

      {/* Main content */}
      <div className="lg:pl-64">
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}



