"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const client_1 = require("react-dom/client");
const vitest_1 = require("vitest");
const RobotDevicesWizard_1 = __importDefault(require("../RobotDevicesWizard"));
async function waitForText(container, text, timeout = 500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (container.textContent && container.textContent.includes(text))
            return;
        // small delay
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`timeout waiting for text: ${text}`);
}
(0, vitest_1.describe)('RobotDevicesWizard', () => {
    (0, vitest_1.it)('scans serial ports and selects follower/leader and scans python plugins', async () => {
        // mock electronAPI
        const mockAPI = {
            scanSerialPorts: vitest_1.vi.fn(async () => [
                { path: '/dev/ttyUSB0', manufacturer: 'Acme', serialNumber: 'A1' },
                { path: '/dev/ttyUSB1', manufacturer: 'RobCo', serialNumber: 'B2' },
            ]),
            listPythonPlugins: vitest_1.vi.fn(async () => ({ robots: [{ class_name: 'R1' }], teleoperators: [{ class_name: 'T1' }] })),
        };
        // attach mock to both global and window to be safe in the test environment
        global.electronAPI = mockAPI;
        window.electronAPI = mockAPI;
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = (0, client_1.createRoot)(container);
        root.render((0, jsx_runtime_1.jsx)(RobotDevicesWizard_1.default, {}, void 0));
        // allow React to flush initial render
        await new Promise((r) => setTimeout(r, 0));
        const scanBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Scan Ports'));
        scanBtn.click();
        await waitForText(container, 'Port: /dev/ttyUSB0');
        // select first as follower
        const followerRadios = Array.from(container.querySelectorAll('input[type="radio"]')).filter((r) => r.nextSibling && r.nextSibling.textContent === 'Use as Follower');
        followerRadios[0].click();
        // select second as leader
        const leaderRadios = Array.from(container.querySelectorAll('input[type="radio"]')).filter((r) => r.nextSibling && r.nextSibling.textContent === 'Use as Leader');
        leaderRadios[1].click();
        const scanPyBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Scan Python Plugins'));
        scanPyBtn.click();
        await waitForText(container, '1 found');
        root.unmount();
        container.remove();
    });
});
//# sourceMappingURL=RobotDevicesWizard.test.js.map