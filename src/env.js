// Connect to websocket API to retrieve client config
// But first, get the current domain name
function envVars() {
    return new Promise((resolve, reject) => {
        try {
            let ENV_VARS = {
                DOMAIN_NAME: window.location.hostname.split('.').splice(-2).join('.'), // Get the domain name
            };
            ENV_VARS.API_BASE_URL = `https://api.${ENV_VARS.DOMAIN_NAME}/`;
            ENV_VARS.API_WS_BASE_URL = `wss://api-ws.${ENV_VARS.DOMAIN_NAME}/`;

            // Get the client config
            const clientConfig = fetch(`${ENV_VARS.API_BASE_URL}clientConfig`)
                .then((response) => response.json())
                .then((data) => {
                    // Merge client data with ENV_VARS
                    ENV_VARS = { ...ENV_VARS, ...data };
                    resolve(ENV_VARS);
                })
        } catch (error) {
            reject(error);
        }
    });
}

export { envVars };
