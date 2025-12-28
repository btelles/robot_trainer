import React from 'react';
import ResourceManager from '../ui/ResourceManager';
import Camera from '../lib/camera';

const CameraFields = [
  { name: 'serialNumber', label: 'Serial Number' },
  { name: 'name', label: 'Name' },
  { name: 'resolution', label: 'Resolution' },
  { name: 'fps', label: 'FPS', type: 'number' },
];

const CamerasView: React.FC = () => {
  return (
    <div className="p-6">
      <ResourceManager title="Cameras" resourceKey="resources.cameras" fields={CameraFields} />
    </div>
  );
};

export default CamerasView;
