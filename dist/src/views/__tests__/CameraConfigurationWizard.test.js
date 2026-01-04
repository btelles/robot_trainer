"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("@testing-library/react");
const vitest_1 = require("vitest");
const CameraConfigurationWizard_1 = __importDefault(require("../CameraConfigurationWizard"));
(0, vitest_1.describe)('CameraConfigurationWizard', () => {
    (0, vitest_1.it)('adds and removes a camera and toggles calibration', async () => {
        const { container, unmount } = (0, react_1.render)((0, jsx_runtime_1.jsx)(CameraConfigurationWizard_1.default, {}, void 0));
        const nameInput = container.querySelector('[aria-label="camera-name"]');
        const fpsInput = container.querySelector('[aria-label="camera-fps"]');
        const resolution = container.querySelector('[aria-label="camera-resolution"]');
        const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Add Camera'));
        // use testing-library's fireEvent so React's synthetic events are triggered correctly
        react_1.fireEvent.input(nameInput, { target: { value: 'FrontCam' } });
        react_1.fireEvent.change(resolution, { target: { value: '1920x1080' } });
        react_1.fireEvent.input(fpsInput, { target: { value: '60' } });
        react_1.fireEvent.click(addBtn);
        // wait briefly for state updates to settle
        await new Promise((r) => setTimeout(r, 20));
        (0, vitest_1.expect)(container.textContent).toContain('FrontCam');
        (0, vitest_1.expect)(container.textContent).toContain('1920x1080 — 60 fps');
        const removeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Remove'));
        react_1.fireEvent.click(removeBtn);
        await new Promise((r) => setTimeout(r, 20));
        (0, vitest_1.expect)(container.textContent).not.toContain('FrontCam');
        unmount();
    });
});
//# sourceMappingURL=CameraConfigurationWizard.test.js.map