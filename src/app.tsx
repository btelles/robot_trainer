import React, { useState } from 'react';
import SetupWizard from './views/SetupWizard';
import SystemSettings from './views/SystemSettings';
import TrainingStudio from './views/TrainingStudio';
import AssemblyView from './views/AssemblyView';
import MonitoringView from './views/Monitoring';
import Cameras from './views/Cameras';
import Robots from './views/Robots';

import { Home, Activity, Cpu, Robot, Zap, Layout, Settings } from './icons';
import Button from './ui/Button';

const NavItem: React.FC<{ id: string; icon: any; label: string; active: string; onClick: (id: string) => void }> = ({ id, icon: Icon, label, active, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors mb-1 ${active === id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  React.useEffect(() => {
    const handler = (ev: Event) => {
      try {
        // @ts-ignore
        const detail = (ev as CustomEvent).detail;
        if (typeof detail === 'string') setActiveTab(detail);
      } catch (e) { }
    };
    window.addEventListener('robottrainer:navigate', handler as EventListener);
    return () => window.removeEventListener('robottrainer:navigate', handler as EventListener);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <AssemblyView />;
      case 'training': return <TrainingStudio />;
      case 'robots': return <Robots />;
      case 'cameras': return <Cameras />;
      case 'setup': return <SetupWizard />;
      case 'system-settings': return <SystemSettings />;
      case 'monitoring': return <MonitoringView />;
      default: return <AssemblyView />;
    }
  };

  return (
    <div className="flex h-screen bg-white font-sans text-gray-900">
      <aside className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="h-14 flex items-center px-6 border-b border-gray-200 bg-white">
          <div className="w-6 h-6 bg-gradient-to-br from-pink-500 to-orange-400 rounded-md mr-3 shadow-sm"></div>
          <span className="font-bold text-lg tracking-tight text-gray-800">Robot Trainer</span>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4">
          <div className="mb-8">
            <NavItem id="dashboard" icon={Home} label="Home" active={activeTab} onClick={setActiveTab} />
            <NavItem id="monitoring" icon={Activity} label="Monitoring" active={activeTab} onClick={setActiveTab} />
          </div>

          <div className="mb-8">
            <NavItem id="robots" icon={Robot} label="Robots" active={activeTab} onClick={setActiveTab} />
            <NavItem id="cameras" icon={Cpu} label="Cameras" active={activeTab} onClick={setActiveTab} />
            <NavItem id="training" icon={Zap} label="Training Studio" active={activeTab} onClick={setActiveTab} />
            <NavItem id="lines" icon={Layout} label="Assembly Lines" active={activeTab} onClick={setActiveTab} />
            <NavItem id="system-settings" icon={Settings} label="System Settings" active={activeTab} onClick={setActiveTab} />
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">Admin</div>
            <Settings className="ml-auto h-4 w-4 text-gray-400 cursor-pointer hover:text-gray-600" />
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center text-sm text-gray-500"></div>
          <div className="flex items-center gap-3">
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
