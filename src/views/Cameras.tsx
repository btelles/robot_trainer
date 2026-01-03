import React from 'react';
import ResourceManager from '../ui/ResourceManager';
import { camerasTable } from '../db/schema';
import { db } from '../db/db';

const CameraFields = [
  { name: 'serialNumber', label: 'Serial Number' },
  { name: 'name', label: 'Name' },
  { name: 'resolution', label: 'Resolution' },
  { name: 'fps', label: 'FPS', type: 'number' },
];

const CamerasView: React.FC = () => {
  return (
    <div className="p-6">
      <ResourceManager title="Cameras" table={camerasTable} />
    </div>
  );
};

export default CamerasView;
