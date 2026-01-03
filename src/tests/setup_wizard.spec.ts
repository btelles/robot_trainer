import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('SetupWizard UI (screenshots)', () => {
  test.beforeEach(async ({ window }) => {
    // default renderer-side handlers used during tests to reply to main
    await window.evaluate(() => {
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.onRequestSaveSystemSettings) {
        // @ts-ignore
        window.electronAPI.onRequestSaveSystemSettings((settings: any) => {
          // @ts-ignore
          window.electronAPI.replySaveSystemSettings({ success: true, settings });
        });
      }
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.onRequestLoadSystemSettings) {
        // @ts-ignore
        window.electronAPI.onRequestLoadSystemSettings(() => {
          // @ts-ignore
          window.electronAPI.replyLoadSystemSettings({});
        });
      }
    });
  });
  test('serial ports scanning and selection states', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'scan-serial-ports': async () => {
        return [
          { path: '/dev/ttyUSB0', manufacturer: 'Acme Robotics', serialNumber: 'ACM1234', productId: '0x6001', vendorId: '0x0403', pnpId: 'usb-FTDI' },
          { path: '/dev/ttyUSB1', manufacturer: 'RobCo', serialNumber: 'RBX-999', productId: '0x2341', vendorId: '0x1A86', pnpId: 'usb-CH340' },
        ];
      }
    });

    // Open Setup view via Robots -> Add -> Create
    await window.click('text=Robots');
    await window.waitForSelector('text=Robots');
    await window.click('text=Add Robot');
    await window.click('text=Create');
    await window.waitForSelector('text=Setup New Robot');

    // Take initial screenshot (no ports yet)
    await window.screenshot({ path: 'test-results/setupwizard-step1-initial.png', fullPage: true });

    // Scan ports
    await window.click('text=Scan Ports');
    await window.waitForSelector('text=Port: /dev/ttyUSB0');
    await window.screenshot({ path: 'test-results/setupwizard-ports-scanned.png', fullPage: true });

    // Select first port as follower
    await window.locator('text=Use as Follower').first().click();
    await window.screenshot({ path: 'test-results/setupwizard-follower-selected.png', fullPage: true });

    // Select second port as leader
    // choose the leader radio whose corresponding port text contains /dev/ttyUSB1
    const cards = window.locator('div.serial-port-card:has-text("Port: /dev/ttyUSB1")');
    await expect(cards).toHaveCount(1);
    await cards.locator('text=Use as Leader').click();
    await window.screenshot({ path: 'test-results/setupwizard-leader-selected.png', fullPage: true });
  });

  test('scan no ports shows not calibrated / null state', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'scan-serial-ports': async () => {
        return [];
      }
    });

    await window.click('text=Robots');
    await window.waitForSelector('text=Robots');
    await window.click('text=Add Robot');
    await window.click('text=Create');
    await window.waitForSelector('text=Setup New Robot');
    await window.click('text=Scan Ports');
    await window.waitForSelector('text=No Serial devices found');
    await window.screenshot({ path: 'test-results/setupwizard-no-ports.png', fullPage: true });
  });

  test('Environment setup flow', async ({ window, setIpcHandlers }) => {
    // Initial state: nothing found
    await setIpcHandlers({
      'check-anaconda': async () => ({ found: false, path: null, envs: [], platform: 'linux' }),
      'install-miniconda': async () => ({ success: true, path: '/home/user/miniconda3' }),
      'create-anaconda-env': async () => ({ success: true, code: 0, output: 'created' }),
      'install-lerobot': async () => ({ success: true, output: 'installed' }),
      'check-lerobot': async () => ({ installed: false }),
      'save-system-settings': async () => ({ success: true }),
      'scan-serial-ports': async () => [],
    });

    // register renderer-side reply handlers for main->renderer settings requests
    await window.evaluate(() => {
      // @ts-ignore
      window.electronAPI.onRequestSaveSystemSettings((settings: any) => {
        // @ts-ignore
        window.electronAPI.replySaveSystemSettings({ success: true, settings });
      });
      // @ts-ignore
      window.electronAPI.onRequestLoadSystemSettings(() => {
        // @ts-ignore
        window.electronAPI.replyLoadSystemSettings({});
      });
    });

    // Navigate to Setup
    await window.click('text=Robots');
    await window.waitForSelector('text=Robots');
    await window.click('text=Add Robot');
    await window.click('text=Create');
    await window.waitForSelector('text=Setup New Robot');

    // Step 1: Install Miniconda
    // Accordion item 1 should be open
    await window.click('text=Install Miniconda');

    // Mock check-anaconda to return found after install (simulating re-check)
    // Note: In a real test we might need to update the handler before the click or use a mutable mock
    // For simplicity here we assume the handler returns different values on subsequent calls or we update it
    // But setIpcHandlers replaces handlers.
    // The UI calls checkAnaconda immediately after installMiniconda returns.
    // So we need the handler to be ready.
    // Let's use a mutable state in the handler.

    let condaFound = false;
    let envCreated = false;

    await setIpcHandlers({
      'check-anaconda': async () => {
        if (!condaFound) return { found: false, path: null, envs: [], platform: 'linux' };
        if (!envCreated) return { found: true, path: '/home/user/miniconda3', envs: [], platform: 'linux' };
        return {
          found: true,
          path: '/home/user/miniconda3',
          envs: [{ name: 'robot_trainer', pythonPath: '/home/user/miniconda3/envs/robot_trainer/bin/python' }],
          platform: 'linux'
        };
      },
      'install-miniconda': async () => {
        condaFound = true;
        return { success: true, path: '/home/user/miniconda3' };
      },
      'create-anaconda-env': async () => {
        envCreated = true;
        return { success: true, code: 0, output: 'created' };
      },
      'install-lerobot': async () => ({ success: true, output: 'installed' }),
      'save-system-settings': async () => ({ success: true }),
      'scan-serial-ports': async () => [],
    });

    // Retry click if needed or just wait
    // The initial check ran on mount with condaFound=false.
    // We click Install.
    await window.click('text=Install Miniconda');

    // Wait for Step 1 complete
    await window.waitForSelector('text=Miniconda/Anaconda detected at:');

    // Step 2: Create Env
    // Accordion 2 should be open now
    await window.click('text=Create Environment');
    await window.waitForSelector('text=Environment robot_trainer is ready');

    // Step 3: Install LeRobot
    await window.click('text=Install LeRobot');
    await window.waitForSelector('text=LeRobot installed successfully');

    // Next Step should be enabled
    await window.click('text=Next Step');
    await window.waitForSelector('text=Scan Ports');
  });

  test('save configuration advances to calibration page', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'scan-serial-ports': async () => {
        return [
          { path: '/dev/ttyUSB0', manufacturer: 'Acme Robotics', serialNumber: 'ACM1234', productId: '0x6001', vendorId: '0x0403', pnpId: 'usb-FTDI' },
          { path: '/dev/ttyUSB1', manufacturer: 'RobCo', serialNumber: 'RBX-999', productId: '0x2341', vendorId: '0x1A86', pnpId: 'usb-CH340' },
        ];
      },
      'list-python-plugins': async () => {
        return { robots: [], teleoperators: [] }
      },
      'check-anaconda': async () => {
        return {
          found: true,
          path: '/home/testuser/miniconda3/envs',
          envs: [{ name: 'robot_trainer', pythonPath: '/home/testuser/miniconda3/envs/robot_trainer/bin/python' }],
          platform: 'linux',
          condaAvailable: true,
          condaVersion: 'conda 23.0.0'
        };
      },
      'install-lerobot': async () => ({ success: true, output: 'installed' }),
      'check-lerobot': async () => ({ installed: false }),
      'save-system-settings': async () => ({ success: true }),
      'save-robot-config': async () => {
        return { ok: true };
      }
    });

    await window.click('text=Robots');
    await window.waitForSelector('text=Robots');
    await window.click('text=Add Robot');
    await window.click('text=Create');
    await window.waitForSelector('text=Setup New Robot');

    // Complete Environment Setup
    await window.click('text=Install LeRobot');
    await window.waitForSelector('text=LeRobot installed successfully');
    await window.click('text=Next Step');

    await window.click('text=Scan Ports');
    await window.waitForSelector('text=Port: /dev/ttyUSB0');

    // assign follower and leader
    await window.locator('text=Use as Follower').first().click();
    const cards = window.locator('[data-path="/dev/ttyUSB1"]');
    await cards.locator('span:has-text("Use as Leader")').click();

    // Next to Cameras step
    await window.click('text=Next Step');
    await window.waitForSelector('text=Cameras');

    // Add a camera
    await window.fill('input[placeholder="Camera name"]', 'FrontCam');
    await window.click('text=Add Camera');
    await window.screenshot({ path: 'test-results/setupwizard-camera-added.png', fullPage: true });

    // Next to Review & Save
    await window.click('text=Next Step');
    await window.waitForSelector('text=Review & Save');
    // Save button requires both follower and leader set; now enabled
    await window.click('text=Save Configuration');

    // Should advance to calibration step
    await window.waitForSelector('text=Calibration');
    await window.screenshot({ path: 'test-results/setupwizard-calibration-page.png', fullPage: true });
  });
});

export { test, expect };
