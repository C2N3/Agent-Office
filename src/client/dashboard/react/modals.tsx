import React, { type ReactElement } from 'react';
import { AvatarPickerModal } from './avatarPickerModal.js';
import { CreateAgentModal } from './createAgentModal/index.js';

export function DashboardModals(): ReactElement {
  return (
    <>
      <CreateAgentModal />
      <AvatarPickerModal />
    </>
  );
}
