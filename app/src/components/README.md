# Sidebar Components

This directory contains modular, reusable sidebar components that can be used across different parts of the application.

## Components Overview

### Core Components

- **`Sidebar`** - Generic sidebar component that can be configured for different use cases
- **`LearningSidebar`** - Specific implementation for the learning interface
- **`SidebarHeader`** - Reusable header component with optional close button
- **`SidebarNavigation`** - Navigation items list component
- **`SidebarFooter`** - Footer component with logout functionality
- **`SidebarItem`** - Individual navigation item component
- **`SidebarDemo`** - Demo component showcasing different sidebar configurations

## Usage Examples

### Basic Sidebar Usage

```tsx
import { Sidebar } from './components'
import { navigationItems } from './config/navigation'

function MyPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  const handleLogout = () => {
    // Logout logic
  }

  return (
    <Sidebar
      title="My App"
      navigation={navigationItems}
      onLogout={handleLogout}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      variant="both"
    />
  )
}
```

### Mobile-Only Sidebar

```tsx
<Sidebar
  title="Mobile Menu"
  navigation={navigationItems}
  onLogout={handleLogout}
  sidebarOpen={sidebarOpen}
  setSidebarOpen={setSidebarOpen}
  variant="mobile"
/>
```

### Desktop-Only Sidebar

```tsx
<Sidebar
  title="Desktop Menu"
  navigation={navigationItems}
  onLogout={handleLogout}
  variant="desktop"
/>
```

### Custom Navigation Items

```tsx
import { Brain, Settings } from 'lucide-react'

const customNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Brain },
  { name: 'Configuration', href: '/config', icon: Settings },
]

<Sidebar
  title="Custom App"
  navigation={customNavigation}
  onLogout={handleLogout}
  variant="both"
/>
```

### Interactive Demo

To see all the sidebar variants in action, you can use the `SidebarDemo` component:

```tsx
import { SidebarDemo } from './components'

function DemoPage() {
  return <SidebarDemo />
}
```

This will show you:
1. Basic desktop sidebar
2. Mobile sidebar with toggle
3. Custom navigation items
4. Both mobile and desktop variants

## Benefits of This Architecture

1. **Reusability** - Components can be used in different contexts
2. **Maintainability** - Each component has a single responsibility
3. **Flexibility** - Easy to customize for different use cases
4. **Type Safety** - Full TypeScript support with proper interfaces
5. **Consistency** - Unified styling and behavior across the app
6. **Testability** - Individual components can be tested in isolation

## Configuration

Navigation items are configured in `src/config/navigation.ts` and can be easily modified or extended for different parts of the application.

## Testing

The components include comprehensive tests. Run them with:

```bash
npm test
```

The test files demonstrate proper usage patterns and ensure components render correctly.
