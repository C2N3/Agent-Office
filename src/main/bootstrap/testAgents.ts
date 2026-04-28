export function registerTestAgents({ agentManager }) {
  const testSubagents = [
    {
      sessionId: 'test-main-1',
      projectPath: 'E:/projects/core-engine',
      displayName: 'Main Service',
      state: 'Working',
      isSubagent: false,
      isTeammate: false,
    },
    {
      sessionId: 'test-sub-1',
      projectPath: 'E:/projects/core-engine',
      displayName: 'Refactor Helper',
      state: 'Working',
      isSubagent: true,
      isTeammate: false,
    },
    {
      sessionId: 'test-team-1',
      projectPath: 'E:/projects/web-ui',
      displayName: 'UI Architect',
      state: 'Waiting',
      isSubagent: false,
      isTeammate: true,
    },
    {
      sessionId: 'test-team-2',
      projectPath: 'E:/projects/web-ui',
      displayName: 'CSS Specialist',
      state: 'Working',
      isSubagent: false,
      isTeammate: true,
    },
  ];

  testSubagents.forEach((agent) => agentManager.updateAgent(agent, 'test'));
}
