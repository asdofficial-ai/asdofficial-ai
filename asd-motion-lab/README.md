# ASD Motion Lab V2 — Editing-only build

CapCut-inspired, independent mobile-first media editor. No AI generation, paid model credentials, or fake generation.
 
Features: import JPEG/PNG/WebP and MP4/MOV/WebM/MKV, trim a single clip, mirror/flip/rotate, center crop to aspect ratio, brightness, contrast, saturation, blur and sharpen, playback speed, frame-rate conversion to 24/30/60/120/250 FPS, source audio extraction as MP3, source audio volume/mute, upload and mix your own audio, searchable library of eight original procedurally synthesized instrumental loops, add text captions, PNG/JPG or MP4 download, undo/redo settings, and save project settings.

Limitations: single-clip (not a full multitrack timeline), no transitions, speech-to-text captions, or commercial music; 40MB media / 12MB audio, 45s video export max (12s for >60 FPS). Free Render compute can be slow. Media is temporary and deleted after output. No user account; public processing is rate-limited.

Deploy:
- Branch: deploy/asd-motion-lab-render-20261021 in asdofficial-ai/asdofficial-ai
- Build: `pip install -r asd-motion-lab/requirements.txt`
- Start: `gunicorn app:app --chdir asd-motion-lab --bind 0.0.0.0:$PORT --workers 1 --threads 2 --timeout 150`
- Health: `/api/health`
