import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configure Vite to use React's JSX transform for the client app.
export default defineConfig({
  plugins: [react()],
})
