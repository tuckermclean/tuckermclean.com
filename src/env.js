// Connect to websocket API to retrieve client config
// But first, get the current domain name
function envVars() {
    return new Promise((resolve, reject) => {
        try {
            let ENV_VARS = {
                DOMAIN_NAME: window.location.hostname.split('.').splice(-2).join('.'), // Get the domain name
            };
            ENV_VARS.API_BASE_URL = `wss://api.${ENV_VARS.DOMAIN_NAME}/`;

            const socket = new WebSocket(ENV_VARS.API_BASE_URL);
            socket.onopen = () => {
                socket.send(JSON.stringify({ action: "clientConfig" }));
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.response === "clientConfig"){
                    // Merge data with ENV_VARS
                    ENV_VARS = { ...ENV_VARS, ...data };
                } else {
                    console.log(data);
                }
                socket.close();
            };

            socket.onclose = () => {
                resolve(ENV_VARS);
            };
        } catch (error) {
            reject(error);
        }
    });
}

export { envVars };
