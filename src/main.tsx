import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './app/ErrorBoundary'
import { applyTheme, useUiStore } from './store/uiStore'

// Apply the saved theme before first paint to avoid a flash of the wrong colors.
applyTheme(useUiStore.getState().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
