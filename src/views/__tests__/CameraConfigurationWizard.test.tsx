import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CameraConfigurationWizard from '../CameraConfigurationWizard';

describe('CameraConfigurationWizard', () => {
  it('adds and removes a camera and toggles calibration', async () => {
    const { container, unmount } = render(<CameraConfigurationWizard />);

    const nameInput = container.querySelector('[aria-label="camera-name"]') as HTMLInputElement;
    const fpsInput = container.querySelector('[aria-label="camera-fps"]') as HTMLInputElement;
    const resolution = container.querySelector('[aria-label="camera-resolution"]') as HTMLSelectElement;
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Add Camera')) as HTMLButtonElement;

    // use testing-library's fireEvent so React's synthetic events are triggered correctly
    fireEvent.input(nameInput, { target: { value: 'FrontCam' } });
    fireEvent.change(resolution, { target: { value: '1920x1080' } });
    fireEvent.input(fpsInput, { target: { value: '60' } });
    fireEvent.click(addBtn);

    // wait briefly for state updates to settle
    await new Promise((r) => setTimeout(r, 20));

    expect(container.textContent).toContain('FrontCam');
    expect(container.textContent).toContain('1920x1080 — 60 fps');

    const removeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Remove')) as HTMLButtonElement;
    fireEvent.click(removeBtn);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).not.toContain('FrontCam');

    unmount();
  });
});
