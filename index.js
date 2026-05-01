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
  html,body{width:100%;height:100%;background:#080c14;overflow:hidden;touch-action:none}
  canvas{display:block;touch-action:none;position:absolute;top:0;left:0}
  #loading{
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    color:#4fa3ff;font-family:sans-serif;font-size:11px;letter-spacing:3px;
    transition:opacity 0.8s;text-align:center;pointer-events:none;
  }
  #bar{width:140px;height:2px;background:rgba(79,163,255,0.15);margin:10px auto 0;border-radius:2px;overflow:hidden}
  #fill{height:100%;background:#4fa3ff;width:0%;transition:width 0.3s;border-radius:2px}
  #tooltip{
    position:absolute;bottom:16px;left:50%;transform:translateX(-50%);
    background:rgba(5,10,20,0.92);border:1px solid rgba(79,163,255,0.3);
    color:#d0e4ff;font-family:sans-serif;font-size:13px;letter-spacing:1px;
    padding:7px 20px;border-radius:24px;pointer-events:none;
    opacity:0;transition:opacity 0.25s;white-space:nowrap;
    box-shadow:0 0 20px rgba(79,163,255,0.12);
  }
  #hint{
    position:absolute;top:10px;left:50%;transform:translateX(-50%);
    color:rgba(100,150,210,0.4);font-family:sans-serif;font-size:9px;
    letter-spacing:2px;pointer-events:none;white-space:nowrap;transition:opacity 1.2s;
  }
</style>
</head>
<body>
<div id="loading">LOADING EARTH<div id="bar"><div id="fill"></div></div></div>
<canvas id="c"></canvas>
<div id="hint">DRAG · PINCH · TAP COUNTRY</div>
<div id="tooltip"></div>

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
  renderer.setClearColor(0x080c14,1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(40,W/H,0.1,1000);
  camera.position.z=2.6;

  // Progress bar
  var fillEl=document.getElementById('fill');
  var loadEl=document.getElementById('loading');
  var prog=0;
  function progress(n){
    prog=Math.max(prog,n);
    fillEl.style.width=prog+'%';
    if(prog>=100) setTimeout(function(){loadEl.style.opacity='0';},400);
  }
  progress(5);

  // Interaction state
  var isDrag=false, isPinch=false;
  var autoSpin=true, spinSpeed=0.0014;
  var momX=0, momY=0, fric=0.90;
  var lx=0, ly=0, lDist=0;
  var targetZ=2.6, camZ=2.6, zMin=1.2, zMax=5.0;
  var tapX=0, tapY=0, tapT=0, lastTap=0;
  var holdTimer=null, isHeld=false;

  // Stars
  (function(){
    var geo=new THREE.BufferGeometry(), v=[];
    for(var i=0;i<1800;i++){
      var th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1), r=50+Math.random()*30;
      v.push(r*Math.sin(ph)*Math.cos(th), r*Math.sin(ph)*Math.sin(th), r*Math.cos(ph));
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.07})));
  })();

  // Lights
  scene.add(new THREE.AmbientLight(0x111122,0.4));
  var sun=new THREE.DirectionalLight(0xfff5e0,3.5);
  sun.position.set(6,2,4); scene.add(sun);
  var fillLight=new THREE.DirectionalLight(0x0011aa,0.15);
  fillLight.position.set(-5,-1,-3); scene.add(fillLight);

  // Earth group
  var earthGroup=new THREE.Group();
  earthGroup.rotation.z=0.41;
  scene.add(earthGroup);

  // Earth shader
  var uEarth={
    dayTexture:{value:null}, nightTexture:{value:null}, specTexture:{value:null},
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

  // Textures
  var BASE='https://globevoyage-admin.onrender.com/texture/';
  var loader=new THREE.TextureLoader();
  loader.crossOrigin='anonymous';
  var texLoaded=0;
  function onTex(){texLoaded++;progress(10+texLoaded*18);}
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
  var FILL_R   = 1.003;
  var BORDER_R = 1.004;

  // lon/lat → 3D (THREE.js standard: Y=up, matches sphere UVs)
  function ll2v(lon, lat, r) {
    var phi   = (90 - lat)  * Math.PI / 180;
    var theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(theta)
    );
  }

  // ── EARCUT triangulation — works for ANY polygon shape ──
  function triangulatePolygon(rings) {
    // Project rings to 2D for earcut, then lift back to 3D sphere
    // Use the first ring's centroid as tangent plane basis
    var allCoords = [];
    rings[0].forEach(function(p){ allCoords.push(p[0], p[1]); });

    // Build earcut hole indices
    var holeIndices = [];
    var offset = rings[0].length;
    for (var i=1; i<rings.length; i++) {
      holeIndices.push(offset);
      rings[i].forEach(function(p){ allCoords.push(p[0], p[1]); });
      offset += rings[i].length;
    }

    var indices = earcut(allCoords, holeIndices.length ? holeIndices : null, 2);
    if (!indices || indices.length === 0) return null;

    var positions = [];
    for (var t=0; t<indices.length; t++) {
      var idx = indices[t];
      var lon = allCoords[idx*2];
      var lat = allCoords[idx*2+1];
      var v = ll2v(lon, lat, FILL_R);
      positions.push(v.x, v.y, v.z);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }

  // Border lines from rings
  function buildBorder(rings) {
    var positions = [];
    rings.forEach(function(ring) {
      for (var i=0; i<ring.length-1; i++) {
        var a = ll2v(ring[i][0],   ring[i][1],   BORDER_R);
        var b = ll2v(ring[i+1][0], ring[i+1][1], BORDER_R);
        positions.push(a.x,a.y,a.z, b.x,b.y,b.z);
      }
    });
    if (!positions.length) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }

  // ── Point-in-polygon (ray casting in lon/lat space) ──
  // This is the AUTHORITATIVE hit test — works for every country
  function pointInRing(lon, lat, ring) {
    var inside = false;
    for (var i=0, j=ring.length-1; i<ring.length; j=i++) {
      var xi=ring[i][0], yi=ring[i][1];
      var xj=ring[j][0], yj=ring[j][1];
      if (((yi>lat) !== (yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function pointInFeature(lon, lat, feature) {
    var geom = feature.geometry;
    if (!geom) return false;
    function testPolygon(rings) {
      // Must be inside outer ring and outside all holes
      if (!pointInRing(lon, lat, rings[0])) return false;
      for (var h=1; h<rings.length; h++) {
        if (pointInRing(lon, lat, rings[h])) return false;
      }
      return true;
    }
    if (geom.type === 'Polygon') return testPolygon(geom.coordinates);
    if (geom.type === 'MultiPolygon') {
      for (var p=0; p<geom.coordinates.length; p++) {
        if (testPolygon(geom.coordinates[p])) return true;
      }
    }
    return false;
  }

  // Convert 3D hit point back to lon/lat
  function vec3ToLL(v) {
    var lat =  Math.asin(v.y / v.length()) * 180 / Math.PI;
    var lon = (Math.atan2(v.z, -v.x) * 180 / Math.PI) - 180;
    if (lon < -180) lon += 360;
    return { lat: lat, lon: lon };
  }

  // Country state
  var countryMap = {};   // iso -> { fillMat, borderMat, name }
  var allFeatures = [];  // kept for point-in-polygon fallback
  var selectedISO = null;
  var highlightTargets = {};

  function getAllRings(feature) {
    var geom = feature.geometry;
    if (!geom) return [];
    var rings = [];
    if (geom.type === 'Polygon') rings = geom.coordinates;
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(function(p){ rings=rings.concat(p); });
    return rings;
  }

  function buildCountryMesh(feature) {
    var iso  = feature.properties.iso;
    var name = feature.properties.name;
    var rings = getAllRings(feature);
    if (!rings.length) return;

    var fillMat = new THREE.MeshBasicMaterial({
      color: 0x4fa3ff, transparent: true, opacity: 0.0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    var borderMat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.28, linewidth: 1,
    });

    var group = new THREE.Group();

    // Build fill with earcut — handles ALL country shapes correctly
    try {
      if (feature.geometry.type === 'Polygon') {
        var fillGeo = triangulatePolygon(feature.geometry.coordinates);
        if (fillGeo) {
          var mesh = new THREE.Mesh(fillGeo, fillMat);
          mesh.userData.iso = iso;
          group.add(mesh);
        }
      } else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(function(poly) {
          var fillGeo = triangulatePolygon(poly);
          if (fillGeo) {
            var mesh = new THREE.Mesh(fillGeo, fillMat);
            mesh.userData.iso = iso;
            group.add(mesh);
          }
        });
      }
    } catch(e) { /* skip broken geometry */ }

    // Borders
    var borderGeo = buildBorder(rings);
    if (borderGeo) {
      group.add(new THREE.LineSegments(borderGeo, borderMat));
    }

    earthGroup.add(group);
    countryMap[iso] = { fillMat: fillMat, borderMat: borderMat, name: name, iso: iso };
  }

  function setSelected(iso) {
    // Clear previous
    if (selectedISO && countryMap[selectedISO]) {
      highlightTargets[selectedISO] = 0.0;
      countryMap[selectedISO].borderMat.color.setHex(0xffffff);
      countryMap[selectedISO].borderMat.opacity = 0.28;
    }
    if (iso === selectedISO) { selectedISO = null; return; }
    selectedISO = iso;
    if (countryMap[iso]) {
      highlightTargets[iso] = 0.52;
      countryMap[iso].borderMat.color.setHex(0x88ccff);
      countryMap[iso].borderMat.opacity = 1.0;
    }
  }

  // Tooltip
  var tipEl = document.getElementById('tooltip');
  var tipTimer;
  function showTip(txt, persist) {
    clearTimeout(tipTimer);
    tipEl.textContent = txt;
    tipEl.style.opacity = '1';
    if (!persist) tipTimer = setTimeout(function(){ tipEl.style.opacity='0'; }, 2800);
  }
  function hideTip() { clearTimeout(tipTimer); tipEl.style.opacity='0'; }

  // Raycaster
  var raycaster = new THREE.Raycaster();

  // ── TAP HANDLER — dual strategy ──
  // 1. Try raycasting fill meshes (fast, works for most countries)
  // 2. If miss, convert hit point to lon/lat and do point-in-polygon (catches everything)
  function handleTap(sx, sy) {
    var ndc = new THREE.Vector2((sx/W)*2-1, -(sy/H)*2+1);
    raycaster.setFromCamera(ndc, camera);

    // Always test against the earth sphere first to get the 3D hit point
    var sphereHits = raycaster.intersectObject(earthMesh);
    if (!sphereHits.length) return; // tapped space

    // Strategy 1: raycast fill meshes
    var fillMeshes = [];
    earthGroup.traverse(function(obj){
      if (obj.isMesh && obj.userData.iso) fillMeshes.push(obj);
    });
    var meshHits = raycaster.intersectObjects(fillMeshes, false);
    if (meshHits.length > 0) {
      var iso = meshHits[0].object.userData.iso;
      setSelected(iso);
      showTip('📍 ' + countryMap[iso].name, true);
      return;
    }

    // Strategy 2: point-in-polygon on the sphere hit point
    var hitPt = sphereHits[0].point;
    // The earthGroup has rotation applied — we need to transform hit point
    // into the earthGroup's local space to get correct lon/lat
    var localPt = earthGroup.worldToLocal(hitPt.clone());
    var ll = vec3ToLL(localPt);

    for (var i=0; i<allFeatures.length; i++) {
      if (pointInFeature(ll.lon, ll.lat, allFeatures[i])) {
        var iso2 = allFeatures[i].properties.iso;
        setSelected(iso2);
        showTip('📍 ' + allFeatures[i].properties.name, true);
        return;
      }
    }

    // Tapped ocean
    if (selectedISO) { setSelected(null); }
    hideTip();
  }

  // Load geodata and build meshes
  fetch('https://globevoyage-admin.onrender.com/geodata')
    .then(function(r){ return r.json(); })
    .then(function(geojson){
      progress(80);
      allFeatures = geojson.features;
      var i = 0;
      function batch() {
        var end = Math.min(i + 15, allFeatures.length);
        for (; i < end; i++) buildCountryMesh(allFeatures[i]);
        progress(80 + Math.round((i / allFeatures.length) * 19));
        if (i < allFeatures.length) setTimeout(batch, 0);
        else progress(100);
      }
      batch();
    })
    .catch(function(){ progress(100); });

  // ── Touch events ──
  function tDist(a,b){ var dx=a.clientX-b.clientX,dy=a.clientY-b.clientY; return Math.sqrt(dx*dx+dy*dy); }

  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      var t=e.touches[0];
      lx=t.clientX; ly=t.clientY;
      tapX=t.clientX; tapY=t.clientY; tapT=Date.now();
      isDrag=true; isPinch=false; momX=0; momY=0; isHeld=false;
      holdTimer=setTimeout(function(){
        isHeld=true; autoSpin=false; showTip('⏸  Globe locked', true);
      }, 600);
    } else if(e.touches.length===2){
      clearTimeout(holdTimer); isDrag=false; isPinch=true;
      lDist=tDist(e.touches[0],e.touches[1]);
    }
  },{passive:false});

  canvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(isDrag&&e.touches.length===1){
      clearTimeout(holdTimer);
      var t=e.touches[0], dx=t.clientX-lx, dy=t.clientY-ly;
      var s=0.005*(camZ/2.6);
      earthGroup.rotation.y+=dx*s;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+dy*s));
      momX=dx*s; momY=dy*s;
      lx=t.clientX; ly=t.clientY;
      autoSpin=false;
    } else if(isPinch&&e.touches.length===2){
      var d=tDist(e.touches[0],e.touches[1]);
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
      // Double-tap zoom toggle
      if(now-lastTap<260&&dx<18&&dy2<18){ targetZ=targetZ>2.0?1.5:2.6; }
      lastTap=now;
      // Single tap
      if(dx<10&&dy2<10&&dt<280) handleTap(tapX, tapY);
      // Resume auto-spin
      if(Math.abs(momX)>0.001||Math.abs(momY)>0.001){
        setTimeout(function(){if(!isDrag&&!isHeld)autoSpin=true;},1800);
      } else if(!isHeld){ autoSpin=true; }
    }
    isDrag=false; isPinch=false;
  },{passive:false});

  // ── Animation loop ──
  function animate(){
    requestAnimationFrame(animate);
    if(autoSpin) earthGroup.rotation.y+=spinSpeed;
    if(!isDrag&&!autoSpin){
      earthGroup.rotation.y+=momX;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+momY));
      momX*=fric; momY*=fric;
      if(Math.abs(momX)<0.00008&&Math.abs(momY)<0.00008){
        momX=0; momY=0; if(!isHeld) autoSpin=true;
      }
    }
    camZ+=(targetZ-camZ)*0.10;
    camera.position.z=camZ;
    if(cloudMesh) cloudMesh.rotation.y+=spinSpeed*1.15;
    // Animate highlight opacity
    Object.keys(highlightTargets).forEach(function(iso){
      var c=countryMap[iso]; if(!c) return;
      var cur=c.fillMat.opacity, tgt=highlightTargets[iso];
      var next=cur+(tgt-cur)*0.12;
      c.fillMat.opacity=next;
      if(Math.abs(next-tgt)<0.001){
        c.fillMat.opacity=tgt;
        if(tgt===0.0){ delete highlightTargets[iso]; }
      }
    });
    renderer.render(scene,camera);
  }
  animate();

  setTimeout(function(){ var h=document.getElementById('hint'); if(h) h.style.opacity='0'; }, 5000);
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
