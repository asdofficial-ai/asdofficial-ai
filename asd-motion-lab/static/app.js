(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const initial={mirror:false,flip:false,rotate:0,ratio:'original',brightness:1,contrast:1,saturation:1,sharpness:0,blur:0,removeBg:false,tolerance:40,speed:1,fps:30,caption:'',textColor:'#ffffff',textPosition:'bottom',volume:1,muteOriginal:false,musicVolume:.65,width:720,imageFormat:'png',start:0,end:15};
let st={...initial},file=null,audio=null,track='',type='video',duration=0,screen='media',sourceUrl='',resultUrl='',tracks=[],search='',undo=[],redo=[],busy=false;
const titles={media:['Media','Import a photo or a video clip.'],transform:['Transform','Mirror, flip, crop, rotate.'],color:['Adjust','Make your colours cinematic.'],speed:['Speed & FPS','Control playback and frame rate.'],text:['Text overlay','Add a clean caption.'],audio:['Audio studio','Add, extract and mix sound.'],export:['Export','Save the finished edit.']};
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>{v=Math.floor(Number(v)||0);return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0')};
function toast(t){let e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),4500)}
function history(){undo.push({...st,track});if(undo.length>35)undo.shift();redo=[]}
function group(title,body){return '<section class="panel-group"><h3 class="group-title">'+title+'</h3>'+body+'</section>'}
function range(label,key,min,max,step){return '<div class="control"><div class="control-head"><label>'+label+'</label><span class="val" data-val="'+key+'">'+st[key]+'</span></div><input data-setting="'+key+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+st[key]+'"></div>'}
function select(label,key,opts){return '<div class="control"><div class="control-head"><label>'+label+'</label></div><select data-setting="'+key+'">'+opts.map(o=>'<option value="'+o[0]+'" '+(String(st[key])===String(o[0])?'selected':'')+'>'+o[1]+'</option>').join('')+'</select></div>'}
function checkbox(label,key){return '<label class="checkline"><input type="checkbox" data-setting="'+key+'" '+(st[key]?'checked':'')+'>'+label+'</label>'}
function btn(id,label,cls){return '<button id="'+id+'" class="btn '+(cls||'flat')+' full">'+label+'</button>'}
function musicList(){let filtered=tracks.filter(t=>(t.title+' '+t.genre).toLowerCase().includes(search.toLowerCase()));return filtered.length?filtered.map(t=>'<button data-track="'+t.id+'" class="music-item '+(track===t.id?'active':'')+'"><span class="music-art">♫</span><span class="music-desc"><strong>'+esc(t.title)+'</strong><small>'+esc(t.genre)+' · '+t.bpm+' BPM</small></span><span class="music-play">'+(track===t.id?'✓':'▶')+'</span></button>').join(''):'<p class="panel-note">'+(tracks.length?'No matching music.':'Loading music library...')+'</p>'}
function wireMusic(){$$('#musicList [data-track]').forEach(b=>b.onclick=()=>{track=b.dataset.track;audio=null;$('#musicPlayer').src='/api/music/'+track;$('#musicPlayer').hidden=false;$('#musicPlayer').play().catch(()=>{});$('#audioTrackName').textContent='♫ '+tracks.find(t=>t.id===track).title;$('#musicList').innerHTML=musicList();wireMusic();toast('Music added')})}
function panel(id){
screen=id;$$('[data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===id));$('#panelTitle').textContent=titles[id][0];$('#panelDesc').textContent=titles[id][1];
let c='';
if(id==='media')c=group('SOURCE',btn('chooseMedia','＋ Import photo or video','primary')+'<p class="panel-note">MP4, MOV, WEBM, MKV, JPG, PNG and WEBP. Max 40MB.</p><div class="selected-track">'+(file?esc(file.name):'No media loaded')+'</div>')+group('QUICK TOOLS','<div class="button-grid"><button class="tool-btn" data-goto="transform"><strong>⟷</strong> Mirror / flip</button><button class="tool-btn" data-goto="color"><strong>◐</strong> Colour</button><button class="tool-btn" data-goto="audio"><strong>♫</strong> Audio</button><button class="tool-btn" data-goto="export"><strong>⇩</strong> Export</button></div>')+group('ABOUT','<div class="pill-warning">Mobile-friendly single-clip editor. This release does not support multi-clip transitions, complex keyframes or copyrighted stock songs.</div>');
if(id==='transform')c=group('FLIP / MIRROR','<div class="button-grid"><button class="tool-btn '+(st.mirror?'selected':'')+'" data-toggle="mirror"><strong>⟷</strong> Mirror</button><button class="tool-btn '+(st.flip?'selected':'')+'" data-toggle="flip"><strong>↟↡</strong> Flip</button></div>'+select('Rotate','rotate',[[0,'None'],[90,'90 degrees'],[180,'180 degrees'],[270,'270 degrees']])+select('Crop to aspect ratio','ratio',[['original','Keep original'],['9:16','9:16 · TikTok'],['16:9','16:9 · YouTube'],['1:1','1:1 · Square'],['4:3','4:3 · Classic']])+(type==='photo'?checkbox('Remove simple flat background','removeBg')+range('Colour tolerance','tolerance',10,150,5):''))+group('HELP','<p class="panel-note">Mirror reverses left/right. Flip reverses top/bottom. Crop removes outer edges.</p>');
if(id==='color')c=group('IMAGE AND VIDEO',range('Brightness','brightness',.3,1.8,.05)+range('Contrast','contrast',.5,2,.05)+range('Saturation','saturation',0,2.5,.05))+group('DETAIL',range('Sharpen','sharpness',0,3,.1)+range('Blur','blur',0,5,.25))+btn('resetColor','Reset colour settings');
if(id==='speed')c=group('SPEED',range('Playback speed','speed',.5,3,.25)+'<p class="panel-note">Affects the exported video duration.</p>')+group('FRAME RATE',select('Output FPS','fps',[[24,'24 FPS'],[30,'30 FPS'],[60,'60 FPS'],[120,'120 FPS'],[250,'250 FPS']])+'<p class="panel-note">250 FPS is conversion, not new camera detail. Over 60 FPS limits exports to 12s.</p>');
if(id==='text')c=group('CAPTION','<div class="control"><label for="captionEditor">Your text</label><textarea id="captionEditor" data-setting="caption" maxlength="160" placeholder="Write your title...">'+esc(st.caption)+'</textarea></div>'+select('Position','textPosition',[['bottom','Bottom'],['top','Top']])+'<div class="control"><label>Text colour</label><input type="color" data-setting="textColor" value="'+st.textColor+'" style="width:100%;height:41px"></div>')+group('TIP','<p class="panel-note">Text is burned into your exported file.</p>');
if(id==='audio')c=group('AUDIO ACTIONS',btn('extractAudio','♫ Extract audio (.mp3)')+'<p class="panel-note">Take the sound out of the original video.</p>'+btn('uploadAudio','＋ Upload your own audio')+(audio?'<p class="selected-track">✓ '+esc(audio.name)+'</p>':''))+group('BUILT-IN MUSIC','<div class="music-search">⌕ &nbsp;<input type="search" id="musicSearch" placeholder="Search music or genre..." value="'+esc(search)+'"></div><div class="music-list" id="musicList">'+musicList()+'</div><p class="panel-note">Original computer-made instrumental loops. No commercial copyrighted songs.</p>')+group('AUDIO MIX',range('Original sound volume','volume',0,2,.1)+range('Music volume','musicVolume',0,2,.1)+checkbox('Mute source audio','muteOriginal')+btn('clearAudio','Remove added audio'));
if(id==='export')c=group('OUTPUT',type==='video'?select('Resolution width','width',[[480,'480 px'],[720,'720 px · HD'],[1080,'1080 px · Full HD']])+select('FPS','fps',[[24,'24 FPS'],[30,'30 FPS'],[60,'60 FPS'],[120,'120 FPS'],[250,'250 FPS']]):select('Image format','imageFormat',[['png','PNG · High quality'],['jpg','JPG · Smaller file']]))+group('RENDER',btn('renderNow','⇩ Export '+(type==='video'?'MP4':'image'),'primary')+'<p class="panel-note">Export can take longer on large files. Max video clip length: 45 seconds.</p>')+group('PROJECT',btn('saveSettings','Save project settings (.json)'));
$('#panelBody').innerHTML=c;
$$('#panelBody [data-setting]').forEach(el=>{
el.oninput=()=>{if(!el.dataset.editing){history();el.dataset.editing='1'}let key=el.dataset.setting;st[key]=el.type==='checkbox'?el.checked:(el.type==='range'||['fps','rotate','width'].includes(key))?Number(el.value):el.value;let v=$('#panelBody [data-val="'+key+'"]');if(v)v.textContent=Math.round(Number(st[key])*100)/100;applyPreview()};
el.onchange=()=>{delete el.dataset.editing;if(el.type==='checkbox')panel(screen)};
});
$$('#panelBody [data-toggle]').forEach(el=>el.onclick=()=>{history();st[el.dataset.toggle]=!st[el.dataset.toggle];panel(screen);applyPreview()});
$$('#panelBody [data-goto]').forEach(el=>el.onclick=()=>panel(el.dataset.goto));
const click=(id,fn)=>{const b=$('#panelBody #'+id);if(b)b.onclick=fn};
click('chooseMedia',()=>$('#fileInput').click());click('uploadAudio',()=>$('#audioInput').click());click('extractAudio',()=>exportFile('extractAudio'));click('renderNow',()=>exportFile('video'));
click('clearAudio',()=>{track='';audio=null;$('#audioTrackName').textContent='Audio track · none selected';panel('audio');toast('Music removed')});
click('resetColor',()=>{history();['brightness','contrast','saturation','sharpness','blur'].forEach(k=>st[k]=initial[k]);panel('color');applyPreview()});
click('saveSettings',()=>{let data=JSON.stringify({name:'ASD Motion Lab',settings:st,track,source:file?.name||null},null,2);let blob=new Blob([data],{type:'application/json'});let u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='ASD-Motion-Settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)});
if(id==='audio'){let input=$('#musicSearch');input.oninput=()=>{search=input.value;$('#musicList').innerHTML=musicList();wireMusic()};wireMusic()}
}
function applyPreview(){
let tf='scaleX('+(st.mirror?-1:1)+') scaleY('+(st.flip?-1:1)+') rotate('+st.rotate+'deg)';
let fl='brightness('+st.brightness+') contrast('+st.contrast+') saturate('+st.saturation+') blur('+st.blur+'px)';
for(let id of ['video','photo']){$('#'+id).style.transform=tf;$('#'+id).style.filter=fl}
}
function refresh(){
let d=Math.max(1,duration||st.end);for(let name of ['start','end']){let el=$('#'+name+'Range');el.max=d;el.value=st[name];el.disabled=type==='photo'||!file}
$('#startVal').textContent=st.start.toFixed(1)+' s';$('#endVal').textContent=st.end.toFixed(1)+' s';
$('#trimInfo').textContent=fmt(st.start)+' — '+fmt(st.end);
$('#clipDuration').textContent=type==='photo'?'PHOTO':fmt(Math.max(0,st.end-st.start));
$('#timeLabel').textContent=fmt(st.start)+' / '+fmt(duration);applyPreview()
}
function chooseFile(f){
if(!f)return;let image=/\.(jpe?g|png|webp)$/i.test(f.name),video=/\.(mp4|mov|webm|mkv)$/i.test(f.name);
if(!image&&!video){toast('Unsupported media file');return}if(f.size>40*1048576){toast('Maximum media size 40MB');return}
if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(f);file=f;type=image?'photo':'video';st={...initial};duration=0;undo=[];redo=[];
$('#video').pause();$('#video').hidden=image;$('#photo').hidden=!image;$('#emptyState').hidden=true;
$('#modeTitle').textContent=image?'Photo Editor':'Video Editor';$('#canvasMode').textContent=image?'PHOTO':'VIDEO';$('#trackName').textContent=f.name;
$('#mediaInfo').textContent=(f.size/1048576).toFixed(1)+' MB · '+(image?'PHOTO':'VIDEO');
if(image){$('#photo').src=sourceUrl;refresh()}else{
let v=$('#video');v.src=sourceUrl;v.load();v.onloadedmetadata=()=>{duration=Number.isFinite(v.duration)?v.duration:0;st.end=Math.min(45,Math.max(.1,duration||15));refresh();if(duration>45)toast('Trim the video to 45 seconds or less')};}
refresh();panel('media')
}
async function exportFile(operation){
if(busy)return;if(!file){toast('Import a file first');$('#fileInput').click();return}
if(operation==='extractAudio'&&type!=='video'){toast('Audio extraction requires video');return}
if(type==='video'&&st.end<=st.start){toast('OUT must be after IN');return}
busy=true;$('#busy').classList.remove('hidden');$('#exportBtn').disabled=true;
try{let form=new FormData();form.append('file',file);form.append('kind',type);form.append('operation',operation);
for(let [k,v] of Object.entries(st))form.append(k,String(v));
if(audio)form.append('audio',audio);else if(track)form.append('track',track);
let response=await fetch('/api/render',{method:'POST',body:form});if(!response.ok){let j={};try{j=await response.json()}catch{}throw Error(j.error||'Export failed ('+response.status+')')}
let blob=await response.blob();if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=URL.createObjectURL(blob);
let ext=operation==='extractAudio'?'mp3':type==='photo'?st.imageFormat:'mp4';
let anchor=$('#downloadFile');anchor.href=resultUrl;anchor.download='ASD-Motion-Lab-'+Date.now()+'.'+ext;
let el=document.createElement(type==='photo'?'img':operation==='extractAudio'?'audio':'video');el.src=resultUrl;
if(el.tagName!=='IMG'){el.controls=true;el.playsInline=true}else el.alt='Edited photo';
$('#resultPreview').replaceChildren(el);
$('#resultText').textContent=operation==='extractAudio'?'Your extracted MP3 is ready.':type==='photo'?'Your edited photo is ready.':'Your video export is ready.';
$('#resultOverlay').classList.remove('hidden');toast('Export complete');
}catch(e){toast(e.message||'Export failed')}finally{busy=false;$('#busy').classList.add('hidden');$('#exportBtn').disabled=false}
}
$('#fileInput').onchange=e=>chooseFile(e.target.files?.[0]);$('#audioInput').onchange=e=>{let f=e.target.files?.[0];if(!f)return;if(f.size>12*1048576)return toast('Audio max 12MB');audio=f;track='';$('#audioTrackName').textContent='♫ '+f.name;panel('audio');toast('Added your audio')};
$('#uploadBtn').onclick=$('#newMedia').onclick=()=>$('#fileInput').click();$('#exportBtn').onclick=()=>exportFile('video');
$('#resetBtn').onclick=()=>{history();st={...initial,end:type==='video'?Math.min(45,duration||15):15};track='';audio=null;refresh();panel(screen);toast('Settings reset')};
$('#undoBtn').onclick=()=>{if(!undo.length)return toast('Nothing to undo');redo.push({...st,track});let prev=undo.pop();st={...initial,...prev};track=prev.track||'';refresh();panel(screen)};
$('#redoBtn').onclick=()=>{if(!redo.length)return toast('Nothing to redo');undo.push({...st,track});let next=redo.pop();st={...initial,...next};track=next.track||'';refresh();panel(screen)};
$$('[data-panel]').forEach(b=>b.onclick=()=>panel(b.dataset.panel));$('#openAudio').onclick=()=>{panel('audio');if(innerWidth<790)$('.inspector').scrollIntoView({behavior:'smooth'})};
$('#fitBtn').onclick=()=>{let e=$('#stage');if(document.fullscreenElement)document.exitFullscreen();else e.requestFullscreen?.().catch(()=>toast('Fullscreen unavailable'))};
$('#playBtn').onclick=()=>{if(type==='photo')return toast('Photo preview');let v=$('#video');if(v.paused){v.play().catch(()=>toast('Unable to play'));$('#playBtn').textContent='Ⅱ'}else{v.pause();$('#playBtn').textContent='▶'}};
$('#video').onpause=()=>$('#playBtn').textContent='▶';
$('#video').ontimeupdate=()=>{let v=$('#video');$('#timeLabel').textContent=fmt(v.currentTime)+' / '+fmt(duration);if(v.currentTime>=st.end+.1){v.pause();v.currentTime=st.start}};
$('#startRange').oninput=e=>{st.start=Math.min(Number(e.target.value),st.end-.1);$('#video').currentTime=st.start;refresh()};
$('#endRange').oninput=e=>{st.end=Math.max(Number(e.target.value),st.start+.1);refresh()};
$('#startRange').onchange=$('#endRange').onchange=history;
for(let id of ['closeResult','backEditor'])$('#'+id).onclick=()=>$('#resultOverlay').classList.add('hidden');
$('#resultOverlay').onclick=e=>{if(e.target.id==='resultOverlay')$('#resultOverlay').classList.add('hidden')};
document.onkeydown=e=>{if(e.key==='Escape')$('#resultOverlay').classList.add('hidden');if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#undoBtn').click()}};
fetch('/api/music').then(r=>r.json()).then(j=>{tracks=j.tracks||[];if(screen==='audio')panel('audio')}).catch(()=>toast('Music list unavailable'));
panel('media');refresh();
})();