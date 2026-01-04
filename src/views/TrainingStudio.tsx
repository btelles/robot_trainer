import React, { useState, useEffect } from 'react';
import { ML_LIBRARIES, DEFAULT_CONFIG } from '../constants/mockData';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { Play, Zap } from '../icons';
import { VideoPlayer } from '../ui/VideoPlayer';

export const TrainingStudio: React.FC = () => {
  const [recording, setRecording] = useState(false);
  const [config, setConfig] = useState<any>(DEFAULT_CONFIG);
  const [episodes, setEpisodes] = useState<Array<any>>([
    { id: 1, duration: '60s', status: 'valid', timestamp: '10:00 AM' },
    { id: 2, duration: '60s', status: 'valid', timestamp: '10:05 AM' },
    { id: 3, duration: '12s', status: 'aborted', timestamp: '10:08 AM' },
  ]);

  const toggleRecord = () => {
    setRecording(r => !r);
    if (!recording) {
      setTimeout(() => {
        setEpisodes(prev => [...prev, { id: prev.length + 1, duration: '0s', status: 'recording', timestamp: 'Now' }]);
      }, 500);
    }
  };

  const [simRunning, setSimRunning] = useState(false);
  const [simUrl, setSimUrl] = useState<string | null>(null);

  useEffect(() => {
    const offStopped = (window as any).electronAPI?.onSimulationStopped
      ? (window as any).electronAPI.onSimulationStopped(() => {
          setSimRunning(false);
          setSimUrl(null);
        })
      : null;

    return () => {
      if (offStopped) offStopped();
    };
  }, []);

  const startSimulation = async () => {
    try {
      // @ts-ignore
      const res = await (window as any).electronAPI?.startSimulation(config);
      if (res && res.ok !== false) {
        setSimRunning(true);
        if (res.wsUrl) setSimUrl(res.wsUrl);
      }
    } catch (e) {
      // ignore
    }
  };

  const stopSimulation = async () => {
    try {
      // @ts-ignore
      await (window as any).electronAPI?.stopSimulation();
    } catch (e) {
      // ignore
    }
    setSimRunning(false);
    setSimUrl(null);
  };

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Training Studio
          </h1>
          <p className="text-sm text-gray-500 mt-1">Record demonstrations and train policies</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Library:</span>
          <select className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-md focus:ring-blue-500 focus:border-blue-500 block p-1.5">
            {ML_LIBRARIES.map(lib => <option key={lib.id} value={lib.id}>{lib.name}</option>)}
          </select>
          <Button variant="primary">
            <Play className="h-4 w-4 mr-2" /> Train Policy
          </Button>
          <Button onClick={() => simRunning ? stopSimulation() : startSimulation()}>
            {simRunning ? 'Stop Simulation' : 'Start Simulation'}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r border-gray-200 bg-gray-50 p-6 overflow-y-auto">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Teleoperation</h3>
          <div className="mb-6">
            <div className={`p-4 rounded-lg border text-center transition-colors ${recording ? 'bg-red-50 border-red-200' : 'bg-white border-gray-300'}`}>
              <div className="text-sm font-medium">Live Teleop</div>
              <div className="mt-2">
                <Button onClick={toggleRecord}>{recording ? 'Stop Recording' : 'Start Recording'}</Button>
              </div>
            </div>
          </div>

          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 mt-8">Training Config</h3>
          <div className="space-y-1">
            <Input label="Repo ID" value={config.repo_id} onChange={(e) => setConfig({...config, repo_id: e.target.value})} />
            <Select
              label="Policy Type"
              value={config.policy_type}
              options={[{label: 'ACT (Action Chunking)', value: 'act'}, {label: 'Diffusion', value: 'diffusion'}]}
              onChange={(e) => setConfig({...config, policy_type: e.target.value})}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Episodes" value={config.num_episodes} type="number" onChange={(e) => setConfig({...config, num_episodes: e.target.value})} />
              <Input label="FPS" value={config.fps} type="number" onChange={(e) => setConfig({...config, fps: e.target.value})} />
            </div>
          </div>
        </div>

        <div className="flex-1 bg-gray-100 p-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="aspect-video bg-black flex items-center justify-center relative overflow-hidden group rounded-md overflow-hidden">
              {simUrl ? (
                <VideoPlayer url={simUrl} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white">Simulation Preview</div>
              )}
            </div>
            <Card className="aspect-video bg-black flex items-center justify-center" />
          </div>

          <h3 className="text-lg font-medium text-gray-900 mb-4">Dataset Timeline</h3>
          <div className="space-y-3">
            {episodes.map(ep => (
              <div key={ep.id} className="p-3 bg-white border rounded-md flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Episode {ep.id}</div>
                  <div className="text-xs text-gray-500">{ep.duration} • {ep.timestamp}</div>
                </div>
                <div className="text-sm text-gray-600">{ep.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingStudio;
