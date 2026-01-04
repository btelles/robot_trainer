import React from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import RobotDevicesWizard from '../RobotDevicesWizard';

async function waitForText(container: HTMLElement, text: string, timeout = 500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (container.textContent && container.textContent.includes(text)) return;
    // small delay
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timeout waiting for text: ${text}`);
}

describe('RobotDevicesWizard', () => {
  it('scans serial ports and selects follower/leader and scans python plugins', async () => {
    // mock electronAPI
    const mockAPI = {
      scanSerialPorts: vi.fn(async () => [
        { path: '/dev/ttyUSB0', manufacturer: 'Acme', serialNumber: 'A1' },
        { path: '/dev/ttyUSB1', manufacturer: 'RobCo', serialNumber: 'B2' },
      ]),
      listPythonPlugins: vi.fn(async () => ({ robots: [{ class_name: 'R1' }], teleoperators: [{ class_name: 'T1' }] })),
    };
    // attach mock to both global and window to be safe in the test environment
    (global as any).electronAPI = mockAPI;
    (window as any).electronAPI = mockAPI;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<RobotDevicesWizard />);
    // allow React to flush initial render
    await new Promise((r) => setTimeout(r, 0));

    const scanBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Scan Ports')) as HTMLButtonElement;
    scanBtn.click();

    await waitForText(container, 'Port: /dev/ttyUSB0');

    // select first as follower
    const followerRadios = Array.from(container.querySelectorAll('input[type="radio"]')).filter((r) => r.nextSibling && (r.nextSibling as Element).textContent === 'Use as Follower');
    (followerRadios[0] as HTMLInputElement).click();
    // select second as leader
    const leaderRadios = Array.from(container.querySelectorAll('input[type="radio"]')).filter((r) => r.nextSibling && (r.nextSibling as Element).textContent === 'Use as Leader');
    (leaderRadios[1] as HTMLInputElement).click();

    const scanPyBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Scan Python Plugins')) as HTMLButtonElement;
    scanPyBtn.click();

    await waitForText(container, '1 found');

    root.unmount();
    container.remove();
  });
});
