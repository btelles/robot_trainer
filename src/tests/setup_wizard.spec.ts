import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('SetupWizard UI (screenshots)', () => {
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

  test('anaconda detection and confirm python path modal', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'scan-serial-ports': async () => [],
      'list-python-plugins': async () => {
        return { robots: [], teleoperators: [] }
      },
      'check-anaconda': async () => {
        return {
          found: true,
          path: '/home/testuser/miniconda3/envs',
          envs: [{ name: 'base', pythonPath: '/home/testuser/miniconda3/envs/base/bin/python' }],
          platform: 'linux',
          condaAvailable: true,
          condaVersion: 'conda 23.0.0'
        };
      },
      'save-robot-config': async () => {
        return { ok: true };
      }
    });

    await window.click('text=Robots');
    await window.waitForSelector('text=Robots');
    await window.click('text=Add Robot');
    await window.click('text=Create');
    await window.waitForSelector('text=Setup New Robot');

    // Open Anaconda detection
    await window.click('text=Detect Anaconda');
    await window.waitForSelector('text=Detected Anaconda');
    await window.screenshot({ path: 'test-results/setupwizard-anaconda-detected.png', fullPage: true });

    // Click 'Use this environment' which will open confirm modal
    await window.click('text=Use this environment');
    await window.waitForSelector('text=Confirm');
    await window.screenshot({ path: 'test-results/setupwizard-confirm-python-modal.png', fullPage: true });

    // Confirm to save python path
    await window.click('button:has-text("Confirm")');
    // After confirming the success message should appear
    await window.waitForSelector('text=Saved Python path');
    await window.screenshot({ path: 'test-results/setupwizard-anaconda-saved.png', fullPage: true });
  });

  test.describe('Create Anaconda env flow', () => {
    test('clicking Yes and creating env succeeds', async ({ window, setIpcHandlers }) => {
      await setIpcHandlers({
        'check-anaconda': async () => ({ found: true, path: '/home/testuser/miniconda3/envs', envs: [], platform: 'linux', condaAvailable: true, condaVersion: 'conda 23.0.0' }),
        'create-anaconda-env': async (_event: any, name: string) => ({ success: true, code: 0, output: 'created' }),
      });

      await window.click('text=Robots');
      await window.waitForSelector('text=Robots');
      await window.click('text=Add Robot');
      await window.click('text=Create');
      await window.waitForSelector('text=Setup New Robot');
      await window.click('text=Detect Anaconda');
      // should show create prompt
      await window.waitForSelector('text=Would you like us to create one called');
      await window.click('text=Yes');
      // after success we show success message
      await window.waitForSelector('text=Successfully created the Anaconda environment');
      // new env should be present in list
      await window.waitForSelector('text=robot_trainer');
    });

    test('clicking Yes and creating env fails shows toast with full log', async ({ window, setIpcHandlers }) => {
      await setIpcHandlers({
        'check-anaconda': async () => ({ found: true, path: '/home/testuser/miniconda3/envs', envs: [], platform: 'linux', condaAvailable: true, condaVersion: 'conda 23.0.0' }),
        'create-anaconda-env': async (_event: any, name: string) => ({ success: false, code: 1, output: 'fatal: could not create\ndetails...' }),
      });

      await window.click('text=Robots');
      await window.waitForSelector('text=Robots');
      await window.click('text=Add Robot');
      await window.click('text=Create');
      await window.waitForSelector('text=Setup New Robot');
      await window.click('text=Detect Anaconda');
      await window.waitForSelector('text=Would you like us to create one called');
      await window.click('text=Yes');
      // toast with the output should appear
      await window.waitForSelector('text=fatal: could not create');
      // dismiss
      await window.click('text=Dismiss');
      // ensure toast gone
      await expect(window.locator('text=fatal: could not create')).toHaveCount(0);
    });

    test('clicking No navigates to system settings', async ({ window, setIpcHandlers }) => {
      await setIpcHandlers({
        'check-anaconda': async () => ({ found: true, path: '/home/testuser/miniconda3/envs', envs: [], platform: 'linux', condaAvailable: true, condaVersion: 'conda 23.0.0' }),
      });

      await window.click('text=Robots');
      await window.waitForSelector('text=Robots');
      await window.click('text=Add Robot');
      await window.click('text=Create');
      await window.waitForSelector('text=Setup New Robot');
      await window.click('text=Detect Anaconda');
      await window.waitForSelector('text=Would you like us to create one called');
      // click the ghost 'No, point to custom Python' button
      await window.click('text=No, point to custom Python');
      // Should navigate to System Settings
      await window.waitForSelector('text=System Settings');
    });
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
          envs: [{ name: 'base', pythonPath: '/home/testuser/miniconda3/envs/base/bin/python' }],
          platform: 'linux',
          condaAvailable: true,
          condaVersion: 'conda 23.0.0'
        };
      },
      'save-robot-config': async () => {
        return { ok: true };
      }
    });

    await window.click('text=Robots');
    await window.waitForSelector('text=Robots');
    await window.click('text=Add Robot');
    await window.click('text=Create');
    await window.waitForSelector('text=Setup New Robot');
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
