import React from 'react';

const createMockIcon = (name) => {
  const MockIcon = (props) => (
    <span data-testid={`mock-icon-${name.toLowerCase()}`} {...props} />
  );
  MockIcon.displayName = name;
  return MockIcon;
};

export const LayoutDashboard = createMockIcon('LayoutDashboard');
export const Clock = createMockIcon('Clock');
export const Users = createMockIcon('Users');
export const BarChart3 = createMockIcon('BarChart3');
export const Globe = createMockIcon('Globe');
export const Settings = createMockIcon('Settings');
export const LogOut = createMockIcon('LogOut');
export const HardDrive = createMockIcon('HardDrive');