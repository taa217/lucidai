import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Play, BookOpen, Brain } from 'lucide-react'
import { AITeacherSession } from '../components/ai-teacher/AITeacherSession'

export const LearningInterface: React.FC = () => {
  const [inputValue, setInputValue] = useState('')
  const [selectedMode, setSelectedMode] = useState<'interactive' | 'read' | 'research'>('interactive')
  const [isTeaching, setIsTeaching] = useState(false)
  const [currentTopic, setCurrentTopic] = useState<string>('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      if (selectedMode === 'interactive') {
        // Start AI Teacher session
        setCurrentTopic(inputValue.trim())
        setIsTeaching(true)
        setInputValue('')
      } else {
        // Handle other modes (read/research)
        console.log('Learning request:', inputValue, 'Mode:', selectedMode)
        setInputValue('')
      }
    }
  }

  const handleModeChange = (mode: 'interactive' | 'read' | 'research') => {
    setSelectedMode(mode)
  }

  const handleTeachingComplete = () => {
    setIsTeaching(false)
    setCurrentTopic('')
  }

  const handleTeachingError = (error: Error) => {
    console.error('Teaching error:', error)
    setIsTeaching(false)
    setCurrentTopic('')
  }

  // Show AI Teacher session when teaching
  if (isTeaching && currentTopic) {
    return (
      <div className="flex-1 flex flex-col p-4">
        <div className="mb-4">
          <button
            onClick={handleTeachingComplete}
            className="text-gray-600 hover:text-gray-800 transition-colors"
          >
            ← Back to learning
          </button>
        </div>
        <div className="flex-1">
          <AITeacherSession
            topic={currentTopic}
            userId="current-user" // TODO: Get from auth context
            onComplete={handleTeachingComplete}
            onError={handleTeachingError}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-32 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center w-full max-w-4xl mx-auto flex flex-col items-center"
      >
        {/* Main prompt text */}
        <h1 className="text-4xl font-bold text-gray-900 mb-12 text-center">
          What do you want to learn?
        </h1>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="w-full max-w-3xl flex justify-center">
          <div className="relative w-full">
            {/* Input field with integrated mode selection */}
            <div className="bg-white border border-gray-300 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 w-full">
              {/* Input row */}
              <div className="flex items-center px-6 py-4">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask anything. Type @ for mentions and / for shortcuts."
                  className="flex-1 outline-none text-gray-900 placeholder-gray-500 text-lg min-w-0"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 ml-4"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
              
              {/* Mode selection icons at bottom, aligned to left - reduced height */}
              <div className="flex items-center px-6 pb-1">
                <div className="flex items-center space-x-1 bg-gray-50 rounded-lg px-2 py-1">
                  {/* Interactive Mode */}
                  <button
                    onClick={() => handleModeChange('interactive')}
                    title="Interactive"
                    className={`p-2 rounded-md transition-all duration-200 ${
                      selectedMode === 'interactive'
                        ? 'bg-primary-100 border border-primary-300 text-primary-700'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  
                  {/* Read Mode */}
                  <button
                    onClick={() => handleModeChange('read')}
                    title="Read"
                    className={`p-2 rounded-md transition-all duration-200 ${
                      selectedMode === 'read'
                        ? 'bg-primary-100 border border-primary-300 text-primary-700'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <BookOpen className="h-4 w-4" />
                  </button>
                  
                  {/* Research Mode */}
                  <button
                    onClick={() => handleModeChange('research')}
                    title="Research"
                    className={`p-2 rounded-md transition-all duration-200 ${
                      selectedMode === 'research'
                        ? 'bg-primary-100 border border-primary-300 text-primary-700'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <Brain className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Optional subtitle */}
        <p className="mt-8 text-gray-600 text-lg text-center">
          Start your learning journey with AI-powered assistance
        </p>
      </motion.div>
    </div>
  )
}
