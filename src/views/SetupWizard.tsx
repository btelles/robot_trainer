import React, { useEffect, useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { ChevronRight, CheckCircle } from '../icons';

interface SerialPort {
  path: string;
  manufacturer: string;
  serialNumber: string;
  productId?: string;
  vendorId?: string;
  pnpId?: string;
}

export const SetupWizard: React.FC = () => {
  const [step, setStep] = useState(1);
  const [cameras, setCameras] = useState<Array<any>>([]);
  const [scanning, setScanning] = useState(false);
  const [serialPorts, setSerialPorts] = useState<SerialPort[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedFollowerPort, setSelectedFollowerPort] = useState<string | null>(null);
  const [selectedLeaderPort, setSelectedLeaderPort] = useState<string | null>(null);
  const [cameraConfigs, setCameraConfigs] = useState<Array<any>>([]);
  const [newCamera, setNewCamera] = useState<{ name: string; resolution: string; fps: number; rotation: number }>({ name: '', resolution: '1280x720', fps: 30, rotation: 0 });
  const [calibration, setCalibration] = useState({ leader: false, follower: false });
  const [pythonScanning, setPythonScanning] = useState(false);
  const [pythonError, setPythonError] = useState<string | null>(null);
  const [robotPlugins, setRobotPlugins] = useState<Array<any>>([]);
  const [teleopPlugins, setTeleopPlugins] = useState<Array<any>>([]);
  const [anacondaScanning, setAnacondaScanning] = useState(false);
  const [anacondaError, setAnacondaError] = useState<string | null>(null);
  const [anacondaResult, setAnacondaResult] = useState<{ found: boolean; path: string | null; envs: Array<{ name: string; pythonPath?: string | null }>; platform?: string; condaAvailable?: boolean; condaVersion?: string } | null>(null);
  const [selectedCondaEnv, setSelectedCondaEnv] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmPythonPath, setConfirmPythonPath] = useState<string | null>(null);
  const [anacondaMessage, setAnacondaMessage] = useState<string | null>(null);
  const [creatingEnv, setCreatingEnv] = useState(false);
  const [createResult, setCreateResult] = useState<{ success: boolean; code: number; output: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedRobot, setSelectedRobot] = useState<string | null>(null);
  const [selectedTeleop, setSelectedTeleop] = useState<string | null>(null);
  const [activeCalibration, setActiveCalibration] = useState<string | null>(null);
  const [cameraCalibration, setCameraCalibration] = useState<Record<string, boolean>>({});

  const addCamera = () => {
    setCameras(prev => [...prev, { id: Date.now(), name: `Camera ${prev.length + 1}`, active: true }]);
  };

  const addCameraConfig = () => {
    if (!newCamera.name.trim()) return;
    setCameraConfigs(prev => [...prev, { id: Date.now().toString(), ...newCamera }]);
    setNewCamera({ name: '', resolution: '1280x720', fps: 30, rotation: 0 });
  };

  const removeCameraConfig = (id: string) => setCameraConfigs(prev => prev.filter(c => c.id !== id));

  const scanPorts = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const ports = await window.electronAPI.scanSerialPorts();
      setSerialPorts(ports);
      if (ports.length > 0) {
        setCalibration(prev => ({ ...prev, leader: true }));
      }
    } catch (error) {
      // Provide friendlier messages for common scenarios
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.match(/permission|access/i)) {
        setScanError('Permission denied when accessing serial ports. Try running with appropriate permissions.');
      } else if (msg.match(/no ports|no devices|Could not find any/i)) {
        setScanError('No serial devices found. Ensure devices are connected and try again.');
      } else {
        setScanError(`Failed to scan USB ports: ${msg}`);
      }
    } finally {
      setScanning(false);
    }
  };

  const saveConfiguration = async () => {
    // validate
    if (!selectedFollowerPort && !selectedLeaderPort) {
      setScanError('Please select at least one robot to configure before saving.');
      return;
    }
    const config = {
      followerPort: selectedFollowerPort,
      leaderPort: selectedLeaderPort,
      cameras: cameraConfigs,
      createdAt: new Date().toISOString(),
    } as any;

    try {
      const res = await (window as any).electronAPI.saveRobotConfig(config);
      if (res && res.ok) {
        // advance to calibration
        setStep(4);
      }
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    }
  };

  const scanPythonPlugins = async () => {
    setPythonScanning(true);
    setPythonError(null);
    try {
      const res = await (window as any).electronAPI.listPythonPlugins();
      // Expect { robots: [...], teleoperators: [...] }
      setRobotPlugins(res?.robots || []);
      setTeleopPlugins(res?.teleoperators || []);
      if ((res?.robots || []).length > 0) setSelectedRobot((res.robots[0].class_name) || null);
      if ((res?.teleoperators || []).length > 0) setSelectedTeleop((res.teleoperators[0].class_name) || null);
    } catch (error) {
      setPythonError(error instanceof Error ? error.message : String(error));
    } finally {
      setPythonScanning(false);
    }
  };

  const checkAnaconda = async () => {
    setAnacondaScanning(true);
    setAnacondaError(null);
    setAnacondaResult(null);
    setSelectedCondaEnv(null);
    setAnacondaMessage(null);
    try {
      const res = await (window as any).electronAPI.checkAnaconda();
      setAnacondaResult(res);
      if (res?.found && (res.envs || []).length > 0) {
        setSelectedCondaEnv(res.envs[0].name || res.envs[0]);
      }
    } catch (err) {
      setAnacondaError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnacondaScanning(false);
    }
  };

  const createAnacondaEnv = async (name = 'robot_trainer') => {
    setCreatingEnv(true);
    setCreateError(null);
    setCreateResult(null);
    try {
      const res = await (window as any).electronAPI.createAnacondaEnv(name);
      setCreateResult(res);
      if (res && res.success) {
        setAnacondaMessage(`Successfully created the Anaconda environment \`robot_trainer\`. `);
        // add the new env to the list so the UI shows it
        setAnacondaResult(prev => {
          if (!prev) return { found: true, path: null, envs: [{ name, pythonPath: null }], platform: undefined, condaAvailable: false, condaVersion: '' } as any;
          const already = prev.envs.find(e => e.name === name);
          if (already) return prev;
          return { ...prev, envs: [...prev.envs, { name, pythonPath: null }] };
        });
        setSelectedCondaEnv(name);
      } else {
        setCreateError(`Failed to create environment (exit ${res?.code}).`);
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingEnv(false);
    }
  };

  const openConfirmForSelectedEnv = () => {
    if (!anacondaResult || !selectedCondaEnv) return;
    const env = anacondaResult.envs.find((e) => e.name === selectedCondaEnv);
    let pythonExec: string | null = null;
    if (env && env.pythonPath) pythonExec = env.pythonPath;
    else if (anacondaResult.path) {
      const envRoot = `${anacondaResult.path}${anacondaResult.path.endsWith('/') ? '' : '/'}${selectedCondaEnv}`;
      pythonExec = (anacondaResult.platform === 'win32') ? `${envRoot}\\python.exe` : `${envRoot}/bin/python`;
    }
    setConfirmPythonPath(pythonExec);
    setConfirmModalOpen(true);
  };

  const confirmSavePythonPath = async () => {
    if (!confirmPythonPath) return;
    try {
      await (window as any).electronAPI.saveSystemSettings({ pythonPath: confirmPythonPath });
      setAnacondaMessage(`Saved Python path: ${confirmPythonPath}`);
      setConfirmModalOpen(false);
    } catch (e) {
      setAnacondaError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="max-w-4xl mx-auto pt-8">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold text-gray-900">New Robot Setup</h2>
        <p className="text-gray-500 mt-1">Configure your leader/follower arms and perception system</p>
      </div>

      <div className="flex items-center justify-center mb-10">
        {[1, 2, 3].map(num => (
          <div key={num} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 
              ${step === num ? 'border-blue-600 bg-blue-600 text-white' : step > num ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 text-gray-400'}`}>
              {num}
            </div>
            {num !== 3 && <div className={`w-24 h-0.5 mx-2 ${step > num ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      <Card className="p-8 min-h-[400px]">
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-lg font-medium">Hardware</h3>
                <p className="text-sm text-gray-500">Attach leader and follower arms</p>
              </div>
              <div>
                <Button variant="ghost" onClick={scanPorts} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan Ports'}</Button>
              </div>
            </div>

            {scanError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {scanError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold">Connected Devices</h4>
                <div className="mt-2">
                  {serialPorts.length === 0 && <p className="text-sm text-gray-500">No Serial devices found. Click "Scan Ports" to search.</p>}
                  <div className="mt-3 space-y-2">
                    {serialPorts.length === 0 ? null : (
                      <div className="space-y-2">
                        {serialPorts.map((p, i) => (
                          <div key={i} data-path={p.path}  className="serial-port-card p-3 border rounded-md bg-gray-50 flex items-start gap-3">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">{p.manufacturer || 'Unknown Device'}</div>
                                <div className="text-xs text-gray-500">Port: {p.path}</div>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">Serial: {p.serialNumber || 'N/A'}</div>
                              <div className="text-xs text-gray-500">Pnp ID: {p.pnpId || 'N/A'}</div>
                              <div className="text-xs text-gray-500">Product ID: {p.productId || 'N/A'} • Vendor ID: {p.vendorId || 'N/A'}</div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <label className="flex items-center gap-2">
                                <input type="radio" name="followerPort" checked={selectedFollowerPort === p.path} onChange={() => {
                                  // prevent assigning same port to both roles
                                  if (selectedLeaderPort === p.path) setSelectedLeaderPort(null);
                                  setSelectedFollowerPort(p.path);
                                }} />
                                <span className="text-sm">Use as Follower</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input type="radio" name="leaderPort" checked={selectedLeaderPort === p.path} onChange={() => {
                                  if (selectedFollowerPort === p.path) setSelectedFollowerPort(null);
                                  setSelectedLeaderPort(p.path);
                                }} disabled={selectedFollowerPort === p.path} />
                                <span className="text-sm">Use as Leader</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input type="radio" name="notUsedPort" checked={selectedLeaderPort !== p.path && selectedFollowerPort !== p.path} onChange={() => {
                                  if (selectedFollowerPort === p.path) setSelectedFollowerPort(null);
                                  if (selectedLeaderPort === p.path) setSelectedLeaderPort(null);
                                }} disabled={selectedFollowerPort === p.path} />
                                <span className="text-sm">Don't use</span>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold">Calibration Status</h4>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between p-2 border rounded-md">
                    <div>Leader Arm</div>
                    <div className="text-sm text-gray-500">{calibration.leader ? 'Calibrated' : 'Not Calibrated'}</div>
                  </div>
                  <div className="flex items-center justify-between p-2 border rounded-md">
                    <div>Follower Arm</div>
                    <div className="text-sm text-gray-500">{calibration.follower ? 'Calibrated' : 'Not Calibrated'}</div>
                  </div>
                  <div className="mt-4 p-3 border rounded-md bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">Python Plugins</div>
                      <Button variant="ghost" onClick={scanPythonPlugins} disabled={pythonScanning}>{pythonScanning ? 'Scanning…' : 'Scan Python Plugins'}</Button>
                    </div>
                    {pythonError && <div className="text-sm text-red-600 mb-2">{pythonError}</div>}
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">Robot Class</label>
                        <Select
                          value={selectedRobot || ''}
                          onChange={(e: any) => setSelectedRobot(e.target.value)}
                          options={[{ label: 'Select robot', value: '' }, ...robotPlugins.map((r) => ({ label: `${r.name || r.class_name} — ${r.class_name}`, value: r.class_name }))]}
                        />
                      </div>

                      <div>
                        <label className="text-xs text-gray-600">Teleoperator Class</label>
                        <Select
                          value={selectedTeleop || ''}
                          onChange={(e: any) => setSelectedTeleop(e.target.value)}
                          options={[{ label: 'Select teleoperator', value: '' }, ...teleopPlugins.map((t) => ({ label: `${t.name || t.class_name} — ${t.class_name}`, value: t.class_name }))]}
                        />
                      </div>
                    </div>
                    <div className="mt-4 p-3 border rounded-md bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">Python Environment</div>
                        <Button variant="ghost" onClick={checkAnaconda} disabled={anacondaScanning}>{anacondaScanning ? 'Detecting…' : 'Detect Anaconda'}</Button>
                      </div>
                      {anacondaError && <div className="text-sm text-red-600 mb-2">{anacondaError}</div>}
                      {!anacondaResult && <div className="text-sm text-gray-500">Click "Detect Anaconda" to look for a local Anaconda installation.</div>}

                      {anacondaResult && anacondaResult.found && (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-600">Detected Anaconda: <span className="font-mono text-sm">{anacondaResult.path}</span></div>
                          <div className="space-y-1 mt-2">
                            {anacondaResult.envs.length === 0 && (
                              <div className="space-y-2">
                                <div className="text-sm text-gray-500">No environments found in the Anaconda envs directory. <br />
                                  We recommend that you have a dedicated environment for Robot Trainer.<br />
                                  Would you like us to create one called <span className="font-mono">robot_trainer</span>?</div>
                                <div className="flex items-center gap-3">
                                  <Button onClick={() => createAnacondaEnv('robot_trainer')} disabled={creatingEnv}>
                                    {creatingEnv ? (
                                      <span className="inline-flex items-center gap-2">
                                        <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" />
                                        Creating…
                                      </span>
                                    ) : 'Yes'}
                                  </Button>
                                  <Button variant="ghost" onClick={() => { window.dispatchEvent(new CustomEvent('robotflow:navigate', { detail: 'system-settings' })); }}>No, point to custom Python</Button>
                                </div>
                              </div>
                            )}

                            {anacondaResult.envs.map((envObj) => (
                              <label key={envObj.name} className="flex items-center gap-3 p-2 border rounded-md">
                                <input type="radio" name="condaEnv" checked={selectedCondaEnv === envObj.name} onChange={() => setSelectedCondaEnv(envObj.name)} />
                                <div className="text-sm">{envObj.name}</div>
                                {envObj.pythonPath && <div className="ml-auto text-xs text-gray-500">{envObj.pythonPath}</div>}
                              </label>
                            ))}
                          </div>

                          <div className="flex items-center gap-3">
                            <Button onClick={openConfirmForSelectedEnv} disabled={!selectedCondaEnv}>Use this environment</Button>
                            <div className="text-sm text-gray-500">or</div>
                            <Button variant="ghost" onClick={() => { window.dispatchEvent(new CustomEvent('robotflow:navigate', { detail: 'system-settings' })); }}>Point to custom Python</Button>
                          </div>
                          {anacondaMessage && <div className="text-sm text-green-600">{anacondaMessage}</div>}
                        </div>
                      )}

                      {anacondaResult && !anacondaResult.found && (
                        <div className="space-y-2">
                          <div className="text-sm">No Anaconda installation detected in your home directory.</div>
                          <div className="flex items-center gap-3">
                            <Button onClick={() => window.open('https://www.anaconda.com/download/success', '_blank')}>Install Anaconda</Button>
                            <Button variant="ghost" onClick={() => { window.dispatchEvent(new CustomEvent('robotflow:navigate', { detail: 'system-settings' })); }}>Point to custom Python</Button>
                          </div>
                          <div className="text-sm text-gray-600">Anaconda is recommended for machine learning workflows used by Robot Trainer.</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-lg font-medium">Cameras</h3>
                <p className="text-sm text-gray-500">Add and configure cameras for this robot</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input className="p-2 border rounded" placeholder="Camera name" value={newCamera.name} onChange={(e) => setNewCamera(prev => ({ ...prev, name: e.target.value }))} />
                <select className="p-2 border rounded" value={newCamera.resolution} onChange={(e) => setNewCamera(prev => ({ ...prev, resolution: e.target.value }))}>
                  <option value="1280x720">1280x720</option>
                  <option value="1920x1080">1920x1080</option>
                  <option value="640x480">640x480</option>
                </select>
                <input className="p-2 border rounded" type="number" value={newCamera.fps} onChange={(e) => setNewCamera(prev => ({ ...prev, fps: Number(e.target.value) }))} />
              </div>
              <div className="flex gap-2">
                <Button onClick={addCameraConfig}>Add Camera</Button>
                <div className="text-sm text-gray-500 self-center">Configured cameras: {cameraConfigs.length}</div>
              </div>

              <div className="space-y-2">
                {cameraConfigs.map(cam => (
                  <div key={cam.id} className="p-3 border rounded flex justify-between items-center">
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
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Review & Save</h3>
                <p className="text-sm text-gray-500">Review your selected devices and cameras before saving.</p>
              </div>
            </div>

            <div className="border rounded-lg p-6">
              <h4 className="font-medium mb-4">Devices</h4>
              <ul className="space-y-2">
                <li>Follower (robot): {selectedFollowerPort || 'Not selected'}</li>
                <li>Leader (teleoperator): {selectedLeaderPort || 'Not selected'}</li>
              </ul>

              <h4 className="font-medium mt-6 mb-4">Cameras</h4>
              {cameraConfigs.length === 0 ? (
                <p className="text-sm text-gray-500">No cameras configured</p>
              ) : (
                <ul className="space-y-2">
                  {cameraConfigs.map((c) => (
                    <li key={c.id} className="flex justify-between">
                      <span>{c.name}</span>
                      <span className="text-sm text-gray-500">{c.resolution} @ {c.fps}fps</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-4">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={saveConfiguration} disabled={!selectedFollowerPort || !selectedLeaderPort}>Save Configuration</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Calibration</h3>
                <p className="text-sm text-gray-500">Calibrate follower, leader, and cameras</p>
              </div>
            </div>

            <div className="border-b">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button onClick={() => { }} className={`py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500`}>Devices</button>
                <button onClick={() => { }} className={`py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500`}>Cameras</button>
              </nav>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 border rounded">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium">Follower (Robot)</h4>
                    <Button variant={activeCalibration === 'follower' ? 'primary' : 'outline'} onClick={() => setActiveCalibration(activeCalibration === 'follower' ? null : 'follower')}>{activeCalibration === 'follower' ? 'Stop' : 'Start'} Calibration</Button>
                  </div>
                  {activeCalibration === 'follower' && (
                    <div>
                      <div className="text-sm text-gray-600">Running calibration steps...</div>
                      <div className="mt-3 w-full bg-gray-200 h-2.5 rounded-full"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: '50%' }} /></div>
                    </div>
                  )}
                </div>

                <div className="p-3 border rounded">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium">Leader (Teleoperator)</h4>
                    <Button variant={activeCalibration === 'leader' ? 'primary' : 'outline'} onClick={() => setActiveCalibration(activeCalibration === 'leader' ? null : 'leader')}>{activeCalibration === 'leader' ? 'Stop' : 'Start'} Calibration</Button>
                  </div>
                  {activeCalibration === 'leader' && (
                    <div>
                      <div className="text-sm text-gray-600">Running calibration steps...</div>
                      <div className="mt-3 w-full bg-gray-200 h-2.5 rounded-full"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: '60%' }} /></div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {cameraConfigs.length === 0 && <div className="text-sm text-gray-500">No cameras to calibrate.</div>}
                {cameraConfigs.map(cam => (
                  <div key={cam.id} className="p-3 border rounded flex justify-between items-center">
                    <div>
                      <div className="font-medium">{cam.name}</div>
                      <div className="text-xs text-gray-500">{cam.resolution} — {cam.fps} fps</div>
                    </div>
                    <div>
                      <Button variant={cameraCalibration[cam.id] ? 'primary' : 'outline'} onClick={() => setCameraCalibration(prev => ({ ...prev, [cam.id]: !prev[cam.id] }))}>{cameraCalibration[cam.id] ? 'Stop' : 'Start'} Calibration</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Confirmation modal for selecting python executable */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-md shadow-lg w-96 p-6">
            <h3 className="text-lg font-medium mb-2">Confirm Python Path</h3>
            <p className="text-sm text-gray-600 mb-4">Please confirm the Python executable that will be used by Robot Trainer.</p>
            <div className="p-3 mb-4 bg-gray-50 border rounded text-sm font-mono break-all">{confirmPythonPath || 'No Python executable detected for this environment.'}</div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setConfirmModalOpen(false)}>Cancel</Button>
              <Button onClick={confirmSavePythonPath} disabled={!confirmPythonPath}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between mt-6">
        <Button variant="ghost" disabled={step === 1} onClick={() => setStep(s => Math.max(1, s - 1))}>Back</Button>
        {step < 4 ? (
          <Button onClick={() => setStep(s => Math.min(4, s + 1))}>
            Next Step <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        ) : null}
      </div>
      {/* Create env result toast (persistent until dismissed) */}
      {(createError || (createResult && !createResult.success)) && (
        <div className="fixed right-4 bottom-4 z-50 w-96 bg-white border rounded shadow-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="font-medium text-sm text-red-700">Failed to create Anaconda environment</div>
              <pre className="mt-2 text-xs text-gray-700 max-h-48 overflow-auto whitespace-pre-wrap">{createResult?.output || createError}</pre>
            </div>
            <div className="flex flex-col items-end">
              <button className="text-sm text-gray-500" onClick={() => { setCreateError(null); setCreateResult(null); }}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SetupWizard;
