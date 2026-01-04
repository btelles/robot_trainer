import React, { useState } from 'react';
import Button from '../ui/Button';

const CameraConfigurationWizard: React.FC = () => {
  const [cameraConfigs, setCameraConfigs] = useState<Array<any>>([]);
  const [newCamera, setNewCamera] = useState<{ name: string; resolution: string; fps: number; rotation: number }>({ name: '', resolution: '1280x720', fps: 30, rotation: 0 });
  const [cameraCalibration, setCameraCalibration] = useState<Record<string, boolean>>({});

  const addCameraConfig = () => {
    if (!newCamera.name.trim()) return;
    const cam = { id: Date.now().toString(), ...newCamera };
    setCameraConfigs((prev) => [...prev, cam]);
    setNewCamera({ name: '', resolution: '1280x720', fps: 30, rotation: 0 });
  };

  const removeCameraConfig = (id: string) => setCameraConfigs((prev) => prev.filter((c) => c.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
        <div>
          <h3 className="text-lg font-medium">Cameras</h3>
          <p className="text-sm text-gray-500">Add and configure cameras for this robot</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            aria-label="camera-name"
            className="p-2 border rounded"
            placeholder="Camera name"
            value={newCamera.name}
            onChange={(e) => setNewCamera((prev) => ({ ...prev, name: e.target.value }))}
          />
          <select
            aria-label="camera-resolution"
            className="p-2 border rounded"
            value={newCamera.resolution}
            onChange={(e) => setNewCamera((prev) => ({ ...prev, resolution: e.target.value }))}
          >
            <option value="1280x720">1280x720</option>
            <option value="1920x1080">1920x1080</option>
            <option value="640x480">640x480</option>
          </select>
          <input
            aria-label="camera-fps"
            className="p-2 border rounded"
            type="number"
            value={newCamera.fps}
            onChange={(e) => setNewCamera((prev) => ({ ...prev, fps: Number(e.target.value) }))}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={addCameraConfig}>Add Camera</Button>
          <div className="text-sm text-gray-500 self-center">Configured cameras: {cameraConfigs.length}</div>
        </div>

        <div className="space-y-2">
          {cameraConfigs.map((cam) => (
            <div key={cam.id} data-testid={`camera-${cam.id}`} className="p-3 border rounded flex justify-between items-center">
              <div>
                <div className="font-medium">{cam.name}</div>
                <div className="text-xs text-gray-500">{cam.resolution} — {cam.fps} fps</div>
              </div>
              <div>
                <Button variant="ghost" onClick={() => removeCameraConfig(cam.id)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h4 className="font-medium mb-2">Camera Calibration</h4>
          {cameraConfigs.length === 0 && <div className="text-sm text-gray-500">No cameras to calibrate.</div>}
          {cameraConfigs.map((cam) => (
            <div key={cam.id} className="p-3 border rounded flex justify-between items-center mb-2">
              <div>
                <div className="font-medium">{cam.name}</div>
                <div className="text-xs text-gray-500">{cam.resolution} — {cam.fps} fps</div>
              </div>
              <div>
                <Button
                  variant={cameraCalibration[cam.id] ? 'primary' : 'outline'}
                  onClick={() => setCameraCalibration((prev) => ({ ...prev, [cam.id]: !prev[cam.id] }))}
                >
                  {cameraCalibration[cam.id] ? 'Stop' : 'Start'} Calibration
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CameraConfigurationWizard;
