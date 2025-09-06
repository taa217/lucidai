import React, { useState } from 'react'
import { AITeacherSession } from './AITeacherSession'

export const TestAITeacher: React.FC = () => {
  const [isTesting, setIsTesting] = useState(false)
  const [testTopic, setTestTopic] = useState('What is machine learning?')

  const handleStartTest = () => {
    setIsTesting(true)
  }

  const handleTestComplete = () => {
    setIsTesting(false)
  }

  const handleTestError = (error: Error) => {
    console.error('Test error:', error)
    setIsTesting(false)
  }

  if (isTesting) {
    return (
      <div className="w-full h-screen">
        <AITeacherSession
          topic={testTopic}
          userId="test-user"
          onComplete={handleTestComplete}
          onError={handleTestError}
        />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Test AI Teacher</h2>
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Topic:</label>
        <input
          type="text"
          value={testTopic}
          onChange={(e) => setTestTopic(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md"
          placeholder="Enter a topic to learn about"
        />
      </div>
      <button
        onClick={handleStartTest}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        Start Test Lesson
      </button>
    </div>
  )
}

export default TestAITeacher










