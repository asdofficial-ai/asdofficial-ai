# ASD Motion Lab
Responsive browser-based video, photo and audio processing studio with original searchable music loops.

## Tools
- Video: trim, mirror, rotate, crop, resize, speed, reverse, FPS conversion, filters, text overlay, fades, compression, GIF, frame extraction
- Audio: extract to MP3, add or replace music, mix audio, control volume, mute
- Photo: sharpen/enhance, solid-background removal, mirror, rotate, crop, resize, filters, text
- Sound vault: 8 original instrumental synthesis loops, search and preview

## Running
Docker:
```sh
docker build -t asd-motion-lab .
docker run -p 10000:10000 asd-motion-lab
```

Then open http://localhost:10000 . Health endpoint: /api/health .

## Limits
45MB per file. 65-second video, special shorter limits for reverse, GIF and 120/250 FPS. No AI content generation, no proprietary tracks, no multi-layer timeline, no native app. Public beta single processing worker and IP rate limits. Input and processed files are temporary and removed after the response finishes. High-resolution photo and large clips can be memory intensive.

## Deployment
Git branch: deploy/asd-motion-lab-render-20261021
Render web service: Docker root context `asd-motion-lab`, Dockerfile `asd-motion-lab/Dockerfile`, health path /api/health.
