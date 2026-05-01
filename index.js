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

// ── HEALTH CHECK ──────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "GlobeVoyage API is live 🌍" });
});

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
  https.get(url, (upstream) => upstream.pipe(res))
    .on("error", () => res.status(502).end());
});

// ── GEOJSON PROXY — country borders + names ───────────────────────────
// Caches in memory after first fetch so globe loads fast on repeat visits
let geojsonCache = null;
let geojsonFetching = false;
let geojsonWaiters = [];

function fetchGeoJSON(cb) {
  if (geojsonCache) return cb(null, geojsonCache);
  geojsonWaiters.push(cb);
  if (geojsonFetching) return;
  geojsonFetching = true;

  // Natural Earth 110m countries — tiny (400kb), reliable, has country names
  const url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
  let data = "";
  https.get(url, (res) => {
    res.on("data", (chunk) => data += chunk);
    res.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        // Slim it down — only keep name + geometry to reduce payload size
        parsed.features = parsed.features.map(f => ({
          type: "Feature",
          properties: {
            name: f.properties.NAME || f.properties.name || "Unknown",
            iso:  f.properties.ISO_A3 || "",
          },
          geometry: f.geometry
        }));
        geojsonCache = parsed;
        const waiters = geojsonWaiters.splice(0);
        waiters.forEach(w => w(null, geojsonCache));
      } catch (e) {
        const waiters = geojsonWaiters.splice(0);
        waiters.forEach(w => w(e, null));
      }
      geojsonFetching = false;
    });
  }).on("error", (e) => {
    geojsonFetching = false;
    const waiters = geojsonWaiters.splice(0);
    waiters.forEach(w => w(e, null));
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

// Warm the cache on startup
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
  html,body{width:100%;height:100%;background:#080c14;overflow:hidden;touch-action:none}
  canvas{display:block;touch-action:none;position:absolute;top:0;left:0}
  #ui{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}
  #loading{
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    color:#4fa3ff;font-family:sans-serif;font-size:11px;letter-spacing:3px;
    transition:opacity 0.8s;text-align:center;
  }
  #bar{width:140px;height:2px;background:rgba(79,163,255,0.15);margin:10px auto 0;border-radius:2px;overflow:hidden}
  #fill{height:100%;background:#4fa3ff;width:0%;transition:width 0.4s;border-radius:2px}
  #tooltip{
    position:absolute;bottom:16px;left:50%;transform:translateX(-50%);
    background:rgba(5,10,20,0.92);border:1px solid rgba(79,163,255,0.3);
    color:#d0e4ff;font-family:sans-serif;font-size:13px;letter-spacing:1px;
    padding:7px 20px;border-radius:24px;pointer-events:none;
    opacity:0;transition:opacity 0.25s;white-space:nowrap;
    box-shadow:0 0 20px rgba(79,163,255,0.15);
  }
  #hint{
    position:absolute;top:12px;left:50%;transform:translateX(-50%);
    color:rgba(100,150,210,0.4);font-family:sans-serif;font-size:9px;
    letter-spacing:2px;pointer-events:none;white-space:nowrap;transition:opacity 1.2s;
  }
</style>
</head>
<body>
<div id="loading">LOADING EARTH<div id="bar"><div id="fill"></div></div></div>
<canvas id="c"></canvas>
<div id="ui">
  <div id="hint">DRAG · PINCH · TAP COUNTRY</div>
  <div id="tooltip"></div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
(function(){
  var W=window.innerWidth, H=window.innerHeight;
  var canvas=document.getElementById('c');
  canvas.width=W; canvas.height=H;

  var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setSize(W,H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0x080c14,1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(40,W/H,0.1,1000);
  camera.position.z=2.6;

  // ── Progress ──
  var fill=document.getElementById('fill');
  var loadEl=document.getElementById('loading');
  var step=0;
  function progress(n){
    step=Math.max(step,n);
    fill.style.width=step+'%';
    if(step>=100) setTimeout(function(){loadEl.style.opacity='0';},400);
  }
  progress(5);

  // ── Interaction ──
  var isDrag=false,isPinch=false,autoSpin=true,spinSpeed=0.0014;
  var momX=0,momY=0,fric=0.90;
  var lx=0,ly=0,lDist=0;
  var camZ=2.6,zMin=1.25,zMax=5.0,targetZ=2.6;
  var tapX=0,tapY=0,tapT=0,lastTap=0;
  var holdTimer=null,isHeld=false;

  // ── Stars ──
  (function(){
    var geo=new THREE.BufferGeometry(),v=[];
    for(var i=0;i<1800;i++){
      var th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=50+Math.random()*30;
      v.push(r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph));
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.07})));
  })();

  // ── Lights ──
  scene.add(new THREE.AmbientLight(0x111122,0.4));
  var sun=new THREE.DirectionalLight(0xfff5e0,3.5);
  sun.position.set(6,2,4); scene.add(sun);
  var fill2=new THREE.DirectionalLight(0x0011aa,0.15);
  fill2.position.set(-5,-1,-3); scene.add(fill2);

  // ── Earth group ──
  var earthGroup=new THREE.Group();
  earthGroup.rotation.z=0.41;
  scene.add(earthGroup);

  // ── Country overlay group (on top of earth) ──
  var countryGroup=new THREE.Group();
  earthGroup.add(countryGroup);

  // ── Earth shader ──
  var uEarth={
    dayTexture:{value:null},
    nightTexture:{value:null},
    specTexture:{value:null},
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

  // ── Atmosphere ──
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

  // ── Load textures ──
  var BASE='https://globevoyage-admin.onrender.com/texture/';
  var loader=new THREE.TextureLoader();
  loader.crossOrigin='anonymous';
  var texLoaded=0;
  function onTex(){texLoaded++;progress(10+texLoaded*20);}

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

  // ── Country border/fill rendering ─────────────────────────────────
  // Convert GeoJSON lon/lat to 3D sphere point
  var RADIUS = 1.002; // just above surface
  var BORDER_R = 1.0035;

  function lonLatToVec3(lon, lat, r) {
    var phi = (90 - lat) * Math.PI / 180;
    var theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta)
    );
  }

  // State
  var countryMeshMap = {};   // iso -> {fill, border, name, centroid}
  var selectedISO = null;
  var hoveredISO  = null;

  // Materials
  var matFillDefault = new THREE.MeshBasicMaterial({
    color: 0x2255aa,
    transparent: true,
    opacity: 0.0,      // invisible by default — shows on hover/select
    side: THREE.FrontSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  var raycaster = new THREE.Raycaster();

  // Fan triangulate a polygon ring projected onto sphere
  function buildFillGeo(rings) {
    var positions = [];
    rings.forEach(function(ring) {
      if (ring.length < 3) return;
      // Compute centroid in lon/lat
      var cLon=0, cLat=0;
      ring.forEach(function(p){cLon+=p[0];cLat+=p[1];});
      cLon/=ring.length; cLat/=ring.length;
      var center = lonLatToVec3(cLon, cLat, RADIUS);
      // Fan from centroid
      for (var i = 0; i < ring.length - 1; i++) {
        var a = lonLatToVec3(ring[i][0],   ring[i][1],   RADIUS);
        var b = lonLatToVec3(ring[i+1][0], ring[i+1][1], RADIUS);
        positions.push(center.x,center.y,center.z, a.x,a.y,a.z, b.x,b.y,b.z);
      }
    });
    if (positions.length === 0) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }

  // Build border line segments for a ring
  function buildBorderGeo(rings) {
    var positions = [];
    rings.forEach(function(ring) {
      for (var i = 0; i < ring.length - 1; i++) {
        var a = lonLatToVec3(ring[i][0],   ring[i][1],   BORDER_R);
        var b = lonLatToVec3(ring[i+1][0], ring[i+1][1], BORDER_R);
        positions.push(a.x,a.y,a.z, b.x,b.y,b.z);
      }
    });
    if (positions.length === 0) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }

  function getCentroid(feature) {
    var coords = [];
    var geom = feature.geometry;
    if (!geom) return [0,0];
    function collectRings(g) {
      if (g.type === 'Polygon') coords = coords.concat(g.coordinates[0]);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(function(p){coords=coords.concat(p[0]);});
    }
    collectRings(geom);
    if (!coords.length) return [0,0];
    var lon=0,lat=0;
    coords.forEach(function(p){lon+=p[0];lat+=p[1];});
    return [lon/coords.length, lat/coords.length];
  }

  function buildCountry(feature) {
    var geom = feature.geometry;
    if (!geom) return;
    var iso  = feature.properties.iso  || feature.properties.name;
    var name = feature.properties.name || 'Unknown';

    var fillRings=[], borderRings=[];
    if (geom.type === 'Polygon') {
      fillRings   = geom.coordinates;
      borderRings = geom.coordinates;
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(function(poly){
        fillRings   = fillRings.concat(poly);
        borderRings = borderRings.concat(poly);
      });
    }

    var fillGeo   = buildFillGeo(fillRings);
    var borderGeo = buildBorderGeo(borderRings);

    var fillMat = new THREE.MeshBasicMaterial({
      color: 0x4fa3ff,
      transparent: true,
      opacity: 0.0,
      side: THREE.FrontSide,
      depthWrite: false,
    });

    var borderMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      linewidth: 1,
    });

    var group = new THREE.Group();
    var fillMesh = null;
    if (fillGeo) {
      fillMesh = new THREE.Mesh(fillGeo, fillMat);
      group.add(fillMesh);
    }
    var borderLine = null;
    if (borderGeo) {
      borderLine = new THREE.LineSegments(borderGeo, borderMat);
      group.add(borderLine);
    }

    countryGroup.add(group);

    var centroid = getCentroid(feature);
    countryMeshMap[iso] = {
      group: group,
      fill: fillMesh,
      border: borderLine,
      fillMat: fillMat,
      borderMat: borderMat,
      name: name,
      iso: iso,
      centroid: centroid,
    };
  }

  // Smooth highlight animate
  var highlightTargets = {}; // iso -> target opacity

  function selectCountry(iso) {
    // Deselect previous
    if (selectedISO && countryMeshMap[selectedISO]) {
      highlightTargets[selectedISO] = 0.0;
    }
    if (iso === selectedISO) { selectedISO = null; return; }
    selectedISO = iso;
    if (countryMeshMap[iso]) {
      highlightTargets[iso] = 0.55;
      // Set border bright
      countryMeshMap[iso].borderMat.color.setHex(0x88ccff);
      countryMeshMap[iso].borderMat.opacity = 0.9;
    }
  }

  function hoverCountry(iso) {
    if (iso === hoveredISO) return;
    // Un-hover old
    if (hoveredISO && hoveredISO !== selectedISO && countryMeshMap[hoveredISO]) {
      highlightTargets[hoveredISO] = 0.0;
      countryMeshMap[hoveredISO].borderMat.color.setHex(0xffffff);
      countryMeshMap[hoveredISO].borderMat.opacity = 0.22;
    }
    hoveredISO = iso;
    if (iso && iso !== selectedISO && countryMeshMap[iso]) {
      highlightTargets[iso] = 0.22;
    }
  }

  // ── Fetch geodata and build country meshes ──
  fetch('https://globevoyage-admin.onrender.com/geodata')
    .then(function(r){return r.json();})
    .then(function(geojson){
      progress(85);
      // Build in batches to avoid blocking
      var features = geojson.features;
      var i = 0;
      function buildBatch(){
        var end = Math.min(i + 20, features.length);
        for (; i < end; i++) buildCountry(features[i]);
        progress(85 + Math.round((i/features.length)*14));
        if (i < features.length) setTimeout(buildBatch, 0);
        else progress(100);
      }
      buildBatch();
    })
    .catch(function(e){ console.error('geodata error', e); progress(100); });

  // ── Tooltip ──
  var tipEl=document.getElementById('tooltip');
  var tipTimer;
  function showTip(txt, persist){
    clearTimeout(tipTimer);
    tipEl.textContent=txt; tipEl.style.opacity='1';
    if(!persist) tipTimer=setTimeout(function(){tipEl.style.opacity='0';},2800);
  }
  function hideTip(){ clearTimeout(tipTimer); tipEl.style.opacity='0'; }

  // ── Touch handling ──
  function touchDist(a,b){var dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;return Math.sqrt(dx*dx+dy*dy);}

  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      var t=e.touches[0];
      lx=t.clientX;ly=t.clientY;
      tapX=t.clientX;tapY=t.clientY;tapT=Date.now();
      isDrag=true;isPinch=false;momX=0;momY=0;isHeld=false;
      holdTimer=setTimeout(function(){isHeld=true;autoSpin=false;showTip('⏸  Globe locked',true);},600);
    } else if(e.touches.length===2){
      clearTimeout(holdTimer);isDrag=false;isPinch=true;
      lDist=touchDist(e.touches[0],e.touches[1]);
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
      var d=touchDist(e.touches[0],e.touches[1]);
      targetZ=Math.max(zMin,Math.min(zMax,targetZ+(lDist-d)*0.012));
      lDist=d;
    }
  },{passive:false});

  canvas.addEventListener('touchend',function(e){
    e.preventDefault();
    clearTimeout(holdTimer);
    var now=Date.now();
    if(e.changedTouches.length===1){
      var cx=e.changedTouches[0].clientX, cy=e.changedTouches[0].clientY;
      var dx=Math.abs(cx-tapX), dy2=Math.abs(cy-tapY), dt=now-tapT;

      // Double tap zoom
      if(now-lastTap<260&&dx<18&&dy2<18){
        targetZ = targetZ>2.0 ? 1.5 : 2.6;
      }
      lastTap=now;

      // Tap = raycast
      if(dx<10&&dy2<10&&dt<280){
        var ndc=new THREE.Vector2((tapX/W)*2-1,-(tapY/H)*2+1);
        raycaster.setFromCamera(ndc,camera);
        // Collect all fill meshes
        var fillMeshes=[];
        Object.keys(countryMeshMap).forEach(function(k){
          if(countryMeshMap[k].fill) fillMeshes.push(countryMeshMap[k].fill);
        });
        var hits=raycaster.intersectObjects(fillMeshes);
        var sphereHit=raycaster.intersectObject(earthMesh);

        if(hits.length>0){
          // Find which country
          var hitMesh=hits[0].object;
          var found=null;
          Object.keys(countryMeshMap).forEach(function(k){
            if(countryMeshMap[k].fill===hitMesh) found=k;
          });
          if(found){
            selectCountry(found);
            showTip('📍 '+countryMeshMap[found].name, true);
          }
        } else if(sphereHit.length>0){
          // Tapped ocean — deselect
          if(selectedISO){
            highlightTargets[selectedISO]=0.0;
            if(countryMeshMap[selectedISO]){
              countryMeshMap[selectedISO].borderMat.color.setHex(0xffffff);
              countryMeshMap[selectedISO].borderMat.opacity=0.22;
            }
            selectedISO=null;
          }
          hideTip();
        }
      }

      // Momentum
      if(Math.abs(momX)>0.001||Math.abs(momY)>0.001){
        setTimeout(function(){if(!isDrag&&!isHeld)autoSpin=true;},1800);
      } else if(!isHeld){
        autoSpin=true;
      }
    }
    isDrag=false;isPinch=false;
  },{passive:false});

  // ── Animate ──
  function animate(){
    requestAnimationFrame(animate);

    if(autoSpin) earthGroup.rotation.y+=spinSpeed;
    if(!isDrag&&!autoSpin){
      earthGroup.rotation.y+=momX;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+momY));
      momX*=fric; momY*=fric;
      if(Math.abs(momX)<0.00008&&Math.abs(momY)<0.00008){momX=0;momY=0;if(!isHeld)autoSpin=true;}
    }

    // Smooth zoom
    camZ+=(targetZ-camZ)*0.10;
    camera.position.z=camZ;

    // Cloud spin
    if(cloudMesh) cloudMesh.rotation.y+=spinSpeed*1.15;

    // Animate highlight opacities
    Object.keys(highlightTargets).forEach(function(iso){
      var entry=countryMeshMap[iso];
      if(!entry||!entry.fillMat) return;
      var cur=entry.fillMat.opacity;
      var target=highlightTargets[iso];
      var next=cur+(target-cur)*0.12;
      entry.fillMat.opacity=next;
      if(Math.abs(next-target)<0.001){
        entry.fillMat.opacity=target;
        if(target===0.0){
          entry.borderMat.color.setHex(0xffffff);
          entry.borderMat.opacity=0.22;
          delete highlightTargets[iso];
        }
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
