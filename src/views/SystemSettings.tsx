import React, { useEffect, useState } from 'react';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface SystemSettingsShape {
  pythonPath?: string;
  venvPath?: string;
  extraPath?: string; // newline separated
  envVars?: { key: string; value: string }[];
}

const defaultSettings: SystemSettingsShape = {
  pythonPath: '',
  venvPath: '',
  extraPath: '',
  envVars: [],
};

const SystemSettings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettingsShape>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        // prefer electron API if available
        const loaded = (window as any).electronAPI?.loadSystemSettings
          ? await (window as any).electronAPI.loadSystemSettings()
          : JSON.parse(localStorage.getItem('systemSettings') || 'null');
        if (loaded && typeof loaded === 'object') setSettings(loaded as SystemSettingsShape);
      } catch (err) {
        // ignore
      }
    };
    load();
    // subscribe to external changes
    const unsub = (window as any).electronAPI?.onSystemSettingsChanged
      ? (window as any).electronAPI.onSystemSettingsChanged((data: any) => {
        if (data && typeof data === 'object') setSettings(data as SystemSettingsShape);
      })
      : null;
    return () => { if (unsub) unsub(); };
  }, []);

  const update = (patch: Partial<SystemSettingsShape>) => {
    setSettings(prev => ({ ...(prev || {}), ...patch }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if ((window as any).electronAPI?.saveSystemSettings) {
        await (window as any).electronAPI.saveSystemSettings(settings);
      } else {
        localStorage.setItem('systemSettings', JSON.stringify(settings));
      }
      setMessage('Settings saved');
    } catch (err) {
      setMessage(`Failed to save settings: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const setEnvVar = (idx: number, field: 'key' | 'value', value: string) => {
    const envVars = (settings.envVars || []).slice();
    envVars[idx] = { ...(envVars[idx] || { key: '', value: '' }), [field]: value };
    update({ envVars });
  };

  const addEnvVar = () => {
    update({ envVars: [...(settings.envVars || []), { key: '', value: '' }] });
  };

  const removeEnvVar = (idx: number) => {
    const envVars = (settings.envVars || []).slice();
    envVars.splice(idx, 1);
    update({ envVars });
  };

  return (
    <div className="max-w-4xl mx-auto pt-8">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold text-gray-900">System Settings</h2>
        <p className="text-gray-500 mt-1">Configure Python interpreter and system-level environment variables</p>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700">Python Interpreter Path</label>
            <Input value={settings.pythonPath || ''} onChange={(e: any) => update({ pythonPath: e.target.value })} placeholder="/usr/bin/python3 or C:\\Python39\\python.exe" />
            <p className="text-xs text-gray-500 mt-1">Full path to the Python interpreter to use for jobs.</p>
          </div>

          <div>
            <label className="block text-sm text-gray-700">Virtual Environment Path</label>
            <Input value={settings.venvPath || ''} onChange={(e: any) => update({ venvPath: e.target.value })} placeholder="/home/user/.venv/myenv" />
            <p className="text-xs text-gray-500 mt-1">Optional: point to a virtual environment to use.</p>
          </div>

          <div>
            <label className="block text-sm text-gray-700">Extra PATH entries</label>
            <textarea className="w-full mt-1 p-2 border rounded text-sm" rows={3} value={settings.extraPath || ''} onChange={(e) => update({ extraPath: e.target.value })} placeholder="/opt/bin\n/other/bin" />
            <p className="text-xs text-gray-500 mt-1">Add extra directories (one per line) to prepend to PATH for subprocesses.</p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm text-gray-700">Environment Variables</label>
              <Button variant="ghost" onClick={addEnvVar}>Add</Button>
            </div>

            <div className="mt-2 space-y-2">
              {(settings.envVars || []).map((v, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input className="flex-1" value={v.key} onChange={(e: any) => setEnvVar(idx, 'key', e.target.value)} placeholder="KEY" />
                  <Input className="flex-1" value={v.value} onChange={(e: any) => setEnvVar(idx, 'value', e.target.value)} placeholder="VALUE" />
                  <Button variant="ghost" onClick={() => removeEnvVar(idx)}>Remove</Button>
                </div>
              ))}
              {(!settings.envVars || settings.envVars.length === 0) && <div className="text-sm text-gray-500">No environment variables configured.</div>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
            <Button variant="ghost" onClick={() => { setSettings(defaultSettings); setMessage('Reset to defaults'); }}>Reset</Button>
            {message && <div className="text-sm text-gray-600 ml-3">{message}</div>}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SystemSettings;
