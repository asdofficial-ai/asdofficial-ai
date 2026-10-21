(()=>{"use strict";
const $=(q,root=document)=>root.querySelector(q), $$=(q,root=document)=>Array.from(root.querySelectorAll(q));
const catalog={
  video:[["cut","✂","Trim"],["mirror","⇄","Mirror"],["rotate","↻","Rotate"],["crop","⊞","Crop"],["resize","▣","Resize"],["speed","↗","Speed"],["reverse","⟲","Reverse"],["fps","◷","FPS"],["filter","◐","Filters"],["text","T","Text"],["fade","◌","Fade"],["compress","▤","Compress"],["gif","◆","GIF"],["frame","◎","Frame"]],
  audio:[["extract","♫","Extract MP3"],["add_audio","⊕","Add audio"],["volume","▱","Volume"],["mute","✕","Mute"]],
  photo:[["enhance","✧","Enhance"],["background","◌","Solid BG"],["mirror","⇄","Mirror"],["rotate","↻","Rotate"],["crop","⊞","Crop"],["resize","▣","Resize"],["filter","◐","Filters"],["text","T","Text"]]
};
function field(name,title,html,wide=false){return '<div class="field'+(wide?' wide':'')+'"><label>'+title+'</label>'+html+'</div>'}
const number=(name,label,value)=>field(name,label,'<input type="number" min="0" step=".1" name="'+name+'" value="'+value+'">');
const rangeFields=()=>number("start","Start (seconds)",0)+number("duration","Duration (0 = remaining)",0);
const htmlSettings={
cut:rangeFields(),
mirror:field("variant","Flip direction",'<select name="variant"><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select>'),
rotate:field("variant","Rotate",'<select name="variant"><option value="right">90° clockwise</option><option value="left">90° counterclockwise</option><option value="180">180°</option></select>'),
crop:field("variant","Aspect ratio",'<select name="variant"><option value="9:16">9:16 · Vertical</option><option value="16:9">16:9 · Wide</option><option value="1:1">1:1 · Square</option><option value="4:3">4:3 · Classic</option></select>'),
resize:field("width","Output width",'<select name="width"><option value="480">480 px</option><option value="720" selected>720 px</option><option value="1080">1080 px</option><option value="1920">1920 px</option></select>'),
speed:field("speed","Playback speed",'<select name="speed"><option value=".5">0.5× slower</option><option value=".75">0.75× slower</option><option value="1.25" selected>1.25× faster</option><option value="1.5">1.5× faster</option><option value="2">2× faster</option></select>'),
fps:field("fps","Target FPS",'<select name="fps"><option>24</option><option>30</option><option selected>60</option><option>120</option><option>250</option></select>')+'<label class="checkline wide"><input name="smooth" type="checkbox"> Interpolate frames (≤60 FPS, ≤8 sec)</label><p class="hint wide">120/250 FPS is conversion, not native recorded FPS; max 10 seconds.</p>',
filter:field("variant","Color filter",'<select name="variant"><option value="vivid">Vivid</option><option value="bw">Black & white</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="soft">Soft</option></select>'),
text:field("caption","Overlay caption",'<input type="text" name="caption" maxlength="120" placeholder="ENTER YOUR TEXT">',true),
volume:field("volume","Original sound volume",'<select name="volume"><option value="0">Mute</option><option value=".5">50%</option><option value="1" selected>100%</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option></select>'),
add_audio:'<p class="hint wide">Choose an original track or upload audio. Use Mix to keep the original sound.</p>',
extract:'<p class="hint wide">Export the original video sound as an MP3 audio file.</p>',
background:field("tolerance","Solid color tolerance",'<input type="range" name="tolerance" min="5" max="150" value="42">',true)+'<p class="hint wide">For plain backgrounds only — not AI segmentation.</p>',
enhance:'<p class="hint wide">Sharpness, contrast and 2× enlargement. Not an AI upscaler.</p>',
reverse:'<p class="hint wide">Reverse footage and original sound. Maximum 12 seconds.</p>',
gif:'<p class="hint wide">Silent GIF export, up to 10 seconds.</p>',
compress:'<p class="hint wide">Compress with reduced output bitrate, at most 720p.</p>',
fade:'<p class="hint wide">One-second fade in and out.</p>',
mute:'<p class="hint wide">Remove the original sound track.</p>',
frame:number("start","Frame time (seconds)",1)
};
let kind="video",tool="cut",working=false,resultUrl=null,sourceUrl=null,tracks=[];
const form=$("#edit-form");
function notify(s,type=""){$("#notification").textContent=s;$("#notification").className="notification"+(type?" "+type:"")}
function updateUpload(){const f=$("#file").files[0];$("#upload-title").textContent=f?f.name:"Tap or drop a file here";$("#upload-subtitle").textContent=f?(f.size/1048576).toFixed(2)+" MB selected":kind==="photo"?"JPG, PNG, WebP · Max 45 MB":"MP4, MOV, WebM, MKV · Max 45 MB"}
function clearResult(){if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;$("#media-output").replaceChildren();$("#media-output").hidden=true;$("#empty-state").hidden=false;const a=$("#download");a.removeAttribute("href");a.classList.add("disabled");a.setAttribute("aria-disabled","true");$("#output-info").innerHTML="No output yet <small>Results stay in this tab, not on the server.</small>";$("#output-stage").textContent="OUTPUT / 02"}
function render(){
const grid=$("#tool-grid");grid.replaceChildren();
for(const [id,glyph,title] of catalog[kind]){
 const b=document.createElement("button");b.type="button";b.className="tool-choose"+(id===tool?" active":"");b.setAttribute("aria-pressed",String(id===tool));const icon=document.createElement("span");icon.className="glyph";icon.textContent=glyph;const txt=document.createElement("span");txt.textContent=title;b.append(icon,txt);b.addEventListener("click",()=>selectTool(id));grid.append(b)
}
let h=htmlSettings[tool]||"";
if(kind!=="photo"&&!["cut","frame","speed","reverse","gif"].includes(tool)) h+='<div class="field wide"><details><summary>Optional clip range</summary><div class="nested-timing">'+rangeFields()+'</div></details></div>';
if(kind!=="photo"&&["speed","reverse","gif"].includes(tool))h+=rangeFields();
$("#settings").innerHTML=h;$("#settings").style.display=h.trim()?"grid":"none";
$("#music-choice").hidden=tool!=="add_audio";
$("#file").accept=kind==="photo"?"image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp":"video/*,.mp4,.mov,.mkv,.webm";
updateUpload()
}
function selectTool(value){if(working)return;tool=value;render();clearResult();notify("Ready for "+(catalog[kind].find(x=>x[0]===value)||[null,null,value])[2]+".")}
function chooseKind(value){if(working)return;kind=value;$$(".category").forEach(b=>{const active=b.dataset.kind===kind;b.classList.toggle("active",active);b.setAttribute("aria-selected",String(active))});tool=catalog[kind][0][0];$("#file").value="";render();clearResult();notify("Choose a file to begin.")}
function fileChanged(){
clearResult();const f=$("#file").files[0];updateUpload();
if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=null;
if(!f){notify("Choose a file.");return}
if(f.size>45*1048576){notify("This file exceeds 45 MB.","error");return}
sourceUrl=URL.createObjectURL(f);const el=document.createElement(kind==="photo"?"img":"video");el.src=sourceUrl;
if(el.tagName==="VIDEO"){el.controls=true;el.playsInline=true;el.preload="metadata"}else el.alt="Source image";
$("#media-output").replaceChildren(el);$("#media-output").hidden=false;$("#empty-state").hidden=true;$("#output-stage").textContent="SOURCE / PREVIEW";$("#output-info").innerHTML="SOURCE MEDIA <small>Process to enable download.</small>";notify("Media selected. Choose settings, then process.")
}
function sourceChanged(){const upload=$('input[name="source"]:checked')?.value==="upload";$("#library-select").hidden=upload;$("#audio-upload").hidden=!upload;$("#audio").disabled=!upload;$("#track").disabled=upload}
async function submit(e){
e.preventDefault();if(working)return;
const f=$("#file").files[0];if(!f){notify("Upload your file first.","error");return}if(f.size>45*1048576){notify("Maximum file size is 45 MB.","error");return}
const upload=tool==="add_audio"&&$('input[name="source"]:checked')?.value==="upload";
if(upload&&!$("#audio").files.length){notify("Choose an audio file.","error");return}
if(tool==="add_audio"&&!upload&&!$("#track").value){notify("Choose a music track.","error");return}
const fd=new FormData(form);fd.set("operation",tool);
if(tool==="add_audio"){if(upload)fd.delete("track");else fd.delete("audio");fd.set("mix",$("#mix").checked?"true":"false")}else{fd.delete("audio");fd.delete("track");fd.delete("mix")}
fd.set("smooth",$('[name="smooth"]')?.checked?"true":"false");
working=true;$("#submit").disabled=true;$("#submit").textContent="PROCESSING MEDIA…";$("#output-stage").textContent="RENDERING / …";notify("Processing your file. Keep this tab open.");
try{
 const response=await fetch("/api/edit",{method:"POST",body:fd});
 if(!response.ok){let message="Could not process the file ("+response.status+").";try{const data=await response.json();message=data.detail||message}catch{}throw new Error(message)}
 const blob=await response.blob();if(!blob.size)throw new Error("Output file was empty.");
 clearResult();resultUrl=URL.createObjectURL(blob);
 const mime=blob.type;const el=document.createElement(mime.startsWith("video")?"video":mime.startsWith("audio")?"audio":"img");el.src=resultUrl;
 if(el.tagName==="IMG")el.alt="Edited image";else{el.controls=true;el.preload="metadata";if(el.tagName==="VIDEO")el.playsInline=true}
 $("#media-output").append(el);$("#media-output").hidden=false;$("#empty-state").hidden=true;
 const ext=mime.includes("video/mp4")?".mp4":mime.includes("audio/mpeg")?".mp3":mime.includes("image/gif")?".gif":mime.includes("image/png")?".png":".jpg";
 const link=$("#download");link.href=resultUrl;link.download="asd-motion-"+tool+ext;link.classList.remove("disabled");link.removeAttribute("aria-disabled");
 $("#output-info").innerHTML=(blob.size/1048576).toFixed(2)+' MB <small>Ready to download.</small>';$("#output-stage").textContent="READY / 02";notify("Edit complete. Tap Download to save.","success");
 $("#media-output").scrollIntoView({behavior:"smooth",block:"nearest"})
}catch(err){notify(err.message||"Processing failed.","error");$("#output-stage").textContent="FAILED / RETRY"}
finally{working=false;$("#submit").disabled=false;$("#submit").innerHTML='✦ &nbsp; PROCESS MEDIA <span>↗</span>'}
}
async function music(query=""){
 try{const response=await fetch("/api/music?q="+encodeURIComponent(query));if(!response.ok)throw Error("Music library unavailable.");const results=await response.json();if(!Array.isArray(results))throw Error("Invalid music response.");if(!query){tracks=results;$("#track").replaceChildren();for(const t of tracks){const opt=document.createElement("option");opt.value=t.id;opt.textContent=t.title+" · "+t.genre;$("#track").append(opt)}}displayMusic(results)}
 catch(err){$("#music-list").textContent=err.message}
}
function play(t){$("#music-player").src=t.url;$("#music-player").play().catch(()=>notify("Tap Play in the audio player to preview."));notify("Previewing "+t.title)}
function addTrack(t){chooseKind("audio");selectTool("add_audio");$("#track").value=t.id;$('input[name="source"][value="library"]').checked=true;sourceChanged();$("#editor").scrollIntoView({behavior:"smooth"});notify(t.title+" selected. Upload a video to add this music.","success")}
function displayMusic(results){
const root=$("#music-list");root.replaceChildren();
if(results.length===0){const p=document.createElement("p");p.className="loading";p.textContent="No matching music. Try a genre.";root.append(p);return}
for(const t of results){
 const card=document.createElement("article");card.className="music-card";const symbol=document.createElement("div");symbol.className="music-icon";symbol.textContent="♫";
 const desc=document.createElement("div");desc.className="music-text";const name=document.createElement("strong");name.textContent=t.title;const meta=document.createElement("span");meta.textContent=t.genre+" · "+t.bpm+" BPM · 16 seconds";desc.append(name,meta);
 const preview=document.createElement("button");preview.type="button";preview.textContent="▶";preview.setAttribute("aria-label","Preview "+t.title);preview.addEventListener("click",()=>play(t));
 const add=document.createElement("button");add.type="button";add.textContent="+ Add";add.addEventListener("click",()=>addTrack(t));card.append(symbol,desc,preview,add);root.append(card)
}}
$$(".category").forEach(b=>b.addEventListener("click",()=>chooseKind(b.dataset.kind)));
$("#file").addEventListener("change",fileChanged);$("#edit-form").addEventListener("submit",submit);
$$('input[name="source"]').forEach(b=>b.addEventListener("change",sourceChanged));
$("#listen-selected").addEventListener("click",()=>{const t=tracks.find(x=>x.id===$("#track").value);if(t)play(t)});
let searchTimer;$("#music-search").addEventListener("input",e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>music(e.target.value.trim()),220)});
const drop=$("#drop");
["dragenter","dragover"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add("drag")}));
["dragleave","drop"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove("drag")}));
drop.addEventListener("drop",e=>{const f=e.dataTransfer?.files?.[0];if(!f)return;const dt=new DataTransfer();dt.items.add(f);$("#file").files=dt.files;fileChanged()});
drop.addEventListener("keydown",e=>{if(e.target===drop&&(e.key==="Enter"||e.key===" ")){e.preventDefault();$("#file").click()}});
chooseKind("video");sourceChanged();music();
})();