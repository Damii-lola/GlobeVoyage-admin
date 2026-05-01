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

// ── GEOJSON — fetched once, cached forever in memory ─────────────────
let geojsonCache = null;
let geojsonReady = false;
let geojsonWaiters = [];

function ensureGeoJSON(cb) {
  if (geojsonReady) return cb(null, geojsonCache);
  geojsonWaiters.push(cb);
  if (geojsonWaiters.length > 1) return; // already fetching
  const url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
  let raw = "";
  https.get(url, (res) => {
    res.on("data", c => raw += c);
    res.on("end", () => {
      try {
        const parsed = JSON.parse(raw);
        // Slim payload — only fields the globe actually uses
        parsed.features = parsed.features.map(f => ({
          type: "Feature",
          properties: {
            name:      f.properties.NAME      || "Unknown",
            iso:       f.properties.ISO_A3    || f.properties.NAME || "Unknown",
            continent: f.properties.CONTINENT || "",
            pop:       f.properties.POP_EST   || 0,
            area:      f.properties.AREA      || 0,
          },
          geometry: f.geometry
        }));
        geojsonCache = parsed;
        geojsonReady = true;
        geojsonWaiters.splice(0).forEach(w => w(null, geojsonCache));
      } catch(e) {
        geojsonWaiters.splice(0).forEach(w => w(e, null));
      }
    });
  }).on("error", e => {
    geojsonWaiters.splice(0).forEach(w => w(e, null));
  });
}

// Still expose /geodata for any other clients
app.get("/geodata", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=3600");
  ensureGeoJSON((err, data) => {
    if (err) return res.status(502).json({ error: "Failed" });
    res.json(data);
  });
});

// Warm cache at startup
ensureGeoJSON(() => console.log("GeoJSON ready ✓"));

// ── GLOBE PAGE — GeoJSON inlined, zero extra round-trips ──────────────
app.get("/globe", (req, res) => {
  ensureGeoJSON((err, geojson) => {
    // If geodata isn't ready yet (first cold boot), wait for it
    // It'll be cached for all subsequent requests
    const geoInline = err ? '{"features":[]}' : JSON.stringify(geojson);

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-cache"); // always re-check for fresh HTML
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#080c14;overflow:hidden;touch-action:none}
  canvas{display:block;touch-action:none;position:absolute;top:0;left:0}
  #loading{
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    color:#4fa3ff;font-family:sans-serif;font-size:11px;letter-spacing:3px;
    transition:opacity 0.8s;text-align:center;pointer-events:none;
  }
  #bar{width:140px;height:2px;background:rgba(79,163,255,0.15);margin:10px auto 0;border-radius:2px;overflow:hidden}
  #fill{height:100%;background:#4fa3ff;width:0%;transition:width 0.3s;border-radius:2px}
  #hint{
    position:absolute;top:10px;left:50%;transform:translateX(-50%);
    color:rgba(100,150,210,0.4);font-family:sans-serif;font-size:9px;
    letter-spacing:2px;pointer-events:none;white-space:nowrap;transition:opacity 1.2s;
  }
  #card{
    position:absolute;bottom:0;left:0;right:0;
    background:linear-gradient(180deg,rgba(5,12,28,0.0) 0%,rgba(5,12,28,0.97) 18%);
    padding:28px 22px 22px;
    transform:translateY(100%);
    transition:transform 0.38s cubic-bezier(0.22,0.9,0.36,1);
    pointer-events:none;
  }
  #card.open{transform:translateY(0%);pointer-events:all}
  #card-flag{font-size:32px;line-height:1;margin-bottom:6px}
  #card-name{color:#fff;font-family:sans-serif;font-size:17px;font-weight:700;letter-spacing:1px;margin-bottom:3px}
  #card-meta{color:#4fa3ff;font-family:sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;opacity:0.8}
  #card-stats{display:flex;margin-bottom:14px;border:1px solid rgba(79,163,255,0.12);border-radius:10px;overflow:hidden}
  .stat{flex:1;padding:9px 0;text-align:center;border-right:1px solid rgba(79,163,255,0.10)}
  .stat:last-child{border-right:none}
  .stat-val{color:#c9e0ff;font-family:sans-serif;font-size:12px;font-weight:700}
  .stat-lbl{color:#3a5a88;font-family:sans-serif;font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-top:2px}
  #card-desc{color:#8aa8cc;font-family:sans-serif;font-size:12px;line-height:1.65;margin-bottom:16px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  #card-row{display:flex;gap:10px;align-items:center}
  #btn-dest{flex:1;background:linear-gradient(135deg,#1a5fd4,#0e3fa8);border:1px solid rgba(79,163,255,0.35);color:#d0e8ff;font-family:sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:11px 0;border-radius:12px;cursor:pointer;text-align:center;transition:opacity 0.15s}
  #btn-dest:active{opacity:0.75}
  #btn-close{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#667;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  #btn-close:active{background:rgba(255,255,255,0.14)}
</style>
</head>
<body>
<div id="loading">LOADING EARTH<div id="bar"><div id="fill"></div></div></div>
<canvas id="c"></canvas>
<div id="hint">DRAG · PINCH · TAP COUNTRY</div>
<div id="card">
  <div id="card-flag"></div>
  <div id="card-name"></div>
  <div id="card-meta"></div>
  <div id="card-stats">
    <div class="stat"><div class="stat-val" id="stat-pop">—</div><div class="stat-lbl">Population</div></div>
    <div class="stat"><div class="stat-val" id="stat-cont">—</div><div class="stat-lbl">Continent</div></div>
    <div class="stat"><div class="stat-val" id="stat-area">—</div><div class="stat-lbl">Area km²</div></div>
  </div>
  <div id="card-desc"></div>
  <div id="card-row">
    <div id="btn-dest">✈  Destinations</div>
    <div id="btn-close">✕</div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/earcut@2.2.4/src/earcut.min.js"></script>

<!-- GeoJSON inlined — zero extra HTTP round-trip -->
<script>var GEOJSON=${geoInline};</script>

<script>
(function(){
  var W=window.innerWidth,H=window.innerHeight;
  var canvas=document.getElementById('c');
  canvas.width=W;canvas.height=H;

  var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setSize(W,H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0x080c14,1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(40,W/H,0.1,1000);
  camera.position.z=2.6;

  var fillEl=document.getElementById('fill');
  var loadEl=document.getElementById('loading');
  var prog=0;
  function progress(n){
    prog=Math.max(prog,n);
    fillEl.style.width=prog+'%';
    if(prog>=100)setTimeout(function(){loadEl.style.opacity='0';},300);
  }
  progress(10); // geodata already here, start at 10%

  // Interaction
  var isDrag=false,isPinch=false,autoSpin=true,spinSpeed=0.0014;
  var momX=0,momY=0,fric=0.90,lx=0,ly=0,lDist=0;
  var baseFOV=40,currentFOV=40,targetFOV=40,fovMin=12,fovMax=70;
  var tapX=0,tapY=0,tapT=0,lastTap=0;
  var holdTimer=null,isHeld=false,cardOpen=false;

  // Stars
  (function(){
    var geo=new THREE.BufferGeometry(),v=[];
    for(var i=0;i<1800;i++){
      var th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=50+Math.random()*30;
      v.push(r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph));
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.07})));
  })();

  // Lights
  scene.add(new THREE.AmbientLight(0x111122,0.4));
  var sun=new THREE.DirectionalLight(0xfff5e0,3.5);
  sun.position.set(6,2,4);scene.add(sun);
  var fl=new THREE.DirectionalLight(0x0011aa,0.15);
  fl.position.set(-5,-1,-3);scene.add(fl);

  // Earth group
  var earthGroup=new THREE.Group();
  earthGroup.rotation.z=0.41;
  scene.add(earthGroup);

  // Earth shader
  var uEarth={
    dayTexture:{value:null},nightTexture:{value:null},specTexture:{value:null},
    sunDirection:{value:new THREE.Vector3(0.8,0.25,0.5).normalize()},
  };
  var earthMesh=new THREE.Mesh(
    new THREE.SphereGeometry(1,64,64),
    new THREE.ShaderMaterial({
      uniforms:uEarth,
      vertexShader:\`
        varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;
        void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);
        vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
      \`,
      fragmentShader:\`
        precision highp float;
        uniform sampler2D dayTexture;uniform sampler2D nightTexture;uniform sampler2D specTexture;
        uniform vec3 sunDirection;
        varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;
        void main(){
          vec3 n=normalize(vNormal);vec3 sun=normalize(sunDirection);
          float cosA=dot(n,sun);float dayA=smoothstep(-0.25,0.5,cosA);
          vec3 day=texture2D(dayTexture,vUv).rgb;
          vec3 night=texture2D(nightTexture,vUv).rgb*1.8;
          vec3 spec=texture2D(specTexture,vUv).rgb;
          vec3 color=mix(night,day,dayA);
          vec3 vd=normalize(cameraPosition-vWorldPos);
          float sp=pow(max(dot(n,normalize(sun+vd)),0.0),80.0);
          color+=vec3(0.55,0.68,0.9)*sp*spec.r*dayA*0.75;
          float rim=pow(1.0-max(dot(n,vd),0.0),4.0);
          color=mix(color,mix(vec3(0.05,0.08,0.25),vec3(0.3,0.6,1.0),dayA),rim*0.65);
          gl_FragColor=vec4(color,1.0);
        }
      \`
    })
  );
  earthGroup.add(earthMesh);

  // Atmosphere
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.08,48,48),
    new THREE.ShaderMaterial({
      uniforms:{sunDir:{value:new THREE.Vector3(0.8,0.25,0.5).normalize()}},
      vertexShader:\`varying vec3 vN,vP;void main(){vN=normal;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}\`,
      fragmentShader:\`uniform vec3 sunDir;varying vec3 vN,vP;void main(){
        vec3 vd=normalize(cameraPosition-(modelMatrix*vec4(vP,1.0)).xyz);
        float rim=pow(1.0-abs(dot(normalize(vN),vd)),2.8);
        float d=dot(normalize((normalMatrix*vec4(vN,0.0)).xyz),normalize(sunDir));
        vec3 col=mix(vec3(0.04,0.08,0.35),vec3(0.25,0.55,1.0),smoothstep(-0.2,0.5,d));
        gl_FragColor=vec4(col,rim*0.55);}\`,
      transparent:true,side:THREE.FrontSide,depthWrite:false,blending:THREE.AdditiveBlending
    })
  ));

  // Textures — load in parallel, globe already spinning while they stream in
  var BASE='https://globevoyage-admin.onrender.com/texture/';
  var loader=new THREE.TextureLoader();
  loader.crossOrigin='anonymous';
  var texLoaded=0;
  function onTex(){texLoaded++;progress(30+texLoaded*22);}
  loader.load(BASE+'earth-day',  function(t){t.anisotropy=renderer.capabilities.getMaxAnisotropy();uEarth.dayTexture.value=t;onTex();},undefined,function(){onTex();});
  loader.load(BASE+'earth-night',function(t){uEarth.nightTexture.value=t;onTex();},undefined,function(){onTex();});
  loader.load(BASE+'earth-water',function(t){uEarth.specTexture.value=t;onTex();},undefined,function(){onTex();});
  var cloudMesh;
  loader.load(BASE+'earth-clouds',function(t){
    cloudMesh=new THREE.Mesh(
      new THREE.SphereGeometry(1.012,48,48),
      new THREE.MeshPhongMaterial({map:t,transparent:true,opacity:0.78,depthWrite:false,blending:THREE.AdditiveBlending})
    );
    earthGroup.add(cloudMesh);
  });

  // ── Country system ─────────────────────────────────────────────────
  var FILL_R=1.003,BORDER_R=1.004;
  function ll2v(lon,lat,r){
    var phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180;
    return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta));
  }
  function triPoly(rings){
    var coords=[],holes=[];
    rings[0].forEach(function(p){coords.push(p[0],p[1]);});
    var off=rings[0].length;
    for(var i=1;i<rings.length;i++){holes.push(off);rings[i].forEach(function(p){coords.push(p[0],p[1]);});off+=rings[i].length;}
    var idx=earcut(coords,holes.length?holes:null,2);
    if(!idx||!idx.length)return null;
    var pos=[];
    for(var t=0;t<idx.length;t++){var i=idx[t],v=ll2v(coords[i*2],coords[i*2+1],FILL_R);pos.push(v.x,v.y,v.z);}
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
    var geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    return geo;
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

  var countryMap={},allFeatures=[],selectedISO=null,highlightTargets={};

  function getAllRings(f){
    var g=f.geometry;if(!g)return[];
    if(g.type==='Polygon')return g.coordinates;
    if(g.type==='MultiPolygon'){var r=[];g.coordinates.forEach(function(p){r=r.concat(p);});return r;}
    return[];
  }

  function buildCountry(f){
    var iso=f.properties.iso,name=f.properties.name;
    var rings=getAllRings(f);if(!rings.length)return;
    var fillMat=new THREE.MeshBasicMaterial({color:0x4fa3ff,transparent:true,opacity:0.0,side:THREE.DoubleSide,depthWrite:false});
    var borderMat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.28,linewidth:1});
    var group=new THREE.Group();
    try{
      if(f.geometry.type==='Polygon'){
        var g=triPoly(f.geometry.coordinates);
        if(g){var m=new THREE.Mesh(g,fillMat);m.userData.iso=iso;group.add(m);}
      }else if(f.geometry.type==='MultiPolygon'){
        f.geometry.coordinates.forEach(function(poly){
          var g=triPoly(poly);
          if(g){var m=new THREE.Mesh(g,fillMat);m.userData.iso=iso;group.add(m);}
        });
      }
    }catch(e){}
    var bg=buildBorder(rings);
    if(bg)group.add(new THREE.LineSegments(bg,borderMat));
    earthGroup.add(group);
    countryMap[iso]={fillMat:fillMat,borderMat:borderMat,name:name,iso:iso,props:f.properties};
  }

  function setSelected(iso){
    if(selectedISO&&countryMap[selectedISO]){
      highlightTargets[selectedISO]=0.0;
      countryMap[selectedISO].borderMat.color.setHex(0xffffff);
      countryMap[selectedISO].borderMat.opacity=0.28;
    }
    if(iso===selectedISO){selectedISO=null;closeCard();return;}
    selectedISO=iso;
    if(countryMap[iso]){
      highlightTargets[iso]=0.48;
      countryMap[iso].borderMat.color.setHex(0x88ccff);
      countryMap[iso].borderMat.opacity=1.0;
    }
  }

  // Country descriptions
  var DESC={
    'USA':'A vast nation of 50 states spanning North America, known for its cultural diversity, world-leading economy, and iconic landmarks from the Grand Canyon to Manhattan.',
    'CAN':'The world\'s second-largest country by area, Canada is celebrated for its stunning natural landscapes, multicultural cities, and welcoming people.',
    'GBR':'A historic island nation that once commanded the world\'s largest empire. Home to London, the British countryside, and centuries of art, science, and culture.',
    'FRA':'The most visited country on Earth, France dazzles with its cuisine, fashion, art, and iconic landmarks including the Eiffel Tower and the French Riviera.',
    'DEU':'Europe\'s largest economy, Germany blends medieval castles and fairy-tale villages with cutting-edge engineering and a rich philosophical heritage.',
    'ITA':'A living museum of Western civilization, Italy gave the world the Renaissance, Roman engineering, and some of the finest food and fashion on the planet.',
    'ESP':'Vibrant and passionate, Spain is famous for flamenco, stunning architecture by Gaudí, world-class football, and a coastline stretching for thousands of kilometres.',
    'RUS':'The world\'s largest country by land area, Russia spans eleven time zones from Eastern Europe to the Pacific, with a deep literary and artistic tradition.',
    'CHN':'Home to over 1.4 billion people, China is an ancient civilisation that has become the world\'s manufacturing powerhouse and a rising global superpower.',
    'IND':'The world\'s most populous democracy, India is a land of extraordinary diversity in language, religion, cuisine, and landscape from the Himalayas to tropical beaches.',
    'BRA':'South America\'s giant, Brazil is home to the world\'s largest rainforest, the Amazon, as well as vibrant carnival culture and stunning Atlantic coastline.',
    'AUS':'An island continent of dramatic contrasts from the red deserts of the Outback to the Great Barrier Reef, with a laid-back culture and unique wildlife.',
    'NGA':'Africa\'s most populous nation and largest economy, Nigeria pulses with creative energy, from Afrobeats music to Nollywood, the world\'s second-largest film industry.',
    'ZAF':'The Rainbow Nation sits at Africa\'s southern tip, offering incredible biodiversity, Cape Town\'s beauty, the Kruger safari, and a hard-won democratic spirit.',
    'EGY':'One of the world\'s oldest civilisations, Egypt straddles Africa and Asia along the Nile, home to the pyramids, ancient temples, and the timeless city of Cairo.',
    'JPN':'An archipelago of remarkable contrasts — ancient temples beside neon skylines, bullet trains, world-renowned cuisine, and a deep culture of craftsmanship.',
    'MEX':'A land of ancient Aztec and Mayan civilisations, Mexico enchants with colourful culture, spicy cuisine, colonial architecture, and warm Pacific and Caribbean coasts.',
    'ARG':'A South American giant of tango, steak, and football, Argentina stretches from the Andes to Patagonia, with the sophisticated city of Buenos Aires.',
    'SAU':'The birthplace of Islam and custodian of its holiest sites, Saudi Arabia is a vast desert kingdom undergoing rapid modernisation atop the world\'s largest oil reserves.',
    'IDN':'The world\'s largest archipelago nation — over 17,000 islands — Indonesia is home to extraordinary biodiversity, ancient temples, and a mosaic of cultures.',
    'TUR':'Straddling two continents, Turkey is where East meets West, offering Istanbul\'s magnificent mosques, ancient ruins, turquoise coasts, and rich culinary traditions.',
    'KEN':'East Africa\'s gateway, Kenya is famed for the Great Migration on the Masai Mara, Nairobi\'s vibrant tech scene, and stunning Rift Valley scenery.',
    'GHA':'West Africa\'s beacon of stability and democracy, Ghana is known for its warm hospitality, rich Ashanti culture, historic forts, and the birthplace of Pan-Africanism.',
    'ETH':'Africa\'s oldest independent nation, Ethiopia is a land of ancient Orthodox churches, the cradle of coffee, and dramatic highland landscapes stretching back millennia.',
    'PAK':'A nation of 230 million at the crossroads of South and Central Asia, Pakistan offers K2 and the Karakoram peaks and the ancient Indus Valley civilisation.',
    'UKR':'Eastern Europe\'s largest country, Ukraine has fertile black-earth farmlands earning it the title breadbasket of Europe, and a proud and resilient people.',
    'MAR':'Where the Sahara meets the Atlantic and Mediterranean, Morocco enchants with ancient medinas, spice-filled souks, dramatic Atlas Mountains, and world-famous cuisine.',
    'PER':'Home to Machu Picchu and the heart of the Inca Empire, Peru is one of the world\'s great archaeological destinations, paired with Amazon rainforest.',
    'COL':'Emerging as one of South America\'s most exciting destinations, Colombia offers Caribbean beaches, coffee highlands, and Cartagena\'s colonial splendour.',
    'NZL':'Two dramatic islands at the bottom of the Pacific, New Zealand is renowned for breathtaking fjords, volcanoes, beaches, and the indigenous Māori culture.',
  };
  function getDesc(iso){return DESC[iso]||'A fascinating country with a rich culture, unique history, and landscapes that invite exploration. Tap Destinations to discover travel experiences here.';}

  // Card UI
  var card=document.getElementById('card');
  var ISO3TO2={'USA':'US','CAN':'CA','GBR':'GB','FRA':'FR','DEU':'DE','ITA':'IT','ESP':'ES','RUS':'RU','CHN':'CN','IND':'IN','BRA':'BR','AUS':'AU','NGA':'NG','ZAF':'ZA','EGY':'EG','JPN':'JP','MEX':'MX','ARG':'AR','SAU':'SA','IDN':'ID','TUR':'TR','KEN':'KE','GHA':'GH','ETH':'ET','PAK':'PK','UKR':'UA','MAR':'MA','PER':'PE','COL':'CO','NZL':'NZ','NLD':'NL','BEL':'BE','CHE':'CH','AUT':'AT','SWE':'SE','NOR':'NO','DNK':'DK','FIN':'FI','POL':'PL','PRT':'PT','GRC':'GR','CZE':'CZ','HUN':'HU','ROU':'RO','BGR':'BG','SRB':'RS','HRV':'HR','ISR':'IL','IRN':'IR','IRQ':'IQ','JOR':'JO','ARE':'AE','QAT':'QA','KWT':'KW','AFG':'AF','BGD':'BD','LKA':'LK','THA':'TH','VNM':'VN','MYS':'MY','SGP':'SG','PHL':'PH','KOR':'KR','DZA':'DZ','TUN':'TN','SDN':'SD','TZA':'TZ','UGA':'UG','MOZ':'MZ','ZMB':'ZM','ZWE':'ZW','AGO':'AO','COD':'CD','CMR':'CM','SEN':'SN','CIV':'CI','CHL':'CL','BOL':'BO','PRY':'PY','URY':'UY','VEN':'VE','ECU':'EC','PAN':'PA','CRI':'CR','GTM':'GT','CUB':'CU','DOM':'DO','ISL':'IS','IRL':'IE','LUX':'LU','MLT':'MT','CYP':'CY'};
  function getFlag(iso){
    var i2=ISO3TO2[iso];if(!i2)return'🌍';
    return i2.toUpperCase().replace(/./g,function(c){return String.fromCodePoint(0x1F1E6-65+c.charCodeAt(0));});
  }
  function fmtPop(n){if(!n)return'—';if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(0)+'K';return''+n;}
  function fmtArea(n){if(!n)return'—';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(0)+'K';return''+n;}

  function openCard(iso){
    var c=countryMap[iso];if(!c)return;
    var p=c.props;
    document.getElementById('card-flag').textContent=getFlag(iso);
    document.getElementById('card-name').textContent=c.name;
    document.getElementById('card-meta').textContent=(p.continent||'').toUpperCase();
    document.getElementById('stat-pop').textContent=fmtPop(p.pop);
    document.getElementById('stat-cont').textContent=p.continent?p.continent.split(' ')[0]:'—';
    document.getElementById('stat-area').textContent=fmtArea(p.area);
    document.getElementById('card-desc').textContent=getDesc(iso);
    card.classList.add('open');
    cardOpen=true;autoSpin=false;
  }
  function closeCard(){
    card.classList.remove('open');
    cardOpen=false;
    if(!isHeld)setTimeout(function(){if(!cardOpen)autoSpin=true;},600);
  }
  document.getElementById('btn-close').addEventListener('click',function(){
    if(selectedISO)setSelected(null);
    closeCard();
  });
  document.getElementById('btn-dest').addEventListener('click',function(){
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type:'DESTINATIONS',
        country:selectedISO,
        name:selectedISO&&countryMap[selectedISO]?countryMap[selectedISO].name:''
      }));
    }
  });

  // Raycaster + tap
  var raycaster=new THREE.Raycaster();
  function handleTap(sx,sy){
    var ndc=new THREE.Vector2((sx/W)*2-1,-(sy/H)*2+1);
    raycaster.setFromCamera(ndc,camera);
    var sh=raycaster.intersectObject(earthMesh);
    if(!sh.length){if(cardOpen){closeCard();if(selectedISO)setSelected(null);}return;}
    var fills=[];earthGroup.traverse(function(o){if(o.isMesh&&o.userData.iso)fills.push(o);});
    var mh=raycaster.intersectObjects(fills,false);
    if(mh.length>0){var iso=mh[0].object.userData.iso;setSelected(iso);openCard(iso);return;}
    var lp=earthGroup.worldToLocal(sh[0].point.clone());
    var ll=v3toll(lp);
    for(var i=0;i<allFeatures.length;i++){
      if(pipFeature(ll.lon,ll.lat,allFeatures[i])){
        var iso2=allFeatures[i].properties.iso;setSelected(iso2);openCard(iso2);return;
      }
    }
    if(selectedISO)setSelected(null);
    closeCard();
  }

  // ── Build all country meshes immediately — data is already here ──
  allFeatures=GEOJSON.features||[];
  progress(20);
  var bi=0;
  function batch(){
    var end=Math.min(bi+20,allFeatures.length);
    for(;bi<end;bi++)buildCountry(allFeatures[bi]);
    progress(20+Math.round((bi/allFeatures.length)*10));
    if(bi<allFeatures.length)setTimeout(batch,0);
    // Countries done by ~30% — rest of bar is texture loading
  }
  batch();

  // Touch events
  function tDist(a,b){var dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;return Math.sqrt(dx*dx+dy*dy);}
  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      var t=e.touches[0];lx=t.clientX;ly=t.clientY;tapX=t.clientX;tapY=t.clientY;tapT=Date.now();
      isDrag=true;isPinch=false;momX=0;momY=0;isHeld=false;
      holdTimer=setTimeout(function(){isHeld=true;autoSpin=false;},600);
    }else if(e.touches.length===2){
      clearTimeout(holdTimer);isDrag=false;isPinch=true;lDist=tDist(e.touches[0],e.touches[1]);
    }
  },{passive:false});
  canvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(isDrag&&e.touches.length===1){
      clearTimeout(holdTimer);
      var t=e.touches[0],dx=t.clientX-lx,dy=t.clientY-ly;
      var s=0.004*(currentFOV/baseFOV);
      earthGroup.rotation.y+=dx*s;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+dy*s));
      momX=dx*s;momY=dy*s;lx=t.clientX;ly=t.clientY;autoSpin=false;
    }else if(isPinch&&e.touches.length===2){
      var d=tDist(e.touches[0],e.touches[1]);
      targetFOV=Math.max(fovMin,Math.min(fovMax,targetFOV+(lDist-d)*0.12));
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
      if(now-lastTap<260&&dx<18&&dy2<18)targetFOV=currentFOV<baseFOV*0.6?baseFOV:22;
      lastTap=now;
      if(dx<10&&dy2<10&&dt<280)handleTap(tapX,tapY);
      if(Math.abs(momX)>0.001||Math.abs(momY)>0.001){
        setTimeout(function(){if(!isDrag&&!isHeld&&!cardOpen)autoSpin=true;},1800);
      }else if(!isHeld&&!cardOpen)autoSpin=true;
    }
    isDrag=false;isPinch=false;
  },{passive:false});

  // Animate
  function animate(){
    requestAnimationFrame(animate);
    if(autoSpin)earthGroup.rotation.y+=spinSpeed;
    if(!isDrag&&!autoSpin){
      earthGroup.rotation.y+=momX;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+momY));
      momX*=fric;momY*=fric;
      if(Math.abs(momX)<0.00008&&Math.abs(momY)<0.00008){momX=0;momY=0;if(!isHeld&&!cardOpen)autoSpin=true;}
    }
    currentFOV+=(targetFOV-currentFOV)*0.09;
    camera.fov=currentFOV;camera.updateProjectionMatrix();
    if(cloudMesh)cloudMesh.rotation.y+=spinSpeed*1.15;
    Object.keys(highlightTargets).forEach(function(iso){
      var c=countryMap[iso];if(!c)return;
      var cur=c.fillMat.opacity,tgt=highlightTargets[iso],next=cur+(tgt-cur)*0.12;
      c.fillMat.opacity=next;
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
