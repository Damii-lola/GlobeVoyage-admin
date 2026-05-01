const express = require("express");
const cors = require("cors");
const https = require("https");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.get("/", (req, res) => res.json({ status: "GlobeVoyage API is live 🌍" }));

// ── TEXTURE PROXY ─────────────────────────────────────────────────────
const TEXTURES = {
  "earth-day":    "https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg",
  "earth-night":  "https://unpkg.com/three-globe@2.30.0/example/img/earth-night.jpg",
  "earth-clouds": "https://unpkg.com/three-globe@2.30.0/example/img/earth-clouds.png",
  "earth-water":  "https://unpkg.com/three-globe@2.30.0/example/img/earth-water.png",
};

app.get("/texture/:name", (req, res) => {
  const url = TEXTURES[req.params.name];
  if (!url) return res.status(404).json({ error: "Texture not found" });
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Content-Type", url.endsWith(".png") ? "image/png" : "image/jpeg");
  https.get(url, (upstream) => upstream.pipe(res)).on("error", () => res.status(502).end());
});

// ── GEOJSON PROXY ─────────────────────────────────────────────────────
let geojsonCache = null;
let geojsonFetching = false;
let geojsonWaiters = [];

function fetchGeoJSON(cb) {
  if (geojsonCache) return cb(null, geojsonCache);
  geojsonWaiters.push(cb);
  if (geojsonFetching) return;
  geojsonFetching = true;
  const url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
  let data = "";
  https.get(url, (res) => {
    res.on("data", (chunk) => data += chunk);
    res.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        parsed.features = parsed.features.map(f => ({
          type: "Feature",
          properties: {
            name: f.properties.NAME || f.properties.name || "Unknown",
            iso:  f.properties.ISO_A3 || f.properties.NAME || "Unknown",
            continent: f.properties.CONTINENT || "",
            pop: f.properties.POP_EST || 0,
            area: f.properties.AREA || 0,
            subregion: f.properties.SUBREGION || "",
          },
          geometry: f.geometry
        }));
        geojsonCache = parsed;
        geojsonWaiters.splice(0).forEach(w => w(null, geojsonCache));
      } catch(e) {
        geojsonWaiters.splice(0).forEach(w => w(e, null));
      }
      geojsonFetching = false;
    });
  }).on("error", (e) => {
    geojsonFetching = false;
    geojsonWaiters.splice(0).forEach(w => w(e, null));
  });
}

app.get("/geodata", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=3600");
  fetchGeoJSON((err, data) => {
    if (err) return res.status(502).json({ error: "Failed to fetch geo data" });
    res.json(data);
  });
});

fetchGeoJSON(() => console.log("GeoJSON cached ✓"));

// ── GLOBE PAGE ────────────────────────────────────────────────────────
app.get("/globe", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#060a12;overflow:hidden;touch-action:none;font-family:-apple-system,sans-serif}
  canvas{display:block;touch-action:none;position:absolute;top:0;left:0}

  #loading{
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    color:#5bb8ff;font-size:10px;letter-spacing:4px;
    transition:opacity 0.8s;text-align:center;pointer-events:none;
  }
  #bar{width:130px;height:1px;background:rgba(91,184,255,0.15);margin:12px auto 0;border-radius:1px;overflow:hidden}
  #fill{height:100%;background:linear-gradient(90deg,#3a8fff,#7dd4ff);width:0%;transition:width 0.35s;border-radius:1px}

  #hint{
    position:absolute;top:10px;left:50%;transform:translateX(-50%);
    color:rgba(120,170,230,0.35);font-size:8px;letter-spacing:3px;
    pointer-events:none;white-space:nowrap;transition:opacity 1.4s;
  }

  /* ── Country info card ── */
  #card{
    position:absolute;bottom:0;left:0;right:0;
    background:linear-gradient(180deg,rgba(6,10,18,0) 0%,rgba(6,10,18,0.97) 18%);
    padding:28px 22px 22px;
    transform:translateY(100%);
    transition:transform 0.38s cubic-bezier(0.22,1,0.36,1);
    pointer-events:none;
  }
  #card.open{ transform:translateY(0); pointer-events:all; }
  #card-flag{ font-size:28px; margin-bottom:6px; line-height:1; }
  #card-name{ font-size:19px;font-weight:700;color:#e8f2ff;letter-spacing:0.5px;margin-bottom:3px; }
  #card-sub{  font-size:10px;color:#5a7aa0;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px; }
  #card-desc{ font-size:12px;color:#8aa8cc;line-height:1.65;margin-bottom:16px; }
  #card-stats{
    display:flex;gap:12px;margin-bottom:16px;
  }
  .stat{
    flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);
    border-radius:10px;padding:8px 10px;
  }
  .stat-val{ font-size:13px;font-weight:600;color:#c8dcf5; }
  .stat-lbl{ font-size:9px;color:#3a5a7a;letter-spacing:1px;text-transform:uppercase;margin-top:2px; }
  #card-btn{
    width:100%;padding:13px;border:none;border-radius:14px;
    background:linear-gradient(135deg,#2a6fff,#1a4fcc);
    color:#fff;font-size:14px;font-weight:600;letter-spacing:1px;
    cursor:pointer;transition:opacity 0.2s,transform 0.15s;
    box-shadow:0 4px 24px rgba(42,111,255,0.35);
  }
  #card-btn:active{ opacity:0.85;transform:scale(0.98); }
  #card-close{
    position:absolute;top:16px;right:18px;
    width:28px;height:28px;border-radius:50%;
    background:rgba(255,255,255,0.07);border:none;
    color:#5a7aa0;font-size:16px;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    transition:background 0.2s;
  }
  #card-close:active{ background:rgba(255,255,255,0.14); }
</style>
</head>
<body>
<div id="loading">LOADING EARTH<div id="bar"><div id="fill"></div></div></div>
<canvas id="c"></canvas>
<div id="hint">DRAG · PINCH · TAP COUNTRY</div>

<!-- Country info card -->
<div id="card">
  <button id="card-close">✕</button>
  <div id="card-flag"></div>
  <div id="card-name"></div>
  <div id="card-sub"></div>
  <div id="card-desc"></div>
  <div id="card-stats">
    <div class="stat"><div class="stat-val" id="s-pop"></div><div class="stat-lbl">Population</div></div>
    <div class="stat"><div class="stat-val" id="s-cont"></div><div class="stat-lbl">Continent</div></div>
    <div class="stat"><div class="stat-val" id="s-reg"></div><div class="stat-lbl">Region</div></div>
  </div>
  <button id="card-btn">✈️  View Destinations</button>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/earcut@2.2.4/src/earcut.min.js"></script>
<script>
(function(){
  var W=window.innerWidth, H=window.innerHeight;
  var canvas=document.getElementById('c');
  canvas.width=W; canvas.height=H;

  var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setSize(W,H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0x060a12,1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.3;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(40,W/H,0.1,1000);
  camera.position.z=2.6;

  // ── Progress ──
  var fillEl=document.getElementById('fill');
  var loadEl=document.getElementById('loading');
  var prog=0;
  function progress(n){
    prog=Math.max(prog,n);
    fillEl.style.width=prog+'%';
    if(prog>=100) setTimeout(function(){loadEl.style.opacity='0';},400);
  }
  progress(5);

  // ── Interaction state ──
  var isDrag=false, isPinch=false;
  var autoSpin=true, spinSpeed=0.0013;
  var momX=0, momY=0, fric=0.90;
  var lx=0, ly=0, lDist=0;
  var targetZ=2.6, camZ=2.6, zMin=1.18, zMax=5.0;
  var tapX=0, tapY=0, tapT=0, lastTap=0;
  var holdTimer=null, isHeld=false;
  var selectedISO=null;
  var cardOpen=false;

  // Pause auto-spin when selected or zoomed in
  function shouldAutoSpin(){
    return !selectedISO && !isHeld && targetZ > zMin+0.15;
  }

  // ── Stars ──
  (function(){
    var geo=new THREE.BufferGeometry(), v=[];
    for(var i=0;i<2200;i++){
      var th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=50+Math.random()*30;
      v.push(r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph));
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.065})));
  })();

  // ── Improved lighting — bright, vivid, realistic ──
  // Soft fill so dark side isn't pitch black
  scene.add(new THREE.AmbientLight(0x1a2540, 0.9));
  // Main sun — warm, strong
  var sun=new THREE.DirectionalLight(0xffeedd, 4.5);
  sun.position.set(5, 2.5, 4);
  scene.add(sun);
  // Secondary bounce — cool blue from atmosphere scatter
  var bounce=new THREE.DirectionalLight(0x3a6aff, 0.7);
  bounce.position.set(-4, 1, -3);
  scene.add(bounce);
  // Subtle top light for polar ice brightness
  var polar=new THREE.DirectionalLight(0xaaccff, 0.35);
  polar.position.set(0, 8, 0);
  scene.add(polar);

  // ── Earth group ──
  var earthGroup=new THREE.Group();
  earthGroup.rotation.z=0.41;
  scene.add(earthGroup);

  // ── Earth shader — improved vibrancy ──
  var uEarth={
    dayTexture:{value:null}, nightTexture:{value:null}, specTexture:{value:null},
    sunDirection:{value:new THREE.Vector3(5,2.5,4).normalize()},
  };
  var earthMesh=new THREE.Mesh(
    new THREE.SphereGeometry(1,72,72),
    new THREE.ShaderMaterial({
      uniforms:uEarth,
      vertexShader:\`
        varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;
        void main(){
          vUv=uv;vNormal=normalize(normalMatrix*normal);
          vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      \`,
      fragmentShader:\`
        precision highp float;
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform sampler2D specTexture;
        uniform vec3 sunDirection;
        varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;

        void main(){
          vec3 n=normalize(vNormal);
          vec3 sun=normalize(sunDirection);
          float cosA=dot(n,sun);
          float dayA=smoothstep(-0.18,0.45,cosA);

          vec4 daySample=texture2D(dayTexture,vUv);
          vec3 day=daySample.rgb;
          // Boost saturation & vibrancy of day texture
          float lum=dot(day,vec3(0.299,0.587,0.114));
          day=mix(vec3(lum),day,1.35); // saturate
          day=pow(day,vec3(0.88));     // gamma lift (brighter)

          vec3 night=texture2D(nightTexture,vUv).rgb;
          night=pow(night,vec3(0.75))*2.2; // brighter city lights
          vec3 spec=texture2D(specTexture,vUv).rgb;

          // Day/night blend with thin terminator line
          vec3 color=mix(night, day, dayA);

          // Specular glint on water
          vec3 vd=normalize(cameraPosition-vWorldPos);
          vec3 hv=normalize(sun+vd);
          float sp=pow(max(dot(n,hv),0.0),90.0);
          // Broader soft shimmer + sharp highlight
          float sp2=pow(max(dot(n,hv),0.0),18.0)*0.06;
          color+=vec3(0.7,0.82,1.0)*(sp*0.9+sp2)*spec.r*dayA;

          // Terminator glow — orange sunrise/sunset band
          float terminator=smoothstep(0.0,0.18,cosA)*smoothstep(0.38,0.18,cosA);
          color+=vec3(0.9,0.45,0.15)*terminator*0.28;

          // Atmosphere rim — vivid blue halo
          float rim=pow(1.0-max(dot(n,vd),0.0),3.8);
          vec3 rimDay=vec3(0.28,0.62,1.0);
          vec3 rimNight=vec3(0.04,0.08,0.28);
          color=mix(color,mix(rimNight,rimDay,smoothstep(-0.3,0.6,cosA)),rim*0.72);

          gl_FragColor=vec4(color,1.0);
        }
      \`
    })
  );
  earthGroup.add(earthMesh);

  // ── Atmosphere outer shell ──
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.09,48,48),
    new THREE.ShaderMaterial({
      uniforms:{sunDir:{value:new THREE.Vector3(5,2.5,4).normalize()}},
      vertexShader:\`varying vec3 vN,vP;void main(){vN=normal;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}\`,
      fragmentShader:\`uniform vec3 sunDir;varying vec3 vN,vP;void main(){
        vec3 vd=normalize(cameraPosition-(modelMatrix*vec4(vP,1.0)).xyz);
        float rim=pow(1.0-abs(dot(normalize(vN),vd)),2.4);
        float d=dot(normalize((normalMatrix*vec4(vN,0.0)).xyz),normalize(sunDir));
        vec3 col=mix(vec3(0.03,0.06,0.28),vec3(0.22,0.56,1.0),smoothstep(-0.15,0.6,d));
        gl_FragColor=vec4(col,rim*0.62);}\`,
      transparent:true,side:THREE.FrontSide,depthWrite:false,blending:THREE.AdditiveBlending
    })
  ));

  // ── Textures ──
  var BASE='https://globevoyage-admin.onrender.com/texture/';
  var texLoader=new THREE.TextureLoader();
  texLoader.crossOrigin='anonymous';
  var texDone=0;
  function onTex(){texDone++;progress(10+texDone*18);}
  texLoader.load(BASE+'earth-day',  function(t){t.anisotropy=renderer.capabilities.getMaxAnisotropy();uEarth.dayTexture.value=t;onTex();},undefined,function(){onTex();});
  texLoader.load(BASE+'earth-night',function(t){uEarth.nightTexture.value=t;onTex();},undefined,function(){onTex();});
  texLoader.load(BASE+'earth-water',function(t){uEarth.specTexture.value=t;onTex();},undefined,function(){onTex();});
  var cloudMesh;
  texLoader.load(BASE+'earth-clouds',function(t){
    cloudMesh=new THREE.Mesh(
      new THREE.SphereGeometry(1.013,48,48),
      new THREE.MeshPhongMaterial({map:t,transparent:true,opacity:0.75,depthWrite:false,blending:THREE.AdditiveBlending})
    );
    earthGroup.add(cloudMesh);
  });

  // ── Country data & descriptions ──
  var DESCRIPTIONS={
    'USA':'The world\'s largest economy and a melting pot of cultures, spanning vast landscapes from Alaskan tundra to Hawaiian tropics.',
    'GBR':'An island nation with a rich imperial history, home to London — one of the world\'s great global cities.',
    'FRA':'Famous for art, cuisine, fashion and the Eiffel Tower, France is the world\'s most visited country.',
    'DEU':'Europe\'s industrial powerhouse, known for engineering precision, classical music, and the Bavarian Alps.',
    'CHN':'The world\'s most populous nation, with 5,000 years of continuous civilisation and a booming modern economy.',
    'IND':'A vibrant subcontinent of 1.4 billion people, incredible diversity, ancient temples and tech innovation.',
    'BRA':'South America\'s giant — home to the Amazon rainforest, Carnival, and some of the world\'s best beaches.',
    'RUS':'The largest country on Earth by area, spanning 11 time zones from Eastern Europe to the Pacific Ocean.',
    'AUS':'A vast island continent famous for unique wildlife, the Great Barrier Reef, and an outdoor lifestyle.',
    'CAN':'The world\'s second-largest country, known for stunning wilderness, multicultural cities and friendly people.',
    'JPN':'A unique blend of ancient tradition and cutting-edge technology, from Mount Fuji to the neon streets of Tokyo.',
    'NGA':'Africa\'s most populous nation and largest economy, a cultural powerhouse of music, film and innovation.',
    'ZAF':'The Rainbow Nation — rich in biodiversity, dramatic landscapes from the Cape to the Kruger National Park.',
    'EGY':'Home to one of humanity\'s oldest civilisations, the Nile, and iconic ancient monuments like the Great Pyramids.',
    'MEX':'A country of ancient Aztec ruins, vibrant fiestas, rich cuisine and stunning Pacific and Caribbean coasts.',
    'ARG':'South America\'s second-largest country, famed for tango, Patagonian wilderness and the Andes mountains.',
    'SAU':'The heart of the Arab world, custodian of Islam\'s holiest sites and a vast oil-rich desert kingdom.',
    'IDN':'The world\'s largest archipelago — over 17,000 islands, extraordinary biodiversity and cultural richness.',
    'TUR':'Straddling two continents, Turkey is a crossroads of civilisations with breathtaking coasts and history.',
    'KEN':'East Africa\'s gateway — famed for the Maasai Mara, world-class marathon runners, and Nairobi\'s energy.',
    'ESP':'Sun, flamenco, La Sagrada Família, and incredible food — Spain is Europe\'s most passionate destination.',
    'ITA':'The cradle of Western civilisation, art and cuisine — from the Colosseum to the canals of Venice.',
    'PAK':'A land of K2, the Karakoram Highway, ancient Indus Valley ruins, and warmly hospitable people.',
    'UKR':'Europe\'s largest country by area, with fertile plains, a deep Cossack heritage, and resilient people.',
    'GHA':'West Africa\'s beacon of democracy and stability, birthplace of Pan-Africanism and rich in gold and culture.',
    'ETH':'Africa\'s oldest independent nation, birthplace of coffee, home to ancient churches and the source of the Blue Nile.',
    'MAR':'Where the Sahara meets the Atlantic — ancient medinas, blue Chefchaouen, and a world-class food scene.',
    'PER':'Land of the Incas, Machu Picchu, the Amazon, and one of the most diverse ecosystems on Earth.',
    'COL':'Where the Andes meet the Caribbean — Colombia has reinvented itself as a vibrant, colourful destination.',
    'NZL':'Two dramatic islands of fjords, volcanoes, Maori culture and the landscapes that brought Middle-earth to life.',
  };

  function getDesc(iso){
    return DESCRIPTIONS[iso] || 'A fascinating country with a rich cultural heritage and unique landscapes waiting to be explored.';
  }
  function fmtPop(n){
    if(!n) return '—';
    if(n>1e9) return (n/1e9).toFixed(1)+'B';
    if(n>1e6) return (n/1e6).toFixed(1)+'M';
    if(n>1e3) return (n/1e3).toFixed(0)+'K';
    return n;
  }

  // ── Country flags (emoji) ──
  var FLAGS={
    'USA':'🇺🇸','GBR':'🇬🇧','FRA':'🇫🇷','DEU':'🇩🇪','CHN':'🇨🇳','IND':'🇮🇳',
    'BRA':'🇧🇷','RUS':'🇷🇺','AUS':'🇦🇺','CAN':'🇨🇦','JPN':'🇯🇵','NGA':'🇳🇬',
    'ZAF':'🇿🇦','EGY':'🇪🇬','MEX':'🇲🇽','ARG':'🇦🇷','SAU':'🇸🇦','IDN':'🇮🇩',
    'TUR':'🇹🇷','KEN':'🇰🇪','ESP':'🇪🇸','ITA':'🇮🇹','PAK':'🇵🇰','UKR':'🇺🇦',
    'GHA':'🇬🇭','ETH':'🇪🇹','MAR':'🇲🇦','PER':'🇵🇪','COL':'🇨🇴','NZL':'🇳🇿',
  };

  // ── Info card ──
  var card=document.getElementById('card');
  var cardName=document.getElementById('card-name');
  var cardSub=document.getElementById('card-sub');
  var cardDesc=document.getElementById('card-desc');
  var cardFlag=document.getElementById('card-flag');
  var sPop=document.getElementById('s-pop');
  var sCont=document.getElementById('s-cont');
  var sReg=document.getElementById('s-reg');
  var cardBtn=document.getElementById('card-btn');
  var cardClose=document.getElementById('card-close');

  function openCard(iso, props){
    cardFlag.textContent = FLAGS[iso] || '🌍';
    cardName.textContent = props.name;
    cardSub.textContent  = (props.subregion || props.continent || '').toUpperCase();
    cardDesc.textContent = getDesc(iso);
    sPop.textContent  = fmtPop(props.pop);
    sCont.textContent = props.continent || '—';
    sReg.textContent  = (props.subregion||'—').split(' ').slice(0,2).join(' ');
    card.classList.add('open');
    cardOpen=true;
    // Pause spin when card open
    autoSpin=false;
  }
  function closeCard(){
    card.classList.remove('open');
    cardOpen=false;
    if(shouldAutoSpin()) autoSpin=true;
  }

  cardClose.addEventListener('click', function(){
    closeCard();
    if(selectedISO && countryMap[selectedISO]){
      highlightTargets[selectedISO]=0.0;
      countryMap[selectedISO].borderMat.color.setHex(0xffffff);
      countryMap[selectedISO].borderMat.opacity=0.25;
    }
    selectedISO=null;
  });

  cardBtn.addEventListener('click', function(){
    // Post message to React Native to navigate to destinations
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type:'DESTINATIONS',
        country: selectedISO,
        name: cardName.textContent
      }));
    }
  });

  // ── Country geometry ──
  var FILL_R=1.003, BORDER_R=1.0042;
  var countryMap={}, allFeatures=[], highlightTargets={};

  function ll2v(lon,lat,r){
    var phi=(90-lat)*Math.PI/180;
    var theta=(lon+180)*Math.PI/180;
    return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta));
  }

  function triangulatePolygon(rings){
    var coords=[];
    rings[0].forEach(function(p){coords.push(p[0],p[1]);});
    var holes=[];
    var off=rings[0].length;
    for(var i=1;i<rings.length;i++){
      holes.push(off);
      rings[i].forEach(function(p){coords.push(p[0],p[1]);});
      off+=rings[i].length;
    }
    var idx=earcut(coords,holes.length?holes:null,2);
    if(!idx||!idx.length) return null;
    var pos=[];
    for(var t=0;t<idx.length;t++){
      var k=idx[t];
      var v=ll2v(coords[k*2],coords[k*2+1],FILL_R);
      pos.push(v.x,v.y,v.z);
    }
    var geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    return geo;
  }

  function buildBorder(rings){
    var pos=[];
    rings.forEach(function(ring){
      for(var i=0;i<ring.length-1;i++){
        var a=ll2v(ring[i][0],ring[i][1],BORDER_R);
        var b=ll2v(ring[i+1][0],ring[i+1][1],BORDER_R);
        pos.push(a.x,a.y,a.z,b.x,b.y,b.z);
      }
    });
    if(!pos.length) return null;
    var geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    return geo;
  }

  function pointInRing(lon,lat,ring){
    var inside=false;
    for(var i=0,j=ring.length-1;i<ring.length;j=i++){
      var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
      if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)) inside=!inside;
    }
    return inside;
  }
  function pointInFeature(lon,lat,f){
    var g=f.geometry; if(!g) return false;
    function testPoly(rings){ if(!pointInRing(lon,lat,rings[0])) return false; for(var h=1;h<rings.length;h++) if(pointInRing(lon,lat,rings[h])) return false; return true; }
    if(g.type==='Polygon') return testPoly(g.coordinates);
    if(g.type==='MultiPolygon'){ for(var p=0;p<g.coordinates.length;p++) if(testPoly(g.coordinates[p])) return true; }
    return false;
  }
  function vec3ToLL(v){
    var lat=Math.asin(v.y/v.length())*180/Math.PI;
    var lon=Math.atan2(v.z,-v.x)*180/Math.PI-180;
    if(lon<-180) lon+=360;
    return {lat:lat,lon:lon};
  }

  function getAllRings(f){
    var g=f.geometry; if(!g) return [];
    var rings=[];
    if(g.type==='Polygon') rings=g.coordinates;
    else if(g.type==='MultiPolygon') g.coordinates.forEach(function(p){rings=rings.concat(p);});
    return rings;
  }

  function buildCountryMesh(feature){
    var iso=feature.properties.iso;
    var rings=getAllRings(feature);
    if(!rings.length) return;

    var fillMat=new THREE.MeshBasicMaterial({
      color:0x4fa3ff,transparent:true,opacity:0.0,
      side:THREE.DoubleSide,depthWrite:false,
    });
    var borderMat=new THREE.LineBasicMaterial({
      color:0xffffff,transparent:true,opacity:0.25,linewidth:1,
    });

    var group=new THREE.Group();
    try{
      if(feature.geometry.type==='Polygon'){
        var fg=triangulatePolygon(feature.geometry.coordinates);
        if(fg){var m=new THREE.Mesh(fg,fillMat);m.userData.iso=iso;group.add(m);}
      } else if(feature.geometry.type==='MultiPolygon'){
        feature.geometry.coordinates.forEach(function(poly){
          var fg=triangulatePolygon(poly);
          if(fg){var m=new THREE.Mesh(fg,fillMat);m.userData.iso=iso;group.add(m);}
        });
      }
    } catch(e){}

    var bg=buildBorder(rings);
    if(bg) group.add(new THREE.LineSegments(bg,borderMat));
    earthGroup.add(group);
    countryMap[iso]={fillMat:fillMat,borderMat:borderMat,name:feature.properties.name,iso:iso,props:feature.properties};
  }

  function setSelected(iso){
    if(selectedISO && countryMap[selectedISO]){
      highlightTargets[selectedISO]=0.0;
      countryMap[selectedISO].borderMat.color.setHex(0xffffff);
      countryMap[selectedISO].borderMat.opacity=0.25;
    }
    if(iso===selectedISO){ selectedISO=null; closeCard(); return; }
    selectedISO=iso;
    if(countryMap[iso]){
      highlightTargets[iso]=0.48;
      countryMap[iso].borderMat.color.setHex(0x88ccff);
      countryMap[iso].borderMat.opacity=1.0;
      openCard(iso, countryMap[iso].props);
    }
    // Pause spin when country selected
    autoSpin=false;
  }

  // ── Raycaster ──
  var raycaster=new THREE.Raycaster();

  function handleTap(sx,sy){
    // Don't raycast through the card UI
    if(cardOpen && sy > H*0.55) return;
    var ndc=new THREE.Vector2((sx/W)*2-1,-(sy/H)*2+1);
    raycaster.setFromCamera(ndc,camera);
    var sphereHits=raycaster.intersectObject(earthMesh);
    if(!sphereHits.length) return;

    // Strategy 1: mesh raycast
    var fills=[];
    earthGroup.traverse(function(o){if(o.isMesh&&o.userData.iso)fills.push(o);});
    var hits=raycaster.intersectObjects(fills,false);
    if(hits.length>0){ setSelected(hits[0].object.userData.iso); return; }

    // Strategy 2: point-in-polygon
    var localPt=earthGroup.worldToLocal(sphereHits[0].point.clone());
    var ll=vec3ToLL(localPt);
    for(var i=0;i<allFeatures.length;i++){
      if(pointInFeature(ll.lon,ll.lat,allFeatures[i])){
        setSelected(allFeatures[i].properties.iso); return;
      }
    }
    // Ocean tap — close
    if(selectedISO){ setSelected(null); }
    closeCard();
  }

  // Load countries
  fetch('https://globevoyage-admin.onrender.com/geodata')
    .then(function(r){return r.json();})
    .then(function(geojson){
      progress(80);
      allFeatures=geojson.features;
      var i=0;
      function batch(){
        var end=Math.min(i+15,allFeatures.length);
        for(;i<end;i++) buildCountryMesh(allFeatures[i]);
        progress(80+Math.round((i/allFeatures.length)*19));
        if(i<allFeatures.length) setTimeout(batch,0);
        else progress(100);
      }
      batch();
    })
    .catch(function(){progress(100);});

  // ── Smooth zoom with proper easing ──
  var zoomVel=0;
  function updateZoom(){
    var diff=targetZ-camZ;
    zoomVel=(zoomVel+diff*0.04)*0.72; // spring physics
    camZ+=zoomVel;
    camera.position.z=camZ;
    // Pause spin at max zoom in
    if(camZ < zMin+0.2 && !selectedISO){
      autoSpin=false;
    } else if(!selectedISO && !isHeld && !isDrag){
      autoSpin=shouldAutoSpin();
    }
  }

  // ── Touch events ──
  function tDist(a,b){var dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;return Math.sqrt(dx*dx+dy*dy);}

  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      var t=e.touches[0];
      lx=t.clientX;ly=t.clientY;
      tapX=t.clientX;tapY=t.clientY;tapT=Date.now();
      isDrag=true;isPinch=false;momX=0;momY=0;isHeld=false;
      holdTimer=setTimeout(function(){isHeld=true;autoSpin=false;},600);
    } else if(e.touches.length===2){
      clearTimeout(holdTimer);isDrag=false;isPinch=true;
      lDist=tDist(e.touches[0],e.touches[1]);
    }
  },{passive:false});

  canvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(isDrag&&e.touches.length===1){
      clearTimeout(holdTimer);
      var t=e.touches[0],dx=t.clientX-lx,dy=t.clientY-ly;
      var s=0.005*(camZ/2.6);
      earthGroup.rotation.y+=dx*s;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+dy*s));
      momX=dx*s;momY=dy*s;
      lx=t.clientX;ly=t.clientY;
      autoSpin=false;
    } else if(isPinch&&e.touches.length===2){
      var d=tDist(e.touches[0],e.touches[1]);
      var delta=(lDist-d)*0.014;
      // Dampen zoom near limits for rubber-band feel
      if(targetZ+delta<zMin) delta*=0.2;
      if(targetZ+delta>zMax) delta*=0.2;
      targetZ=Math.max(zMin,Math.min(zMax,targetZ+delta));
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
      if(now-lastTap<260&&dx<18&&dy2<18){ targetZ=targetZ>2.0?1.45:2.6; }
      lastTap=now;
      if(dx<10&&dy2<10&&dt<280) handleTap(tapX,tapY);
      if(Math.abs(momX)>0.001||Math.abs(momY)>0.001){
        setTimeout(function(){if(!isDrag&&!isHeld&&shouldAutoSpin())autoSpin=true;},1800);
      } else if(shouldAutoSpin()){ autoSpin=true; }
    }
    isDrag=false;isPinch=false;
  },{passive:false});

  // ── Animate ──
  var hlTime=0;
  function animate(){
    requestAnimationFrame(animate);

    if(autoSpin) earthGroup.rotation.y+=spinSpeed;
    if(!isDrag&&!autoSpin&&(Math.abs(momX)>0||Math.abs(momY)>0)){
      earthGroup.rotation.y+=momX;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+momY));
      momX*=fric;momY*=fric;
      if(Math.abs(momX)<0.00008&&Math.abs(momY)<0.00008){ momX=0;momY=0; }
    }

    updateZoom();
    if(cloudMesh) cloudMesh.rotation.y+=spinSpeed*1.12;

    // Animate country highlight — smooth fill + animated border opacity
    hlTime+=0.05;
    Object.keys(highlightTargets).forEach(function(iso){
      var c=countryMap[iso]; if(!c) return;
      var cur=c.fillMat.opacity, tgt=highlightTargets[iso];
      var next=cur+(tgt-cur)*0.11;
      c.fillMat.opacity=next;
      // Pulse the border when selected
      if(iso===selectedISO){
        c.borderMat.opacity=0.7+0.3*Math.sin(hlTime);
      }
      if(Math.abs(next-tgt)<0.001){
        c.fillMat.opacity=tgt;
        if(tgt===0.0) delete highlightTargets[iso];
      }
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
