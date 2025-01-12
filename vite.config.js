import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        callback: 'callback.html',
        chat: 'chat.html',
        login: 'login.html',
      }
    }
  }
})
