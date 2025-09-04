import React from 'react'
import { motion } from 'framer-motion'

interface PlaceholderPageProps {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ 
  title, 
  description, 
  icon: Icon 
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-2xl mx-auto"
      >
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-primary-100 rounded-full">
            <Icon className="h-12 w-12 text-primary-600" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {title}
        </h1>
        
        <p className="text-lg text-gray-600 mb-8">
          {description}
        </p>
        
        <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
          <p className="text-sm text-gray-500">
            This feature is coming soon. Stay tuned for updates!
          </p>
        </div>
      </motion.div>
    </div>
  )
}
