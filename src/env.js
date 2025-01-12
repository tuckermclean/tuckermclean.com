const ENV_VARS = {
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    DOMAIN_NAME: import.meta.env.VITE_DOMAIN_NAME,
    COGNITO_CLIENT_ID: import.meta.env.VITE_COGNITO_CLIENT_ID,
    GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
};

export { ENV_VARS };
