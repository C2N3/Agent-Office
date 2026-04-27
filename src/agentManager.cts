const agentManagerModule = require('./agentManager.js');
const AgentManager = agentManagerModule.AgentManager || agentManagerModule.default || agentManagerModule;

module.exports = AgentManager;
module.exports.AgentManager = AgentManager;
