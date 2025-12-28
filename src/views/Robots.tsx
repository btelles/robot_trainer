import React from 'react';
import ResourceManager from '../ui/ResourceManager';
import Robot from '../lib/robot';
import SetupWizard from './SetupWizard';

const RobotFields = [
  { name: 'serialNumber', label: 'Serial Number' },
  { name: 'name', label: 'Name' },
  { name: 'model', label: 'Model' },
  { name: 'notes', label: 'Notes' },
];

const RobotsView: React.FC = () => {
  const renderForm = ({ onCancel }: { onCancel: () => void }) => {
    return (
      <SetupWizard />
    );
  };

  return (
    <div className="p-6">
      <ResourceManager title="Robots" resourceKey="resources.robots" fields={RobotFields} renderForm={renderForm} />
    </div>
  );
};

export default RobotsView;
