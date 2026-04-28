/* 
    Adobe CSInterface.js v8.0.0 (Minimal & Essential functions)
    Simple wrapper to enable communication between CEP and Premiere.
*/

function CSInterface() {
    this.__proto__.evalScript = function(script, callback) {
        if (callback === null || callback === undefined) {
            callback = function(result) {};
        }
        window.__adobe_cep__.evalScript(script, callback);
    };
}

CSInterface.prototype.getHostEnvironment = function() {
    return JSON.parse(window.__adobe_cep__.getHostEnvironment());
};

CSInterface.prototype.closeExtension = function() {
    window.__adobe_cep__.closeExtension();
};
