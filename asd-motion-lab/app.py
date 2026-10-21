from __future__ import annotations
import io, math, os, re, struct, subprocess, tempfile, threading, time, wave, random
from pathlib import Path
from collections import defaultdict
from flask import Flask, jsonify, request, send_file, send_from_directory, abort
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['MAX_CONTENT_LENGTH'] = 42 * 1024 * 1024
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SLOT = threading.BoundedSemaphore(1)
HITS = defaultdict(list)
LOCK = threading.Lock()
MUSIC = [
    dict(id='neon-pulse', title='Neon Pulse', genre='Electronic', bpm=120),
    dict(id='night-drive', title='Night Drive', genre='Synthwave', bpm=105),
    dict(id='lofi-focus', title='Lo-fi Focus', genre='Chill', bpm=78),
    dict(id='shadow-step', title='Shadow Step', genre='Trap', bpm=142),
    dict(id='soft-ambient', title='Soft Ambient', genre='Ambient', bpm=70),
    dict(id='arcade-rush', title='Arcade Rush', genre='Gaming', bpm=135),
    dict(id='cinematic-rise', title='Cinematic Rise', genre='Film', bpm=92),
    dict(id='horizon', title='Horizon', genre='Pop', bpm=112),
]
INDEX = {m['id']: m for m in MUSIC}
PI = math.pi

def fnum(key, default, low, high):
    try: n = float(request.form.get(key,default))
    except (ValueError,TypeError): n=default
    if not math.isfinite(n): n=default
    return max(low,min(high,n))
def sval(key,default=''): return str(request.form.get(key,default))[:160]
def yes(key): return sval(key).lower() in ('true','1','yes','on')
def err(message,code=422): return jsonify(error=message),code
def rate_limit():
    address = request.remote_addr or 'unknown'
    t=time.monotonic()
    with LOCK:
        HITS[address]=[v for v in HITS[address] if t-v<1800]
        if len(HITS[address])>=20:return False
        HITS[address].append(t)
        if len(HITS)>1500:
            for k in list(HITS):
                if HITS[k] and t-HITS[k][-1]>1800: del HITS[k]
        return True
def clean_kind(file,allowed):
    if file is None or not file.filename:raise ValueError('Choose a file first.')
    ext=Path(file.filename).suffix.lower()
    if ext not in allowed:raise ValueError('Unsupported media format.')
    return ext
def ratio_crop(im,ratio):
    if ratio=='original':return im
    rw,rh={'9:16':(9,16),'16:9':(16,9),'1:1':(1,1),'4:3':(4,3)}.get(ratio,(1,1))
    w,h=im.size
    nw=min(w,round(h*rw/rh)); nh=min(h,round(w*rh/rw))
    x=(w-nw)//2; y=(h-nh)//2
    return im.crop((x,y,x+nw,y+nh))
def font(size):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'):
        try: return ImageFont.truetype(f,size)
        except OSError:pass
    return ImageFont.load_default()
def edit_photo(inp, out):
    with Image.open(inp) as original:
        if original.width*original.height>28_000_000:raise ValueError('Photo too large. Maximum 28 megapixels.')
        im=ImageOps.exif_transpose(original).convert('RGBA')
    if yes('mirror'): im=ImageOps.mirror(im)
    if yes('flip'): im=ImageOps.flip(im)
    rot=int(fnum('rotate',0,0,270)); im=im.rotate(-rot,expand=True)
    im=ratio_crop(im,sval('ratio','original'))
    im=ImageEnhance.Brightness(im).enhance(fnum('brightness',1,.2,2))
    im=ImageEnhance.Contrast(im).enhance(fnum('contrast',1,.3,2.5))
    im=ImageEnhance.Color(im).enhance(fnum('saturation',1,0,3))
    sharp=fnum('sharpness',0,0,3)
    if sharp: im=im.filter(ImageFilter.UnsharpMask(radius=1.5,percent=int(sharp*110),threshold=2))
    blur=fnum('blur',0,0,6)
    if blur: im=im.filter(ImageFilter.GaussianBlur(blur))
    if yes('removeBg'):
        if im.width*im.height>8_000_000:raise ValueError('Background removal supports photos up to 8 megapixels.')
        px=im.load(); w,h=im.size
        samples=[px[0,0],px[w-1,0],px[0,h-1],px[w-1,h-1]]
        bg=[sorted(p[j] for p in samples)[1] for j in range(3)]
        tol=int(fnum('tolerance',40,10,150))
        for yy in range(h):
            for xx in range(w):
                p=px[xx,yy]; distance=math.sqrt(sum((p[j]-bg[j])**2 for j in range(3)))
                a=max(0,min(255,int((distance-tol)/24*255)))
                px[xx,yy]=(p[0],p[1],p[2],min(p[3],a))
    caption=sval('caption')
    if caption.strip():
        d=ImageDraw.Draw(im)
        fs=int(max(20,min(120,im.width*.052)))
        f=font(fs)
        bbox=d.textbbox((0,0),caption,font=f,stroke_width=2)
        text_w=bbox[2]-bbox[0]
        y=int(im.height*(.13 if sval('textPosition','bottom')=='top' else .82))
        x=max(16,(im.width-text_w)//2)
        d.text((x,y),caption,font=f,fill=sval('textColor','#ffffff'),stroke_width=max(1,fs//25),stroke_fill='#080b16')
    if max(im.size)>2600:
        im.thumbnail((2600,2600),Image.Resampling.LANCZOS)
    fmt=sval('imageFormat','png')
    if fmt=='jpg':
        base=Image.new('RGB',im.size,'white');base.paste(im,mask=im.getchannel('A'))
        base.save(out,format='JPEG',quality=93,optimize=True)
        return 'image/jpeg','jpg'
    im.save(out,format='PNG',optimize=True)
    return 'image/png','png'
def ffmpeg(args,timeout=115):
    try:
        p=subprocess.run([FFMPEG,'-nostdin','-hide_banner','-loglevel','error','-y',*args],capture_output=True,text=True,timeout=timeout)
    except subprocess.TimeoutExpired:raise ValueError('Export took too long. Try a shorter clip or 480p.')
    if p.returncode:raise ValueError('FFmpeg could not finish this edit. '+(p.stderr.strip()[-260:] or 'Check the video format.'))
def has_audio(path):
    try:
        p=subprocess.run([FFMPEG,'-hide_banner','-i',str(path)],capture_output=True,text=True,timeout=12)
        return bool(re.search(r'Stream #.*: Audio:',p.stderr))
    except Exception:return False
def wav_music(key):
    cfg=INDEX.get(key)
    if not cfg:raise ValueError('Unknown music track.')
    sr=16000; length=12; bpm=cfg['bpm']; step=60/bpm
    idx=MUSIC.index(cfg); roots=[110,98,130.81,82.41,146.83,123.47,87.31,130.81]
    root=roots[idx]; buf=io.BytesIO()
    with wave.open(buf,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr)
        frames=bytearray()
        for n in range(sr*length):
            t=n/sr; b=t/step; beat=b-int(b)
            bass=.19*math.sin(2*PI*root*t)*(0.55+0.45*math.cos(2*PI*.25*t))
            lead=.11*math.sin(2*PI*(root*2*(1 if int(b)%4<2 else 1.5))*t)
            kick=.22*math.sin(2*PI*(52*math.exp(-beat*9)+42)*t)*math.exp(-beat*18)
            hat=(random.Random(n//23+idx).random()-.5)*.08*math.exp(-((b*2)%1)*22)
            volume=min(1,t/.06,(length-t)/.25)
            sample=max(-1,min(1,(bass+lead+kick+hat)*volume))
            frames.extend(struct.pack('<h',int(sample*30000)))
        w.writeframes(frames)
    return buf.getvalue()
def video_filters():
    filters=[]
    speed=fnum('speed',1,.5,3)
    filters.append(f'setpts=(PTS-STARTPTS)/{speed}')
    if yes('mirror'):filters.append('hflip')
    if yes('flip'):filters.append('vflip')
    rotation=int(fnum('rotate',0,0,270))
    if rotation==90: filters.append('transpose=clock')
    if rotation==180: filters.extend(['hflip','vflip'])
    if rotation==270: filters.append('transpose=cclock')
    ratio=sval('ratio','original')
    if ratio in ('9:16','16:9','1:1','4:3'):
        rw,rh=[int(p) for p in ratio.split(':')]
        target=rw/rh
        filters.append(f"crop=if(gt(iw/ih\\,{target})\\,ih*{target}\\,iw):if(gt(iw/ih\\,{target})\\,ih\\,iw/{target})")
    bright=fnum('brightness',1,.2,2)-1
    cont=fnum('contrast',1,.3,2.5)
    sat=fnum('saturation',1,0,3)
    filters.append(f'eq=brightness={bright*.3:.3f}:contrast={cont:.3f}:saturation={sat:.3f}')
    sharp=fnum('sharpness',0,0,3)
    if sharp:filters.append(f'unsharp=5:5:{min(2,sharp*.6):.3f}')
    blur=fnum('blur',0,0,6)
    if blur:filters.append(f'boxblur={blur:.1f}:1')
    fps=int(fnum('fps',30,24,250))
    if fps not in (24,30,60,120,250):fps=30
    filters.append(f'fps={fps}')
    width=int(fnum('width',720,360,1080))
    if width not in (480,720,1080):width=720
    filters.append(f'scale={width}:-2:flags=lanczos')
    return filters,speed,fps
def do_video(inp, out, work, audio_file=None):
    operation=sval('operation','video')
    start=fnum('start',0,0,300)
    end=fnum('end',15,0,300)
    if end<=start:raise ValueError('End time must be greater than start time.')
    length=min(end-start,45)
    filters,speed,fps=video_filters()
    if fps>60 and length>12:raise ValueError('120/250 FPS exports are limited to 12 seconds.')
    if speed<.75 and length>30:raise ValueError('For slow motion, keep clips under 30 seconds.')
    audio_exists=has_audio(inp)
    if operation=='extractAudio':
        if not audio_exists:raise ValueError('The uploaded video does not contain an audio track.')
        ffmpeg(['-ss',str(start),'-t',str(length),'-i',str(inp),'-vn','-q:a','3','-codec:a','libmp3lame',str(out)])
        return 'audio/mpeg','mp3'
    caption=sval('caption').strip()
    if caption:
        text_path=work/'caption.txt';text_path.write_text(caption,encoding='utf-8')
        col=re.sub(r'[^a-fA-F0-9]','',sval('textColor','#ffffff'))[:6] or 'ffffff'
        ypos='h*0.12' if sval('textPosition','bottom')=='top' else 'h*0.82'
        filters.append(f"drawtext=textfile={text_path}:fontcolor=0x{col}:fontsize=h/21:x=(w-text_w)/2:y={ypos}:borderw=3:bordercolor=black")
    filt=','.join(filters)
    cmd=['-ss',f'{start:.2f}','-t',f'{length:.2f}','-i',str(inp)]
    track=sval('track')
    if track and track not in INDEX:raise ValueError('Unknown music track.')
    if track:
        path=work/'music.wav';path.write_bytes(wav_music(track))
        audio_file=path
    add_audio=audio_file is not None
    if add_audio:cmd.extend(['-stream_loop','-1','-i',str(audio_file)])
    mix= fnum('musicVolume',.65,0,2)
    original=fnum('volume',1,0,2)
    atempo=f'atempo={speed:.4f}'
    if speed>2:atempo='atempo=2,atempo='+f'{speed/2:.4f}'
    afade='afade=t=in:st=0:d=0.2'
    if add_audio:
        if audio_exists and original>0 and not yes('muteOriginal'):
            complex_filter=(f'[0:v]{filt}[v];[0:a]volume={original:.3f},{atempo}[a0];'
                +f'[1:a]volume={mix:.3f}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]')
            audio_map='[a]'
        else:
            complex_filter=f'[0:v]{filt}[v];[1:a]volume={mix:.3f}[a]'
            audio_map='[a]'
        cmd+=['-filter_complex',complex_filter,'-map','[v]','-map',audio_map]
    elif audio_exists and original>0 and not yes('muteOriginal'):
        complex_filter=f'[0:v]{filt}[v];[0:a]volume={original:.3f},{atempo}[a]'
        cmd+=['-filter_complex',complex_filter,'-map','[v]','-map','[a]']
    else:
        cmd+=['-vf',filt,'-map','0:v:0','-an']
    cmd+=['-t',f'{min(50,length/speed):.2f}','-c:v','libx264','-preset','ultrafast','-crf','22','-threads','2','-pix_fmt','yuv420p']
    if add_audio or (audio_exists and original>0 and not yes('muteOriginal')):cmd+=['-c:a','aac','-b:a','128k']
    cmd+=['-movflags','+faststart',str(out)]
    ffmpeg(cmd)
    return 'video/mp4','mp4'

@app.get('/')
def home():return send_from_directory(ROOT/'static','index.html')
@app.get('/api/health')
def health():
    return jsonify(ok=True,name='ASD Motion Lab',engine='FFmpeg',editing=True,ai_generation=False,version='2.0')
@app.get('/api/music')
def music():return jsonify(tracks=MUSIC)
@app.get('/api/music/<track>')
def track(track):
    if track not in INDEX:abort(404)
    return send_file(io.BytesIO(wav_music(track)),mimetype='audio/wav',download_name=track+'.wav')
@app.post('/api/render')
def render():
    if not rate_limit():return err('Processing limit reached (20 per 30 minutes). Try again later.',429)
    if not SLOT.acquire(False):return err('Another export is running. Try again shortly.',503)
    try:
        kind=sval('kind','video')
        is_photo=kind=='photo'
        uploaded=request.files.get('file')
        clean_kind(uploaded,{'.jpg','.jpeg','.png','.webp'} if is_photo else {'.mp4','.mov','.webm','.mkv'})
        with tempfile.TemporaryDirectory(prefix='asd-edit-') as temp:
            work=Path(temp)
            ext=Path(uploaded.filename).suffix.lower()
            source=work/('input'+ext)
            uploaded.save(source)
            if source.stat().st_size>40*1024*1024:raise ValueError('Maximum upload is 40 MB.')
            out=work/('render.jpg' if is_photo and sval('imageFormat','png')=='jpg' else 'render.png' if is_photo else 'render.mp3' if sval('operation')=='extractAudio' else 'render.mp4')
            if is_photo: mimetype,suffix=edit_photo(source,out)
            else:
                audio=request.files.get('audio')
                uploaded_audio=None
                if audio and audio.filename:
                    clean_kind(audio,{'.mp3','.wav','.m4a','.aac','.ogg'})
                    uploaded_audio=work/('music'+Path(audio.filename).suffix.lower())
                    audio.save(uploaded_audio)
                    if uploaded_audio.stat().st_size>12*1024*1024:raise ValueError('Audio upload max 12 MB.')
                mimetype,suffix=do_video(source,out,work,uploaded_audio)
            if not out.exists() or out.stat().st_size<100:raise ValueError('The exported file was empty.')
            return send_file(io.BytesIO(out.read_bytes()),mimetype=mimetype,download_name='ASD-Motion-Lab.'+suffix,as_attachment=True)
    except (ValueError, OSError, subprocess.SubprocessError) as ex:return err(str(ex))
    except Exception:
        app.logger.exception('Render error')
        return err('Rendering failed. Try shorter or simpler media.',500)
    finally:SLOT.release()

@app.errorhandler(413)
def too_big(ex):return err('File too large. Maximum request size is 42 MB.',413)
