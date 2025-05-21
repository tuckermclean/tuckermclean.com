import { defineConfig } from 'vite';

export default defineConfig(({ command, mode }) => {
    return {
        build: {
            rollupOptions: {
                input: {
                    main: 'index.html',
                    callback: 'callback.html',
                    chat: 'chat.html',
                    login: 'login.html',
                }
            }
        },
        server: {
            fs: {
                // Allow serving files from one level up to the project root
                allow: ['..']
            }
        },
        // Ensure /writings/ requests are handled properly
        base: '/',
        publicDir: 'public'
    };
});