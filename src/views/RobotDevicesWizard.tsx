import React, { useEffect, useState } from 'react';
import Button from '../ui/Button';

interface SerialPort { path: string; manufacturer: string; serialNumber: string; productId?: string; vendorId?: string; pnpId?: string; }

const RobotDevicesWizard: React.FC = () => {
  const [serialPorts, setSerialPorts] = useState<SerialPort[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedFollowerPort, setSelectedFollowerPort] = useState<string | null>(null);
  const [selectedLeaderPort, setSelectedLeaderPort] = useState<string | null>(null);
  const [robotPlugins, setRobotPlugins] = useState<Array<any>>([]);
  const [teleopPlugins, setTeleopPlugins] = useState<Array<any>>([]);
  const [pythonScanning, setPythonScanning] = useState(false);
  const [pythonError, setPythonError] = useState<string | null>(null);

  useEffect(() => {
    // no-op on mount for tests; callers may call scanPorts
  }, []);

  const scanPorts = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const ports = await (window as any).electronAPI.scanSerialPorts();
      setSerialPorts(ports || []);
    } catch (error) {
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

  const scanPythonPlugins = async () => {
    setPythonScanning(true);
    setPythonError(null);
    try {
      const res = await (window as any).electronAPI.listPythonPlugins();
      setRobotPlugins(res?.robots || []);
      setTeleopPlugins(res?.teleoperators || []);
    } catch (error) {
      setPythonError(error instanceof Error ? error.message : String(error));
    } finally {
      setPythonScanning(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
        <div>
          <h3 className="text-lg font-medium">Select a device.</h3>
          <p className="text-sm text-gray-500">Which device below is your robot?</p>
        </div>
        <div>
          <Button variant="ghost" onClick={scanPorts} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan Ports'}</Button>
        </div>
      </div>

      {scanError && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{scanError}</div>}

      <div>
        {serialPorts.length === 0 ? (
          <div>
            <p className="text-sm text-gray-500">No devices found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {serialPorts.map((p, i) => (
              <div key={i} data-path={p.path} className="serial-port-card p-3 border rounded-md bg-gray-50 flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{p.manufacturer || 'Unknown Device'}</div>
                    <div className="text-xs text-gray-500">Port: {p.path}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Serial: {p.serialNumber || 'N/A'}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <label className="flex items-center gap-2">
                    <input type="radio" name={`follower-${p.path}`} checked={selectedFollowerPort === p.path} onChange={() => { if (selectedLeaderPort === p.path) setSelectedLeaderPort(null); setSelectedFollowerPort(p.path); }} />
                    <span className="text-sm">Use as Follower</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name={`leader-${p.path}`} checked={selectedLeaderPort === p.path} onChange={() => { if (selectedFollowerPort === p.path) setSelectedFollowerPort(null); setSelectedLeaderPort(p.path); }} />
                    <span className="text-sm">Use as Leader</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 p-3 rounded-md bg-white">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Python Plugins</div>
          <Button variant="ghost" onClick={scanPythonPlugins} disabled={pythonScanning}>{pythonScanning ? 'Scanning…' : 'Scan Python Plugins'}</Button>
        </div>
        {pythonError && <div className="text-sm text-red-600 mb-2">{pythonError}</div>}
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-600">Robot Class</label>
            <div className="text-sm text-gray-700">{robotPlugins.length} found</div>
          </div>
          <div>
            <label className="text-xs text-gray-600">Teleoperator Class</label>
            <div className="text-sm text-gray-700">{teleopPlugins.length} found</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RobotDevicesWizard;
