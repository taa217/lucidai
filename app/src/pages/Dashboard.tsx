import React from 'react'
import { motion } from 'framer-motion'
import { 
  BookOpen, 
  MessageSquare, 
  FileText, 
  TrendingUp,
  Clock,
  LogOut,
  User
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useAuth } from '../contexts/AuthContext'

const stats = [
  { name: 'Total Documents', value: '24', icon: FileText, change: '+12%', changeType: 'positive' },
  { name: 'Active Chats', value: '8', icon: MessageSquare, change: '+5%', changeType: 'positive' },
  { name: 'Learning Hours', value: '156', icon: Clock, change: '+23%', changeType: 'positive' },
  { name: 'Study Sessions', value: '42', icon: BookOpen, change: '+8%', changeType: 'positive' },
]

const recentActivities = [
  { id: 1, type: 'document', title: 'Mathematics Chapter 5', time: '2 hours ago', status: 'completed' },
  { id: 2, type: 'chat', title: 'Physics Discussion', time: '4 hours ago', status: 'active' },
  { id: 3, type: 'document', title: 'History Notes', time: '1 day ago', status: 'in-progress' },
  { id: 4, type: 'chat', title: 'Chemistry Help', time: '2 days ago', status: 'completed' },
]

const quickActions = [
  { name: 'Upload Document', description: 'Add new study material', icon: FileText, href: '/documents/upload' },
  { name: 'Start Chat', description: 'Begin a new learning session', icon: MessageSquare, href: '/chat/new' },
  { name: 'View Progress', description: 'Check your learning stats', icon: TrendingUp, href: '/progress' },
]

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-2 text-gray-600">
              Welcome back, {user?.firstName || user?.email || 'User'}! Here's what's happening with your learning journey.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span>{user?.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors duration-200"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="card hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                  <stat.icon className="h-6 w-6 text-primary-600" />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <div className="flex items-baseline">
                  <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                  <span className={cn(
                    "ml-2 text-sm font-medium",
                    stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                  )}>
                    {stat.change}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="lg:col-span-2"
        >
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {quickActions.map((action) => (
                <a
                  key={action.name}
                  href={action.href}
                  className="group relative rounded-lg border border-gray-200 p-4 hover:border-primary-300 hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 group-hover:bg-primary-200 transition-colors duration-200">
                      <action.icon className="h-5 w-5 text-primary-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
                        {action.name}
                      </p>
                      <p className="text-sm text-gray-500">{action.description}</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center space-x-3">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    activity.type === 'document' ? 'bg-blue-100' : 'bg-green-100'
                  )}>
                    {activity.type === 'document' ? (
                      <FileText className="h-4 w-4 text-blue-600" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{activity.title}</p>
                    <p className="text-xs text-gray-500">{activity.time}</p>
                  </div>
                  <span className={cn(
                    "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                    activity.status === 'completed' ? 'bg-green-100 text-green-800' :
                    activity.status === 'active' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  )}>
                    {activity.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Learning Progress */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.6 }}
        className="card"
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">Learning Progress</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Mathematics</span>
            <span className="text-sm text-gray-500">75%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-primary-600 h-2 rounded-full" style={{ width: '75%' }}></div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Physics</span>
            <span className="text-sm text-gray-500">60%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-primary-600 h-2 rounded-full" style={{ width: '60%' }}></div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">History</span>
            <span className="text-sm text-gray-500">45%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-primary-600 h-2 rounded-full" style={{ width: '45%' }}></div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
