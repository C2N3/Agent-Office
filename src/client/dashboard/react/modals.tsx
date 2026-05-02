import React, { type ReactElement } from 'react';
import { AvatarPickerModal } from './avatarPickerModal';
import { CreateAgentModal } from './createAgentModal/index';

export function DashboardModals(): ReactElement {
  return (
    <>
      <CreateAgentModal />
      <AvatarPickerModal />
    </>
  );
}
