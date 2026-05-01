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

// ── TEXTURE PROXY — serves NASA textures with correct CORS headers ────
const TEXTURES = {
  "earth-day":    "https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg",
  "earth-night":  "https://unpkg.com/three-globe@2.30.0/example/img/earth-night.jpg",
  "earth-clouds": "https://unpkg.com/three-globe@2.30.0/example/img/earth-clouds.png",
  "earth-water":  "https://unpkg.com/three-globe@2.30.0/example/img/earth-water.png",
  "earth-bump":   "https://unpkg.com/three-globe@2.30.0/example/img/earth-topology.png",
};

app.get("/texture/:name", (req, res) => {
  const url = TEXTURES[req.params.name];
  if (!url) return res.status(404).json({ error: "Texture not found" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=86400");

  const contentType = url.endsWith(".png") ? "image/png" : "image/jpeg";
  res.setHeader("Content-Type", contentType);

  https.get(url, (upstream) => {
    upstream.pipe(res);
  }).on("error", (err) => {
    console.error("Texture fetch error:", err.message);
    res.status(502).json({ error: "Failed to fetch texture" });
  });
});

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
  canvas{display:block;touch-action:none}
  #loading{
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    color:#4488ff;font-family:sans-serif;font-size:11px;letter-spacing:3px;
    transition:opacity 0.8s;pointer-events:none;text-align:center;
  }
  #loading-bar{
    width:120px;height:2px;background:rgba(68,136,255,0.2);margin:8px auto 0;border-radius:2px;overflow:hidden;
  }
  #loading-fill{
    height:100%;background:#4488ff;width:0%;transition:width 0.3s;border-radius:2px;
  }
  #tooltip{
    position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
    background:rgba(8,12,20,0.88);border:1px solid rgba(100,160,255,0.25);
    color:#c9d8f0;font-family:sans-serif;font-size:12px;letter-spacing:1px;
    padding:6px 16px;border-radius:20px;pointer-events:none;
    opacity:0;transition:opacity 0.3s;white-space:nowrap;
  }
  #hint{
    position:absolute;bottom:46px;left:50%;transform:translateX(-50%);
    color:rgba(100,140,200,0.45);font-family:sans-serif;font-size:9px;
    letter-spacing:2px;pointer-events:none;white-space:nowrap;transition:opacity 1s;
  }
</style>
</head>
<body>
<div id="loading">
  LOADING EARTH
  <div id="loading-bar"><div id="loading-fill"></div></div>
</div>
<div id="hint">DRAG · PINCH · TAP</div>
<div id="tooltip"></div>
<canvas id="c"></canvas>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
(function(){
  var W=window.innerWidth,H=window.innerHeight;
  var canvas=document.getElementById('c');
  canvas.width=W;canvas.height=H;

  var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setSize(W,H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0x080c14,1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.1;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(40,W/H,0.1,1000);
  camera.position.z=2.6;

  // ── Loading progress ──
  var loadFill=document.getElementById('loading-fill');
  var loadEl=document.getElementById('loading');
  var loaded=0,total=3;
  function onLoad(){
    loaded++;
    loadFill.style.width=Math.round((loaded/total)*100)+'%';
    if(loaded>=total){
      setTimeout(function(){loadEl.style.opacity='0';},400);
    }
  }

  // ── Interaction state ──
  var isDragging=false,isPinching=false;
  var autoSpin=true,autoSpinSpeed=0.0015;
  var momentumX=0,momentumY=0,friction=0.91;
  var lastX=0,lastY=0,lastDist=0;
  var cameraZ=2.6,zMin=1.3,zMax=5.0;
  var tapStartX=0,tapStartY=0,tapStartTime=0;
  var holdTimer=null,isHeld=false;
  var lastTap=0;

  // ── Stars ──
  (function(){
    var geo=new THREE.BufferGeometry(),v=[];
    for(var i=0;i<2000;i++){
      var th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=50+Math.random()*30;
      v.push(r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph));
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.07})));
  })();

  // ── Lights ──
  scene.add(new THREE.AmbientLight(0x111122,0.4));
  var sun=new THREE.DirectionalLight(0xfff5e0,3.5);
  sun.position.set(6,2,4);
  scene.add(sun);
  var fill=new THREE.DirectionalLight(0x0011aa,0.15);
  fill.position.set(-5,-1,-3);
  scene.add(fill);

  // ── Earth group ──
  var earthGroup=new THREE.Group();
  earthGroup.rotation.z=0.41;
  scene.add(earthGroup);

  // ── Shader ──
  var uniforms={
    dayTexture:{value:null},
    nightTexture:{value:null},
    specTexture:{value:null},
    sunDirection:{value:new THREE.Vector3(0.8,0.25,0.5).normalize()},
    highlightLat:{value:-999.0},
    highlightLon:{value:-999.0},
    highlightActive:{value:0.0},
  };

  var vsh=\`
    varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;
    void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);
    vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
  \`;
  var fsh=\`
    precision highp float;
    uniform sampler2D dayTexture;uniform sampler2D nightTexture;uniform sampler2D specTexture;
    uniform vec3 sunDirection;uniform float highlightLat;uniform float highlightLon;uniform float highlightActive;
    varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;
    void main(){
      vec3 n=normalize(vNormal);vec3 sun=normalize(sunDirection);
      float cosA=dot(n,sun);float dayA=smoothstep(-0.25,0.5,cosA);
      vec3 day=texture2D(dayTexture,vUv).rgb;
      vec3 night=texture2D(nightTexture,vUv).rgb*1.8;
      vec3 spec=texture2D(specTexture,vUv).rgb;
      vec3 color=mix(night,day,dayA);
      vec3 vd=normalize(cameraPosition-vWorldPos);
      vec3 hv=normalize(sun+vd);
      float sp=pow(max(dot(n,hv),0.0),80.0);
      color+=vec3(0.6,0.7,0.9)*sp*spec.r*dayA*0.8;
      if(highlightActive>0.0){
        float lat=(vUv.y-0.5)*180.0;float lon=(vUv.x-0.5)*360.0;
        float d=sqrt((lat-highlightLat)*(lat-highlightLat)+(lon-highlightLon)*(lon-highlightLon));
        color=mix(color,vec3(0.4,0.75,1.0),highlightActive*smoothstep(20.0,0.0,d)*0.4);
      }
      float rim=pow(1.0-max(dot(n,vd),0.0),4.0);
      color=mix(color,mix(vec3(0.05,0.08,0.25),vec3(0.3,0.6,1.0),dayA),rim*0.65);
      gl_FragColor=vec4(color,1.0);
    }
  \`;

  var earth=new THREE.Mesh(
    new THREE.SphereGeometry(1,64,64),
    new THREE.ShaderMaterial({uniforms:uniforms,vertexShader:vsh,fragmentShader:fsh})
  );
  earthGroup.add(earth);

  // ── Atmosphere ──
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.08,48,48),
    new THREE.ShaderMaterial({
      uniforms:{sunDirection:{value:new THREE.Vector3(0.8,0.25,0.5).normalize()}},
      vertexShader:\`varying vec3 vN,vP;void main(){vN=normal;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}\`,
      fragmentShader:\`uniform vec3 sunDirection;varying vec3 vN,vP;void main(){
        vec3 vd=normalize(cameraPosition-(modelMatrix*vec4(vP,1.0)).xyz);
        float rim=pow(1.0-abs(dot(normalize(vN),vd)),2.8);
        float d=dot(normalize((normalMatrix*vec4(vN,0.0)).xyz),normalize(sunDirection));
        vec3 col=mix(vec3(0.04,0.08,0.35),vec3(0.25,0.55,1.0),smoothstep(-0.2,0.5,d));
        gl_FragColor=vec4(col,rim*0.55);}\`,
      transparent:true,side:THREE.FrontSide,depthWrite:false,blending:THREE.AdditiveBlending
    })
  ));

  // ── Load textures from our own backend ──
  var BASE='https://globevoyage-admin.onrender.com/texture/';
  var loader=new THREE.TextureLoader();
  loader.crossOrigin='anonymous';

  loader.load(BASE+'earth-day',function(t){
    t.anisotropy=renderer.capabilities.getMaxAnisotropy();
    uniforms.dayTexture.value=t;onLoad();
  },undefined,function(e){console.error('day',e);onLoad();});

  loader.load(BASE+'earth-night',function(t){
    uniforms.nightTexture.value=t;onLoad();
  },undefined,function(e){console.error('night',e);onLoad();});

  loader.load(BASE+'earth-water',function(t){
    uniforms.specTexture.value=t;onLoad();
  },undefined,function(e){console.error('spec',e);onLoad();});

  // Clouds (optional, don't block loading indicator)
  var cloudMesh;
  loader.load(BASE+'earth-clouds',function(t){
    cloudMesh=new THREE.Mesh(
      new THREE.SphereGeometry(1.012,48,48),
      new THREE.MeshPhongMaterial({map:t,transparent:true,opacity:0.82,depthWrite:false,blending:THREE.AdditiveBlending})
    );
    earthGroup.add(cloudMesh);
  });

  // ── Countries ──
  var COUNTRIES=[
    {name:'Nigeria',lat:[4,14],lon:[3,15]},
    {name:'United States',lat:[24,50],lon:[-125,-66]},
    {name:'United Kingdom',lat:[50,59],lon:[-8,2]},
    {name:'France',lat:[42,51],lon:[-5,9]},
    {name:'Germany',lat:[47,55],lon:[6,15]},
    {name:'China',lat:[18,54],lon:[73,135]},
    {name:'India',lat:[8,37],lon:[68,97]},
    {name:'Brazil',lat:[-34,5],lon:[-74,-34]},
    {name:'Russia',lat:[41,82],lon:[27,180]},
    {name:'Australia',lat:[-44,-10],lon:[113,154]},
    {name:'Canada',lat:[42,84],lon:[-141,-52]},
    {name:'South Africa',lat:[-35,-22],lon:[16,33]},
    {name:'Egypt',lat:[22,32],lon:[25,37]},
    {name:'Japan',lat:[31,46],lon:[130,146]},
    {name:'Mexico',lat:[15,33],lon:[-118,-87]},
    {name:'Argentina',lat:[-55,-22],lon:[-74,-53]},
    {name:'Saudi Arabia',lat:[16,32],lon:[36,56]},
    {name:'Indonesia',lat:[-11,6],lon:[95,141]},
    {name:'Turkey',lat:[36,43],lon:[26,45]},
    {name:'Kenya',lat:[-5,5],lon:[34,42]},
    {name:'Spain',lat:[36,44],lon:[-9,4]},
    {name:'Italy',lat:[36,47],lon:[7,18]},
    {name:'Pakistan',lat:[23,38],lon:[60,78]},
    {name:'Ukraine',lat:[44,53],lon:[22,40]},
    {name:'Ghana',lat:[5,11],lon:[-3,1]},
    {name:'Ethiopia',lat:[3,15],lon:[33,48]},
    {name:'Morocco',lat:[27,36],lon:[-14,0]},
    {name:'Peru',lat:[-18,0],lon:[-82,-68]},
    {name:'Colombia',lat:[-4,13],lon:[-79,-67]},
    {name:'New Zealand',lat:[-47,-34],lon:[166,178]},
  ];

  var countryMeshes=[];
  var raycaster=new THREE.Raycaster();
  COUNTRIES.forEach(function(c){
    var latMin=c.lat[0]*Math.PI/180,latMax=c.lat[1]*Math.PI/180;
    var lonMin=c.lon[0]*Math.PI/180,lonMax=c.lon[1]*Math.PI/180;
    var s=12,v=[],idx=[];
    for(var li=0;li<=s;li++){
      for(var lo=0;lo<=s;lo++){
        var la=latMin+(latMax-latMin)*(li/s);
        var ln=lonMin+(lonMax-lonMin)*(lo/s);
        v.push(1.002*Math.cos(la)*Math.cos(ln),1.002*Math.sin(la),1.002*Math.cos(la)*Math.sin(ln));
      }
    }
    for(var li=0;li<s;li++){
      for(var lo=0;lo<s;lo++){
        var a=li*(s+1)+lo,b=a+s+1;
        idx.push(a,b,a+1,b,b+1,a+1);
      }
    }
    var geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    geo.setIndex(idx);geo.computeVertexNormals();
    var mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));
    mesh.userData={name:c.name,lat:(c.lat[0]+c.lat[1])/2,lon:(c.lon[0]+c.lon[1])/2};
    earthGroup.add(mesh);
    countryMeshes.push(mesh);
  });

  // ── Tooltip ──
  var tooltip=document.getElementById('tooltip');
  var ttTimer;
  function showTip(txt){
    clearTimeout(ttTimer);
    tooltip.textContent=txt;tooltip.style.opacity='1';
    ttTimer=setTimeout(function(){tooltip.style.opacity='0';},2800);
  }

  // ── Highlight ──
  var hlRing=null,hlPulse=0;
  function highlight(lat,lon){
    if(hlRing)earthGroup.remove(hlRing);
    uniforms.highlightLat.value=lat;uniforms.highlightLon.value=lon;uniforms.highlightActive.value=1.0;
    hlPulse=0;
    var phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180,r=1.018;
    hlRing=new THREE.Mesh(
      new THREE.TorusGeometry(0.05,0.005,12,48),
      new THREE.MeshBasicMaterial({color:0x44aaff,transparent:true,opacity:0.9})
    );
    hlRing.position.set(r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta));
    hlRing.lookAt(hlRing.position.clone().multiplyScalar(2));
    earthGroup.add(hlRing);
    setTimeout(function(){if(hlRing){earthGroup.remove(hlRing);hlRing=null;}uniforms.highlightActive.value=0.0;},3500);
  }

  // ── Touch ──
  function dist2(a,b){var dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;return Math.sqrt(dx*dx+dy*dy);}

  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      var t=e.touches[0];
      lastX=t.clientX;lastY=t.clientY;
      tapStartX=t.clientX;tapStartY=t.clientY;tapStartTime=Date.now();
      isDragging=true;isPinching=false;momentumX=0;momentumY=0;isHeld=false;
      holdTimer=setTimeout(function(){isHeld=true;autoSpin=false;showTip('⏸  Globe locked');},600);
    } else if(e.touches.length===2){
      clearTimeout(holdTimer);isDragging=false;isPinching=true;
      lastDist=dist2(e.touches[0],e.touches[1]);
    }
  },{passive:false});

  canvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(isDragging&&e.touches.length===1){
      clearTimeout(holdTimer);
      var t=e.touches[0],dx=t.clientX-lastX,dy=t.clientY-lastY;
      var s=0.005*(cameraZ/2.6);
      earthGroup.rotation.y+=dx*s;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+dy*s));
      momentumX=dx*s;momentumY=dy*s;
      lastX=t.clientX;lastY=t.clientY;
      autoSpin=false;
    } else if(isPinching&&e.touches.length===2){
      var d=dist2(e.touches[0],e.touches[1]);
      cameraZ=Math.max(zMin,Math.min(zMax,cameraZ+(lastDist-d)*0.01));
      lastDist=d;
    }
  },{passive:false});

  canvas.addEventListener('touchend',function(e){
    e.preventDefault();
    clearTimeout(holdTimer);
    var now=Date.now();
    if(e.changedTouches.length===1){
      var dx=Math.abs(e.changedTouches[0].clientX-tapStartX);
      var dy=Math.abs(e.changedTouches[0].clientY-tapStartY);
      var dt=now-tapStartTime;
      // Double tap zoom
      if(now-lastTap<280&&dx<15&&dy<15){
        cameraZ=cameraZ>2.0?1.55:2.6;
      }
      lastTap=now;
      // Single tap — raycast
      if(dx<10&&dy<10&&dt<280){
        var ndc=new THREE.Vector2((tapStartX/W)*2-1,-(tapStartY/H)*2+1);
        raycaster.setFromCamera(ndc,camera);
        var hits=raycaster.intersectObjects(countryMeshes);
        var sphereHit=raycaster.intersectObject(earth);
        if(hits.length>0){
          var c=hits[0].object.userData;
          highlight(c.lat,c.lon);showTip('📍 '+c.name);
        } else if(sphereHit.length>0){
          var p=sphereHit[0].point;
          var la=Math.asin(p.y/p.length())*180/Math.PI;
          var lo=Math.atan2(p.z,p.x)*180/Math.PI;
          showTip('🌍 '+la.toFixed(1)+'°  '+lo.toFixed(1)+'°');
        }
      }
      // Flick momentum
      if(Math.abs(momentumX)>0.001||Math.abs(momentumY)>0.001){
        setTimeout(function(){if(!isDragging&&!isHeld)autoSpin=true;},1800);
      } else if(!isHeld){
        autoSpin=true;
      }
    }
    isDragging=false;isPinching=false;
  },{passive:false});

  // ── Animate ──
  function animate(){
    requestAnimationFrame(animate);
    if(autoSpin) earthGroup.rotation.y+=autoSpinSpeed;
    if(!isDragging&&!autoSpin){
      earthGroup.rotation.y+=momentumX;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+momentumY));
      momentumX*=friction;momentumY*=friction;
      if(Math.abs(momentumX)<0.00008&&Math.abs(momentumY)<0.00008){momentumX=0;momentumY=0;if(!isHeld)autoSpin=true;}
    }
    camera.position.z+=(cameraZ-camera.position.z)*0.12;
    if(cloudMesh)cloudMesh.rotation.y+=autoSpinSpeed*1.15;
    if(uniforms.highlightActive.value>0){hlPulse+=0.08;uniforms.highlightActive.value=0.55+0.45*Math.sin(hlPulse);}
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
