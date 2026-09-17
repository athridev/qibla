'use strict';
const $=id=>document.getElementById(id);let lang='en';try{const saved=localStorage.getItem('qibla-language');if(languages[saved])lang=saved;}catch{}
const t=(key,params={})=>Object.entries(params).reduce((s,[k,v])=>s.replaceAll('{'+k+'}',String(v)),translations[lang]?.[key]??EN[key]??key);
const number=(n,d=0)=>new Intl.NumberFormat(lang,{maximumFractionDigits:d,minimumFractionDigits:d}).format(n);
let spot=null,landmark=null,accuracy=null,stage=1,world=false,gpsRequest=0,searchRequest=0,installPrompt=null,searchController=null;let pin,landmarkPin,accuracyCircle,qiblaLine,facingLine,arrowPin;let mapReady=typeof L!=='undefined';
const map=mapReady?L.map('map',{zoomControl:false,worldCopyJump:true,minZoom:2,maxZoom:20,maxBounds:[[-85,-540],[85,540]]}).setView([24,35],3):null;
const street=mapReady?L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,maxZoom:20,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}):null;
const satellite=mapReady?L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:19,maxZoom:20,attribution:'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, GIS User Community'}):null;
let layer=street,failedTiles=0;let qiblaHalo,kaabaPin,routeArrows=[],combinedPins=false,routeCache=null,routeKey='';
let pendingSpot=null,pendingAccuracy=null,pendingName='',candidatePin,candidateCircle,draftLandmark=null,draftLine,draftArrow,userMapMove=false;
let gpsWatch=null,gpsTimer=null,bestGPS=null,gpsRunning=false;

if(map){street.addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);kaabaPin=L.marker(Geo.K,{icon:L.divIcon({className:'',html:'<div class="kaaba-pin">الكعبة · Kaaba</div>',iconSize:[104,29],iconAnchor:[52,14]})}).addTo(map);for(const tiles of [street,satellite]){tiles.on('tileerror',()=>{failedTiles++;if(failedTiles>=3){$('mapError').textContent=t('mapFailed');$('mapError').hidden=false;}});tiles.on('tileload',()=>{failedTiles=0;$('mapError').hidden=true;});}map.on('click',e=>{
  if(stage===3)return;
  stopGPS();
  if(map.getZoom()<16){message('zoomFirst');map.setView(e.latlng,16);return;}
  const p=[e.latlng.lat,wrap(e.latlng.lng)];
  if(stage===1)previewPosition(p,null,t('manualPreview'),false);
  else aimAt(p);
});
map.on('dragstart',()=>{stopGPS();userMapMove=true;});
map.on('move',()=>{if(stage===2&&!world){const c=map.getCenter();draftLandmark=[c.lat,wrap(c.lng)];drawAim();}});
map.on('zoomend moveend',()=>{
  const moved=userMapMove;userMapMove=false;if(stage===1&&moved){const c=map.getCenter();previewPosition([c.lat,wrap(c.lng)],null,t('manualPreview'),false);}
  if(spot&&stage!==1){world=map.getZoom()<=7;drawQibla();renderGuide();}
});map.on('zoomend',()=>{if(spot&&stage!==1){drawPins();renderGuide();}});}

function wrap(lng){return ((lng+540)%360)-180;}
function message(key,params){$('status').textContent=key?t(key,params):'';}
function mapGuard(){if(map)return true;message('mapFailed');return false;}
function applyLanguage(next){if(!languages[next])return;lang=next;try{localStorage.setItem('qibla-language',lang);}catch{}document.documentElement.lang=lang;document.documentElement.dir=['ar','ur','fa','he'].includes(lang)?'rtl':'ltr';document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=t(el.dataset.t);});document.querySelectorAll('[data-label]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.label));el.title=t(el.dataset.label);});document.querySelectorAll('[data-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.placeholder);el.setAttribute('aria-label',t(el.dataset.placeholder));});$('languageName').textContent=languages[lang];$('otherLanguage').value='';render();renderHelp();if(map){setTimeout(()=>map.invalidateSize(),0);if(pendingSpot)previewPosition(pendingSpot,pendingAccuracy,pendingName,false);else{drawPins();drawQibla();if(stage===2)drawAim();}}if(!navigator.onLine){$('mapError').textContent=t('offline');$('mapError').hidden=false;}}
function closeDialog(id){$(id).close();if(id==='searchDialog')cancelSearch();}
function openDialog(id){$(id).showModal();}
for(const [code,name] of Object.entries(languages)){if(['ar','en'].includes(code))continue;const opt=document.createElement('option');opt.value=code;opt.textContent=name;$('otherLanguage').append(opt);}
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{applyLanguage(b.dataset.lang);closeDialog('languageDialog');});$('otherLanguage').onchange=e=>{if(e.target.value){applyLanguage(e.target.value);closeDialog('languageDialog');}};
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>closeDialog(b.dataset.dialog));$('languageButton').onclick=()=>openDialog('languageDialog');$('helpButton').onclick=$('aboutMethod').onclick=()=>{renderHelp();openDialog('helpDialog');};
function renderHelp(){const c=$('helpContent');c.replaceChildren();if(!['ar','en'].includes(lang)){const note=document.createElement('p');note.textContent=t('limited');note.lang='en';c.append(note);}for(let i=1;i<=5;i++){const h=document.createElement('h3'),p=document.createElement('p');h.textContent=t('help'+i);p.textContent=t('help'+i+'body');c.append(h,p);}const p=spot??Geo.K;const ll=p.join(',');$('googleLink').href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(ll);$('appleLink').href='https://maps.apple.com/?ll='+encodeURIComponent(ll)+'&z=18';$('installHelp').textContent=t(matchMedia('(display-mode: standalone)').matches?'installed':'installIOS');}
function render(){const result=stage===3&&!!spot;$('setupPanel').hidden=result;$('resultPanel').hidden=!result;$('locationCard').hidden=!spot;$('crosshair').hidden=result;$('centerConfirm').hidden=result;$('centerConfirm').querySelector('span').textContent=t(stage===1?'confirmSpot':'setHere');$('mapHint').textContent=t(world?'wholeRoute':stage===1?'tapSpot':stage===2?'tapLandmark':'readyHint');$('stepTitle').textContent=t(stage===1?'spotTitle':'landmarkTitle');$('stepDescription').textContent=t(stage===1?'spotDescription':'landmarkDescription');$('instructionIcon').querySelector('use').setAttribute('href',stage===1?'#i-pin':'#i-arrow');$('locateButton').hidden=stage!==1;$('manualButton').textContent=t(stage===1?'manual':'useCenter');$('coordinatesButton').hidden=stage!==1;$('setupNote').textContent=t(stage===1?'privacyShort':'accuracy');$('searchPlaceButton').hidden=stage!==1;$('aimGuide').hidden=stage!==2;$('crosshair').classList.toggle('aiming',stage===2);$('centerConfirm').classList.toggle('aiming',stage===2);$('centerConfirm').querySelector('span').textContent=t(stage===1?'confirmSpot':'confirmLook');$('centerConfirm').disabled=stage===1?!pendingSpot:!validAim();$('locationPreview').hidden=stage!==1||!pendingSpot;if(pendingSpot){$('previewName').textContent=pendingName||t('previewSpot');$('previewNote').textContent=pendingAccuracy!==null?t(gpsRunning?'gpsRefining':'gpsReady',{n:number(pendingAccuracy)}):t('previewNote');}if(stage!==2)$('aimDetail').textContent='';$('worldView').textContent=t(world?'localView':'wholeRoute');for(let i=1;i<=3;i++){const el=$('step'+i);el.classList.toggle('active',i===stage);el.classList.toggle('done',i<stage);if(i===stage)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');}
if(spot){$('locationCoordinates').textContent=spot.map(v=>v.toFixed(6)).join(', ');$('locationAccuracy').textContent=accuracy!==null?t('gpsAccuracy',{n:number(accuracy)}):t('manualAccuracy');}if(result)renderResult();if(stage===2)updateAimDetail();renderGuide();}
function renderResult(){const q=Geo.qibla(spot);$('bearingValue').textContent=q.usable?number(q.bearing,1)+'°':'—';$('distanceValue').textContent=number(q.distance/1000)+' km';$('accuracyNote').textContent=t(!q.usable?'special':landmark&&accuracy!==null&&accuracy>Geo.distance(spot,landmark)/5?'weakBaseline':accuracy>25?'weakAccuracy':'accuracy');$('turnArc').setAttribute('d','');if(!q.usable){$('turnTitle').textContent='—';$('turnDescription').textContent=t('special');$('directionArrow').style.display='none';return;}$('directionArrow').style.display='';if(!landmark){$('turnTitle').textContent=t('noLandmark');$('turnDescription').textContent=t('qiblaOnly');$('directionArrow').style.display='none';return;}const delta=Geo.turn(Geo.bearing(spot,landmark),q.bearing);$('turnTitle').textContent=Math.abs(delta)<1?t('aligned'):t(delta<0?'left':'right',{n:number(Math.abs(delta))});$('turnDescription').textContent=t('turnHint');$('directionArrow').setAttribute('transform','rotate('+delta+' 80 80)');if(Math.abs(delta)>1){const a=delta*Math.PI/180,x=80+55*Math.sin(a),y=80-55*Math.cos(a);$('turnArc').setAttribute('d',`M80 25 A55 55 0 0 ${delta>=0?1:0} ${x} ${y}`);}}
function icon(type){return L.divIcon({className:'',html:'<div class="'+type+'-pin"></div>',iconSize:[26,26],iconAnchor:[13,13]});}

function drawPins(){
  if(!map||!spot)return;for(const l of [pin,landmarkPin,accuracyCircle,facingLine])if(l)map.removeLayer(l);
  combinedPins=false;
  if(landmark&&stage===3){const a=map.latLngToContainerPoint(spot),b=map.latLngToContainerPoint(nearLongitude(landmark,spot[1]));combinedPins=Math.hypot(a.x-b.x,a.y-b.y)<44;}
  const originIcon=combinedPins?L.divIcon({className:'',html:'<div class="person-pin combined"></div>',iconSize:[32,32],iconAnchor:[16,16]}):icon('person');
  pin=L.marker(spot,{icon:originIcon,draggable:map.getZoom()>=16,zIndexOffset:1000,title:t('imHere')}).addTo(map).bindTooltip(t(combinedPins?'combinedPoint':'imHere'),{permanent:true,className:'origin-label',direction:'bottom',offset:[0,16]});
  pin.on('click',()=>{if(combinedPins)showMyView();});
  pin.on('dragend',()=>{const p=pin.getLatLng();setSpot([p.lat,wrap(p.lng)],null,false);});
  if(accuracy&&map.getZoom()>=14)accuracyCircle=L.circle(spot,{radius:accuracy,color:'#3479c8',weight:1,fillOpacity:.07,interactive:false}).addTo(map);
  if(landmark&&stage===3){
    const end=nearLongitude(landmark,spot[1]);
    facingLine=L.polyline([spot,end],{color:'#286de2',weight:4,dashArray:'7 8',interactive:false}).addTo(map);
    if(!combinedPins){
      const a=map.latLngToContainerPoint(spot),b=map.latLngToContainerPoint(end);const direction=b.x>=a.x?'right':'left';
      landmarkPin=L.marker(end,{icon:icon('landmark'),draggable:map.getZoom()>=16,zIndexOffset:1100,title:t('lookHere')}).addTo(map).bindTooltip(t('lookHere'),{permanent:true,className:'landmark-label',direction,offset:[direction==='right'?13:-13,0]});
      landmarkPin.on('dragend',()=>{const p=landmarkPin.getLatLng();if(!setLandmark([p.lat,wrap(p.lng)],false))drawPins();});
    }
  }
  $('zoomNote').hidden=!combinedPins;$('zoomNote').textContent=t('combinedHint');
}

function nearLongitude(p,ref){const out=[...p];while(out[1]-ref>180)out[1]-=360;while(out[1]-ref< -180)out[1]+=360;return out;}

function clearRoute(){for(const l of [qiblaLine,qiblaHalo,arrowPin,...routeArrows])if(l&&map)map.removeLayer(l);qiblaLine=qiblaHalo=arrowPin=null;routeArrows=[];}
function drawQibla(){
  if(!map)return;clearRoute();if(!spot||stage===1)return;
  const q=Geo.qibla(spot);if(!q.usable)return;const key=spot.join(',');
  if(key!==routeKey){routeCache=Geo.route(spot);routeKey=key;}
  const path=routeCache;
  qiblaHalo=L.polyline(path,{color:'#ffffff',weight:9,opacity:.9,smoothFactor:0,interactive:false}).addTo(map);
  qiblaLine=L.polyline(path,{color:'#098158',weight:5,opacity:1,smoothFactor:0,interactive:false}).addTo(map);
  kaabaPin?.setLatLng(path[path.length-1]);
  const projected=path.map(p=>{const v=map.latLngToContainerPoint(p);return [v.x,v.y];});const size=map.getSize();
  for(const a of Geo.mapArrows(projected,size.x,size.y)){
    const p=map.containerPointToLatLng([a.x,a.y]);
    const arrow=L.marker(p,{interactive:false,zIndexOffset:200,icon:L.divIcon({className:'',html:'<div class="line-arrow" style="transform:rotate('+a.angle+'deg)">▲</div>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map);routeArrows.push(arrow);
  }
}
function updateSheetHeight(){const height=document.querySelector('.panel').getBoundingClientRect().height;document.querySelector('main').style.setProperty('--sheet-height',height+'px');}
function expandGuide(){document.body.classList.remove('guide-collapsed');updateSheetHeight();}
function renderGuide(){
  document.body.dataset.stage=String(stage);document.body.dataset.preview=String(!!pendingSpot);
  const key=stage===1?(pendingSpot?'guideConfirm':'guideLocate'):stage===2?'guideFace':'guideReady';
  $('guideTitle').textContent=t(key);$('guideCopy').textContent=t(key+'Copy');$('guideProgress').textContent=t('stepOf',{n:number(stage)});
  $('guideBack').hidden=stage===1&&!pendingSpot;$('crosshair').hidden=stage===3||world;$('centerConfirm').hidden=stage===3||world;$('step2').disabled=!spot;$('step3').disabled=!landmark;
  $('sheetToggle').setAttribute('aria-label',t(document.body.classList.contains('guide-collapsed')?'showDetails':'hideDetails'));
  $('routeHud').hidden=!spot||stage===1;$('viewSwitcher').hidden=!spot||stage===1;
  if(spot){const q=Geo.qibla(spot);$('hudBearing').textContent=q.usable?number(q.bearing,1)+'°':'—';$('hudDistance').textContent=number(q.distance/1000)+' km';
    $('detailSpot').textContent=spot.map(v=>v.toFixed(6)).join(', ');
    $('detailTarget').textContent=landmark?landmark.map(v=>v.toFixed(6)).join(', '):'—';
    $('detailSeparation').textContent=landmark?number(Geo.distance(spot,landmark))+' m':'—';
    $('detailHeading').textContent=landmark?number(Geo.bearing(spot,landmark),1)+'°':'—';
  }
  $('nearbyView').classList.toggle('active',!!map&&map.getZoom()>=16);
  $('fullRouteView').classList.toggle('active',!!map&&map.getZoom()<=7);
  $('facingView').disabled=!landmark&&stage!==2;
  $('mapHint').textContent=t(stage===1?'tapSpot':stage===2?'tapLandmark':world?'routeCurve':'readyHint');
  $('worldView').textContent=t(world?'myView':'fullRoute');
  if(stage===3){$('zoomNote').hidden=!combinedPins;$('zoomNote').textContent=t('combinedHint');}
  updateSheetHeight();
}
function fitPadding(){const mobile=matchMedia('(max-width: 800px)').matches,rtl=document.documentElement.dir==='rtl';if(mobile)return {paddingTopLeft:[35,170],paddingBottomRight:[65,document.querySelector('.panel').getBoundingClientRect().height+35]};return {paddingTopLeft:[rtl?90:430,100],paddingBottomRight:[rtl?430:90,55]};}
function showMyView(){if(!map||!spot)return;world=false;if(landmark)map.fitBounds([spot,nearLongitude(landmark,spot[1])],{...fitPadding(),maxZoom:19});else map.setView(spot,18);drawPins();drawQibla();renderGuide();}
$('guideBack').onclick=()=>{setStage(stage===3?2:1);expandGuide();};
$('sheetToggle').onclick=()=>{document.body.classList.toggle('guide-collapsed');renderGuide();};
$('nearbyView').onclick=()=>{if(!map||!spot)return;world=false;map.setView(spot,18);drawPins();drawQibla();renderGuide();};
$('facingView').onclick=showMyView;
$('fullRouteView').onclick=()=>{
  if(!map||!spot)return;if(!Geo.qibla(spot).usable){message('special');return;}
  if(matchMedia('(max-width: 800px)').matches)document.body.classList.add('guide-collapsed');
  updateSheetHeight();world=true;drawQibla();map.fitBounds(qiblaLine.getBounds(),{...fitPadding(),maxZoom:6});drawPins();renderGuide();
};
if(typeof ResizeObserver!=='undefined')new ResizeObserver(updateSheetHeight).observe(document.querySelector('.panel'));

function clearDraft(){for(const l of [candidatePin,candidateCircle,draftLine,draftArrow])if(l&&map)map.removeLayer(l);candidatePin=candidateCircle=draftLine=draftArrow=null;}
function scrollToMap(){document.querySelector('.map-shell').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
function previewPosition(p,acc=null,name='',pan=true){
  if(!Geo.valid(p)||Math.abs(p[0])>85)throw Error('Invalid map coordinates');
  expandGuide();pendingSpot=[...p];pendingAccuracy=acc;pendingName=name;stage=1;world=false;draftLandmark=null;
  clearRoute();for(const l of [candidatePin,candidateCircle,draftLine,draftArrow,pin,landmarkPin,accuracyCircle,qiblaLine,facingLine,arrowPin])if(l&&map)map.removeLayer(l);
  candidatePin=candidateCircle=draftLine=draftArrow=null;
  if(map){if(pan)map.setView(p,19);candidatePin=L.marker(p,{icon:L.divIcon({className:'',html:'<div class="candidate-pin"></div>',iconSize:[30,30],iconAnchor:[15,15]}),draggable:true,zIndexOffset:1200}).addTo(map);
    candidatePin.on('dragstart',stopGPS);candidatePin.on('dragend',()=>{const c=candidatePin.getLatLng();previewPosition([c.lat,wrap(c.lng)],null,t('manualPreview'));});
    if(acc!==null)candidateCircle=L.circle(p,{radius:acc,color:'#ad8137',weight:1,fillOpacity:.1,interactive:false}).addTo(map);
    if(!pan){const c=map.getCenter();if(Geo.distance([c.lat,wrap(c.lng)],p)>1)map.panTo(p);}
  }
  render();message(acc!==null?'gpsReady':'previewSpot',acc!==null?{n:number(acc)}:{});
}
function validAim(){return !!spot&&!!draftLandmark&&Geo.distance(spot,draftLandmark)>=10&&Geo.distance(spot,draftLandmark)<=5000;}
function updateAimDetail(){
  const distance=spot&&draftLandmark?Geo.distance(spot,draftLandmark):0;
  $('aimDetail').textContent=distance<10?t('aimTooClose'):distance>5000?t('aimTooFar'):t('aimDistance',{n:number(distance)});
  $('centerConfirm').disabled=!validAim();
}
function drawAim(){
  if(!map||!spot||!draftLandmark||stage!==2)return;
  const end=nearLongitude(draftLandmark,spot[1]);
  if(!draftLine)draftLine=L.polyline([spot,end],{color:'#3479c8',weight:4,dashArray:'7 7',interactive:false}).addTo(map);else draftLine.setLatLngs([spot,end]);
  if(draftArrow)map.removeLayer(draftArrow);
  const d=Geo.distance(spot,draftLandmark),b=Geo.bearing(spot,draftLandmark);
  if(d>=10&&d<=5000){const p=Geo.destination(spot,b,d*.6);draftArrow=L.marker(nearLongitude(p,spot[1]),{interactive:false,icon:L.divIcon({className:'',html:'<div class="facing-arrow" style="transform:rotate('+b+'deg)"><svg><use href="#i-arrow"/></svg></div>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map);}
  updateAimDetail();
}
function aimAt(p){draftLandmark=p;if(map)map.panTo(nearLongitude(p,spot[1]),{animate:false});drawAim();updateAimDetail();}
function setSpot(p,acc=null,pan=true){
  if(!Geo.valid(p)||Math.abs(p[0])>85)throw Error('Coordinates must be within the map limits.');
  stopGPS();clearDraft();expandGuide();pendingSpot=null;pendingAccuracy=null;gpsRequest++;spot=p;accuracy=acc;landmark=null;draftLandmark=null;stage=2;world=false;
  message(acc>25?'weakAccuracy':'locationUpdated');
  if(map){if(pan)map.setView(p,18);else map.panTo(p);drawPins();drawQibla();}
  render();renderHelp();return {position:spot,qibla:Geo.qibla(spot)};
}
function setLandmark(p,fit=false){
  if(!spot){message('noSpot');return false;}if(!Geo.valid(p))throw Error('Invalid landmark');
  const d=Geo.distance(spot,p);if(d<10){message('tooClose');return false;}if(d>5000){message('farLandmark');return false;}
  clearDraft();expandGuide();landmark=p;stage=3;world=false;message('');drawPins();drawQibla();render();
  if(map&&fit)showMyView();return true;
}
function setStage(next){
  if(next>1&&!spot){message('noSpot');return;}stopGPS();clearDraft();expandGuide();pendingSpot=null;stage=next;world=false;gpsRequest++;message('');
  if(next===1&&spot){previewPosition(spot,accuracy,t('previewSpot'));return;}
  if(spot&&map)map.setView(spot,18);draftLandmark=null;drawPins();drawQibla();render();
}
$('step1').onclick=$('editLocation').onclick=()=>setStage(1);
$('step2').onclick=$('editLandmark').onclick=()=>{setStage(2);scrollToMap();};
$('step3').onclick=()=>{if(!landmark){setStage(2);return;}setStage(3);};
$('manualButton').onclick=()=>{if(!mapGuard())return;stopGPS();message(stage===1?'tapSpot':'tapLandmark');scrollToMap();$('map').focus({preventScroll:true});};
$('centerConfirm').onclick=()=>{
  if(!mapGuard())return;if(map.getZoom()<16){message('zoomFirst');map.setZoom(16);return;}
  if(stage===1){if(!pendingSpot)return;const p=[...pendingSpot],acc=pendingAccuracy;setSpot(p,acc);}
  else if(validAim())setLandmark(draftLandmark,true);
};
function stopGPS(){
  gpsRequest++;if(gpsWatch!==null&&navigator.geolocation?.clearWatch)navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;
  if(gpsTimer!==null)clearTimeout(gpsTimer);gpsTimer=null;gpsRunning=false;$('locateButton').disabled=false;$('locateButton').querySelector('span').textContent=t('locate');
}
function startGPS(){
  if(gpsRunning){stopGPS();render();return;}
  if(!navigator.geolocation){message('unsupported');return;}
  stopGPS();bestGPS=null;gpsRunning=true;const request=gpsRequest;message('locating');$('locateButton').querySelector('span').textContent=t('cancelGps');
  const success=p=>{
    if(request!==gpsRequest)return;
    const coords=[p.coords.latitude,p.coords.longitude],acc=p.coords.accuracy;
    if(!Geo.valid(coords)||Math.abs(coords[0])>85||!Number.isFinite(acc)||acc<0){stopGPS();message('special');return;}
    if(!bestGPS||acc<bestGPS.accuracy){bestGPS={point:coords,accuracy:acc};previewPosition(coords,acc,t('gpsPreview'));}
    if(acc<=8){stopGPS();render();message('gpsReady',{n:number(acc)});}else message('gpsRefining',{n:number(bestGPS.accuracy)});
  };
  const failure=e=>{if(request!==gpsRequest)return;const hadFix=!!bestGPS;stopGPS();render();message(hadFix?'gpsStill':e.code===1?'denied':e.code===3?'gpsTimeout':'gpsFailed');};
  gpsTimer=setTimeout(()=>{if(request!==gpsRequest)return;const fixed=!!bestGPS;stopGPS();render();message(fixed?'gpsReady':'gpsTimeout',fixed?{n:number(bestGPS.accuracy)}:{});},20000);
  if(navigator.geolocation.watchPosition)gpsWatch=navigator.geolocation.watchPosition(success,failure,{enableHighAccuracy:true,timeout:18000,maximumAge:0});
  else navigator.geolocation.getCurrentPosition(success,failure,{enableHighAccuracy:true,timeout:18000,maximumAge:0});
}
$('locateButton').onclick=startGPS;
$('coordinatesButton').onclick=()=>{stopGPS();$('coordinateError').textContent='';$('coordinatePaste').value='';if(spot){$('latitude').value=spot[0];$('longitude').value=spot[1];}openDialog('coordinatesDialog');};
$('coordinatePaste').oninput=()=>{const p=Places.coordinates($('coordinatePaste').value);if(p){$('latitude').value=p[0];$('longitude').value=p[1];$('coordinateError').textContent='';}};
for(const id of ['latitude','longitude'])$(id).addEventListener('input',()=>{$('coordinatePaste').value='';$('coordinateError').textContent='';});
$('coordinateForm').onsubmit=e=>{
  e.preventDefault();let p;const pasted=$('coordinatePaste').value.trim();
  if(pasted)p=Places.coordinates(pasted);else {const a=Places.digits($('latitude').value).trim(),b=Places.digits($('longitude').value).trim();if(a&&b)p=Places.coordinates(a+','+b);}
  if(!p){$('coordinateError').textContent=t('invalidCoordinates');return;}
  stopGPS();previewPosition(p,null,t('coordinates'));closeDialog('coordinatesDialog');scrollToMap();
};

function switchLayer(selected){if(!mapGuard())return;map.removeLayer(layer);layer=selected;failedTiles=0;$('mapError').hidden=true;layer.addTo(map);$('streetButton').classList.toggle('active',layer===street);$('satelliteButton').classList.toggle('active',layer===satellite);$('streetButton').setAttribute('aria-pressed',String(layer===street));$('satelliteButton').setAttribute('aria-pressed',String(layer===satellite));}
$('streetButton').onclick=()=>switchLayer(street);$('satelliteButton').onclick=()=>switchLayer(satellite);$('zoomIn').onclick=()=>map?.zoomIn();$('zoomOut').onclick=()=>map?.zoomOut();$('recenter').onclick=()=>{if(!spot){message('noSpot');return;}world=false;map?.setView(spot,18);drawQibla();render();};
$('worldView').onclick=()=>{if(world)showMyView();else $('fullRouteView').onclick();};
$('reset').onclick=()=>{stopGPS();clearDraft();clearRoute();expandGuide();combinedPins=false;kaabaPin?.setLatLng(Geo.K);pendingSpot=null;draftLandmark=null;cancelSearch();gpsRequest++;spot=null;landmark=null;accuracy=null;world=false;stage=1;for(const l of [pin,landmarkPin,accuracyCircle,qiblaLine,facingLine,arrowPin])if(l&&map)map.removeLayer(l);pin=landmarkPin=accuracyCircle=qiblaLine=facingLine=arrowPin=null;message('');$('searchResults').hidden=true;render();renderHelp();};

let searchTimer=null,lastSearch=0;const searchCache=new Map();
function cancelSearch(){if(searchTimer!==null)clearTimeout(searchTimer);searchTimer=null;searchController?.abort();searchController=null;searchRequest++;$('searchResults').setAttribute('aria-busy','false');}
function openSearch(){stopGPS();openDialog('searchDialog');$('searchStatus').textContent=t('searchStart');$('searchInput').focus();}
$('searchOpener').onclick=$('searchPlaceButton').onclick=openSearch;
$('searchCoordinates').onclick=()=>{closeDialog('searchDialog');$('coordinatesButton').onclick();};
$('searchDialog').addEventListener('close',cancelSearch);
function choosePlace(item){
  closeDialog('searchDialog');stopGPS();previewPosition(item.point,null,item.name);
  if(map&&item.kind==='area')map.setZoom(14);
  $('searchInput').blur();scrollToMap();
}
function showPlaceResults(items){
  const box=$('searchResults');box.replaceChildren();box.hidden=false;
  if(!items.length){$('searchStatus').textContent=t('noResults');box.hidden=true;return;}
  $('searchStatus').textContent=t('resultsCount',{n:number(items.length)});
  for(const item of items){const button=document.createElement('button');button.type='button';const name=document.createElement('strong'),address=document.createElement('small'),tag=document.createElement('span');name.textContent=item.name;address.textContent=item.address;tag.className='result-tag';tag.textContent=t(item.kind);button.append(name,address,tag);button.onclick=()=>choosePlace(item);box.append(button);}
}
async function searchPlaces(){
  const query=$('searchInput').value.trim();if(query.length<2)return;
  if(searchTimer!==null)clearTimeout(searchTimer);searchTimer=null;
  searchController?.abort();const seq=++searchRequest;
  const coords=Places.coordinates(query);
  if(coords){showPlaceResults([{point:coords,name:t('coordinates'),address:coords.map(v=>v.toFixed(6)).join(', '),kind:'place'}]);return;}
  if(/^https?:\/\//i.test(query)||/^[-+\d٠-٩۰-۹]/.test(query)&&/[;,،]/.test(query)&&!/[A-Za-z]/.test(query)){
    $('searchResults').hidden=true;$('searchStatus').textContent=t('invalidCoordinates');return;
  }
  const wait=1100-(Date.now()-lastSearch);if(wait>0){searchTimer=setTimeout(searchPlaces,wait);return;}
  const focus=pendingSpot??spot??(map&&map.getZoom()>=10?[map.getCenter().lat,wrap(map.getCenter().lng)]:null);
  const key=lang+'|'+query.toLowerCase()+'|'+(focus?focus.map(v=>v.toFixed(2)).join(','):'');
  if(searchCache.has(key)){showPlaceResults(searchCache.get(key));return;}
  const controller=new AbortController();searchController=controller;lastSearch=Date.now();
  $('searchStatus').textContent=t('searching');$('searchResults').hidden=true;$('searchResults').setAttribute('aria-busy','true');
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const url=new URL('https://photon.komoot.io/api/');url.searchParams.set('q',query);url.searchParams.set('limit','7');
    if(['en','de','fr'].includes(lang))url.searchParams.set('lang',lang);
    if(focus){url.searchParams.set('lat',String(focus[0]));url.searchParams.set('lon',String(focus[1]));}
    const response=await fetch(url,{signal:controller.signal,credentials:'omit'});if(!response.ok)throw Error('Place search failed');
    const data=await response.json();if(seq!==searchRequest)return;const items=Places.results(data);
    if(searchCache.size>=30)searchCache.delete(searchCache.keys().next().value);searchCache.set(key,items);showPlaceResults(items);
  }catch{if(seq===searchRequest)$('searchStatus').textContent=t('searchFailed');}
  finally{clearTimeout(timeout);if(seq===searchRequest)$('searchResults').setAttribute('aria-busy','false');}
}
$('searchForm').onsubmit=e=>{e.preventDefault();searchPlaces();};
$('searchInput').addEventListener('input',()=>{cancelSearch();$('searchResults').hidden=true;$('searchStatus').textContent=t('searchStart');if($('searchInput').value.trim().length>=3)searchTimer=setTimeout(searchPlaces,850);});
$('searchInput').addEventListener('keydown',e=>{if(e.key==='ArrowDown'){const first=$('searchResults').querySelector('button');if(first){e.preventDefault();first.focus();}}});
$('searchResults').addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;const buttons=[...$('searchResults').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(i<0)return;e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();});
window.addEventListener('offline',()=>{$('mapError').textContent=t('offline');$('mapError').hidden=false;});window.addEventListener('online',()=>{$('mapError').hidden=true;layer?.redraw();});window.addEventListener('pagehide',stopGPS);window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});$('installButton').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else{$('installHelp').textContent=t('installIOS');$('installHelp').scrollIntoView({block:'nearest'});}};
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
let chosen=false;try{chosen=!!localStorage.getItem('qibla-language');}catch{}applyLanguage(lang);if(!chosen)openDialog('languageDialog');if(!mapReady){$('mapError').textContent=t('mapFailed');$('mapError').hidden=false;}
if(document.modelContext?.registerTool){const lifecycle=new AbortController();const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};register({name:'set_qibla_position',title:'Set Qibla map position',description:'Set the place where the user is standing, clear the old landmark, and display its Qibla line.',inputSchema:{type:'object',properties:{latitude:{type:'number',minimum:-85,maximum:85},longitude:{type:'number',minimum:-180,maximum:180}},required:['latitude','longitude'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||!Number.isFinite(input.latitude)||!Number.isFinite(input.longitude))throw Error('Numeric coordinates required');return setSpot([input.latitude,input.longitude]);}});register({name:'set_facing_landmark',title:'Set the landmark the user faces',description:'Set a visible landmark between 10 m and 5 km from the current position and show the turn toward Qibla.',inputSchema:{type:'object',properties:{latitude:{type:'number'},longitude:{type:'number'}},required:['latitude','longitude'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||!Geo.valid([input.latitude,input.longitude]))throw Error('Valid coordinates required');if(!setLandmark([input.latitude,input.longitude]))throw Error('Set a position first and choose a landmark between 10 m and 5 km away');const q=Geo.qibla(spot);return {bearing:q.bearing,usable:q.usable,turnDegrees:q.usable?Geo.turn(Geo.bearing(spot,landmark),q.bearing):null};}});window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
