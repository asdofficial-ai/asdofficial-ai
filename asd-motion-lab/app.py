from __future__ import annotations
import io, json, math, os, subprocess, tempfile, threading, time, wave
from pathlib import Path
from functools import lru_cache
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageFont, ImageDraw, ImageOps
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="ASD Motion Lab", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
LIMIT = 45 * 1024 * 1024
VIDEO_MAX = 65.0
SEM = threading.BoundedSemaphore(1)
RATE = {}
RATE_LOCK = threading.Lock()
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm"}
AUDIO_EXT = {".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac"}
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MUSIC_DIR = Path(tempfile.gettempdir()) / "asd-motion-music"
TRACKS = [
    {"id": "night-drive", "title": "Night Drive", "genre": "Phonk", "bpm": 120, "notes": [110, 130.81, 164.81, 146.83]},
    {"id": "quiet-hours", "title": "Quiet Hours", "genre": "Lo-fi", "bpm": 82, "notes": [174.61, 220, 261.63, 196]},
    {"id": "neon-pulse", "title": "Neon Pulse", "genre": "Electronic", "bpm": 132, "notes": [130.81, 164.81, 196, 174.61]},
    {"id": "dark-orbit", "title": "Dark Orbit", "genre": "Cinematic", "bpm": 95, "notes": [98, 116.54, 146.83, 110]},
    {"id": "sunrise-loop", "title": "Sunrise Loop", "genre": "Chill", "bpm": 105, "notes": [164.81, 196, 246.94, 220]},
    {"id": "shadow-steps", "title": "Shadow Steps", "genre": "Trap", "bpm": 140, "notes": [110, 138.59, 164.81, 130.81]},
    {"id": "velvet-air", "title": "Velvet Air", "genre": "Ambient", "bpm": 72, "notes": [174.61, 207.65, 233.08, 196]},
    {"id": "headshot", "title": "Headshot", "genre": "Gaming", "bpm": 150, "notes": [146.83, 174.61, 220, 196]},
]

def fail(message: str, status: int = 422):
    raise HTTPException(status_code=status, detail=message)

def positive(value, low, high, label):
    if not math.isfinite(value) or value < low or value > high:
        fail(f"{label} must be between {low} and {high}.")
    return value

def ffprobe(path: Path):
    try:
        res = subprocess.run(
            ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15,
        )
        if res.returncode:
            raise ValueError("Unsupported or damaged media file.")
        return json.loads(res.stdout)
    except (ValueError, subprocess.TimeoutExpired, json.JSONDecodeError):
        raise ValueError("Unable to read media properties.")

def run_ffmpeg(cmd, timeout=115):
    try:
        completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise ValueError("Editing timed out. Try a shorter clip.")
    if completed.returncode != 0:
        detail = completed.stderr[-600:]
        raise ValueError("Could not process this file or setting. " + ("Check the media format." if not detail else "Please choose another input."))
    return True

def build_music(track):
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    dest = MUSIC_DIR / (track["id"] + ".wav")
    if dest.exists():
        return dest
    sr = 22050
    seconds = 16
    t = np.arange(sr * seconds, dtype=np.float64) / sr
    out = np.zeros(t.shape, dtype=np.float64)
    bpm = track["bpm"]
    sec_per_beat = 60 / bpm
    beat_index = np.floor(t / sec_per_beat).astype(np.int32)
    local = (t / sec_per_beat - beat_index)
    notes = np.array(track["notes"])
    freq = notes[(beat_index // 2) % len(notes)]
    # Original synthesized melodies (no sampled commercial music).
    melody = (np.sin(2 * np.pi * freq * t)
            + 0.21 * np.sin(2 * np.pi * 2 * freq * t)
            + 0.10 * np.sin(2 * np.pi * 3 * freq * t))
    env = np.exp(-local * 4.4)
    out += melody * env * 0.13
    bass = np.sin(2 * np.pi * (freq / 2) * t)
    out += bass * 0.12
    kick = np.sin(2 * np.pi * (58 + 88 * np.exp(-local * 20)) * t) * np.exp(-local * 17)
    out += kick * 0.24 * (beat_index % 2 == 0)
    rng = np.random.default_rng(sum(ord(c) for c in track["id"]))
    noise = rng.normal(size=t.size)
    out += noise * (np.exp(-((local % .5) * 65)) * 0.038)
    envelope = np.minimum(1.0, np.minimum(t / .15, (seconds - t) / .2))
    out *= np.clip(envelope, 0, 1)
    out = np.int16(np.clip(out * 25000, -32767, 32767))
    with wave.open(str(dest), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes(out.tobytes())
    return dest

def prepare_image(src: Path, target: Path, operation: str, args):
    with Image.open(src) as source:
        if source.width * source.height > 24_000_000:
            raise ValueError("Images over 24 megapixels are not supported.")
        im = ImageOps.exif_transpose(source).convert("RGB")
        mode = args["variant"]
        if operation == "enhance":
            im = ImageOps.autocontrast(im, cutoff=.4)
            im = ImageEnhance.Contrast(im).enhance(1.13)
            im = ImageEnhance.Sharpness(im).enhance(2.0)
            im = im.resize((im.width * 2, im.height * 2), Image.Resampling.LANCZOS)
        elif operation == "mirror":
            im = ImageOps.mirror(im) if mode == "horizontal" else ImageOps.flip(im)
        elif operation == "rotate":
            im = im.rotate({"left": 90, "right": -90, "180": 180}.get(mode, -90), expand=True)
        elif operation == "filter":
            if mode == "bw":
                im = ImageOps.grayscale(im).convert("RGB")
            elif mode == "vivid":
                im = ImageEnhance.Color(im).enhance(1.65)
                im = ImageEnhance.Contrast(im).enhance(1.16)
            elif mode == "warm":
                rgb = np.asarray(im).astype(np.int16)
                rgb[:, :, 0] += 17
                rgb[:, :, 2] -= 12
                im = Image.fromarray(np.uint8(np.clip(rgb, 0, 255)))
            elif mode == "cool":
                rgb = np.asarray(im).astype(np.int16)
                rgb[:, :, 2] += 21
                rgb[:, :, 0] -= 13
                im = Image.fromarray(np.uint8(np.clip(rgb, 0, 255)))
            elif mode == "soft":
                im = im.filter(ImageFilter.GaussianBlur(1.3))
        elif operation == "resize":
            width = int(args["width"])
            if width not in (480, 720, 1080, 1920):
                raise ValueError("Choose a supported output width.")
            im = im.resize((width, max(1, round(im.height * width / im.width))), Image.Resampling.LANCZOS)
        elif operation == "crop":
            rw, rh = (float(x) for x in mode.split(":"))
            desired = rw / rh
            cw = min(im.width, int(im.height * desired))
            ch = min(im.height, int(im.width / desired))
            x, y = (im.width - cw) // 2, (im.height - ch) // 2
            im = im.crop((x, y, x + cw, y + ch))
        elif operation == "text":
            caption = args["caption"].strip()[:120]
            if not caption:
                raise ValueError("Enter text to add.")
            draw = ImageDraw.Draw(im)
            font = ImageFont.truetype(FONT, max(20, min(100, im.width // 14)))
            box = draw.textbbox((0, 0), caption, font=font, stroke_width=2)
            px = (im.width - (box[2] - box[0])) // 2
            py = max(4, im.height - (box[3] - box[1]) - im.height // 10)
            draw.text((px, py), caption, font=font, fill="white", stroke_width=3, stroke_fill="black")
        elif operation == "background":
            rgb = np.array(im, dtype=np.float32)
            h, w = rgb.shape[:2]
            b = max(2, min(20, h // 30, w // 30))
            corners = [rgb[:b, :b].mean((0, 1)), rgb[:b, -b:].mean((0, 1)),
                       rgb[-b:, :b].mean((0, 1)), rgb[-b:, -b:].mean((0, 1))]
            bg = np.median(np.array(corners), axis=0)
            dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
            alpha = np.uint8(np.clip((dist - float(args["tolerance"])) * 255 / 34, 0, 255))
            dest = target.with_suffix(".png")
            Image.fromarray(np.dstack([np.uint8(rgb), alpha]), "RGBA").save(dest)
            return dest
        else:
            raise ValueError("Unsupported photo tool.")
        dest = target.with_suffix(".jpg")
        im.save(dest, format="JPEG", quality=91, optimize=True)
        return dest

def video_render(src, audio_path, output, operation, args, tmp):
    probe = ffprobe(src)
    streams = probe.get("streams", [])
    if not any(s.get("codec_type") == "video" for s in streams):
        raise ValueError("This file does not contain a video stream.")
    sound = any(s.get("codec_type") == "audio" for s in streams)
    length_orig = float(probe.get("format", {}).get("duration", "0"))
    if not math.isfinite(length_orig) or length_orig <= 0 or length_orig > VIDEO_MAX:
        raise ValueError("Video duration must be 65 seconds or less.")
    start = positive(float(args["start"]), 0, VIDEO_MAX, "Start")
    if start >= length_orig:
        raise ValueError("Start position exceeds clip length.")
    duration = float(args["duration"])
    if duration < 0 or not math.isfinite(duration):
        raise ValueError("Duration cannot be negative.")
    duration = min(duration if duration > 0 else length_orig - start, length_orig - start)
    if operation in ("reverse",) and duration > 12:
        raise ValueError("Reverse is limited to 12 seconds for reliable exports.")
    if operation == "fps" and int(args["fps"]) > 60 and duration > 10:
        raise ValueError("120/250 FPS exports are limited to 10 seconds.")
    vfilters = []
    afilters = []
    op = operation
    mode = args["variant"]
    if op == "mirror":
        vfilters = ["hflip" if mode == "horizontal" else "vflip"]
    elif op == "rotate":
        vfilters = [{"left": "transpose=2", "right": "transpose=1", "180": "hflip,vflip"}.get(mode, "transpose=1")]
    elif op == "crop":
        ratios = {"9:16": (9, 16), "1:1": (1, 1), "16:9": (16, 9), "4:3": (4, 3)}
        if mode not in ratios:
            raise ValueError("Unknown crop ratio.")
        rw, rh = ratios[mode]
        vfilters = [f"crop=trunc(min(iw\\,ih*{rw}/{rh})/2)*2:trunc(min(ih\\,iw*{rh}/{rw})/2)*2"]
    elif op == "resize":
        w = int(args["width"])
        if w not in (480, 720, 1080, 1920):
            raise ValueError("Invalid output width.")
        vfilters = [f"scale={w}:-2:flags=lanczos"]
    elif op == "speed":
        speed = float(args["speed"])
        if speed not in (.5, .75, 1.25, 1.5, 2):
            raise ValueError("Unsupported speed.")
        vfilters = [f"setpts=PTS/{speed}"]
        if sound:
            afilters = [f"atempo={speed}"]
    elif op == "reverse":
        vfilters = ["reverse"]
        if sound:
            afilters = ["areverse"]
    elif op == "fps":
        fps = int(args["fps"])
        if fps not in (24, 30, 60, 120, 250):
            raise ValueError("Unsupported FPS.")
        interpolate = bool(args["smooth"])
        if interpolate and fps > 60:
            raise ValueError("Interpolation is available only up to 60 FPS.")
        if interpolate and duration > 8:
            raise ValueError("Interpolation is limited to 8 seconds.")
        vfilters = [f"minterpolate=fps={fps}:mi_mode=mci" if interpolate else f"fps={fps}"]
    elif op == "filter":
        vfilters = [{
            "bw": "hue=s=0",
            "vivid": "eq=saturation=1.6:contrast=1.1",
            "warm": "colorbalance=rs=.15:gs=.04:bs=-.12",
            "cool": "colorbalance=rs=-.10:gs=.03:bs=.14",
            "soft": "gblur=sigma=1.1",
        }.get(mode, "eq=contrast=1.08")]
    elif op == "text":
        caption = args["caption"].strip()[:120]
        if not caption:
            raise ValueError("Enter text to overlay.")
        caption_file = tmp / "caption.txt"
        caption_file.write_text(caption, encoding="utf-8")
        vfilters = [f"drawtext=fontfile={FONT}:textfile={caption_file}:fontsize=h/19:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-text_h-h/10"]
    elif op == "fade":
        fadeout = max(0, duration - 1)
        vfilters = [f"fade=t=in:st=0:d=1,fade=t=out:st={fadeout:.2f}:d=1"]
        if sound:
            afilters = [f"afade=t=in:st=0:d=1,afade=t=out:st={fadeout:.2f}:d=1"]
    elif op == "volume":
        if not sound:
            raise ValueError("This clip has no audio to adjust.")
        vol = float(args["volume"])
        positive(vol, 0, 3, "Volume")
        afilters = [f"volume={vol}"]
    elif op == "mute":
        sound = False
    elif op == "compress":
        w = next((s.get("width", 0) for s in streams if s.get("codec_type") == "video"), 720)
        if w > 720:
            vfilters = ["scale=720:-2"]
    elif op == "gif":
        if duration > 10:
            raise ValueError("GIF exports are limited to 10 seconds.")
        vfilters = ["fps=12,scale=480:-1:flags=lanczos"]
        sound = False
    elif op in ("cut", "frame", "extract", "add_audio"):
        pass
    else:
        raise ValueError("Unsupported video tool.")

    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(start), "-i", str(src)]
    if op == "add_audio":
        if audio_path is None or not audio_path.exists():
            raise ValueError("Choose a library track or upload an audio file.")
        cmd += ["-stream_loop", "-1", "-i", str(audio_path)]
    cmd += ["-t", str(duration)]
    if op == "frame":
        dest = output.with_suffix(".png")
        cmd += ["-map", "0:v:0", "-frames:v", "1", str(dest)]
    elif op == "extract":
        if not sound:
            raise ValueError("This video has no audio to extract.")
        dest = output.with_suffix(".mp3")
        cmd += ["-vn", "-map", "0:a:0", "-c:a", "libmp3lame", "-b:a", "192k", str(dest)]
    elif op == "gif":
        dest = output.with_suffix(".gif")
        cmd += ["-vf", ",".join(vfilters), "-an", str(dest)]
    elif op == "add_audio":
        dest = output.with_suffix(".mp4")
        mix = bool(args["mix"])
        if mix and sound:
            vol = float(args["volume"])
            positive(vol, 0, 3, "Volume")
            cmd += ["-filter_complex",
                    f"[0:a]volume={vol}[a0];[1:a]volume=0.85[a1];[a0][a1]amix=inputs=2:duration=first[a]",
                    "-map", "0:v:0", "-map", "[a]"]
        else:
            cmd += ["-map", "0:v:0", "-map", "1:a:0"]
        cmd += ["-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(dest)]
    else:
        dest = output.with_suffix(".mp4")
        cmd += ["-map", "0:v:0"]
        if sound:
            cmd += ["-map", "0:a:0?"]
        if vfilters:
            cmd += ["-vf", ",".join(vfilters)]
        if afilters:
            cmd += ["-af", ",".join(afilters)]
        if not sound:
            cmd += ["-an"]
        crf = "29" if op == "compress" else "23"
        cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", crf,
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart", str(dest)]
    run_ffmpeg(cmd)
    if not dest.exists() or not dest.stat().st_size:
        raise ValueError("The editor produced no output.")
    return dest

@app.get("/", response_class=HTMLResponse)
async def home():
    return (ROOT / "static" / "index.html").read_text(encoding="utf-8")

@app.get("/api/health")
async def health():
    return {"ok": True, "version": "1.2.0", "service": "ASD Motion Lab", "ai_generation": False}

@app.get("/api/music")
async def list_music(q: str = ""):
    query = q.strip().lower()[:100]
    return [{"id": t["id"], "title": t["title"], "genre": t["genre"],
             "bpm": t["bpm"], "duration": 16, "url": "/api/music/" + t["id"]}
            for t in TRACKS if query in (t["title"] + " " + t["genre"]).lower()]

@app.get("/api/music/{track_id}")
async def play_music(track_id: str):
    track = next((t for t in TRACKS if t["id"] == track_id), None)
    if not track:
        fail("Track not found.", 404)
    path = await run_in_threadpool(build_music, track)
    return FileResponse(path, media_type="audio/wav", filename=track_id + ".wav",
                        content_disposition_type="inline")

@app.post("/api/edit")
async def edit(request: Request,
               file: UploadFile = File(...),
               operation: str = Form(...),
               audio: UploadFile | None = File(None),
               track: str = Form(""),
               variant: str = Form("horizontal"),
               start: float = Form(0),
               duration: float = Form(0),
               fps: int = Form(60),
               smooth: bool = Form(False),
               speed: float = Form(1.25),
               volume: float = Form(1),
               width: int = Form(720),
               tolerance: int = Form(42),
               caption: str = Form(""),
               mix: bool = Form(False)):
    image_ops = {"enhance", "background", "mirror", "rotate", "crop", "resize", "filter", "text"}
    video_ops = {"cut", "mirror", "rotate", "crop", "resize", "speed", "reverse", "fps", "filter",
                 "text", "fade", "volume", "mute", "compress", "gif", "frame", "extract", "add_audio"}
    ext = Path(file.filename or "").suffix.lower()
    if operation not in video_ops | image_ops:
        fail("Unsupported editing operation.", 400)
    is_image = ext in IMAGE_EXT
    if not is_image and ext not in VIDEO_EXT:
        fail("Only supported image and video formats are accepted.", 400)
    if is_image and operation not in image_ops:
        fail("This tool requires a video file.", 422)
    if not is_image and operation not in video_ops:
        fail("This tool requires an image file.", 422)
    if audio and operation != "add_audio":
        fail("Audio uploads are only accepted for Add Audio.")
    if audio and track:
        fail("Choose either uploaded audio or a library track.")
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with RATE_LOCK:
        RATE[ip] = [x for x in RATE.get(ip, []) if now - x < 600]
        if len(RATE[ip]) >= 12:
            fail("Temporary rate limit. Retry in a few minutes.", 429)
        RATE[ip].append(now)
    if not SEM.acquire(blocking=False):
        fail("One edit is processing. Please retry shortly.", 503)
    tmp = tempfile.TemporaryDirectory(prefix="asdmotion-")
    folder = Path(tmp.name)
    args = locals().copy()
    try:
        src = folder / ("input" + ext)
        total = 0
        with src.open("wb") as out:
            while data := await file.read(1024 * 1024):
                total += len(data)
                if total > LIMIT:
                    fail("Maximum upload size is 45 MB.", 413)
                out.write(data)
        if not total:
            fail("Empty file.", 400)
        audio_path = None
        if operation == "add_audio":
            if audio is not None:
                ae = Path(audio.filename or "").suffix.lower()
                if ae not in AUDIO_EXT:
                    fail("Use MP3, M4A, WAV, AAC, OGG or FLAC audio.", 400)
                audio_path = folder / ("track" + ae)
                audio_len = 0
                with audio_path.open("wb") as out:
                    while data := await audio.read(1024 * 1024):
                        audio_len += len(data)
                        if audio_len > 15 * 1024 * 1024:
                            fail("Audio upload limit is 15 MB.", 413)
                        out.write(data)
            elif track:
                found = next((t for t in TRACKS if t["id"] == track), None)
                if not found:
                    fail("Unknown library track.", 422)
                audio_path = await run_in_threadpool(build_music, found)
            else:
                fail("Select a music track or upload audio.")
        target = folder / "render"
        if is_image:
            dest = await run_in_threadpool(prepare_image, src, target, operation, args)
        else:
            dest = await run_in_threadpool(video_render, src, audio_path, target, operation, args, folder)
        media_types = {".mp4": "video/mp4", ".mp3": "audio/mpeg", ".jpg": "image/jpeg",
                       ".png": "image/png", ".gif": "image/gif"}
        return FileResponse(dest, filename="asd-motion-" + operation + dest.suffix,
                            media_type=media_types[dest.suffix],
                            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                            background=BackgroundTask(tmp.cleanup))
    except HTTPException:
        tmp.cleanup()
        raise
    except (OSError, ValueError) as exc:
        tmp.cleanup()
        fail(str(exc))
    except Exception:
        tmp.cleanup()
        fail("Processing failed. Please check the file and settings.")
    finally:
        SEM.release()
