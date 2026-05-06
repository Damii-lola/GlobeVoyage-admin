const express = require("express");
const cors    = require("cors");
const https   = require("https");
const http    = require("http");
const fs      = require("fs");
const path    = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let THREE_JS  = "";
let EARCUT_JS = "";
try { THREE_JS  = fs.readFileSync(path.join(__dirname,"node_modules/three/build/three.min.js"),"utf8"); } catch(e){console.error("three.js missing",e.message);}
try { EARCUT_JS = fs.readFileSync(path.join(__dirname,"node_modules/earcut/src/earcut.js"),"utf8"); } catch(e){console.error("earcut.js missing",e.message);}

app.get("/", (req, res) => res.json({ status: "GlobeVoyage API is live 🌍" }));

// Keepalive ping
const SELF = process.env.RENDER_EXTERNAL_URL || "https://globevoyage-admin.onrender.com";
setInterval(() => {
  const mod = SELF.startsWith("https") ? https : http;
  mod.get(SELF + "/", r => r.resume()).on("error", ()=>{});
}, 4 * 60 * 1000);

// Texture proxy
const TEXTURES = {
  "earth-day":    "https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg",
  "earth-night":  "https://unpkg.com/three-globe@2.30.0/example/img/earth-night.jpg",
  "earth-clouds": "https://unpkg.com/three-globe@2.30.0/example/img/earth-clouds.png",
  "earth-water":  "https://unpkg.com/three-globe@2.30.0/example/img/earth-water.png",
};
app.get("/texture/:name", (req, res) => {
  const url = TEXTURES[req.params.name];
  if (!url) return res.status(404).end();
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public,max-age=86400");
  res.setHeader("Content-Type", url.endsWith(".png")?"image/png":"image/jpeg");
  https.get(url, u => u.pipe(res)).on("error", ()=>res.status(502).end());
});

// GeoJSON proxy
let geojsonCache=null, geojsonFetching=false, geojsonWaiters=[];
function fetchGeoJSON(cb){
  if(geojsonCache) return cb(null,geojsonCache);
  geojsonWaiters.push(cb);
  if(geojsonFetching) return;
  geojsonFetching=true;
  let data="";
  https.get("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson", res=>{
    res.on("data",c=>data+=c);
    res.on("end",()=>{
      try{
        const p=JSON.parse(data);
        p.features=p.features.map(f=>({
          type:"Feature",
          properties:{
            name:f.properties.NAME||"Unknown",
            iso:f.properties.ISO_A3||f.properties.NAME||"Unknown",
            continent:f.properties.CONTINENT||"",
            pop:f.properties.POP_EST||0,
            subregion:f.properties.SUBREGION||"",
          },
          geometry:f.geometry
        }));
        geojsonCache=p;
        geojsonWaiters.splice(0).forEach(w=>w(null,geojsonCache));
      }catch(e){ geojsonWaiters.splice(0).forEach(w=>w(e,null)); }
      geojsonFetching=false;
    });
  }).on("error",e=>{ geojsonFetching=false; geojsonWaiters.splice(0).forEach(w=>w(e,null)); });
}
app.get("/geodata",(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public,max-age=3600");
  fetchGeoJSON((err,data)=>err?res.status(502).json({error:"geo fail"}):res.json(data));
});
fetchGeoJSON(()=>console.log("GeoJSON cached ✓"));

// ── GLOBE PAGE ────────────────────────────────────────────────────────
app.get("/globe", (req, res) => {
  res.setHeader("Content-Type","text/html");
  res.setHeader("Cache-Control","public,max-age=300");

  const DESCRIPTIONS={
    USA:"The world's largest economy and a melting pot of cultures, spanning vast landscapes from Alaskan tundra to Hawaiian tropics.",
    GBR:"An island nation with a rich imperial history, home to London — one of the world's great global cities.",
    FRA:"Famous for art, cuisine, fashion and the Eiffel Tower, France is the world's most visited country.",
    DEU:"Europe's industrial powerhouse, known for engineering precision, classical music, and the Bavarian Alps.",
    CHN:"The world's most populous nation, with 5,000 years of continuous civilisation and a booming modern economy.",
    IND:"A vibrant subcontinent of 1.4 billion people, incredible diversity, ancient temples and tech innovation.",
    BRA:"South America's giant — home to the Amazon rainforest, Carnival, and some of the world's best beaches.",
    RUS:"The largest country on Earth by area, spanning 11 time zones from Eastern Europe to the Pacific Ocean.",
    AUS:"A vast island continent famous for unique wildlife, the Great Barrier Reef, and an outdoor lifestyle.",
    CAN:"The world's second-largest country, known for stunning wilderness, multicultural cities and friendly people.",
    JPN:"A unique blend of ancient tradition and cutting-edge technology, from Mount Fuji to the neon streets of Tokyo.",
    NGA:"Africa's most populous nation and largest economy, a cultural powerhouse of music, film and innovation.",
    ZAF:"The Rainbow Nation — rich in biodiversity, dramatic landscapes from the Cape to the Kruger National Park.",
    EGY:"Home to one of humanity's oldest civilisations, the Nile, and iconic ancient monuments like the Great Pyramids.",
    MEX:"A country of ancient Aztec ruins, vibrant fiestas, rich cuisine and stunning Pacific and Caribbean coasts.",
    ARG:"South America's second-largest country, famed for tango, Patagonian wilderness and the Andes mountains.",
    SAU:"The heart of the Arab world, custodian of Islam's holiest sites and a vast oil-rich desert kingdom.",
    IDN:"The world's largest archipelago — over 17,000 islands, extraordinary biodiversity and cultural richness.",
    TUR:"Straddling two continents, Turkey is a crossroads of civilisations with breathtaking coasts and history.",
    KEN:"East Africa's gateway — famed for the Maasai Mara, world-class marathon runners, and Nairobi's energy.",
    ESP:"Sun, flamenco, La Sagrada Família, and incredible food — Spain is Europe's most passionate destination.",
    ITA:"The cradle of Western civilisation, art and cuisine — from the Colosseum to the canals of Venice.",
    PAK:"A land of K2, the Karakoram Highway, ancient Indus Valley ruins, and warmly hospitable people.",
    UKR:"Europe's largest country by area, with fertile plains, a deep Cossack heritage, and resilient people.",
    GHA:"West Africa's beacon of democracy and stability, birthplace of Pan-Africanism and rich in gold and culture.",
    ETH:"Africa's oldest independent nation, birthplace of coffee, ancient churches and the source of the Blue Nile.",
    MAR:"Where the Sahara meets the Atlantic — ancient medinas, blue Chefchaouen, and a world-class food scene.",
    PER:"Land of the Incas, Machu Picchu, the Amazon, and one of the most diverse ecosystems on Earth.",
    COL:"Where the Andes meet the Caribbean — Colombia has reinvented itself as a vibrant, colourful destination.",
    NZL:"Two dramatic islands of fjords, volcanoes, Maori culture and the landscapes that brought Middle-earth to life.",
    SGP:"A tiny city-state that punches far above its weight in food, finance, gardens and futuristic architecture.",
    THA:"The Land of Smiles — golden temples, street food paradise, tropical islands and warm hospitality.",
    VNM:"A slender S-shaped country of stunning bays, ancient towns, motorbike-filled streets and incredible pho.",
    KOR:"K-pop, kimchi, cutting-edge technology and 5,000 years of history wrapped in one dynamic peninsula.",
    PRT:"Europe's westernmost nation — cobblestone Lisbon, Porto's wine cellars, and the world's best surf.",
    NLD:"A flat land of tulips, windmills, golden-age art and the most bikes per capita on the planet.",
    GRC:"The birthplace of democracy, philosophy and the Olympics — with 6,000 islands and unbeatable cuisine.",
  };
  const FLAGS={
    USA:"🇺🇸",GBR:"🇬🇧",FRA:"🇫🇷",DEU:"🇩🇪",CHN:"🇨🇳",IND:"🇮🇳",BRA:"🇧🇷",RUS:"🇷🇺",
    AUS:"🇦🇺",CAN:"🇨🇦",JPN:"🇯🇵",NGA:"🇳🇬",ZAF:"🇿🇦",EGY:"🇪🇬",MEX:"🇲🇽",ARG:"🇦🇷",
    SAU:"🇸🇦",IDN:"🇮🇩",TUR:"🇹🇷",KEN:"🇰🇪",ESP:"🇪🇸",ITA:"🇮🇹",PAK:"🇵🇰",UKR:"🇺🇦",
    GHA:"🇬🇭",ETH:"🇪🇹",MAR:"🇲🇦",PER:"🇵🇪",COL:"🇨🇴",NZL:"🇳🇿",SGP:"🇸🇬",THA:"🇹🇭",
    VNM:"🇻🇳",KOR:"🇰🇷",PRT:"🇵🇹",NLD:"🇳🇱",GRC:"🇬🇷",
  };

  res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{
    width:100%;height:100%;
    background:#060a12;
    overflow:hidden;
    touch-action:none;
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  }

  /* Canvas fills the whole WebView — it IS the viewport */
  canvas{
    position:absolute;top:0;left:0;
    width:100%!important;height:100%!important;
    touch-action:none;display:block;
  }

  /* Loading */
  #loading{
    position:absolute;top:50%;left:50%;
    transform:translate(-50%,-50%);
    color:#5bb8ff;font-size:10px;letter-spacing:4px;
    transition:opacity 0.8s;text-align:center;pointer-events:none;z-index:10;
  }
  #bar{width:130px;height:1px;background:rgba(91,184,255,0.15);margin:12px auto 0;border-radius:1px;overflow:hidden}
  #fill{height:100%;background:linear-gradient(90deg,#3a8fff,#7dd4ff);width:0%;transition:width 0.3s;}

  /* Hint */
  #hint{
    position:absolute;top:12px;left:50%;transform:translateX(-50%);
    color:rgba(140,185,240,0.4);font-size:9px;letter-spacing:3px;
    pointer-events:none;white-space:nowrap;transition:opacity 1.4s;z-index:5;
  }

  /* Country info card — slides up from bottom of WebView */
  #card{
    position:absolute;left:0;right:0;bottom:0;z-index:20;
    background:linear-gradient(to bottom, rgba(6,10,20,0) 0%, rgba(6,10,20,0.97) 12%, #060a14 100%);
    padding:32px 20px 28px;
    transform:translateY(100%);
    transition:transform 0.4s cubic-bezier(0.22,1,0.36,1);
    /* Backdrop tap to close is handled on the canvas below */
  }
  #card.open{ transform:translateY(0); }

  #card-top{ display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px; }
  #card-title-group{ display:flex;align-items:center;gap:10px; }
  #card-flag{ font-size:28px;line-height:1; }
  #card-name{ font-size:20px;font-weight:700;color:#e8f4ff;letter-spacing:0.2px; }
  #card-sub{ font-size:9px;color:#3a6080;letter-spacing:2.5px;text-transform:uppercase;margin-top:2px; }
  #card-close{
    width:30px;height:30px;border-radius:50%;flex-shrink:0;
    background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);
    color:#5a7a9a;font-size:14px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
  }
  #card-desc{ font-size:12px;color:#6a90b0;line-height:1.7;margin-bottom:14px; }
  #card-stats{ display:flex;gap:8px;margin-bottom:16px; }
  .stat{
    flex:1;background:rgba(255,255,255,0.03);
    border:1px solid rgba(255,255,255,0.06);
    border-radius:10px;padding:8px 10px;
  }
  .sv{ font-size:12px;font-weight:600;color:#a8c8e8; }
  .sl{ font-size:8px;color:#2a4a62;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px; }
  #card-btn{
    width:100%;padding:14px;border:none;border-radius:14px;
    background:linear-gradient(135deg,#2a72ff 0%,#1040cc 100%);
    color:#fff;font-size:14px;font-weight:600;letter-spacing:1px;
    cursor:pointer;
    box-shadow:0 4px 24px rgba(42,114,255,0.4),0 0 0 1px rgba(42,114,255,0.2);
    transition:transform 0.12s,opacity 0.12s;
  }
  #card-btn:active{transform:scale(0.97);opacity:0.88}

  /* Tap-outside overlay — sits between globe and card */
  #backdrop{
    display:none;
    position:absolute;inset:0;z-index:15;
  }
  #backdrop.on{ display:block; }
</style>
</head>
<body>

<div id="loading">LOADING EARTH<div id="bar"><div id="fill"></div></div></div>
<canvas id="c"></canvas>
<div id="hint">DRAG · PINCH · TAP COUNTRY</div>
<div id="backdrop"></div>

<div id="card">
  <div id="card-top">
    <div id="card-title-group">
      <span id="card-flag"></span>
      <div>
        <div id="card-name"></div>
        <div id="card-sub"></div>
      </div>
    </div>
    <button id="card-close">✕</button>
  </div>
  <div id="card-desc"></div>
  <div id="card-stats">
    <div class="stat"><div class="sv" id="s-pop"></div><div class="sl">Population</div></div>
    <div class="stat"><div class="sv" id="s-cont"></div><div class="sl">Continent</div></div>
    <div class="stat"><div class="sv" id="s-reg"></div><div class="sl">Region</div></div>
  </div>
  <button id="card-btn">✈️&nbsp; View Destinations</button>
</div>

<script>${THREE_JS}</script>
<script>${EARCUT_JS}</script>
<script>
var DESCRIPTIONS=${JSON.stringify(DESCRIPTIONS)};
var FLAGS=${JSON.stringify(FLAGS)};
</script>
<script>
(function(){

  // ── Renderer setup ──────────────────────────────────────────────────
  var W=window.innerWidth, H=window.innerHeight;
  var canvas=document.getElementById('c');
  // Set canvas pixel dimensions explicitly
  canvas.width  = W * (window.devicePixelRatio||1);
  canvas.height = H * (window.devicePixelRatio||1);
  canvas.style.width  = W+'px';
  canvas.style.height = H+'px';

  var renderer=new THREE.WebGLRenderer({
    canvas:canvas, antialias:true,
    powerPreference:'high-performance'
  });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.setClearColor(0x060a12, 1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.3;

  var scene=new THREE.Scene();

  // Camera — this is what we move for zoom, never scale anything
  var camera=new THREE.PerspectiveCamera(45, W/H, 0.1, 1000);
  camera.position.z=2.8;

  // Progress
  var fillEl=document.getElementById('fill');
  var loadEl=document.getElementById('loading');
  var prog=0;
  function progress(n){
    prog=Math.max(prog,n);
    fillEl.style.width=prog+'%';
    if(prog>=100)setTimeout(function(){loadEl.style.opacity='0';},400);
  }
  progress(20);

  // ── Interaction state ───────────────────────────────────────────────
  var isDrag=false, isPinch=false;
  var autoSpin=true, spinSpeed=0.0013;
  var momX=0, momY=0, fric=0.90;
  var lx=0, ly=0, lDist=0;

  // Camera Z — the ONLY thing that changes for zoom
  // We never scale any mesh or WebView element
  var CAM_DEFAULT = 2.8;
  var CAM_COUNTRY = 1.9;  // zoom level when a country is selected
  var CAM_MIN     = 1.3;
  var CAM_MAX     = 5.5;
  var targetZ = CAM_DEFAULT;
  var camZ    = CAM_DEFAULT;
  var zoomVel = 0;

  var tapX=0,tapY=0,tapT=0,lastTap=0;
  var holdTimer=null,isHeld=false;
  var selectedISO=null,cardOpen=false;

  function shouldSpin(){ return !selectedISO&&!isHeld&&camZ>CAM_MIN+0.3; }

  // ── Stars ──────────────────────────────────────────────────────────
  (function(){
    var geo=new THREE.BufferGeometry(),v=[];
    for(var i=0;i<2000;i++){
      var th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=50+Math.random()*30;
      v.push(r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph));
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.065})));
  })();

  // ── Lights ─────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x1a2540,0.9));
  var sun=new THREE.DirectionalLight(0xffeedd,4.5);
  sun.position.set(5,2.5,4);scene.add(sun);
  var bounce=new THREE.DirectionalLight(0x3a6aff,0.7);
  bounce.position.set(-4,1,-3);scene.add(bounce);
  var polar=new THREE.DirectionalLight(0xaaccff,0.35);
  polar.position.set(0,8,0);scene.add(polar);

  // ── Earth group ─────────────────────────────────────────────────────
  var earthGroup=new THREE.Group();
  earthGroup.rotation.z=0.41;
  scene.add(earthGroup);

  // ── Earth shader ────────────────────────────────────────────────────
  var uEarth={
    dayTexture:{value:null},nightTexture:{value:null},specTexture:{value:null},
    sunDirection:{value:new THREE.Vector3(5,2.5,4).normalize()},
  };
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(1,72,72),new THREE.ShaderMaterial({
    uniforms:uEarth,
    vertexShader:'varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:\`precision highp float;
      uniform sampler2D dayTexture,nightTexture,specTexture;
      uniform vec3 sunDirection;
      varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;
      void main(){
        vec3 n=normalize(vNormal);vec3 sun=normalize(sunDirection);
        float cosA=dot(n,sun);float dayA=smoothstep(-0.18,0.45,cosA);
        vec3 day=texture2D(dayTexture,vUv).rgb;
        float lum=dot(day,vec3(0.299,0.587,0.114));
        day=mix(vec3(lum),day,1.35);day=pow(day,vec3(0.88));
        vec3 night=texture2D(nightTexture,vUv).rgb;night=pow(night,vec3(0.75))*2.2;
        vec3 spec=texture2D(specTexture,vUv).rgb;
        vec3 color=mix(night,day,dayA);
        vec3 vd=normalize(cameraPosition-vWorldPos);
        vec3 hv=normalize(sun+vd);
        float sp=pow(max(dot(n,hv),0.0),90.0);
        float sp2=pow(max(dot(n,hv),0.0),18.0)*0.06;
        color+=vec3(0.7,0.82,1.0)*(sp*0.9+sp2)*spec.r*dayA;
        float term=smoothstep(0.0,0.18,cosA)*smoothstep(0.38,0.18,cosA);
        color+=vec3(0.9,0.45,0.15)*term*0.28;
        float rim=pow(1.0-max(dot(n,vd),0.0),3.8);
        color=mix(color,mix(vec3(0.04,0.08,0.28),vec3(0.28,0.62,1.0),smoothstep(-0.3,0.6,cosA)),rim*0.72);
        gl_FragColor=vec4(color,1.0);
      }\`
  }));
  earthGroup.add(earthMesh);

  // Atmosphere
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.09,48,48),new THREE.ShaderMaterial({
    uniforms:{sd:{value:new THREE.Vector3(5,2.5,4).normalize()}},
    vertexShader:'varying vec3 vN,vP;void main(){vN=normal;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 sd;varying vec3 vN,vP;void main(){vec3 vd=normalize(cameraPosition-(modelMatrix*vec4(vP,1.0)).xyz);float rim=pow(1.0-abs(dot(normalize(vN),vd)),2.4);float d=dot(normalize((normalMatrix*vec4(vN,0.0)).xyz),normalize(sd));vec3 col=mix(vec3(0.03,0.06,0.28),vec3(0.22,0.56,1.0),smoothstep(-0.15,0.6,d));gl_FragColor=vec4(col,rim*0.62);}',
    transparent:true,side:THREE.FrontSide,depthWrite:false,blending:THREE.AdditiveBlending
  })));

  // ── Textures ────────────────────────────────────────────────────────
  var BASE='https://globevoyage-admin.onrender.com/texture/';
  var texLoader=new THREE.TextureLoader();texLoader.crossOrigin='anonymous';
  var texDone=0;
  function onTex(){texDone++;progress(25+texDone*18);}
  texLoader.load(BASE+'earth-day',  function(t){t.anisotropy=renderer.capabilities.getMaxAnisotropy();uEarth.dayTexture.value=t;onTex();},undefined,function(){onTex();});
  texLoader.load(BASE+'earth-night',function(t){uEarth.nightTexture.value=t;onTex();},undefined,function(){onTex();});
  texLoader.load(BASE+'earth-water',function(t){uEarth.specTexture.value=t;onTex();},undefined,function(){onTex();});
  var cloudMesh;
  texLoader.load(BASE+'earth-clouds',function(t){
    cloudMesh=new THREE.Mesh(new THREE.SphereGeometry(1.013,48,48),
      new THREE.MeshPhongMaterial({map:t,transparent:true,opacity:0.75,depthWrite:false,blending:THREE.AdditiveBlending}));
    earthGroup.add(cloudMesh);
  });

  // ── Country geometry ────────────────────────────────────────────────
  var FILL_R=1.003, BORDER_R=1.0042;
  var countryMap={}, allFeatures=[], highlightTargets={};

  function ll2v(lon,lat,r){
    var phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180;
    return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta));
  }
  function triPoly(rings){
    var coords=[];rings[0].forEach(function(p){coords.push(p[0],p[1]);});
    var holes=[],off=rings[0].length;
    for(var i=1;i<rings.length;i++){holes.push(off);rings[i].forEach(function(p){coords.push(p[0],p[1]);});off+=rings[i].length;}
    var idx=earcut(coords,holes.length?holes:null,2);
    if(!idx||!idx.length)return null;
    var pos=[];
    for(var t=0;t<idx.length;t++){var k=idx[t];var v=ll2v(coords[k*2],coords[k*2+1],FILL_R);pos.push(v.x,v.y,v.z);}
    var geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    return geo;
  }
  function buildBorder(rings){
    var pos=[];
    rings.forEach(function(ring){
      for(var i=0;i<ring.length-1;i++){
        var a=ll2v(ring[i][0],ring[i][1],BORDER_R),b=ll2v(ring[i+1][0],ring[i+1][1],BORDER_R);
        pos.push(a.x,a.y,a.z,b.x,b.y,b.z);
      }
    });
    if(!pos.length)return null;
    var geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));return geo;
  }
  function pipRing(lon,lat,ring){
    var inside=false;
    for(var i=0,j=ring.length-1;i<ring.length;j=i++){
      var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
      if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi))inside=!inside;
    }
    return inside;
  }
  function pipFeature(lon,lat,f){
    var g=f.geometry;if(!g)return false;
    function tp(rings){if(!pipRing(lon,lat,rings[0]))return false;for(var h=1;h<rings.length;h++)if(pipRing(lon,lat,rings[h]))return false;return true;}
    if(g.type==='Polygon')return tp(g.coordinates);
    if(g.type==='MultiPolygon'){for(var p=0;p<g.coordinates.length;p++)if(tp(g.coordinates[p]))return true;}
    return false;
  }
  function v3toll(v){
    var lat=Math.asin(v.y/v.length())*180/Math.PI;
    var lon=Math.atan2(v.z,-v.x)*180/Math.PI-180;
    if(lon<-180)lon+=360;
    return{lat:lat,lon:lon};
  }
  function getRings(f){
    var g=f.geometry;if(!g)return[];var r=[];
    if(g.type==='Polygon')r=g.coordinates;
    else if(g.type==='MultiPolygon')g.coordinates.forEach(function(p){r=r.concat(p);});
    return r;
  }
  function buildCountry(feature){
    var iso=feature.properties.iso;
    var rings=getRings(feature);if(!rings.length)return;
    var fillMat=new THREE.MeshBasicMaterial({color:0x4fa3ff,transparent:true,opacity:0.0,side:THREE.DoubleSide,depthWrite:false});
    var borderMat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.25,linewidth:1});
    var group=new THREE.Group();
    try{
      if(feature.geometry.type==='Polygon'){
        var fg=triPoly(feature.geometry.coordinates);
        if(fg){var m=new THREE.Mesh(fg,fillMat);m.userData.iso=iso;group.add(m);}
      }else if(feature.geometry.type==='MultiPolygon'){
        feature.geometry.coordinates.forEach(function(poly){
          var fg=triPoly(poly);
          if(fg){var m=new THREE.Mesh(fg,fillMat);m.userData.iso=iso;group.add(m);}
        });
      }
    }catch(e){}
    var bg=buildBorder(rings);
    if(bg)group.add(new THREE.LineSegments(bg,borderMat));
    earthGroup.add(group);
    countryMap[iso]={fillMat:fillMat,borderMat:borderMat,name:feature.properties.name,iso:iso,props:feature.properties};
  }

  // ── Card UI ─────────────────────────────────────────────────────────
  var card       = document.getElementById('card');
  var backdrop   = document.getElementById('backdrop');

  function fmtPop(n){if(!n)return'—';if(n>1e9)return(n/1e9).toFixed(1)+'B';if(n>1e6)return(n/1e6).toFixed(1)+'M';if(n>1e3)return Math.round(n/1e3)+'K';return''+n;}

  function openCard(iso,props){
    document.getElementById('card-flag').textContent = FLAGS[iso]||'🌍';
    document.getElementById('card-name').textContent = props.name;
    document.getElementById('card-sub').textContent  = (props.subregion||props.continent||'').toUpperCase();
    document.getElementById('card-desc').textContent = DESCRIPTIONS[iso]||'A fascinating destination with a rich cultural heritage and unique landscapes.';
    document.getElementById('s-pop').textContent  = fmtPop(props.pop);
    document.getElementById('s-cont').textContent = props.continent||'—';
    document.getElementById('s-reg').textContent  = (props.subregion||'—').split(' ').slice(0,2).join(' ');
    card.classList.add('open');
    backdrop.classList.add('on');
    cardOpen=true;
    autoSpin=false;
    // Smooth zoom in to country
    targetZ=CAM_COUNTRY;
  }

  function closeCard(){
    card.classList.remove('open');
    backdrop.classList.remove('on');
    cardOpen=false;
    // Zoom back out
    targetZ=CAM_DEFAULT;
    if(shouldSpin())autoSpin=true;
  }

  document.getElementById('card-close').addEventListener('click',function(e){
    e.stopPropagation();
    dismissSelection();
  });
  document.getElementById('card-btn').addEventListener('click',function(e){
    e.stopPropagation();
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type:'DESTINATIONS',
        country:selectedISO,
        name:document.getElementById('card-name').textContent
      }));
    }
  });
  // Tap backdrop to close
  backdrop.addEventListener('click',function(){ dismissSelection(); });

  function dismissSelection(){
    if(selectedISO&&countryMap[selectedISO]){
      highlightTargets[selectedISO]=0.0;
      countryMap[selectedISO].borderMat.color.setHex(0xffffff);
      countryMap[selectedISO].borderMat.opacity=0.25;
    }
    selectedISO=null;
    closeCard();
  }

  function setSelected(iso){
    // Deselect previous
    if(selectedISO&&countryMap[selectedISO]){
      highlightTargets[selectedISO]=0.0;
      countryMap[selectedISO].borderMat.color.setHex(0xffffff);
      countryMap[selectedISO].borderMat.opacity=0.25;
    }
    if(iso===selectedISO){dismissSelection();return;}
    selectedISO=iso;
    if(countryMap[iso]){
      highlightTargets[iso]=0.48;
      countryMap[iso].borderMat.color.setHex(0x88ccff);
      countryMap[iso].borderMat.opacity=1.0;
      openCard(iso,countryMap[iso].props);
    }
    autoSpin=false;
  }

  // ── Raycaster ────────────────────────────────────────────────────────
  var raycaster=new THREE.Raycaster();
  function handleTap(sx,sy){
    // Ignore taps in lower area if card is open (handled by backdrop/button)
    var cardEl=document.getElementById('card');
    var cardRect=cardEl.getBoundingClientRect();
    if(cardOpen && sy > cardRect.top) return;

    var ndc=new THREE.Vector2((sx/W)*2-1,-(sy/H)*2+1);
    raycaster.setFromCamera(ndc,camera);
    var sphereHits=raycaster.intersectObject(earthMesh);
    if(!sphereHits.length){ if(selectedISO)dismissSelection(); return; }

    // Try mesh hit
    var fills=[];
    earthGroup.traverse(function(o){if(o.isMesh&&o.userData.iso)fills.push(o);});
    var hits=raycaster.intersectObjects(fills,false);
    if(hits.length>0){setSelected(hits[0].object.userData.iso);return;}

    // Point-in-polygon fallback
    var localPt=earthGroup.worldToLocal(sphereHits[0].point.clone());
    var ll=v3toll(localPt);
    for(var i=0;i<allFeatures.length;i++){
      if(pipFeature(ll.lon,ll.lat,allFeatures[i])){setSelected(allFeatures[i].properties.iso);return;}
    }
    // Ocean — dismiss
    if(selectedISO)dismissSelection();
  }

  // Load countries
  fetch('https://globevoyage-admin.onrender.com/geodata')
    .then(function(r){return r.json();})
    .then(function(geojson){
      progress(82);
      allFeatures=geojson.features;
      var i=0;
      function batch(){
        var end=Math.min(i+15,allFeatures.length);
        for(;i<end;i++)buildCountry(allFeatures[i]);
        progress(82+Math.round((i/allFeatures.length)*17));
        if(i<allFeatures.length)setTimeout(batch,0);
        else progress(100);
      }
      batch();
    })
    .catch(function(){progress(100);});

  // ── Touch ────────────────────────────────────────────────────────────
  function tDist(a,b){var dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;return Math.sqrt(dx*dx+dy*dy);}

  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      var t=e.touches[0];
      lx=t.clientX;ly=t.clientY;
      tapX=t.clientX;tapY=t.clientY;tapT=Date.now();
      isDrag=true;isPinch=false;momX=0;momY=0;isHeld=false;
      holdTimer=setTimeout(function(){isHeld=true;autoSpin=false;},600);
    }else if(e.touches.length===2){
      clearTimeout(holdTimer);isDrag=false;isPinch=true;
      lDist=tDist(e.touches[0],e.touches[1]);
    }
  },{passive:false});

  canvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(isDrag&&e.touches.length===1){
      clearTimeout(holdTimer);
      var t=e.touches[0],dx=t.clientX-lx,dy=t.clientY-ly;
      // Sensitivity scales with zoom depth — closer = slower drag
      var s=0.004*(camZ/CAM_DEFAULT);
      earthGroup.rotation.y+=dx*s;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+dy*s));
      momX=dx*s;momY=dy*s;
      lx=t.clientX;ly=t.clientY;
      autoSpin=false;
    }else if(isPinch&&e.touches.length===2){
      var d=tDist(e.touches[0],e.touches[1]);
      var delta=(lDist-d)*0.016;
      // Rubber-band resistance near limits
      if(targetZ+delta<CAM_MIN) delta*=0.2;
      if(targetZ+delta>CAM_MAX) delta*=0.2;
      targetZ=Math.max(CAM_MIN,Math.min(CAM_MAX,targetZ+delta));
      lDist=d;
    }
  },{passive:false});

  canvas.addEventListener('touchend',function(e){
    e.preventDefault();
    clearTimeout(holdTimer);
    var now=Date.now();
    if(e.changedTouches.length===1){
      var cx=e.changedTouches[0].clientX,cy=e.changedTouches[0].clientY;
      var dx=Math.abs(cx-tapX),dy2=Math.abs(cy-tapY),dt=now-tapT;
      // Double-tap: zoom toggle
      if(now-lastTap<260&&dx<18&&dy2<18){
        targetZ=camZ<CAM_DEFAULT-0.3?CAM_DEFAULT:CAM_MIN+0.3;
      }
      lastTap=now;
      // Single tap
      if(dx<10&&dy2<10&&dt<280)handleTap(tapX,tapY);
      // Momentum resume
      if(Math.abs(momX)>0.001||Math.abs(momY)>0.001){
        setTimeout(function(){if(!isDrag&&!isHeld&&shouldSpin())autoSpin=true;},1800);
      }else if(shouldSpin()){autoSpin=true;}
    }
    isDrag=false;isPinch=false;
  },{passive:false});

  // ── Animation loop ────────────────────────────────────────────────────
  var hlTime=0;
  function animate(){
    requestAnimationFrame(animate);

    if(autoSpin)earthGroup.rotation.y+=spinSpeed;
    if(!isDrag&&(Math.abs(momX)>0||Math.abs(momY)>0)){
      earthGroup.rotation.y+=momX;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+momY));
      momX*=fric;momY*=fric;
      if(Math.abs(momX)<0.00008&&Math.abs(momY)<0.00008){momX=0;momY=0;}
    }

    // Spring physics zoom — pure camera Z movement, nothing else
    var diff=targetZ-camZ;
    zoomVel=(zoomVel+diff*0.035)*0.75;
    camZ+=zoomVel;
    camera.position.z=camZ;

    // Pause spin when zoomed right in
    if(camZ<CAM_MIN+0.25&&!selectedISO)autoSpin=false;
    else if(!selectedISO&&!isHeld&&!isDrag&&shouldSpin())autoSpin=true;

    if(cloudMesh)cloudMesh.rotation.y+=spinSpeed*1.12;

    // Highlight animation
    hlTime+=0.05;
    Object.keys(highlightTargets).forEach(function(iso){
      var c=countryMap[iso];if(!c)return;
      var cur=c.fillMat.opacity,tgt=highlightTargets[iso];
      var next=cur+(tgt-cur)*0.11;
      c.fillMat.opacity=next;
      if(iso===selectedISO)c.borderMat.opacity=0.65+0.35*Math.sin(hlTime);
      if(Math.abs(next-tgt)<0.001){c.fillMat.opacity=tgt;if(tgt===0.0)delete highlightTargets[iso];}
    });

    renderer.render(scene,camera);
  }
  animate();

  setTimeout(function(){var h=document.getElementById('hint');if(h)h.style.opacity='0';},5000);
})();
</script>
</body>
</html>`);
});

// ── DESTINATIONS ──────────────────────────────────────────────────────
app.get("/api/destinations", async (req, res) => {
  const { data, error } = await supabase.from("destinations").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.get("/api/destinations/:id", async (req, res) => {
  const { data, error } = await supabase.from("destinations").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});
app.post("/api/destinations", async (req, res) => {
  const { name, country, description, image_url, price } = req.body;
  const { data, error } = await supabase.from("destinations").insert([{ name, country, description, image_url, price }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});
app.put("/api/destinations/:id", async (req, res) => {
  const { name, country, description, image_url, price } = req.body;
  const { data, error } = await supabase.from("destinations").update({ name, country, description, image_url, price }).eq("id", req.params.id).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});
app.delete("/api/destinations/:id", async (req, res) => {
  const { error } = await supabase.from("destinations").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Deleted successfully" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GlobeVoyage API running on port ${PORT}`));
