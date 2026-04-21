import React, { type ReactElement } from 'react';
import { AssignTaskModal } from './assignTaskModal/index.js';
import { AvatarPickerModal } from './avatarPickerModal.js';
import { ConversationViewerModal } from './conversationViewerModal.js';
import { CreateAgentModal } from './createAgentModal/index.js';
import { TaskReportModal } from './taskReportModal.js';
import { TeamFormationModal } from './teamFormationModal.js';
import { TeamReportModal } from './teamReportModal.js';

export function DashboardModals(): ReactElement {
  return (
    <>
      <CreateAgentModal />
      <AssignTaskModal />
      <AvatarPickerModal />
      <TeamFormationModal />
      <TaskReportModal />
      <TeamReportModal />
      <ConversationViewerModal />
    </>
  );
}
