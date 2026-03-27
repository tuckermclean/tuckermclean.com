// Connect to websocket API to retrieve client config
// But first, get the current domain name
function envVars(clientConfig = true) {
    return new Promise((resolve, reject) => {
        try {
            let ENV_VARS = {
                DOMAIN_NAME: window.location.hostname.split('.').splice(-2).join('.'), // Get the domain name
            };
            ENV_VARS.BASE_URL = `https://${ENV_VARS.DOMAIN_NAME}/`;
            ENV_VARS.API_BASE_URL = `https://api.${ENV_VARS.DOMAIN_NAME}/`;
            ENV_VARS.API_WS_BASE_URL = `wss://api-ws.${ENV_VARS.DOMAIN_NAME}/`;

            // If domain name is alijamaluddin.com, set the ENV_VARS.NAME to Ali Jamaluddin
            if (ENV_VARS.DOMAIN_NAME === 'alijamaluddin.com') {
                ENV_VARS.NAME = 'Ali Jamaluddin';
                ENV_VARS.INITIALS = 'AJ';
                ENV_VARS.EMAIL = 'me@alijamaluddin.com';
            } else if (ENV_VARS.DOMAIN_NAME === 'technomantics.com') {
                ENV_VARS.NAME = 'Developer McDev';
                ENV_VARS.INITIALS = 'DM';
                ENV_VARS.EMAIL = 'fakedev@technomantics.com';
            } else {
                ENV_VARS.NAME = 'Tucker McLean';
                ENV_VARS.INITIALS = 'TM';
                ENV_VARS.EMAIL = 'me@tuckermclean.com';
            }

            // Get the client config
            if (clientConfig) {
                fetch(`${ENV_VARS.API_BASE_URL}clientConfig`)
                    .then((response) => response.json())
                    .then((data) => {
                    // Merge client data with ENV_VARS
                    ENV_VARS = { ...ENV_VARS, ...data };
                    resolve(ENV_VARS);
                    });
            } else {
                resolve(ENV_VARS);
            }
        } catch (error) {
            reject(error);
        }
    });
}

export { envVars };
