#!/usr/bin/env python3
"""
Simple simulator that tries to use `lerobot` if available, otherwise falls
back to a minimal built-in simulator that draws a moving robot. The script
writes newline-delimited JSON messages to stdout. Frame messages are:
  {"type": "frame", "data": "<base64-jpeg>"}

This is intended to be spawned by the Electron main process and piped into
the renderer for display.
"""
from __future__ import annotations
import sys
import time
import json
import base64
import signal
from io import BytesIO
from pathlib import Path

STOP = False


def handle_sigterm(_signum, _frame):
    global STOP
    STOP = True


signal.signal(signal.SIGINT, handle_sigterm)
signal.signal(signal.SIGTERM, handle_sigterm)


def output_frame_raw(img):
    # Ensure 640x480 resolution for FFmpeg consistency
    if img.size != (640, 480):
        img = img.resize((640, 480))
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    try:
        sys.stdout.buffer.write(img.tobytes())
        sys.stdout.flush()
    except BrokenPipeError:
        # FFmpeg process likely died
        global STOP
        STOP = True

def run_fallback_sim(fps=30):
    # Minimal simulation using Pillow to draw a moving circle representing a robot
    try:
        from PIL import Image, ImageDraw
    except Exception:
        sys.stderr.write('Pillow is required for fallback simulator\n')
        sys.stderr.flush()
        return 1

    w, h = 640, 480
    radius = 24
    t = 0.0
    dt = 1.0 / fps
    while not STOP:
        # simple circular motion
        cx = int(w/2 + (w/3) * 0.6 * __import__('math').cos(t))
        cy = int(h/2 + (h/3) * __import__('math').sin(t))
        img = Image.new('RGB', (w, h), (30, 30, 30))
        draw = ImageDraw.Draw(img)
        # robot body
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(200, 80, 80))
        # heading
        draw.line((cx, cy, cx + radius, cy), fill=(255,255,255), width=3)
        output_frame_raw(img)
        t += 0.2
        time.sleep(dt)
    return 0


def try_lerobot_sim(fps=30):
    """Try to use the `lerobot` package to make a short-running simulation.
    This will be best-effort: if lerobot isn't installed or its API differs,
    fall back to the simple simulator above.
    """
    try:
        import lerobot
    except Exception as e:
        sys.stderr.write(f'lerobot unavailable: {e}\n')
        sys.stderr.flush()
        return run_fallback_sim(fps=fps)

    # Prefer to create the gym manipulator env directly using the provided
    # `lerobot.rl.gym_manipulator.make_robot_env` factory and the
    # `env-config.json` shipped with the project. If that fails fall back to
    # the simple renderer above.
    try:
        import importlib
        import os
        import numpy as np
        from PIL import Image

        # Load the gym_manipulator module (package path used by CLI)
        try:
            gm = importlib.import_module('lerobot.rl.gym_manipulator')
        except Exception:
            # try alternative module path
            gm = importlib.import_module('lerobot.scripts.rl.gym_manipulator')

        # locate config file: prefer explicit --config path via env var, else search nearby
        cfg_path = None
        # check for CLI arg style --config_path
        for i, a in enumerate(sys.argv):
            if a in ('--config_path', '--config') and i + 1 < len(sys.argv):
                cfg_path = sys.argv[i+1]
                break

        if not cfg_path:
            # look for env-config.json next to this script
            here = Path(__file__).parent
            candidate = here / 'env-config.json'
            if candidate.exists():
                cfg_path = str(candidate)
            else:
                # try repository root
                candidate = Path.cwd() / 'src' / 'python' / 'env-config.json'
                if candidate.exists():
                    cfg_path = str(candidate)

        if not cfg_path:
            sys.stderr.write('env-config.json not found; falling back to simple sim\n')
            sys.stderr.flush()
            return run_fallback_sim(fps=fps)

        # Prefer to use the library's parser to build a proper EnvConfig
        # so that RobotConfig and other choice-registered classes are
        # instantiated correctly (this mirrors `python -m ... --config_path`).
        try:
            from lerobot.configs import parser as lr_parser

            # wrap a tiny function that calls the module factory so the
            # parser will instantiate the correct config class for us.
            def _make_env(cfg):
                return gm.make_robot_env(cfg)

            wrapped = lr_parser.wrap(Path(cfg_path))(_make_env)
            env = wrapped()
        except Exception:
            # If parser-based creation fails, fall back to the previous
            # heuristic that attempts to coerce the JSON into a namespace.
            with open(cfg_path, 'r') as f:
                cfg_data = json.load(f)

            # gym_manipulator expects an EnvConfig-like object. The provided
            # env-config.json places the env data under the "env" key; adjust.
            cfg_dict = cfg_data.get('env', cfg_data)
            # some configs use "name" where EnvConfig expects "type" - map it
            if 'type' not in cfg_dict and 'name' in cfg_dict:
                cfg_dict['type'] = cfg_dict.get('name')
            # map 'processor' -> 'wrapper' if present
            if 'processor' in cfg_dict and 'wrapper' not in cfg_dict:
                cfg_dict['wrapper'] = cfg_dict.pop('processor')

            # helper to convert dict -> object with attribute access
            def to_obj(d):
                if isinstance(d, dict):
                    ns = type('C', (), {})()
                    for k, v in d.items():
                        setattr(ns, k, to_obj(v))
                    return ns
                elif isinstance(d, list):
                    return [to_obj(x) for x in d]
                else:
                    return d

            cfg_obj = to_obj(cfg_dict)
            # add top-level device if provided
            if 'device' in cfg_data:
                setattr(cfg_obj, 'device', cfg_data.get('device'))

            if hasattr(gm, 'make_robot_env'):
                env = gm.make_robot_env(cfg_obj)
            else:
                if hasattr(gm, 'main'):
                    gm.main()
                    return 0
                sys.stderr.write('gym_manipulator.make_robot_env not found; falling back\n')
                sys.stderr.flush()
                return run_fallback_sim(fps=fps)

        # reset environment and attempt to render repeatedly
        try:
            obs = env.reset()
        except Exception:
            try:
                obs = env.reset(None)
            except Exception:
                obs = None

        dt = 1.0 / fps
        action = None
        # prepare zero action if action_space is available
        if hasattr(env, 'action_space'):
            try:
                a = env.action_space.sample()
                # zero it out where numeric
                try:
                    a = a * 0.0
                except Exception:
                    pass
                action = a
            except Exception:
                action = None

        while not STOP:
            frame = None
            try:
                # prefer env.render() if available
                if hasattr(env, 'render'):
                    frame = env.render()
                # step to advance simulation and then render
                if frame is None and action is not None:
                    try:
                        env.step(action)
                    except Exception:
                        # some envs expect tuple return
                        try:
                            env.step(action, {})
                        except Exception:
                            pass
                    try:
                        frame = env.render()
                    except Exception:
                        frame = None
            except Exception:
                frame = None

            if frame is None:
                time.sleep(dt)
                continue

            # convert numpy array or PIL image or bytes into raw RGB and emit
            try:
                if isinstance(frame, np.ndarray):
                    img = Image.fromarray(frame)
                    output_frame_raw(img)
                elif isinstance(frame, (bytes, bytearray)):
                    # Assume it's already raw RGB bytes if bytes, but we need to be careful about size
                    # If it's raw bytes, we might just write it if we trust it.
                    # But for safety, let's try to load it if it's an encoded image, or assume it's raw.
                    # Given the context of "frame", it's likely a numpy array or similar.
                    # If it is bytes, it might be encoded.
                    try:
                        img = Image.open(BytesIO(frame))
                        output_frame_raw(img)
                    except Exception:
                        # Maybe raw bytes? Just write it if size matches?
                        # For now, let's assume it's an image we can load or a numpy array.
                        pass
                else:
                    # try to coerce via PIL
                    img = Image.fromarray(np.asarray(frame))
                    output_frame_raw(img)
            except Exception:
                # on any conversion error, sleep and continue
                time.sleep(dt)

        # attempt to close environment cleanly
        try:
            env.close()
        except Exception:
            pass

        return 0
    except Exception as e:
        sys.stderr.write(f'Error running lerobot sim: {e}\n')
        sys.stderr.flush()
        return run_fallback_sim(fps=fps)


def main():
    fps = 30
    # simple CLI options parsing
    if '--fps' in sys.argv:
        try:
            i = sys.argv.index('--fps')
            fps = int(sys.argv[i+1])
        except Exception:
            pass

    # Try lerobot first, but gracefully fallback
    return_code = try_lerobot_sim(fps=fps)
    sys.exit(return_code)


if __name__ == '__main__':
    raise SystemExit(main())
