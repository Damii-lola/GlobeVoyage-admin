const express = require("express");
const cors = require("cors");
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

// ── GLOBE HTML PAGE (served to WebView in mobile app) ─────────────────
app.get("/globe", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
  canvas { display: block; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
(function() {
  const canvas = document.getElementById('c');
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W; canvas.height = H;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.position.z = 2.6;

  // ── Stars ──
  const starGeo = new THREE.BufferGeometry();
  const sv = [];
  for (let i = 0; i < 1500; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 30 + Math.random() * 20;
    sv.push(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta), r*Math.cos(phi));
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 })));

  // ── Lighting ──
  scene.add(new THREE.AmbientLight(0x222233, 1));
  const sun = new THREE.DirectionalLight(0xfff5e0, 2.2);
  sun.position.set(5, 2, 4);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x334488, 0.4);
  rim.position.set(-4, -1, -3);
  scene.add(rim);

  // ── Procedural Earth texture on canvas ──
  function makeEarthTexture() {
    const size = 1024;
    const tc = document.createElement('canvas');
    tc.width = size * 2; tc.height = size;
    const ctx = tc.getContext('2d');

    function noise(x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      return (Math.sin(X * 127.1 + Y * 311.7) * 43758.5453) % 1;
    }
    function snoise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
      const a=Math.abs(noise(xi,yi)), b=Math.abs(noise(xi+1,yi));
      const c=Math.abs(noise(xi,yi+1)), d=Math.abs(noise(xi+1,yi+1));
      return a*(1-u)*(1-v) + b*u*(1-v) + c*(1-u)*v + d*u*v;
    }
    function fbm(x, y, oct) {
      let v=0,a=0.5,f=1;
      for(let i=0;i<oct;i++){v+=a*snoise(x*f,y*f);a*=0.5;f*=2.1;}
      return v;
    }

    function isLand(lat, lon) {
      if(lat>15&&lat<75&&lon>-170&&lon<-50) return true;
      if(lat>-58&&lat<13&&lon>-82&&lon<-34) return true;
      if(lat>35&&lat<72&&lon>-12&&lon<45) return true;
      if(lat>-38&&lat<38&&lon>-18&&lon<52) return true;
      if(lat>10&&lat<75&&lon>45&&lon<145) return true;
      if(lat>-10&&lat<25&&lon>95&&lon<155) return true;
      if(lat>-45&&lat<-10&&lon>112&&lon<155) return true;
      if(lat>60&&lat<85&&lon>-60&&lon<-15) return true;
      if(lat<-65) return true;
      if(lat>8&&lat<30&&lon>68&&lon<88) return true;
      if(lat>30&&lat<46&&lon>129&&lon<146) return true;
      if(lat>50&&lat<62&&lon>-11&&lon<2) return true;
      if(lat>-48&&lat<-34&&lon>165&&lon<180) return true;
      if(lat>-5&&lat<7&&lon>99&&lon<104) return true;
      if(lat>1&&lat<7&&lon>103&&lon<104.5) return true;
      return false;
    }

    const W2 = tc.width, H2 = tc.height;
    const imgData = ctx.createImageData(W2, H2);
    const d = imgData.data;

    for (let py = 0; py < H2; py++) {
      for (let px = 0; px < W2; px++) {
        const u = px / W2, v = py / H2;
        const lon = (u - 0.5) * 360;
        const lat = (0.5 - v) * 180;
        const land = isLand(lat, lon);
        const n = fbm(u * 6, v * 6, 5);
        const n2 = fbm(u * 12 + 3, v * 12 + 1.5, 4);
        let r, g, b;

        if (land) {
          const absLat = Math.abs(lat);
          if (absLat > 68) {
            // Ice caps
            const t = Math.min(1, (absLat - 68) / 15);
            r = Math.round(210 + t*30); g = Math.round(225 + t*20); b = Math.round(235 + t*15);
          } else if (absLat > 55) {
            // Tundra/taiga
            r = Math.round(100 + n*40); g = Math.round(120 + n*50); b = Math.round(80 + n*30);
          } else if (absLat < 25 && lon > 10 && lon < 60) {
            // Sahara / Arabian desert
            r = Math.round(190 + n*40); g = Math.round(160 + n*30); b = Math.round(80 + n*20);
          } else if (absLat < 15) {
            // Rainforest
            r = Math.round(20 + n*30); g = Math.round(90 + n*50); b = Math.round(20 + n*20);
          } else {
            // Temperate grassland/forest
            r = Math.round(50 + n*60);  g = Math.round(110 + n*60); b = Math.round(40 + n*30);
          }
          // Rocky variation
          r = Math.round(r + n2*15); g = Math.round(g + n2*12); b = Math.round(b + n2*10);
        } else {
          // Ocean
          const depth = fbm(u*3, v*3, 4);
          r = Math.round(5  + depth*20);
          g = Math.round(30 + depth*60);
          b = Math.round(100 + depth*80);
          // Shallow coastal
          const coastal = fbm(u*20, v*20, 3);
          if (coastal > 0.55) { r+=8; g+=20; b+=10; }
        }

        // Clouds
        const c1 = fbm(u*5 + 1.1, v*4 + 0.6, 5);
        const c2 = fbm(u*3.5 - 0.4, v*6 + 2.0, 4);
        const itcz = Math.exp(-Math.abs(lat) * 0.09) * 0.2;
        const cloud = c1*0.55 + c2*0.45 + itcz;
        if (cloud > 0.54) {
          const cf = Math.min(1, (cloud - 0.54) / 0.25);
          r = Math.round(r + (242-r)*cf);
          g = Math.round(g + (246-g)*cf);
          b = Math.round(b + (252-b)*cf);
        }

        const idx = (py * W2 + px) * 4;
        d[idx]   = Math.min(255, Math.max(0, r));
        d[idx+1] = Math.min(255, Math.max(0, g));
        d[idx+2] = Math.min(255, Math.max(0, b));
        d[idx+3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return new THREE.CanvasTexture(tc);
  }

  function makeNightTexture() {
    const size = 512;
    const tc = document.createElement('canvas');
    tc.width = size * 2; tc.height = size;
    const ctx = tc.getContext('2d');
    ctx.fillStyle = '#000005';
    ctx.fillRect(0, 0, tc.width, tc.height);

    function isLand(lat, lon) {
      if(lat>15&&lat<75&&lon>-170&&lon<-50) return true;
      if(lat>-58&&lat<13&&lon>-82&&lon<-34) return true;
      if(lat>35&&lat<72&&lon>-12&&lon<45) return true;
      if(lat>-38&&lat<38&&lon>-18&&lon<52) return true;
      if(lat>10&&lat<75&&lon>45&&lon<145) return true;
      if(lat>-10&&lat<25&&lon>95&&lon<155) return true;
      if(lat>-45&&lat<-10&&lon>112&&lon<155) return true;
      if(lat>8&&lat<30&&lon>68&&lon<88) return true;
      if(lat>30&&lat<46&&lon>129&&lon<146) return true;
      if(lat>35&&lat<52&&lon>-10&&lon<40) return true;
      if(lat>30&&lat<45&&lon>-120&&lon<-65) return true;
      return false;
    }

    function noise(x,y){return Math.abs((Math.sin(x*127.1+y*311.7)*43758.5453)%1);}

    const W2=tc.width, H2=tc.height;
    for(let py=0;py<H2;py++){
      for(let px=0;px<W2;px++){
        const u=px/W2, v=py/H2;
        const lon=(u-0.5)*360, lat=(0.5-v)*180;
        if(isLand(lat,lon) && Math.abs(lat)<65){
          const n=noise(px*0.3,py*0.3);
          if(n>0.78){
            const br=Math.round(180+n*60);
            const idx=(py*W2+px)*4;
            const imgD=ctx.getImageData(px,py,1,1).data;
            ctx.fillStyle=\`rgba(\${br},\${Math.round(br*0.8)},\${Math.round(br*0.3)},\${(n-0.78)*4})\`;
            ctx.fillRect(px,py,1,1);
          }
        }
      }
    }
    return new THREE.CanvasTexture(tc);
  }

  function makeSpecMap() {
    const size=512;
    const tc=document.createElement('canvas');
    tc.width=size*2; tc.height=size;
    const ctx=tc.getContext('2d');

    function isLand(lat,lon){
      if(lat>15&&lat<75&&lon>-170&&lon<-50)return true;
      if(lat>-58&&lat<13&&lon>-82&&lon<-34)return true;
      if(lat>35&&lat<72&&lon>-12&&lon<45)return true;
      if(lat>-38&&lat<38&&lon>-18&&lon<52)return true;
      if(lat>10&&lat<75&&lon>45&&lon<145)return true;
      if(lat>-10&&lat<25&&lon>95&&lon<155)return true;
      if(lat>-45&&lat<-10&&lon>112&&lon<155)return true;
      if(lat<-65)return true;
      return false;
    }

    const W2=tc.width,H2=tc.height;
    const imgData=ctx.createImageData(W2,H2);
    const d=imgData.data;
    for(let py=0;py<H2;py++){
      for(let px=0;px<W2;px++){
        const u=px/W2,v=py/H2;
        const lon=(u-0.5)*360,lat=(0.5-v)*180;
        const spec=isLand(lat,lon)?8:220;
        const i=(py*W2+px)*4;
        d[i]=spec;d[i+1]=spec;d[i+2]=spec;d[i+3]=255;
      }
    }
    ctx.putImageData(imgData,0,0);
    return new THREE.CanvasTexture(tc);
  }

  // Build all textures
  const earthTex = makeEarthTexture();
  const nightTex = makeNightTexture();
  const specMap  = makeSpecMap();

  // ── Earth sphere ──
  const earthGeo = new THREE.SphereGeometry(1, 64, 64);
  const earthMat = new THREE.MeshPhongMaterial({
    map:          earthTex,
    specularMap:  specMap,
    specular:     new THREE.Color(0x4488bb),
    shininess:    55,
    emissiveMap:  nightTex,
    emissive:     new THREE.Color(0xffaa44),
    emissiveIntensity: 0.6,
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  earth.rotation.x = 0.41; // 23.5° tilt
  scene.add(earth);

  // ── Cloud layer ──
  function makeCloudTexture() {
    const size=512;
    const tc=document.createElement('canvas');
    tc.width=size*2;tc.height=size;
    const ctx=tc.getContext('2d');
    ctx.fillStyle='rgba(0,0,0,0)';
    ctx.clearRect(0,0,tc.width,tc.height);

    function noise(x,y){return Math.abs((Math.sin(x*127.1+y*311.7)*43758.5453)%1);}
    function sn(x,y){
      const xi=Math.floor(x),yi=Math.floor(y);
      const xf=x-xi,yf=y-yi;
      const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
      return noise(xi,yi)*(1-u)*(1-v)+noise(xi+1,yi)*u*(1-v)+noise(xi,yi+1)*(1-u)*v+noise(xi+1,yi+1)*u*v;
    }
    function fbm(x,y){let v=0,a=0.5,f=1;for(let i=0;i<5;i++){v+=a*sn(x*f,y*f);a*=0.5;f*=2.1;}return v;}

    const W2=tc.width,H2=tc.height;
    const imgData=ctx.createImageData(W2,H2);
    const d=imgData.data;
    for(let py=0;py<H2;py++){
      for(let px=0;px<W2;px++){
        const u=px/W2,v=py/H2;
        const lat=(0.5-v)*180;
        const c1=fbm(u*5+1.1,v*4+0.6);
        const c2=fbm(u*3.5-0.4,v*6+2.0);
        const itcz=Math.exp(-Math.abs(lat)*0.09)*0.2;
        const cloud=c1*0.55+c2*0.45+itcz;
        const alpha=cloud>0.52?Math.min(255,Math.round((cloud-0.52)/0.28*220)):0;
        const i=(py*W2+px)*4;
        d[i]=245;d[i+1]=248;d[i+2]=255;d[i+3]=alpha;
      }
    }
    ctx.putImageData(imgData,0,0);
    return new THREE.CanvasTexture(tc);
  }

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.018, 48, 48),
    new THREE.MeshPhongMaterial({
      map: makeCloudTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
    })
  );
  clouds.rotation.x = 0.41;
  scene.add(clouds);

  // ── Atmosphere ──
  const atmosMat = new THREE.MeshPhongMaterial({
    color: 0x4488ff,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 32, 32), atmosMat));
  const atmos2 = new THREE.MeshPhongMaterial({
    color: 0x1144cc,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.14, 32, 32), atmos2));

  // ── Animate ──
  function animate() {
    requestAnimationFrame(animate);
    earth.rotation.y  += 0.0018;
    clouds.rotation.y += 0.0022;
    renderer.render(scene, camera);
  }
  animate();
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
  const { data, error } = await supabase
    .from("destinations").select("*").eq("id", req.params.id).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

app.post("/api/destinations", async (req, res) => {
  const { name, country, description, image_url, price } = req.body;
  const { data, error } = await supabase
    .from("destinations").insert([{ name, country, description, image_url, price }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.put("/api/destinations/:id", async (req, res) => {
  const { name, country, description, image_url, price } = req.body;
  const { data, error } = await supabase
    .from("destinations").update({ name, country, description, image_url, price })
    .eq("id", req.params.id).select();
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
