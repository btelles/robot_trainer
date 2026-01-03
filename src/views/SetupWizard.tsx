import React, { useEffect, useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { ChevronRight, CheckCircle } from '../icons';
import useUIStore from '../lib/uiStore';

interface SerialPort {
  path: string;
  manufacturer: string;
  serialNumber: string;
  productId?: string;
  vendorId?: string;
  pnpId?: string;
}

const AccordionItem = ({ title, isOpen, onToggle, status, children }: any) => {
  return (
    <div className="border rounded-md mb-2 overflow-hidden">
      <div
        className={`flex items-center justify-between p-3 cursor-pointer ${isOpen ? 'bg-gray-50' : 'bg-white'}`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {status === 'complete' ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <div className={`w-5 h-5 rounded-full border-2 ${status === 'loading' ? 'border-blue-500 border-t-transparent animate-spin' : 'border-gray-300'}`} />
          )}
          <span className="font-medium">{title}</span>
        </div>
        <ChevronRight className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </div>
      {isOpen && (
        <div className="p-3 border-t bg-white">
          {children}
        </div>
      )}
    </div>
  );
};

export const SetupWizard: React.FC = () => {
  const [step, setStep] = useState(1);

  // Accordion state
  const [expandedItem, setExpandedItem] = useState<number | null>(1);

  // Step 1: Miniconda
  const [condaStatus, setCondaStatus] = useState<'pending' | 'loading' | 'complete' | 'error'>('pending');
  const [condaResult, setCondaResult] = useState<any>(null);
  const [condaError, setCondaError] = useState<string | null>(null);

  // Step 2: Env
  const [envStatus, setEnvStatus] = useState<'pending' | 'loading' | 'complete' | 'error'>('pending');
  const [envError, setEnvError] = useState<string | null>(null);

  // Step 3: LeRobot
  const [lerobotStatus, setLerobotStatus] = useState<'pending' | 'loading' | 'complete' | 'error'>('pending');
  const [lerobotError, setLerobotError] = useState<string | null>(null);
  const [lerobotOutput, setLerobotOutput] = useState<string | null>(null);

  const setCurrentPage = useUIStore((s: any) => s.setCurrentPage);
  const setResourceManagerShowForm = useUIStore((s: any) => s.setResourceManagerShowForm);
  const setShowSetupWizard = useUIStore((s: any) => s.setShowSetupWizard);

  // Initial check
  useEffect(() => {
    checkConda();
  }, []);

  // auto-close modal when all steps complete
  useEffect(() => {
    if (condaStatus === 'complete' && envStatus === 'complete' && lerobotStatus === 'complete') {
      try { setShowSetupWizard(false); } catch (e) { }
    }
  }, [condaStatus, envStatus, lerobotStatus, setShowSetupWizard]);

  const checkConda = async () => {
    setCondaStatus('loading');
    try {
      const res = await window.electronAPI.checkAnaconda();
      debugger;
      setCondaResult(res);
      if (res.found) {
        setCondaStatus('complete');
        // Check env
        const hasEnv = res.envs.some((e: any) => e.name === 'robot_trainer');
        if (hasEnv) {
          setEnvStatus('complete');

          // Also ensure we save the python path
          const env = res.envs.find((e: any) => e.name === 'robot_trainer');
          if (env && env.pythonPath) {
            await window.electronAPI.saveSystemSettings({ pythonPath: env.pythonPath, condaRoot: res.path });
          }

          // Check LeRobot
          setLerobotStatus('loading');
          const lr = await window.electronAPI.checkLerobot();
          if (lr.installed) {
            setLerobotStatus('complete');
            setExpandedItem(null);
          } else {
            setLerobotStatus('pending');
            setExpandedItem(3);
          }
        } else {
          setEnvStatus('pending');
          setExpandedItem(2);
        }
      } else {
        setCondaStatus('pending'); // Not found, need action
        setExpandedItem(1);
      }
    } catch (e) {
      setCondaError(String(e));
      setCondaStatus('error');
    }
  };

  const handleInstallMiniconda = async () => {
    setCondaStatus('loading');
    setCondaError(null);
    try {
      const res = await window.electronAPI.installMiniconda();
      if (res.success) {
        // Re-check
        console.log('Miniconda installed, re-checking...');
        await checkConda();
      } else {
        setCondaError(res.error || 'Installation failed');
        setCondaStatus('error');
      }
    } catch (e) {
      setCondaError(String(e));
      setCondaStatus('error');
    }
  };

  const handleCreateEnv = async () => {
    setEnvStatus('loading');
    setEnvError(null);
    try {
      const res = await window.electronAPI.createAnacondaEnv('robot_trainer');
      if (res.success) {
        setEnvStatus('complete');
        setExpandedItem(3);
        // Refresh conda result to get the new env path
        const condaRes = await window.electronAPI.checkAnaconda();
        setCondaResult(condaRes);

        // Save system settings with the new python path
        const env = condaRes.envs.find((e: any) => e.name === 'robot_trainer');
        if (env && env.pythonPath) {
          await window.electronAPI.saveSystemSettings({ pythonPath: env.pythonPath, condaRoot: condaRes.path });
        }
      } else {
        setEnvError(res.output || 'Creation failed');
        setEnvStatus('error');
      }
    } catch (e) {
      setEnvError(String(e));
      setEnvStatus('error');
    }
  };

  const handleInstallLerobot = async () => {
    setLerobotStatus('loading');
    setLerobotError(null);
    try {
      const res = await window.electronAPI.installLerobot();
      if (res.success) {
        setLerobotStatus('complete');
        setLerobotOutput(res.output || 'Installed successfully');
        setExpandedItem(null); // All done
      } else {
        setLerobotError(res.error || res.output || 'Installation failed');
        setLerobotStatus('error');
      }
    } catch (e) {
      setLerobotError(String(e));
      setLerobotStatus('error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto pt-8">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold text-gray-900">Welcome!</h2>
        <p className="text-gray-500 mt-1">
          Let's setup your environment. Training robots takes a few steps (and some time), but with your permission, we'll handle it for you.
        </p>
      </div>

      <div className="mt-4 max-w-2xl mx-auto">
        <AccordionItem
          title="1. Detect or Install Miniconda"
          isOpen={expandedItem === 1}
          onToggle={() => setExpandedItem(expandedItem === 1 ? null : 1)}
          status={condaStatus}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Miniconda is a minimal installer for conda. It is a small, <a href="https://anaconda.com">enterprise-grade package manager for Python</a>.
            </p>
            {condaStatus === 'complete' ? (
              <div className="text-sm text-green-600">
                Miniconda/Anaconda detected at: <span className="font-mono">{condaResult?.path}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {condaError && <div className="text-sm text-red-600">{condaError}</div>}
                <Button onClick={handleInstallMiniconda} disabled={condaStatus === 'loading'}>
                  {condaStatus === 'loading' ? 'Installing. This may take a while...' : 'Install Miniconda'}
                </Button>
                <div className="text-xs text-gray-500">
                  This will install Miniconda to your application data folder.
                </div>
              </div>
            )}
          </div>
        </AccordionItem>

        <AccordionItem
          title="2. Create Robot Trainer Environment"
          isOpen={expandedItem === 2}
          onToggle={() => setExpandedItem(expandedItem === 2 ? null : 2)}
          status={envStatus}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              We need a dedicated Python environment named <code>robot_trainer</code> to manage dependencies.
            </p>
            {envStatus === 'complete' ? (
              <div className="text-sm text-green-600">
                Environment <code>robot_trainer</code> is ready.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {envError && <div className="text-sm text-red-600 whitespace-pre-wrap">{envError}</div>}
                <Button onClick={handleCreateEnv} disabled={envStatus === 'loading' || condaStatus !== 'complete'}>
                  {envStatus === 'loading' ? 'Creating...' : 'Create Environment'}
                </Button>
              </div>
            )}
          </div>
        </AccordionItem>

        <AccordionItem
          title="3. Install LeRobot"
          isOpen={expandedItem === 3}
          onToggle={() => setExpandedItem(expandedItem === 3 ? null : 3)}
          status={lerobotStatus}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <a href="https://huggingface.co/docs/lerobot/index" target="_blank" rel="noopener noreferrer">LeRobot</a> is a library for robot learning. We will install it into the <code>robot_trainer</code> environment.
            </p>
            {lerobotStatus === 'complete' ? (
              <div className="text-sm text-green-600">
                LeRobot installed successfully.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {lerobotError && <div className="text-sm text-red-600 whitespace-pre-wrap">{lerobotError}</div>}
                <Button onClick={handleInstallLerobot} disabled={lerobotStatus === 'loading' || envStatus !== 'complete'}>
                  {lerobotStatus === 'loading' ? 'Installing. This may take even longer...' : 'Install LeRobot'}
                </Button>
              </div>
            )}
          </div>
        </AccordionItem>
      </div>

      <div className="flex justify-between mt-8 max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => {
            if (step === 1) {
              setResourceManagerShowForm(false);
                setCurrentPage('robots');
                setShowSetupWizard(false);
            } else {
              setStep((s) => Math.max(1, s - 1));
            }
          }}
        >
          Back
        </Button>
        {step < 4 ? (
          <Button
            onClick={() => setStep((s) => Math.min(4, s + 1))}
            disabled={lerobotStatus !== 'complete'}
          >
            Next Step <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        ) : null}
      </div>
    </div >
  );
};

export default SetupWizard;
