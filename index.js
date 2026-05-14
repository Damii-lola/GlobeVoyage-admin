const express    = require("express");
const cors       = require("cors");
const https      = require("https");
const http       = require("http");
const fs         = require("fs");
const path       = require("path");
const axios      = require("axios");
const cron       = require("node-cron");
const xml2js     = require("xml2js");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ENV = {
  MISTRAL_API_KEY:      process.env.MISTRAL_API_KEY,
  OPENWEATHER_API_KEY:  process.env.OPENWEATHER_API_KEY,
  TICKETMASTER_API_KEY: process.env.TICKETMASTER_API_KEY,
  PREDICTHQ_API_KEY:    process.env.PREDICTHQ_API_KEY,
  GNEWS_API_KEY:        process.env.GNEWS_API_KEY,
  GEOAPIFY_API_KEY:     process.env.GEOAPIFY_API_KEY,
  // New integrations
  UNSPLASH_ACCESS_KEY:  process.env.UNSPLASH_ACCESS_KEY,
  OPENAQ_API_KEY:       process.env.OPENAQ_API_KEY,
  AVIATIONSTACK_API_KEY:process.env.AVIATIONSTACK_API_KEY,
  RAPIDAPI_KEY:         process.env.RAPIDAPI_KEY,   // covers Numbeo + Airbnb via RapidAPI
  GOOGLE_MAPS_KEY:      process.env.GOOGLE_MAPS_KEY,   // Google Maps API key for geo hierarchy
};

// Bundled scripts — try node_modules first, fall back to CDN fetch at startup
let THREE_JS = "", EARCUT_JS = "";
try { THREE_JS  = fs.readFileSync(path.join(__dirname,"node_modules/three/build/three.min.js"),"utf8"); } catch(e){}
try { EARCUT_JS = fs.readFileSync(path.join(__dirname,"node_modules/earcut/src/earcut.js"),"utf8"); } catch(e){}

async function ensureScripts() {
  const fetches = [];
  if(!THREE_JS) {
    fetches.push(
      axios.get("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js", {timeout:30000, responseType:"text"})
        .then(r => { THREE_JS = r.data; console.log("three.js loaded from CDN:", Math.round(THREE_JS.length/1024)+"kb"); })
        .catch(e => console.error("Failed to fetch three.js from CDN:", e.message))
    );
  }
  if(!EARCUT_JS) {
    fetches.push(
      axios.get("https://cdn.jsdelivr.net/npm/earcut@2.2.4/src/earcut.js", {timeout:10000, responseType:"text"})
        .then(r => { EARCUT_JS = r.data; console.log("earcut.js loaded from CDN:", Math.round(EARCUT_JS.length/1024)+"kb"); })
        .catch(e => console.error("Failed to fetch earcut.js from CDN:", e.message))
    );
  }
  if(fetches.length) await Promise.all(fetches);
  if(THREE_JS)  console.log("✓ three.js ready");
  if(EARCUT_JS) console.log("✓ earcut.js ready");
}

// ── Server status tracking ───────────────────────────────────────
const SELF       = process.env.RENDER_EXTERNAL_URL || "https://globevoyage-admin.onrender.com";
const serverBoot = new Date().toISOString();
let   pingCount  = 0;
let   lastPingAt = null;
let   pipelineStatus = {
  running:     false,
  lastRunAt:   null,
  lastRunName: null,
  nextRuns:    ["06:00 UTC","14:00 UTC","22:00 UTC"],
  countriesLastRun: 0,
};

// Self-ping keepalive — every 5s so Render never sleeps
setInterval(() => {
  const mod = SELF.startsWith("https") ? https : http;
  mod.get(SELF+"/", r=>r.resume()).on("error",()=>{});
  pingCount++;
  lastPingAt = new Date().toISOString();
}, 5000);

const WIKI_UA = "GlobeVoyage/2.0 (travel-intelligence-app; nodejs-axios)";

// ══════════════════════════════════════════════════════════════════
// ALL 195 COUNTRIES
// ══════════════════════════════════════════════════════════════════
const COUNTRIES = [
  // Africa (54)
  {iso:"DZA",name:"Algeria",continent:"Africa"},{iso:"AGO",name:"Angola",continent:"Africa"},
  {iso:"BEN",name:"Benin",continent:"Africa"},{iso:"BWA",name:"Botswana",continent:"Africa"},
  {iso:"BFA",name:"Burkina Faso",continent:"Africa"},{iso:"BDI",name:"Burundi",continent:"Africa"},
  {iso:"CPV",name:"Cape Verde",continent:"Africa"},{iso:"CMR",name:"Cameroon",continent:"Africa"},
  {iso:"CAF",name:"Central African Republic",continent:"Africa"},{iso:"TCD",name:"Chad",continent:"Africa"},
  {iso:"COM",name:"Comoros",continent:"Africa"},{iso:"COD",name:"DR Congo",continent:"Africa"},
  {iso:"COG",name:"Republic of Congo",continent:"Africa"},{iso:"CIV",name:"Ivory Coast",continent:"Africa"},
  {iso:"DJI",name:"Djibouti",continent:"Africa"},{iso:"EGY",name:"Egypt",continent:"Africa"},
  {iso:"GNQ",name:"Equatorial Guinea",continent:"Africa"},{iso:"ERI",name:"Eritrea",continent:"Africa"},
  {iso:"SWZ",name:"Eswatini",continent:"Africa"},{iso:"ETH",name:"Ethiopia",continent:"Africa"},
  {iso:"GAB",name:"Gabon",continent:"Africa"},{iso:"GMB",name:"Gambia",continent:"Africa"},
  {iso:"GHA",name:"Ghana",continent:"Africa"},{iso:"GIN",name:"Guinea",continent:"Africa"},
  {iso:"GNB",name:"Guinea-Bissau",continent:"Africa"},{iso:"KEN",name:"Kenya",continent:"Africa"},
  {iso:"LSO",name:"Lesotho",continent:"Africa"},{iso:"LBR",name:"Liberia",continent:"Africa"},
  {iso:"LBY",name:"Libya",continent:"Africa"},{iso:"MDG",name:"Madagascar",continent:"Africa"},
  {iso:"MWI",name:"Malawi",continent:"Africa"},{iso:"MLI",name:"Mali",continent:"Africa"},
  {iso:"MRT",name:"Mauritania",continent:"Africa"},{iso:"MUS",name:"Mauritius",continent:"Africa"},
  {iso:"MAR",name:"Morocco",continent:"Africa"},{iso:"MOZ",name:"Mozambique",continent:"Africa"},
  {iso:"NAM",name:"Namibia",continent:"Africa"},{iso:"NER",name:"Niger",continent:"Africa"},
  {iso:"NGA",name:"Nigeria",continent:"Africa"},{iso:"RWA",name:"Rwanda",continent:"Africa"},
  {iso:"STP",name:"Sao Tome and Principe",continent:"Africa"},{iso:"SEN",name:"Senegal",continent:"Africa"},
  {iso:"SLE",name:"Sierra Leone",continent:"Africa"},{iso:"SOM",name:"Somalia",continent:"Africa"},
  {iso:"ZAF",name:"South Africa",continent:"Africa"},{iso:"SSD",name:"South Sudan",continent:"Africa"},
  {iso:"SDN",name:"Sudan",continent:"Africa"},{iso:"TZA",name:"Tanzania",continent:"Africa"},
  {iso:"TGO",name:"Togo",continent:"Africa"},{iso:"TUN",name:"Tunisia",continent:"Africa"},
  {iso:"UGA",name:"Uganda",continent:"Africa"},{iso:"ZMB",name:"Zambia",continent:"Africa"},
  {iso:"ZWE",name:"Zimbabwe",continent:"Africa"},
  // Asia (49)
  {iso:"AFG",name:"Afghanistan",continent:"Asia"},{iso:"ARM",name:"Armenia",continent:"Asia"},
  {iso:"AZE",name:"Azerbaijan",continent:"Asia"},{iso:"BHR",name:"Bahrain",continent:"Asia"},
  {iso:"BGD",name:"Bangladesh",continent:"Asia"},{iso:"BTN",name:"Bhutan",continent:"Asia"},
  {iso:"BRN",name:"Brunei",continent:"Asia"},{iso:"KHM",name:"Cambodia",continent:"Asia"},
  {iso:"CHN",name:"China",continent:"Asia"},{iso:"CYP",name:"Cyprus",continent:"Asia"},
  {iso:"GEO",name:"Georgia",continent:"Asia"},{iso:"IND",name:"India",continent:"Asia"},
  {iso:"IDN",name:"Indonesia",continent:"Asia"},{iso:"IRN",name:"Iran",continent:"Asia"},
  {iso:"IRQ",name:"Iraq",continent:"Asia"},{iso:"ISR",name:"Israel",continent:"Asia"},
  {iso:"JPN",name:"Japan",continent:"Asia"},{iso:"JOR",name:"Jordan",continent:"Asia"},
  {iso:"KAZ",name:"Kazakhstan",continent:"Asia"},{iso:"KWT",name:"Kuwait",continent:"Asia"},
  {iso:"KGZ",name:"Kyrgyzstan",continent:"Asia"},{iso:"LAO",name:"Laos",continent:"Asia"},
  {iso:"LBN",name:"Lebanon",continent:"Asia"},{iso:"MYS",name:"Malaysia",continent:"Asia"},
  {iso:"MDV",name:"Maldives",continent:"Asia"},{iso:"MNG",name:"Mongolia",continent:"Asia"},
  {iso:"MMR",name:"Myanmar",continent:"Asia"},{iso:"NPL",name:"Nepal",continent:"Asia"},
  {iso:"PRK",name:"North Korea",continent:"Asia"},{iso:"OMN",name:"Oman",continent:"Asia"},
  {iso:"PAK",name:"Pakistan",continent:"Asia"},{iso:"PSE",name:"Palestine",continent:"Asia"},
  {iso:"PHL",name:"Philippines",continent:"Asia"},{iso:"QAT",name:"Qatar",continent:"Asia"},
  {iso:"SAU",name:"Saudi Arabia",continent:"Asia"},{iso:"SGP",name:"Singapore",continent:"Asia"},
  {iso:"KOR",name:"South Korea",continent:"Asia"},{iso:"LKA",name:"Sri Lanka",continent:"Asia"},
  {iso:"SYR",name:"Syria",continent:"Asia"},{iso:"TWN",name:"Taiwan",continent:"Asia"},
  {iso:"TJK",name:"Tajikistan",continent:"Asia"},{iso:"THA",name:"Thailand",continent:"Asia"},
  {iso:"TLS",name:"Timor-Leste",continent:"Asia"},{iso:"TUR",name:"Turkey",continent:"Asia"},
  {iso:"TKM",name:"Turkmenistan",continent:"Asia"},{iso:"ARE",name:"United Arab Emirates",continent:"Asia"},
  {iso:"UZB",name:"Uzbekistan",continent:"Asia"},{iso:"VNM",name:"Vietnam",continent:"Asia"},
  {iso:"YEM",name:"Yemen",continent:"Asia"},
  // Europe (44)
  {iso:"ALB",name:"Albania",continent:"Europe"},{iso:"AND",name:"Andorra",continent:"Europe"},
  {iso:"AUT",name:"Austria",continent:"Europe"},{iso:"BLR",name:"Belarus",continent:"Europe"},
  {iso:"BEL",name:"Belgium",continent:"Europe"},{iso:"BIH",name:"Bosnia and Herzegovina",continent:"Europe"},
  {iso:"BGR",name:"Bulgaria",continent:"Europe"},{iso:"HRV",name:"Croatia",continent:"Europe"},
  {iso:"CZE",name:"Czech Republic",continent:"Europe"},{iso:"DNK",name:"Denmark",continent:"Europe"},
  {iso:"EST",name:"Estonia",continent:"Europe"},{iso:"FIN",name:"Finland",continent:"Europe"},
  {iso:"FRA",name:"France",continent:"Europe"},{iso:"DEU",name:"Germany",continent:"Europe"},
  {iso:"GRC",name:"Greece",continent:"Europe"},{iso:"HUN",name:"Hungary",continent:"Europe"},
  {iso:"ISL",name:"Iceland",continent:"Europe"},{iso:"IRL",name:"Ireland",continent:"Europe"},
  {iso:"ITA",name:"Italy",continent:"Europe"},{iso:"XKX",name:"Kosovo",continent:"Europe"},
  {iso:"LVA",name:"Latvia",continent:"Europe"},{iso:"LIE",name:"Liechtenstein",continent:"Europe"},
  {iso:"LTU",name:"Lithuania",continent:"Europe"},{iso:"LUX",name:"Luxembourg",continent:"Europe"},
  {iso:"MLT",name:"Malta",continent:"Europe"},{iso:"MDA",name:"Moldova",continent:"Europe"},
  {iso:"MCO",name:"Monaco",continent:"Europe"},{iso:"MNE",name:"Montenegro",continent:"Europe"},
  {iso:"NLD",name:"Netherlands",continent:"Europe"},{iso:"MKD",name:"North Macedonia",continent:"Europe"},
  {iso:"NOR",name:"Norway",continent:"Europe"},{iso:"POL",name:"Poland",continent:"Europe"},
  {iso:"PRT",name:"Portugal",continent:"Europe"},{iso:"ROU",name:"Romania",continent:"Europe"},
  {iso:"RUS",name:"Russia",continent:"Europe"},{iso:"SMR",name:"San Marino",continent:"Europe"},
  {iso:"SRB",name:"Serbia",continent:"Europe"},{iso:"SVK",name:"Slovakia",continent:"Europe"},
  {iso:"SVN",name:"Slovenia",continent:"Europe"},{iso:"ESP",name:"Spain",continent:"Europe"},
  {iso:"SWE",name:"Sweden",continent:"Europe"},{iso:"CHE",name:"Switzerland",continent:"Europe"},
  {iso:"UKR",name:"Ukraine",continent:"Europe"},{iso:"GBR",name:"United Kingdom",continent:"Europe"},
  // North America (23)
  {iso:"ATG",name:"Antigua and Barbuda",continent:"North America"},
  {iso:"BHS",name:"Bahamas",continent:"North America"},{iso:"BRB",name:"Barbados",continent:"North America"},
  {iso:"BLZ",name:"Belize",continent:"North America"},{iso:"CAN",name:"Canada",continent:"North America"},
  {iso:"CRI",name:"Costa Rica",continent:"North America"},{iso:"CUB",name:"Cuba",continent:"North America"},
  {iso:"DMA",name:"Dominica",continent:"North America"},{iso:"DOM",name:"Dominican Republic",continent:"North America"},
  {iso:"SLV",name:"El Salvador",continent:"North America"},{iso:"GRD",name:"Grenada",continent:"North America"},
  {iso:"GTM",name:"Guatemala",continent:"North America"},{iso:"HTI",name:"Haiti",continent:"North America"},
  {iso:"HND",name:"Honduras",continent:"North America"},{iso:"JAM",name:"Jamaica",continent:"North America"},
  {iso:"MEX",name:"Mexico",continent:"North America"},{iso:"NIC",name:"Nicaragua",continent:"North America"},
  {iso:"PAN",name:"Panama",continent:"North America"},{iso:"KNA",name:"Saint Kitts and Nevis",continent:"North America"},
  {iso:"LCA",name:"Saint Lucia",continent:"North America"},
  {iso:"VCT",name:"Saint Vincent and the Grenadines",continent:"North America"},
  {iso:"TTO",name:"Trinidad and Tobago",continent:"North America"},
  {iso:"USA",name:"United States",continent:"North America"},
  // South America (12)
  {iso:"ARG",name:"Argentina",continent:"South America"},{iso:"BOL",name:"Bolivia",continent:"South America"},
  {iso:"BRA",name:"Brazil",continent:"South America"},{iso:"CHL",name:"Chile",continent:"South America"},
  {iso:"COL",name:"Colombia",continent:"South America"},{iso:"ECU",name:"Ecuador",continent:"South America"},
  {iso:"GUY",name:"Guyana",continent:"South America"},{iso:"PRY",name:"Paraguay",continent:"South America"},
  {iso:"PER",name:"Peru",continent:"South America"},{iso:"SUR",name:"Suriname",continent:"South America"},
  {iso:"URY",name:"Uruguay",continent:"South America"},{iso:"VEN",name:"Venezuela",continent:"South America"},
  // Oceania (14)
  {iso:"AUS",name:"Australia",continent:"Oceania"},{iso:"FJI",name:"Fiji",continent:"Oceania"},
  {iso:"KIR",name:"Kiribati",continent:"Oceania"},{iso:"MHL",name:"Marshall Islands",continent:"Oceania"},
  {iso:"FSM",name:"Micronesia",continent:"Oceania"},{iso:"NRU",name:"Nauru",continent:"Oceania"},
  {iso:"NZL",name:"New Zealand",continent:"Oceania"},{iso:"PLW",name:"Palau",continent:"Oceania"},
  {iso:"PNG",name:"Papua New Guinea",continent:"Oceania"},{iso:"WSM",name:"Samoa",continent:"Oceania"},
  {iso:"SLB",name:"Solomon Islands",continent:"Oceania"},{iso:"TON",name:"Tonga",continent:"Oceania"},
  {iso:"TUV",name:"Tuvalu",continent:"Oceania"},{iso:"VUT",name:"Vanuatu",continent:"Oceania"},
];

const HOT_ISOS = new Set([
  "FRA","USA","GBR","JPN","ITA","ESP","THA","AUS","DEU","CAN",
  "MEX","BRA","ARE","SGP","IND","GRC","PRT","NLD","CHE","NZL"
]);

// ══════════════════════════════════════════════════════════════════
// SOURCE HEALTH TRACKING
// ══════════════════════════════════════════════════════════════════
const sourceHealth = {};
function recordHealth(source, ok, ms, err) {
  sourceHealth[source] = {
    ok, last_check: new Date().toISOString(),
    response_ms: ms, error: err||null,
    success_count: (sourceHealth[source]?.success_count||0)+(ok?1:0),
    fail_count:    (sourceHealth[source]?.fail_count||0)+(ok?0:1),
  };
}
async function timed(source, fn) {
  const t = Date.now();
  try { const r = await fn(); recordHealth(source,true,Date.now()-t,null); return r; }
  catch(e) { recordHealth(source,false,Date.now()-t,e.message); throw e; }
}

// ══════════════════════════════════════════════════════════════════
// CAPITAL COORDINATES
// ══════════════════════════════════════════════════════════════════
const geoCoordCache = {
  // Africa
  DZA:{lat:36.7372,lon:3.0865},   AGO:{lat:-8.8368,lon:13.2343},
  BEN:{lat:6.3654,lon:2.4183},    BWA:{lat:-24.6282,lon:25.9231},
  BFA:{lat:12.3569,lon:-1.5353},  BDI:{lat:-3.3869,lon:29.3619},
  CPV:{lat:14.9315,lon:-23.5087}, CMR:{lat:3.8612,lon:11.5217},
  CAF:{lat:4.3612,lon:18.5550},   TCD:{lat:12.1048,lon:15.0445},
  COM:{lat:-11.7022,lon:43.2551}, COD:{lat:-4.3276,lon:15.3215},
  COG:{lat:-4.2634,lon:15.2429},  CIV:{lat:6.8276,lon:-5.2893},
  DJI:{lat:11.5886,lon:43.1456},  EGY:{lat:30.0444,lon:31.2357},
  GNQ:{lat:3.7523,lon:8.7741},    ERI:{lat:15.3229,lon:38.9251},
  SWZ:{lat:-26.3054,lon:31.1367}, ETH:{lat:9.0320,lon:38.7421},
  GAB:{lat:0.4162,lon:9.4673},    GMB:{lat:13.4549,lon:-16.5790},
  GHA:{lat:5.5502,lon:-0.2174},   GIN:{lat:9.5243,lon:-13.6773},
  GNB:{lat:11.8636,lon:-15.5977}, KEN:{lat:-1.2921,lon:36.8219},
  LSO:{lat:-29.3151,lon:27.4869}, LBR:{lat:6.3005,lon:-10.7969},
  LBY:{lat:32.9021,lon:13.1806},  MDG:{lat:-18.9137,lon:47.5361},
  MWI:{lat:-13.9669,lon:33.7873}, MLI:{lat:12.6392,lon:-8.0029},
  MRT:{lat:18.0735,lon:-15.9582}, MUS:{lat:-20.1654,lon:57.4896},
  MAR:{lat:33.9716,lon:-6.8498},  MOZ:{lat:-25.9692,lon:32.5732},
  NAM:{lat:-22.5609,lon:17.0658}, NER:{lat:13.5116,lon:2.1254},
  NGA:{lat:9.0765,lon:7.3986},    RWA:{lat:-1.9441,lon:30.0619},
  STP:{lat:0.3365,lon:6.7273},    SEN:{lat:14.6928,lon:-17.4467},
  SLE:{lat:8.4897,lon:-13.2344},  SOM:{lat:2.0469,lon:45.3182},
  ZAF:{lat:-25.7479,lon:28.2293}, SSD:{lat:4.8517,lon:31.5825},
  SDN:{lat:15.5007,lon:32.5599},  TZA:{lat:-6.1722,lon:35.7395},
  TGO:{lat:6.1375,lon:1.2123},    TUN:{lat:36.8190,lon:10.1658},
  UGA:{lat:0.3476,lon:32.5825},   ZMB:{lat:-15.4166,lon:28.2833},
  ZWE:{lat:-17.8252,lon:31.0335},
  // Asia
  AFG:{lat:34.5553,lon:69.2075},  ARM:{lat:40.1872,lon:44.5152},
  AZE:{lat:40.4093,lon:49.8671},  BHR:{lat:26.2154,lon:50.5860},
  BGD:{lat:23.8103,lon:90.4125},  BTN:{lat:27.4728,lon:89.6390},
  BRN:{lat:4.9031,lon:114.9398},  KHM:{lat:11.5626,lon:104.9282},
  CHN:{lat:39.9042,lon:116.4074}, CYP:{lat:35.1856,lon:33.3823},
  GEO:{lat:41.6938,lon:44.8015},  IND:{lat:28.6139,lon:77.2090},
  IDN:{lat:-6.2088,lon:106.8456}, IRN:{lat:35.6892,lon:51.3890},
  IRQ:{lat:33.3406,lon:44.4009},  ISR:{lat:31.7683,lon:35.2137},
  JPN:{lat:35.6762,lon:139.6503}, JOR:{lat:31.9566,lon:35.9457},
  KAZ:{lat:51.1811,lon:71.4460},  KWT:{lat:29.3759,lon:47.9774},
  KGZ:{lat:42.8746,lon:74.5698},  LAO:{lat:17.9757,lon:102.6331},
  LBN:{lat:33.8938,lon:35.5018},  MYS:{lat:3.1390,lon:101.6869},
  MDV:{lat:4.1755,lon:73.5093},   MNG:{lat:47.9077,lon:106.8832},
  MMR:{lat:19.7633,lon:96.0785},  NPL:{lat:27.7172,lon:85.3240},
  PRK:{lat:39.0392,lon:125.7625}, OMN:{lat:23.5880,lon:58.3829},
  PAK:{lat:33.7294,lon:73.0931},  PSE:{lat:31.9522,lon:35.2332},
  PHL:{lat:14.5995,lon:120.9842}, QAT:{lat:25.2854,lon:51.5310},
  SAU:{lat:24.6877,lon:46.7219},  SGP:{lat:1.3521,lon:103.8198},
  KOR:{lat:37.5665,lon:126.9780}, LKA:{lat:6.9271,lon:79.8612},
  SYR:{lat:33.5102,lon:36.2913},  TWN:{lat:25.0330,lon:121.5654},
  TJK:{lat:38.5598,lon:68.7733},  THA:{lat:13.7563,lon:100.5018},
  TLS:{lat:-8.5569,lon:125.5789}, TUR:{lat:39.9334,lon:32.8597},
  TKM:{lat:37.9601,lon:58.3261},  ARE:{lat:24.4539,lon:54.3773},
  UZB:{lat:41.2995,lon:69.2401},  VNM:{lat:21.0285,lon:105.8542},
  YEM:{lat:15.3694,lon:44.1910},
  // Europe
  ALB:{lat:41.3275,lon:19.8187},  AND:{lat:42.5063,lon:1.5218},
  AUT:{lat:48.2082,lon:16.3738},  BLR:{lat:53.9045,lon:27.5615},
  BEL:{lat:50.8503,lon:4.3517},   BIH:{lat:43.8486,lon:18.3564},
  BGR:{lat:42.6977,lon:23.3219},  HRV:{lat:45.8150,lon:15.9819},
  CZE:{lat:50.0755,lon:14.4378},  DNK:{lat:55.6761,lon:12.5683},
  EST:{lat:59.4370,lon:24.7536},  FIN:{lat:60.1699,lon:24.9384},
  FRA:{lat:48.8566,lon:2.3522},   DEU:{lat:52.5200,lon:13.4050},
  GRC:{lat:37.9838,lon:23.7275},  HUN:{lat:47.4979,lon:19.0402},
  ISL:{lat:64.1266,lon:-21.8174}, IRL:{lat:53.3498,lon:-6.2603},
  ITA:{lat:41.9028,lon:12.4964},  XKX:{lat:42.6629,lon:21.1655},
  LVA:{lat:56.9460,lon:24.1059},  LIE:{lat:47.1410,lon:9.5215},
  LTU:{lat:54.6872,lon:25.2797},  LUX:{lat:49.6117,lon:6.1319},
  MLT:{lat:35.8997,lon:14.5147},  MDA:{lat:47.0105,lon:28.8638},
  MCO:{lat:43.7384,lon:7.4246},   MNE:{lat:42.4304,lon:19.2594},
  NLD:{lat:52.3676,lon:4.9041},   MKD:{lat:41.9965,lon:21.4314},
  NOR:{lat:59.9139,lon:10.7522},  POL:{lat:52.2297,lon:21.0122},
  PRT:{lat:38.7169,lon:-9.1395},  ROU:{lat:44.4268,lon:26.1025},
  RUS:{lat:55.7558,lon:37.6173},  SMR:{lat:43.9424,lon:12.4578},
  SRB:{lat:44.8176,lon:20.4633},  SVK:{lat:48.1486,lon:17.1077},
  SVN:{lat:46.0569,lon:14.5058},  ESP:{lat:40.4168,lon:-3.7038},
  SWE:{lat:59.3293,lon:18.0686},  CHE:{lat:46.9480,lon:7.4474},
  UKR:{lat:50.4501,lon:30.5234},  GBR:{lat:51.5074,lon:-0.1278},
  // North America
  ATG:{lat:17.1274,lon:-61.8468}, BHS:{lat:25.0480,lon:-77.3554},
  BRB:{lat:13.0969,lon:-59.6145}, BLZ:{lat:17.2510,lon:-88.7590},
  CAN:{lat:45.4215,lon:-75.6972}, CRI:{lat:9.9281,lon:-84.0907},
  CUB:{lat:23.1136,lon:-82.3666}, DMA:{lat:15.3092,lon:-61.3794},
  DOM:{lat:18.4861,lon:-69.9312}, SLV:{lat:13.6929,lon:-89.2182},
  GRD:{lat:12.0561,lon:-61.7488}, GTM:{lat:14.6349,lon:-90.5069},
  HTI:{lat:18.5392,lon:-72.3350}, HND:{lat:14.0818,lon:-87.2068},
  JAM:{lat:17.9970,lon:-76.7936}, MEX:{lat:19.4326,lon:-99.1332},
  NIC:{lat:12.1328,lon:-86.2926}, PAN:{lat:8.9936,lon:-79.5197},
  KNA:{lat:17.3026,lon:-62.7177}, LCA:{lat:14.0101,lon:-60.9875},
  VCT:{lat:13.1600,lon:-61.2248}, TTO:{lat:10.6549,lon:-61.5019},
  USA:{lat:38.8951,lon:-77.0364},
  // South America
  ARG:{lat:-34.6037,lon:-58.3816},BOL:{lat:-16.5000,lon:-68.1500},
  BRA:{lat:-15.7975,lon:-47.8919},CHL:{lat:-33.4489,lon:-70.6693},
  COL:{lat:4.7110,lon:-74.0721},  ECU:{lat:-0.2295,lon:-78.5243},
  GUY:{lat:6.8013,lon:-58.1553},  PRY:{lat:-25.2867,lon:-57.6470},
  PER:{lat:-12.0464,lon:-77.0428},SUR:{lat:5.8520,lon:-55.2038},
  URY:{lat:-34.9011,lon:-56.1915},VEN:{lat:10.4806,lon:-66.9036},
  // Oceania
  AUS:{lat:-35.2809,lon:149.1300},FJI:{lat:-18.1416,lon:178.4415},
  KIR:{lat:1.3290,lon:172.9790},  MHL:{lat:7.1095,lon:171.3803},
  FSM:{lat:6.9248,lon:158.1618},  NRU:{lat:-0.5477,lon:166.9209},
  NZL:{lat:-41.2865,lon:174.7762},PLW:{lat:7.5000,lon:134.6240},
  PNG:{lat:-9.4438,lon:147.1803}, WSM:{lat:-13.8314,lon:-172.1345},
  SLB:{lat:-9.4456,lon:160.0432}, TON:{lat:-21.1393,lon:-175.2049},
  TUV:{lat:-8.5200,lon:179.1980}, VUT:{lat:-17.7333,lon:168.3210},
};

// ══════════════════════════════════════════════════════════════════
// DATA FETCHERS
// ══════════════════════════════════════════════════════════════════

async function fetchWikipedia(countryName) {
  return timed("wikipedia", async () => {
    const headers = { "User-Agent": WIKI_UA };
    const s = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{ action:"query",format:"json",list:"search",srsearch:`${countryName} tourism`,srlimit:1 },
      headers, timeout:8000
    });
    const title = s.data?.query?.search?.[0]?.title || countryName;
    const c = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{ action:"query",format:"json",prop:"extracts",exintro:true,explaintext:true,titles:title },
      headers, timeout:8000
    });
    const page = Object.values(c.data?.query?.pages||{})[0];
    return { summary:(page?.extract||"").slice(0,1500), title };
  });
}

async function fetchWikivoyage(countryName) {
  return timed("wikivoyage", async () => {
    const headers = { "User-Agent": WIKI_UA };
    const r = await axios.get("https://en.wikivoyage.org/w/api.php", {
      params:{ action:"query",format:"json",prop:"extracts",explaintext:true,titles:countryName },
      headers, timeout:8000
    });
    const page = Object.values(r.data?.query?.pages||{})[0];
    const text = page?.extract||"";
    const sections = {};
    ["See","Do","Eat","Drink","Sleep","Stay safe","Get in","Get around"].forEach(sec => {
      const m = text.match(new RegExp(`==\\s*${sec}\\s*==([\\s\\S]*?)(?====|$)`,"i"));
      if(m) sections[sec] = m[1].trim().slice(0,600);
    });
    const highlights = (text.match(/^\*\s+(.+)$/gm)||[]).slice(0,10).map(l=>l.replace(/^\*\s+/,""));
    return { sections, highlights, full:text.slice(0,2000) };
  });
}

async function fetchFoursquare(countryName, iso) {
  return timed("foursquare", async () => {
    const coords = geoCoordCache[iso] || geoCoordCache["FRA"];
    const { lat, lon } = coords;
    const r = await axios.get("https://api.opentripmap.com/0.1/en/places/radius", {
      params: {
        radius:   100000,
        lon:      lon,
        lat:      lat,
        kinds:    "interesting_places,tourist_facilities,cultural,historic",
        rate:     "3",
        format:   "json",
        limit:    10,
        apikey:   "5ae2e3f221c38a28845f05b681b7e8e0898a39f3f1d2a7c3b24d7c12",
      },
      timeout: 8000
    });
    return (r.data||[]).slice(0,8).map(p => ({
      name:       p.name || p.wikipedia_extracts?.title || "Attraction",
      fsq_id:     p.xid,
      lat:        p.point?.lat,
      lng:        p.point?.lon,
      address:    `${countryName}`,
      categories: [p.kinds?.split(",")[0]?.replace(/_/g," ") || "attraction"],
    })).filter(p => p.name && p.name !== "Attraction");
  });
}

async function fetchWeather(countryName) {
  if(!ENV.OPENWEATHER_API_KEY) return {now:null,forecast:[]};
  return timed("openweathermap", async () => {
    const [nR,fR] = await Promise.all([
      axios.get("https://api.openweathermap.org/data/2.5/weather",{params:{q:countryName,appid:ENV.OPENWEATHER_API_KEY,units:"metric"},timeout:6000}),
      axios.get("https://api.openweathermap.org/data/2.5/forecast",{params:{q:countryName,appid:ENV.OPENWEATHER_API_KEY,units:"metric",cnt:5},timeout:6000}),
    ]);
    const n=nR.data;
    return {
      now:{ temp:Math.round(n.main.temp),feels_like:Math.round(n.main.feels_like),condition:n.weather[0].description,icon:n.weather[0].icon,humidity:n.main.humidity,wind:Math.round(n.wind.speed*3.6) },
      forecast:(fR.data?.list||[]).slice(0,5).map(f=>({date:f.dt_txt.split(" ")[0],high:Math.round(f.main.temp_max),low:Math.round(f.main.temp_min),condition:f.weather[0].description,icon:f.weather[0].icon}))
    };
  });
}

function riskScore(text){
  const t=(text||"").toLowerCase();
  if(/strike|protest|riot|attack|terror|quake|flood|hurricane|tsunami|evacuation|emergency|coup/.test(t)) return "high";
  if(/delay|cancel|warning|alert|caution|unrest|closure/.test(t)) return "medium";
  return "low";
}

const gnewsCache = {};
let gnewsCallsToday = 0;
let gnewsResetAt    = Date.now() + 24*60*60*1000;
const GNEWS_DAILY_CAP = 8;

function gnewsResetIfNeeded() {
  if(Date.now() > gnewsResetAt) {
    gnewsCallsToday = 0;
    gnewsResetAt    = Date.now() + 24*60*60*1000;
  }
}
function gnewsBudgetAvailable() {
  gnewsResetIfNeeded();
  return gnewsCallsToday < GNEWS_DAILY_CAP;
}
function hoursUntilReset() {
  return Math.max(0, Math.round((gnewsResetAt - Date.now()) / 3600000));
}

const ALPHA2 = {
  DZA:"dz",EGY:"eg",GHA:"gh",KEN:"ke",MAR:"ma",NGA:"ng",ZAF:"za",TUN:"tn",
  ETH:"et",TZA:"tz",UGA:"ug",CMR:"cm",SEN:"sn",CIV:"ci",AGO:"ao",SDN:"sd",
  CHN:"cn",IND:"in",IDN:"id",JPN:"jp",KOR:"kr",MYS:"my",PAK:"pk",PHL:"ph",
  SAU:"sa",SGP:"sg",LKA:"lk",THA:"th",TUR:"tr",ARE:"ae",VNM:"vn",BGD:"bd",
  IRN:"ir",IRQ:"iq",ISR:"il",JOR:"jo",KWT:"kw",LBN:"lb",QAT:"qa",SYR:"sy",
  AUT:"at",BEL:"be",BGR:"bg",HRV:"hr",CZE:"cz",DNK:"dk",FIN:"fi",FRA:"fr",
  DEU:"de",GRC:"gr",HUN:"hu",IRL:"ie",ITA:"it",NLD:"nl",NOR:"no",POL:"pl",
  PRT:"pt",ROU:"ro",RUS:"ru",SRB:"rs",SVK:"sk",ESP:"es",SWE:"se",CHE:"ch",
  UKR:"ua",GBR:"gb",BLR:"by",AZE:"az",GEO:"ge",ARM:"am",
  CAN:"ca",MEX:"mx",USA:"us",CUB:"cu",DOM:"do",GTM:"gt",HND:"hn",CRI:"cr",
  ARG:"ar",BRA:"br",CHL:"cl",COL:"co",PER:"pe",VEN:"ve",ECU:"ec",BOL:"bo",
  AUS:"au",NZL:"nz",
};

async function fetchNews(countryName, iso) {
  if(!ENV.GNEWS_API_KEY) return [];
  const cached = gnewsCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  if(!gnewsBudgetAvailable()) {
    console.log(`[GNews] Daily cap reached (${gnewsCallsToday}/${GNEWS_DAILY_CAP}) — skipping ${iso}`);
    return cached ? cached.data : [];
  }
  const country2 = ALPHA2[iso] || null;
  if(!country2) return [];
  return timed("newsapi", async () => {
    const r = await axios.get("https://gnews.io/api/v4/top-headlines", {
      params: { country: country2, lang:"en", max:5, token: ENV.GNEWS_API_KEY },
      timeout: 8000
    });
    gnewsCallsToday++;
    const data = (r.data?.articles||[]).slice(0,5).map(a => ({
      title:        a.title,
      url:          a.url,
      source:       a.source?.name,
      published_at: a.publishedAt,
      description:  (a.description||"").slice(0,200),
      risk_level:   riskScore(a.title+" "+(a.description||"")),
    }));
    gnewsCache[iso] = { data, expires: Date.now()+6*60*60*1000 };
    return data;
  });
}

async function fetchGoogleNews(countryName) {
  return timed("google_news", async () => {
    const q = encodeURIComponent(`${countryName} travel`);
    const r = await axios.get(`https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`,{timeout:8000,headers:{"User-Agent":"GlobeVoyage/2.0"}});
    const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
    const items = parsed?.rss?.channel?.item||[];
    const arr = Array.isArray(items)?items:[items];
    return arr.filter(i=>i&&i.title).slice(0,8).map(i=>({title:i.title,url:i.link,source:i.source?._||"Google News",published_at:i.pubDate,risk_level:riskScore(i.title||"")}));
  });
}

async function fetchGDACS(countryName) {
  return timed("gdacs", async () => {
    const r = await axios.get("https://www.gdacs.org/xml/rss.xml",{timeout:10000,headers:{"User-Agent":"GlobeVoyage/2.0"}});
    const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
    const items = parsed?.rss?.channel?.item||[];
    const arr = Array.isArray(items)?items:[items];
    const cn = countryName.toLowerCase();
    return arr.filter(i=>(i.title||"").toLowerCase().includes(cn)||(i.description||"").toLowerCase().includes(cn))
      .slice(0,4).map(i=>({event_type:i["gdacs:eventtype"]||"Disaster",severity:i["gdacs:alertlevel"]||"Unknown",description:i.title,date:i.pubDate,url:i.link}));
  });
}

async function fetchTicketmaster(countryName, iso) {
  if(!ENV.TICKETMASTER_API_KEY) return [];
  return timed("ticketmaster", async () => {
    const r = await axios.get("https://app.ticketmaster.com/discovery/v2/events.json",{
      params:{apikey:ENV.TICKETMASTER_API_KEY,keyword:countryName,countryCode:iso?.slice(0,2)||"",size:8,sort:"date,asc",startDateTime:new Date().toISOString().split(".")[0]+"Z"},
      timeout:8000
    });
    return (r.data?._embedded?.events||[]).slice(0,8).map(e=>({name:e.name,date:e.dates?.start?.localDate,venue:e._embedded?.venues?.[0]?.name,city:e._embedded?.venues?.[0]?.city?.name,type:e.classifications?.[0]?.segment?.name,url:e.url,source:"Ticketmaster",price:e.priceRanges?.[0]?`${e.priceRanges[0].currency} ${Math.round(e.priceRanges[0].min)}-${Math.round(e.priceRanges[0].max)}`:null}));
  });
}

async function fetchEventbrite(countryName) {
  return timed("eventbrite", async () => {
    const results = [];
    try {
      const q = encodeURIComponent(countryName);
      const r = await axios.get(
        `https://www.meetup.com/find/events/?allMeetups=true&keywords=${q}&radius=200&userFreeform=${q}&mcId=c10001&mcName=${q}&sort=default&eventFilter=all`,
        { timeout:6000, headers:{"User-Agent":"GlobeVoyage/2.0","Accept":"application/rss+xml,application/xml,text/xml"} }
      );
      if(r.headers["content-type"]?.includes("xml")) {
        const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
        const items = parsed?.rss?.channel?.item||[];
        const arr = Array.isArray(items)?items:[items];
        arr.filter(i=>i&&i.title).slice(0,5).forEach(i=>{
          results.push({
            name: typeof i.title==="object"?i.title._:i.title,
            date: i.pubDate?new Date(i.pubDate).toISOString().split("T")[0]:null,
            url:  i.link||"",
            description: (typeof i.description==="object"?i.description._:i.description||"").replace(/<[^>]*>/g,"").slice(0,150),
            source:"Meetup",
          });
        });
      }
    } catch(e) {}
    if(results.length === 0) {
      const q3 = encodeURIComponent(`${countryName} events festival concert`);
      try {
        const r3 = await axios.get(`https://news.google.com/rss/search?q=${q3}&hl=en&gl=US&ceid=US:en`,
          {timeout:5000,headers:{"User-Agent":"GlobeVoyage/2.0"}});
        const parsed3 = await xml2js.parseStringPromise(r3.data,{explicitArray:false});
        const items3 = parsed3?.rss?.channel?.item||[];
        const arr3 = Array.isArray(items3)?items3:[items3];
        arr3.filter(i=>i&&i.title).slice(0,4).forEach(i=>{
          results.push({
            name: typeof i.title==="object"?i.title._:i.title,
            date: i.pubDate?new Date(i.pubDate).toISOString().split("T")[0]:null,
            url:  i.link||"",
            source:"Google News Events",
          });
        });
      } catch(e) {}
    }
    if(results.length===0) throw new Error("No event sources returned data");
    return results.slice(0,8);
  });
}

async function fetchPredictHQ(countryName) {
  if(!ENV.PREDICTHQ_API_KEY) return [];
  return timed("predicthq", async () => {
    const r = await axios.get("https://api.predicthq.com/v1/events/",{
      params:{country:countryName,active_from:new Date().toISOString().split("T")[0],limit:8,sort:"rank","category[]":"concerts,festivals,performing-arts,sports,public-holidays"},
      headers:{Authorization:`Bearer ${ENV.PREDICTHQ_API_KEY}`},timeout:8000
    });
    return (r.data?.results||[]).slice(0,8).map(e=>({name:e.title,date:e.start,type:e.category,description:(e.description||"").slice(0,200),rank:e.rank,source:"PredictHQ"}));
  });
}

async function fetchGeoapify(countryName, iso) {
  if(!ENV.GEOAPIFY_API_KEY) return {};
  return timed("geoapify", async () => {
    const g = await axios.get("https://api.geoapify.com/v1/geocode/search",{
      params:{text:countryName,type:"country",apiKey:ENV.GEOAPIFY_API_KEY,limit:1},
      timeout:6000});
    const place = g.data?.features?.[0];
    if(!place) return {};
    const {lat,lon} = place.properties;
    if(iso) geoCoordCache[iso] = {lat, lon};
    const p = await axios.get("https://api.geoapify.com/v2/places",{
      params:{categories:"tourism,entertainment",filter:`circle:${lon},${lat},50000`,
        limit:8,apiKey:ENV.GEOAPIFY_API_KEY},
      timeout:8000});
    return {
      capital_coords:{lat,lon},
      pois:(p.data?.features||[]).slice(0,8).map(f=>({
        name:f.properties.name, category:f.properties.categories?.[0],
        address:f.properties.formatted, lat:f.properties.lat, lon:f.properties.lon,
      }))
    };
  });
}

async function fetchSocialTrends(countryName) {
  return timed("social_proxy", async () => {
    const results = [];
    try {
      const q = encodeURIComponent(`${countryName} travel trending`);
      const r = await axios.get(
        `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`,
        { timeout:6000, headers:{"User-Agent":"GlobeVoyage/2.0"} }
      );
      const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
      const items = parsed?.rss?.channel?.item||[];
      const arr = Array.isArray(items)?items:[items];
      arr.filter(i=>i&&i.title).slice(0,4).forEach(i=>{
        results.push({
          platform:"Google News",
          caption: typeof i.title==="object"?i.title._:i.title,
          url: i.link||"",
          sentiment:"neutral",
        });
      });
    } catch(e){}
    try {
      const bq = encodeURIComponent(`${countryName} tourism`);
      const br = await axios.get(
        `https://www.bing.com/news/search?q=${bq}&format=RSS`,
        { timeout:6000, headers:{"User-Agent":"GlobeVoyage/2.0"} }
      );
      const parsed2 = await xml2js.parseStringPromise(br.data,{explicitArray:false});
      const items2 = parsed2?.rss?.channel?.item||[];
      const arr2 = Array.isArray(items2)?items2:[items2];
      arr2.filter(i=>i&&i.title).slice(0,3).forEach(i=>{
        results.push({
          platform:"Bing News",
          caption: typeof i.title==="object"?i.title._:i.title,
          url: i.link||"",
          sentiment:"neutral",
        });
      });
    } catch(e){}
    return results.slice(0,6);
  });
}

// ══════════════════════════════════════════════════════════════════
// NEW DATA SOURCES
// ══════════════════════════════════════════════════════════════════

async function fetchUnsplash(countryName) {
  if(!ENV.UNSPLASH_ACCESS_KEY) return [];
  return timed("unsplash", async () => {
    const r = await axios.get("https://api.unsplash.com/search/photos", {
      params:{
        query:     `${countryName} travel landscape`,
        per_page:  9,
        order_by:  "relevant",
        orientation: "landscape",
      },
      headers:{ Authorization:`Client-ID ${ENV.UNSPLASH_ACCESS_KEY}` },
      timeout: 8000,
    });
    return (r.data?.results||[]).map(p => ({
      id:          p.id,
      url_small:   p.urls?.small,
      url_regular: p.urls?.regular,
      url_full:    p.urls?.full,
      alt:         p.alt_description||p.description||countryName,
      credit:      p.user?.name||"",
      credit_link: p.user?.links?.html||"",
      color:       p.color||"#000",
      width:       p.width,
      height:      p.height,
    }));
  });
}

async function fetchAirQuality(countryName, iso) {
  return timed("openaq", async () => {
    const ALPHA2_AQ = {
      DZA:"DZ",EGY:"EG",GHA:"GH",KEN:"KE",MAR:"MA",NGA:"NG",ZAF:"ZA",TUN:"TN",
      ETH:"ET",TZA:"TZ",UGA:"UG",CMR:"CM",SEN:"SN",CIV:"CI",AGO:"AO",SDN:"SD",
      CHN:"CN",IND:"IN",IDN:"ID",JPN:"JP",KOR:"KR",MYS:"MY",PAK:"PK",PHL:"PH",
      SAU:"SA",SGP:"SG",LKA:"LK",THA:"TH",TUR:"TR",ARE:"AE",VNM:"VN",BGD:"BD",
      IRN:"IR",IRQ:"IQ",ISR:"IL",JOR:"JO",KWT:"KW",LBN:"LB",QAT:"QA",SYR:"SY",
      AUT:"AT",BEL:"BE",BGR:"BG",HRV:"HR",CZE:"CZ",DNK:"DK",FIN:"FI",FRA:"FR",
      DEU:"DE",GRC:"GR",HUN:"HU",IRL:"IE",ITA:"IT",NLD:"NL",NOR:"NO",POL:"PL",
      PRT:"PT",ROU:"RO",RUS:"RU",SRB:"RS",SVK:"SK",ESP:"ES",SWE:"SE",CHE:"CH",
      UKR:"UA",GBR:"GB",BLR:"BY",AZE:"AZ",GEO:"GE",ARM:"AM",
      CAN:"CA",MEX:"MX",USA:"US",CUB:"CU",DOM:"DO",GTM:"GT",HND:"HN",CRI:"CR",
      ARG:"AR",BRA:"BR",CHL:"CL",COL:"CO",PER:"PE",VEN:"VE",ECU:"EC",BOL:"BO",
      AUS:"AU",NZL:"NZ",
    };
    const cc = ALPHA2_AQ[iso];
    if(!cc) return null;
    const headers = ENV.OPENAQ_API_KEY ? { "X-API-Key": ENV.OPENAQ_API_KEY } : {};
    const r = await axios.get("https://api.openaq.org/v3/locations", {
      params:{ countries_id: cc, limit: 5, order_by: "lastUpdated", sort_order: "desc" },
      headers,
      timeout: 8000,
    });
    const locations = r.data?.results||[];
    if(!locations.length) return null;
    const locId = locations[0].id;
    const m = await axios.get(`https://api.openaq.org/v3/locations/${locId}/latest`, {
      headers,
      timeout: 8000,
    });
    const measurements = m.data?.results||[];
    const byParam = {};
    measurements.forEach(x => { byParam[x.parameter] = x.value; });
    const pm25 = byParam["pm25"] ?? byParam["pm2.5"] ?? null;
    const pm10 = byParam["pm10"] ?? null;
    const aqi  = pm25 !== null ? calcAQI(pm25) : null;
    return {
      location:  locations[0].name||countryName,
      pm25:      pm25 !== null ? Math.round(pm25*10)/10 : null,
      pm10:      pm10 !== null ? Math.round(pm10*10)/10 : null,
      aqi,
      aqi_label: aqi !== null ? aqiLabel(aqi) : null,
      updated:   locations[0].lastUpdated||null,
    };
  });
}

function calcAQI(pm25) {
  const bp = [
    [0,12,0,50],[12.1,35.4,51,100],[35.5,55.4,101,150],
    [55.5,150.4,151,200],[150.5,250.4,201,300],[250.5,500.4,301,500],
  ];
  for(const [cLow,cHigh,iLow,iHigh] of bp) {
    if(pm25 >= cLow && pm25 <= cHigh) {
      return Math.round(((iHigh-iLow)/(cHigh-cLow))*(pm25-cLow)+iLow);
    }
  }
  return null;
}

function aqiLabel(aqi) {
  if(aqi<=50)  return "Good";
  if(aqi<=100) return "Moderate";
  if(aqi<=150) return "Unhealthy for Sensitive Groups";
  if(aqi<=200) return "Unhealthy";
  if(aqi<=300) return "Very Unhealthy";
  return "Hazardous";
}

const aviationCache = {};
async function fetchFlights(countryName, iso) {
  if(!ENV.AVIATIONSTACK_API_KEY) return null;
  const cached = aviationCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("aviationstack", async () => {
    const r = await axios.get("http://api.aviationstack.com/v1/airports", {
      params:{
        access_key: ENV.AVIATIONSTACK_API_KEY,
        country_name: countryName,
        limit: 5,
      },
      timeout: 10000,
    });
    const airports = (r.data?.data||[]).map(a => ({
      name:      a.airport_name,
      iata:      a.iata_code,
      city:      a.city_iata_code||a.city||"",
      latitude:  a.latitude,
      longitude: a.longitude,
    })).filter(a => a.iata);
    const data = { airports, major_hub: airports[0]||null };
    aviationCache[iso] = { data, expires: Date.now()+24*60*60*1000 };
    return data;
  });
}

const numbeoCache = {};
let numbeoCallsThisMonth = 0;
let numbeoResetAt = Date.now() + 30*24*60*60*1000;
const NUMBEO_MONTHLY_CAP = 8;

function numbeoResetIfNeeded() {
  if(Date.now() > numbeoResetAt) { numbeoCallsThisMonth=0; numbeoResetAt=Date.now()+30*24*60*60*1000; }
}

async function fetchCostOfLiving(countryName) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = numbeoCache[countryName];
  if(cached && Date.now() < cached.expires) return cached.data;
  numbeoResetIfNeeded();
  if(numbeoCallsThisMonth >= NUMBEO_MONTHLY_CAP) {
    console.log(`[Numbeo] Monthly cap reached — skipping ${countryName}`);
    return cached ? cached.data : null;
  }
  return timed("numbeo", async () => {
    const r = await axios.get("https://cost-of-living-and-prices.p.rapidapi.com/prices", {
      params:{ country_name: countryName, city_name: "" },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "cost-of-living-and-prices.p.rapidapi.com",
      },
      timeout: 10000,
    });
    numbeoCallsThisMonth++;
    const items = r.data?.prices||[];
    const get = (name) => items.find(i=>i.item_name?.toLowerCase().includes(name.toLowerCase()))?.avg||null;
    const data = {
      city:               r.data?.city_name||countryName,
      country:            r.data?.country_name||countryName,
      meal_cheap:         get("inexpensive restaurant"),
      meal_mid:           get("mid-range restaurant"),
      coffee:             get("cappuccino"),
      beer_local:         get("domestic beer"),
      water_bottle:       get("water (0.33"),
      one_bed_city_rent:  get("1 bedroom apartment in city"),
      one_bed_outside_rent: get("1 bedroom apartment outside"),
      monthly_transport:  get("monthly pass"),
      taxi_per_km:        get("taxi 1km"),
      internet_monthly:   get("internet"),
      avg_salary:         get("average monthly net salary"),
      currency:           "USD",
      raw_count:          items.length,
    };
    numbeoCache[countryName] = { data, expires: Date.now()+24*60*60*1000 };
    return data;
  });
}

const restCountriesCache = {};
async function fetchRestCountries(iso) {
  if(restCountriesCache[iso]) return restCountriesCache[iso];
  return timed("rest_countries", async () => {
    const r = await axios.get(`https://restcountries.com/v3.1/alpha/${iso}`, {
      timeout: 8000,
    });
    const c = r.data?.[0];
    if(!c) return null;
    const data = {
      name:         c.name?.common,
      official:     c.name?.official,
      capital:      c.capital?.[0]||null,
      region:       c.region,
      subregion:    c.subregion,
      population:   c.population,
      area_km2:     c.area,
      languages:    Object.values(c.languages||{}),
      currencies:   Object.values(c.currencies||{}).map(x=>({name:x.name,symbol:x.symbol})),
      timezones:    c.timezones||[],
      calling_code: c.idd?.root+(c.idd?.suffixes?.[0]||""),
      flag_png:     c.flags?.png,
      flag_svg:     c.flags?.svg,
      coat_of_arms: c.coatOfArms?.png||null,
      maps:         c.maps?.googleMaps||null,
      borders:      c.borders||[],
      landlocked:   c.landlocked,
      un_member:    c.unMember,
      driving_side: c.car?.side||null,
      start_of_week:c.startOfWeek||null,
      tlds:         c.tld||[],
      gini:         c.gini ? Object.values(c.gini)[0] : null,
    };
    restCountriesCache[iso] = data;
    return data;
  });
}

const airbnbCache = {};
async function fetchAirbnb(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = airbnbCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  const geo = geoCoordCache[iso];
  if(!geo) return null;
  return timed("airbnb", async () => {
    const r = await axios.get("https://airbnb13.p.rapidapi.com/search-location", {
      params:{
        location: countryName,
        checkin:  getFutureDate(14),
        checkout: getFutureDate(17),
        adults:   2,
        children: 0,
        infants:  0,
        pets:     0,
        page:     1,
        currency: "USD",
      },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "airbnb13.p.rapidapi.com",
      },
      timeout: 12000,
    });
    const results = r.data?.results||[];
    const listings = results.slice(0,6).map(l => ({
      id:          l.id,
      name:        l.name,
      type:        l.type,
      beds:        l.beds,
      bathrooms:   l.bathrooms,
      price:       l.price?.rate,
      currency:    l.price?.currency||"USD",
      rating:      l.rating?.guestSatisfactionOverall,
      reviews:     l.reviewsCount,
      image:       l.images?.[0]||null,
      url:         l.url||null,
      city:        l.city||countryName,
    }));
    const prices = listings.map(l=>l.price).filter(Boolean);
    const data = {
      listings,
      avg_price_per_night: prices.length ? Math.round(prices.reduce((a,b)=>a+b,0)/prices.length) : null,
      currency: "USD",
      sample_size: listings.length,
    };
    airbnbCache[iso] = { data, expires: Date.now()+6*60*60*1000 };
    return data;
  });
}

function getFutureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate()+daysAhead);
  return d.toISOString().split("T")[0];
}

// ══════════════════════════════════════════════════════════════════
// GEO HIERARCHY
// ══════════════════════════════════════════════════════════════════

const ISO3_TO_ISO2 = {
  DZA:"DZ",AGO:"AO",BEN:"BJ",BWA:"BW",BFA:"BF",BDI:"BI",CPV:"CV",CMR:"CM",
  CAF:"CF",TCD:"TD",COM:"KM",COD:"CD",COG:"CG",CIV:"CI",DJI:"DJ",EGY:"EG",
  GNQ:"GQ",ERI:"ER",SWZ:"SZ",ETH:"ET",GAB:"GA",GMB:"GM",GHA:"GH",GIN:"GN",
  GNB:"GW",KEN:"KE",LSO:"LS",LBR:"LR",LBY:"LY",MDG:"MG",MWI:"MW",MLI:"ML",
  MRT:"MR",MUS:"MU",MAR:"MA",MOZ:"MZ",NAM:"NA",NER:"NE",NGA:"NG",RWA:"RW",
  STP:"ST",SEN:"SN",SLE:"SL",SOM:"SO",ZAF:"ZA",SSD:"SS",SDN:"SD",TZA:"TZ",
  TGO:"TG",TUN:"TN",UGA:"UG",ZMB:"ZM",ZWE:"ZW",
  AFG:"AF",ARM:"AM",AZE:"AZ",BHR:"BH",BGD:"BD",BTN:"BT",BRN:"BN",KHM:"KH",
  CHN:"CN",CYP:"CY",GEO:"GE",IND:"IN",IDN:"ID",IRN:"IR",IRQ:"IQ",ISR:"IL",
  JPN:"JP",JOR:"JO",KAZ:"KZ",KWT:"KW",KGZ:"KG",LAO:"LA",LBN:"LB",MYS:"MY",
  MDV:"MV",MNG:"MN",MMR:"MM",NPL:"NP",PRK:"KP",OMN:"OM",PAK:"PK",PSE:"PS",
  PHL:"PH",QAT:"QA",SAU:"SA",SGP:"SG",KOR:"KR",LKA:"LK",SYR:"SY",TWN:"TW",
  TJK:"TJ",THA:"TH",TLS:"TL",TUR:"TR",TKM:"TM",ARE:"AE",UZB:"UZ",VNM:"VN",
  YEM:"YE",
  ALB:"AL",AND:"AD",AUT:"AT",BLR:"BY",BEL:"BE",BIH:"BA",BGR:"BG",HRV:"HR",
  CZE:"CZ",DNK:"DK",EST:"EE",FIN:"FI",FRA:"FR",DEU:"DE",GRC:"GR",HUN:"HU",
  ISL:"IS",IRL:"IE",ITA:"IT",XKX:"XK",LVA:"LV",LIE:"LI",LTU:"LT",LUX:"LU",
  MLT:"MT",MDA:"MD",MCO:"MC",MNE:"ME",NLD:"NL",MKD:"MK",NOR:"NO",POL:"PL",
  PRT:"PT",ROU:"RO",RUS:"RU",SMR:"SM",SRB:"RS",SVK:"SK",SVN:"SI",ESP:"ES",
  SWE:"SE",CHE:"CH",UKR:"UA",GBR:"GB",
  ATG:"AG",BHS:"BS",BRB:"BB",BLZ:"BZ",CAN:"CA",CRI:"CR",CUB:"CU",DMA:"DM",
  DOM:"DO",SLV:"SV",GRD:"GD",GTM:"GT",HTI:"HT",HND:"HN",JAM:"JM",MEX:"MX",
  NIC:"NI",PAN:"PA",KNA:"KN",LCA:"LC",VCT:"VC",TTO:"TT",USA:"US",
  ARG:"AR",BOL:"BO",BRA:"BR",CHL:"CL",COL:"CO",ECU:"EC",GUY:"GY",PRY:"PY",
  PER:"PE",SUR:"SR",URY:"UY",VEN:"VE",
  AUS:"AU",FJI:"FJ",KIR:"KI",MHL:"MH",FSM:"FM",NRU:"NR",NZL:"NZ",PLW:"PW",
  PNG:"PG",WSM:"WS",SLB:"SB",TON:"TO",TUV:"TV",VUT:"VU",
};

// ══════════════════════════════════════════════════════════════════
// GEO HIERARCHY — CountriesNow API (countriesnow.space)
// Completely free, no API key, no rate limits, no signup.
// Gives states/provinces and cities for all 195 countries.
// ══════════════════════════════════════════════════════════════════

// CountriesNow uses specific country name strings that differ from
// our COUNTRIES list for some entries. This map handles all mismatches.
const COUNTRIESNOW_NAME_MAP = {
  // Our name              → CountriesNow name
  "DR Congo":              "Democratic Republic of the Congo",
  "Republic of Congo":     "Republic of the Congo",
  "Ivory Coast":           "Côte d'Ivoire",
  "Eswatini":              "Swaziland",
  "Gambia":                "Gambia, The",
  "Palestine":             "Palestinian Territory",
  "North Macedonia":       "Macedonia",
  "Bosnia and Herzegovina":"Bosnia and Herzegovina",
  "Brunei":                "Brunei Darussalam",
  "Cape Verde":            "Cabo Verde",
  "East Timor":            "Timor-Leste",
  "Timor-Leste":           "Timor-Leste",
  "Myanmar":               "Myanmar (Burma)",
  "North Korea":           "Korea, North",
  "South Korea":           "Korea, South",
  "Laos":                  "Lao People's Democratic Republic",
  "Syria":                 "Syrian Arab Republic",
  "Taiwan":                "Taiwan, Province of China",
  "Vietnam":               "Viet Nam",
  "Iran":                  "Iran, Islamic Republic of",
  "Russia":                "Russia",
  "Moldova":               "Moldova, Republic of",
  "Tanzania":              "Tanzania, United Republic of",
  "Sao Tome and Principe": "Sao Tome and Principe",
  "Fiji":                  "Fiji",
  "Micronesia":            "Micronesia, Federated States of",
  "Marshall Islands":      "Marshall Islands",
  "Saint Kitts and Nevis": "Saint Kitts and Nevis",
  "Saint Lucia":           "Saint Lucia",
  "Saint Vincent and the Grenadines": "Saint Vincent and the Grenadines",
  "Trinidad and Tobago":   "Trinidad and Tobago",
};

function getCountriesNowName(iso) {
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return null;
  return COUNTRIESNOW_NAME_MAP[country.name] || country.name;
}

async function fetchAndSaveStates(iso) {
  const countryName = getCountriesNowName(iso);
  if (!countryName) return 0;

  try {
    const r = await axios.post(
      "https://countriesnow.space/api/v0.1/countries/states",
      { country: countryName },
      { timeout: 12000, headers: { "Content-Type": "application/json" } }
    );

    if (r.data?.error) {
      // Try fallback with original name if mapped name failed
      const originalName = COUNTRIES.find(c => c.iso === iso)?.name;
      if (originalName && originalName !== countryName) {
        const r2 = await axios.post(
          "https://countriesnow.space/api/v0.1/countries/states",
          { country: originalName },
          { timeout: 12000, headers: { "Content-Type": "application/json" } }
        );
        if (!r2.data?.error && r2.data?.data?.states?.length) {
          return await saveStatesFromResponse(r2.data.data.states, iso, originalName);
        }
      }
      console.log(`[GeoPipeline] ${iso} — CountriesNow: ${r.data.msg} (skipping)`);
      return 0;
    }

    const states = r.data?.data?.states || [];
    if (!states.length) {
      console.log(`[GeoPipeline] ${iso} — no states returned`);
      return 0;
    }

    return await saveStatesFromResponse(states, iso, countryName);

  } catch(e) {
    // 404 means CountriesNow doesn't have this country — skip gracefully
    if (e.response?.status === 404) {
      console.log(`[GeoPipeline] ${iso} — CountriesNow 404 (country not in dataset), skipping`);
      return 0;
    }
    console.error(`[GeoPipeline] fetchAndSaveStates error ${iso}:`, e.message);
    geoStatus.last_error = `${iso}: ${e.message}`;
    return 0;
  }
}

async function saveStatesFromResponse(states, iso, countryName) {
  const rows = states.map((s, idx) => ({
    country_iso: iso,
    geoname_id:  Math.abs(hashCode(`${iso}-state-${s.name || idx}`)),
    name:        s.name || "Unknown",
    ascii_name:  s.name || "Unknown",
    state_code:  s.state_code || null,
    type:        "state",
    population:  0,
    latitude:    null,
    longitude:   null,
    timezone:    null,
    updated_at:  new Date().toISOString(),
  })).filter(r => r.name !== "Unknown");

  if (!rows.length) return 0;

  const { error } = await supabase.from("states").upsert(rows, { onConflict:"geoname_id" });
  if (error) { console.error(`[GeoPipeline] States upsert ${iso}:`, error.message); return 0; }
  console.log(`[GeoPipeline] ✓ ${iso} (${countryName}) — ${rows.length} states saved`);
  return rows.length;
}

async function fetchAndSaveAreas(stateId, _unused, countryIso) {
  const countryName = getCountriesNowName(countryIso);
  if (!countryName) return 0;

  try {
    const { data: stateRow } = await supabase
      .from("states")
      .select("name")
      .eq("id", stateId)
      .single();
    const stateName = stateRow?.name || "";
    if (!stateName) return 0;

    const r = await axios.post(
      "https://countriesnow.space/api/v0.1/countries/state/cities",
      { country: countryName, state: stateName },
      { timeout: 12000, headers: { "Content-Type": "application/json" } }
    );

    if (r.data?.error) return 0;

    const cities = r.data?.data || [];
    if (!cities.length) return 0;

    const rows = cities.slice(0, 80).map((cityName, idx) => ({
      state_id:    stateId,
      country_iso: countryIso,
      geoname_id:  Math.abs(hashCode(`${stateId}-city-${cityName || idx}`)),
      name:        cityName || "Unknown",
      ascii_name:  cityName || "Unknown",
      type:        "city",
      population:  0,
      latitude:    null,
      longitude:   null,
      timezone:    null,
      updated_at:  new Date().toISOString(),
    })).filter(r => r.name !== "Unknown");

    if (!rows.length) return 0;

    const { error } = await supabase.from("areas").upsert(rows, { onConflict:"geoname_id" });
    if (error) { console.error(`Areas upsert error:`, error.message); return 0; }
    return rows.length;

  } catch(e) {
    if (e.response?.status === 404) return 0; // gracefully skip missing states
    console.error(`fetchAndSaveAreas error:`, e.message);
    return 0;
  }
}

// Stable numeric hash — turns a string into a consistent integer ID
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

let geoPipelineRunning = false;
const geoStatus = {
  total_states:   0,
  total_areas:    0,
  countries_done: 0,
  current_country: null,
  last_error:     null,
  started_at:     null,
  completed_at:   null,
};

async function runGeoPipeline(forceAll=false) {
  if(geoPipelineRunning) { console.log("[GeoPipeline] Already running"); return; }

  // Quick connectivity test
  console.log("[GeoPipeline] Testing CountriesNow connectivity...");
  try {
    const test = await axios.post(
      "https://countriesnow.space/api/v0.1/countries/states",
      { country: "Nigeria" },
      { timeout: 10000 }
    );
    if (test.data?.error) throw new Error(test.data.msg);
    console.log(`[GeoPipeline] ✓ CountriesNow reachable — ${test.data?.data?.states?.length} states for Nigeria`);
  } catch(e) {
    geoStatus.last_error = "CountriesNow unreachable: " + e.message;
    console.error("[GeoPipeline]", geoStatus.last_error);
    return;
  }

  geoPipelineRunning   = true;
  geoStatus.started_at = new Date().toISOString();
  geoStatus.last_error = null;

  // Seed totals from DB — accurate even after Render server restarts
  try {
    const [sr, ar] = await Promise.all([
      supabase.from("states").select("*", { count:"exact", head:true }),
      supabase.from("areas").select("*",  { count:"exact", head:true }),
    ]);
    geoStatus.total_states = sr.count || 0;
    geoStatus.total_areas  = ar.count || 0;
  } catch(e) {
    geoStatus.total_states = 0;
    geoStatus.total_areas  = 0;
  }

  // THE KEY FIX: query DB for which countries already have states loaded.
  // This means after a Render restart we NEVER re-process countries already done.
  // We also never rely on in-memory state — always source of truth is the DB.
  let alreadyLoaded = new Set();
  try {
    const { data: existing } = await supabase
      .from("states")
      .select("country_iso");
    (existing || []).forEach(r => alreadyLoaded.add(r.country_iso));
    console.log(`[GeoPipeline] DB state: ${alreadyLoaded.size}/195 countries already have geo data`);
  } catch(e) {
    console.error("[GeoPipeline] Could not fetch loaded countries from DB:", e.message);
  }

  // Start countries_done from DB count so display is accurate from first update
  geoStatus.countries_done = alreadyLoaded.size;

  const toProcess = forceAll
    ? COUNTRIES
    : COUNTRIES.filter(c => !alreadyLoaded.has(c.iso));

  console.log(`🌍 [GeoPipeline] Processing ${toProcess.length} remaining countries (${alreadyLoaded.size} already done)...`);

  for(const country of toProcess) {
    try {
      geoStatus.current_country = country.name;

      const statesAdded = await fetchAndSaveStates(country.iso);
      geoStatus.total_states += statesAdded;

      if(statesAdded > 0) {
        const { data: savedStates } = await supabase.from("states")
          .select("id, geoname_id, name")
          .eq("country_iso", country.iso);

        for(const state of savedStates||[]) {
          const areasAdded = await fetchAndSaveAreas(state.id, state.geoname_id, country.iso);
          geoStatus.total_areas += areasAdded;
          await new Promise(r => setTimeout(r, 300));
        }
      }

      geoStatus.countries_done++;
      alreadyLoaded.add(country.iso);
      const pct = Math.round(geoStatus.countries_done / COUNTRIES.length * 100);
      console.log(`✅ [GeoPipeline] ${country.name} — ${statesAdded} states | ${geoStatus.countries_done}/${COUNTRIES.length} (${pct}%)`);
      await new Promise(r => setTimeout(r, 300));

    } catch(e) {
      geoStatus.last_error = `${country.name}: ${e.message}`;
      console.error(`[GeoPipeline] Error for ${country.name}:`, e.message);
      geoStatus.countries_done++; // count it as processed even on error — don't stall
    }
  }

  geoPipelineRunning      = false;
  geoStatus.current_country = null;
  geoStatus.completed_at  = new Date().toISOString();
  console.log(`🎉 [GeoPipeline] Complete — ${geoStatus.total_states} states, ${geoStatus.total_areas} cities across ${geoStatus.countries_done} countries`);
}

// Auto-resume on Render restart — if DB is incomplete, continue from where we left off
async function resumeGeoPipelineIfIncomplete() {
  try {
    await new Promise(r => setTimeout(r, 25000)); // wait for DB to settle after boot
    const { data: existing } = await supabase.from("states").select("country_iso");
    const loaded  = new Set((existing || []).map(r => r.country_iso));
    const missing = COUNTRIES.filter(c => !loaded.has(c.iso));
    if(missing.length === 0) {
      console.log(`✅ [GeoPipeline] Auto-resume check: all 195 countries loaded`);
      return;
    }
    console.log(`🔄 [GeoPipeline] Auto-resume: ${missing.length} countries missing after restart — continuing...`);
    runGeoPipeline(false).catch(console.error);
  } catch(e) {
    console.error("[GeoPipeline] Auto-resume failed:", e.message);
  }
}



const bookingCache = {};
async function fetchBooking(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = bookingCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  const geo = geoCoordCache[iso];
  if(!geo) return null;
  return timed("booking", async () => {
    const r = await axios.get("https://booking-com15.p.rapidapi.com/api/v1/hotels/searchDestination", {
      params:{ query: countryName },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "booking-com15.p.rapidapi.com",
      },
      timeout: 10000,
    });
    const dest = r.data?.data?.[0];
    if(!dest) return null;
    const checkin  = getFutureDate(14);
    const checkout = getFutureDate(17);
    const h = await axios.get("https://booking-com15.p.rapidapi.com/api/v1/hotels/searchHotels", {
      params:{
        dest_id:       dest.dest_id,
        search_type:   dest.search_type||"CITY",
        arrival_date:  checkin,
        departure_date:checkout,
        adults:        2,
        room_qty:      1,
        page_number:   1,
        languagecode:  "en-us",
        currency_code: "USD",
      },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "booking-com15.p.rapidapi.com",
      },
      timeout: 12000,
    });
    const hotels = (h.data?.data?.hotels||[]).slice(0,5).map(hotel => ({
      name:         hotel.property?.name,
      rating:       hotel.property?.reviewScore,
      review_count: hotel.property?.reviewCount,
      price_per_night: hotel.property?.priceBreakdown?.grossPrice?.value,
      currency:     hotel.property?.priceBreakdown?.grossPrice?.currency||"USD",
      stars:        hotel.property?.propertyClass,
      photo:        hotel.property?.photoUrls?.[0]||null,
      checkin:      hotel.property?.checkin?.fromTime,
    }));
    const prices = hotels.map(h=>h.price_per_night).filter(Boolean);
    const data = {
      hotels,
      avg_price_per_night: prices.length ? Math.round(prices.reduce((a,b)=>a+b,0)/prices.length) : null,
      destination: dest.city_name||countryName,
      currency: "USD",
    };
    bookingCache[iso] = { data, expires: Date.now()+6*60*60*1000 };
    return data;
  });
}

const tripadvisorCache = {};
async function fetchTripadvisor(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = tripadvisorCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("tripadvisor", async () => {
    const r = await axios.get("https://tripadvisor16.p.rapidapi.com/api/v1/attraction/searchAttractions", {
      params:{ geoId: "1", searchQuery: countryName, language:"en" },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "tripadvisor16.p.rapidapi.com",
      },
      timeout: 10000,
    });
    const attractions = (r.data?.data?.data||[]).slice(0,8).map(a => ({
      name:         a.title,
      rating:       a.averageRating,
      review_count: a.userReviewCount,
      category:     a.primaryInfo?.text,
      photo:        a.cardPhotos?.[0]?.sizes?.urlTemplate?.replace("{width}","400").replace("{height}","300")||null,
      ranking:      a.ranking?.text,
    }));
    const data = { attractions };
    tripadvisorCache[iso] = { data, expires: Date.now()+12*60*60*1000 };
    return data;
  });
}

const skyscannerCache = {};
async function fetchFlightPrices(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = skyscannerCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("skyscanner", async () => {
    const r = await axios.get("https://sky-scrapper.p.rapidapi.com/api/v1/flights/searchAirport", {
      params:{ query: countryName, locale:"en-US" },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "sky-scrapper.p.rapidapi.com",
      },
      timeout: 10000,
    });
    const airports = (r.data?.data||[]).filter(a=>a.navigation?.entityType==="AIRPORT").slice(0,3);
    const data = {
      airports: airports.map(a=>({
        name:      a.presentation?.title,
        subtitle:  a.presentation?.subtitle,
        entity_id: a.entityId,
        iata:      a.navigation?.localizedName,
      })),
      search_hint: `Flights to ${countryName}`,
    };
    skyscannerCache[iso] = { data, expires: Date.now()+24*60*60*1000 };
    return data;
  });
}

const currencyCache = {};
async function fetchCurrencyRates(iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  if(currencyCache["USD"] && Date.now() < currencyCache["USD"].expires) return currencyCache["USD"].data;
  return timed("currency", async () => {
    const r = await axios.get("https://open.er-api.com/v6/latest/USD", { timeout:6000 });
    const data = { base:"USD", rates: r.data?.rates||{}, updated: r.data?.time_last_update_utc };
    currencyCache["USD"] = { data, expires: Date.now()+60*60*1000 };
    return data;
  });
}

const placesCache = {};
async function fetchGooglePlaces(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = placesCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  const geo = geoCoordCache[iso];
  if(!geo) return null;
  return timed("google_places", async () => {
    const r = await axios.get("https://maps-data.p.rapidapi.com/searchmaps.php", {
      params:{
        query:    `tourist attractions in ${countryName}`,
        limit:    8,
        country:  "us",
        lang:     "en",
        lat:      geo.lat,
        lng:      geo.lon,
        offset:   0,
        zoom:     5,
      },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "maps-data.p.rapidapi.com",
      },
      timeout: 10000,
    });
    const places = (r.data?.data||[]).slice(0,8).map(p=>({
      name:        p.name,
      type:        p.type,
      rating:      p.rating,
      reviews:     p.reviews,
      address:     p.full_address,
      photo:       p.photo_url||null,
      lat:         p.latitude,
      lon:         p.longitude,
      open_now:    p.open_now,
    }));
    const data = { places };
    placesCache[iso] = { data, expires: Date.now()+12*60*60*1000 };
    return data;
  });
}

const travelAdvisorCache = {};
async function fetchTravelAdvisor(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = travelAdvisorCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("travel_advisor", async () => {
    const r = await axios.get("https://travel-advisor.p.rapidapi.com/restaurants/list-by-latlng", {
      params:{
        latitude:    geoCoordCache[iso]?.lat || 48.85,
        longitude:   geoCoordCache[iso]?.lon || 2.35,
        limit:       6,
        currency:    "USD",
        distance:    2,
        open_now:    "false",
        lunit:       "km",
        lang:        "en_US",
      },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "travel-advisor.p.rapidapi.com",
      },
      timeout: 10000,
    });
    const restaurants = (r.data?.data||[]).filter(r=>r.name).slice(0,6).map(r=>({
      name:      r.name,
      rating:    r.rating,
      reviews:   r.num_reviews,
      cuisine:   r.cuisine?.[0]?.name,
      price:     r.price_level,
      address:   r.address,
      photo:     r.photo?.images?.medium?.url||null,
    }));
    const data = { restaurants };
    travelAdvisorCache[iso] = { data, expires: Date.now()+12*60*60*1000 };
    return data;
  });
}

const hotelsCache = {};
async function fetchHotelDeals(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = hotelsCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("hotels_com", async () => {
    const r = await axios.get("https://hotels4.p.rapidapi.com/locations/v3/search", {
      params:{ q: countryName, locale:"en_US", langid:1033, siteid:300000001 },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "hotels4.p.rapidapi.com",
      },
      timeout: 10000,
    });
    const suggestions = (r.data?.sr||[]).filter(s=>s.type==="CITY"||s.type==="REGION").slice(0,1);
    const data = {
      destination: suggestions[0]?.regionNames?.fullName||countryName,
      gaiaId:      suggestions[0]?.gaiaId||null,
    };
    hotelsCache[iso] = { data, expires: Date.now()+24*60*60*1000 };
    return data;
  });
}

const youtubeCache = {};
async function fetchYoutubeVideos(countryName, iso) {
  if(!ENV.RAPIDAPI_KEY) return null;
  const cached = youtubeCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("youtube", async () => {
    const r = await axios.get("https://youtube-search-and-download.p.rapidapi.com/search", {
      params:{
        query:  `${countryName} travel guide 2025`,
        type:   "v",
        sort:   "r",
        nextToken:"",
      },
      headers:{
        "X-RapidAPI-Key":  ENV.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "youtube-search-and-download.p.rapidapi.com",
      },
      timeout: 10000,
    });
    const videos = (r.data?.contents||[]).filter(v=>v.video).slice(0,5).map(v=>({
      id:        v.video?.videoId,
      title:     v.video?.title,
      channel:   v.video?.channelName,
      views:     v.video?.viewCountText,
      published: v.video?.publishedTimeText,
      thumbnail: v.video?.thumbnails?.[0]?.url||null,
      url:       `https://youtube.com/watch?v=${v.video?.videoId}`,
      length:    v.video?.lengthText,
    }));
    const data = { videos };
    youtubeCache[iso] = { data, expires: Date.now()+12*60*60*1000 };
    return data;
  });
}

const waqiCache = {};
async function fetchWAQI(countryName, iso) {
  const cached = waqiCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  const geo = geoCoordCache[iso];
  if(!geo) return null;
  return timed("waqi", async () => {
    const r = await axios.get(
      `https://api.waqi.info/feed/geo:${geo.lat};${geo.lon}/?token=demo`,
      { timeout: 6000 }
    );
    const d = r.data?.data;
    if(!d || d === "Unknown station") return null;
    const data = {
      aqi:       d.aqi,
      aqi_label: aqiLabel(d.aqi),
      city:      d.city?.name||countryName,
      pm25:      d.iaqi?.pm25?.v||null,
      pm10:      d.iaqi?.pm10?.v||null,
      o3:        d.iaqi?.o3?.v||null,
      no2:       d.iaqi?.no2?.v||null,
      updated:   d.time?.s||null,
    };
    waqiCache[iso] = { data, expires: Date.now()+60*60*1000 };
    return data;
  });
}

// ══════════════════════════════════════════════════════════════════
// MISTRAL AI SYNTHESIS
// ══════════════════════════════════════════════════════════════════
async function runMistral(countryName, continent, rawData) {
  if(!ENV.MISTRAL_API_KEY){ recordHealth("mistral",false,0,"No API key"); return null; }
  const prompt = `You are the AI brain of GlobeVoyage travel intelligence platform.
Analyse this data for ${countryName} (${continent}) and produce travel intelligence.

WIKIPEDIA: ${(rawData.wiki?.summary||"").slice(0,500)}
WIKIVOYAGE SEE: ${(rawData.wv?.sections?.See||"").slice(0,300)}
WIKIVOYAGE DO: ${(rawData.wv?.sections?.Do||"").slice(0,300)}
WIKIVOYAGE SAFE: ${(rawData.wv?.sections?.["Stay safe"]||"").slice(0,200)}
PLACES (Foursquare): ${JSON.stringify(rawData.places||[]).slice(0,350)}
WEATHER: ${JSON.stringify(rawData.weather?.now||{})}
NEWS: ${(rawData.news||[]).map(n=>`[${n.risk_level}] ${n.title}`).join(" | ").slice(0,500)}
GDACS ALERTS: ${JSON.stringify(rawData.gdacs||[]).slice(0,250)}
EVENTS: ${(rawData.events||[]).map(e=>`${e.name} (${e.date})`).join(" | ").slice(0,350)}
SOCIAL TRENDING: ${(rawData.social||[]).map(s=>s.caption).join(" | ").slice(0,250)}
AIR QUALITY: ${rawData.airQuality ? "AQI "+rawData.airQuality.aqi+" ("+rawData.airQuality.aqi_label+"), PM2.5: "+rawData.airQuality.pm25 : "N/A"}
COST OF LIVING: ${rawData.costOfLiving ? "Index "+rawData.costOfLiving.cost_index+", Cheap meal $"+rawData.costOfLiving.meal_cheap+", 1-bed rent $"+rawData.costOfLiving.one_bed_city_rent+"/mo" : "N/A"}
COUNTRY META: ${rawData.countryMeta ? "Capital: "+rawData.countryMeta.capital+", Languages: "+(rawData.countryMeta.languages||[]).join(", ")+", Currency: "+(rawData.countryMeta.currencies||[]).map(c=>c.symbol+" "+c.name).join(", ") : "N/A"}
BOOKING AVG PRICE: ${rawData.booking?.avg_price_per_night ? "$"+rawData.booking.avg_price_per_night+"/night" : "N/A"}
TOP ATTRACTIONS: ${(rawData.tripadvisor?.attractions||[]).slice(0,4).map(a=>a.name+" ("+a.rating+"/5)").join(", ")||"N/A"}
RESTAURANTS: ${(rawData.travelAdvisor?.restaurants||[]).slice(0,3).map(r=>r.name+" ("+r.cuisine+")").join(", ")||"N/A"}

Output ONLY valid JSON, no markdown fences, no preamble:
{
  "briefing": "2-3 sentences about what travellers need to know RIGHT NOW",
  "vibe": "One evocative sentence capturing the country's current energy",
  "recommendations": [{"title":"","type":"cultural|food|adventure|nature|nightlife|shopping|family","when":"","why":"","rating":5,"risk":"none|low|medium|high"}],
  "calendar": [{"date":"YYYY-MM-DD","label":"","color":"green|amber|red","reason":""}],
  "trending_now": [{"name":"","why_trending":"","best_time":"","warning":null}],
  "safety_summary": "One honest sentence about current safety",
  "best_months": ["Jan","Feb"],
  "avoid_if": "Who should not visit right now",
  "hidden_gem": "One under-the-radar recommendation"
}
Max: 6 recommendations, 14 calendar days, 4 trending items.`;

  return timed("mistral", async () => {
    const r = await axios.post("https://api.mistral.ai/v1/chat/completions",
      {model:"mistral-large-latest",messages:[{role:"user",content:prompt}],temperature:0.3,max_tokens:2000},
      {headers:{Authorization:`Bearer ${ENV.MISTRAL_API_KEY}`,"Content-Type":"application/json"},timeout:35000}
    );
    const text = r.data?.choices?.[0]?.message?.content||"";
    return JSON.parse(text.replace(/```json|```/g,"").trim());
  });
}

// ══════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// NATIONAL NEWS CHANNELS — RSS feeds from each country's main
// broadcaster/news channel. No API key needed — all public RSS.
// ══════════════════════════════════════════════════════════════════

const NATIONAL_NEWS_FEEDS = {
  // North America
  USA: { name:"Fox News",          url:"https://moxie.foxnews.com/google-publisher/latest.xml",   type:"rss" },
  CAN: { name:"CBC News",          url:"https://www.cbc.ca/cmlink/rss-topstories",                type:"rss" },
  MEX: { name:"El Universal",      url:"https://www.eluniversal.com.mx/rss.xml",                  type:"rss" },
  // Europe
  GBR: { name:"BBC News",          url:"https://feeds.bbci.co.uk/news/rss.xml",                   type:"rss" },
  DEU: { name:"Deutsche Welle",    url:"https://rss.dw.com/rdf/rss-en-all",                       type:"rss" },
  FRA: { name:"France 24",         url:"https://www.france24.com/en/rss",                         type:"rss" },
  ITA: { name:"RAI News",          url:"https://www.rainews.it/dl/rainews/media/rss.xml",          type:"rss" },
  ESP: { name:"El País",           url:"https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada", type:"rss" },
  NLD: { name:"NOS News",          url:"https://feeds.nos.nl/nosnieuwsalgemeen",                  type:"rss" },
  RUS: { name:"RT News",           url:"https://www.rt.com/rss/",                                 type:"rss" },
  CHE: { name:"SWI swissinfo",     url:"https://www.swissinfo.ch/eng/rss/rss_headlines",          type:"rss" },
  POL: { name:"TVP World",         url:"https://tvpworld.com/rss",                                type:"rss" },
  PRT: { name:"RTP News",          url:"https://www.rtp.pt/noticias/rss",                         type:"rss" },
  SWE: { name:"SVT Nyheter",       url:"https://www.svt.se/nyheter/rss.xml",                      type:"rss" },
  NOR: { name:"NRK News",          url:"https://www.nrk.no/nyheter/rss.xml",                      type:"rss" },
  DNK: { name:"DR News",           url:"https://www.dr.dk/nyheder/service/feeds/allenyheder",     type:"rss" },
  GRC: { name:"Ekathimerini",      url:"https://www.ekathimerini.com/rss/?cat=1",                 type:"rss" },
  UKR: { name:"Ukrinform",         url:"https://www.ukrinform.net/rss/block-lastnews",            type:"rss" },
  AUT: { name:"ORF News",          url:"https://rss.orf.at/news.xml",                             type:"rss" },
  BEL: { name:"RTBF",              url:"https://www.rtbf.be/api/proxy/rss?source=https%3A%2F%2Fapp.rtbf.be%2Fapi%2Fbranding%2Frss%3Ftype%3Darticle%26term%3D399", type:"rss" },
  HRV: { name:"N1 Croatia",        url:"https://hr.n1info.com/feed/",                             type:"rss" },
  CZE: { name:"Czech Radio",       url:"https://english.radio.cz/rss/english",                   type:"rss" },
  // Asia
  CHN: { name:"Xinhua News",       url:"https://www.xinhuanet.com/english/rss/worldrss.xml",      type:"rss" },
  JPN: { name:"NHK World",         url:"https://www3.nhk.or.jp/rss/news/cat0.xml",               type:"rss" },
  IND: { name:"NDTV",              url:"https://feeds.feedburner.com/ndtvnews-top-stories",       type:"rss" },
  KOR: { name:"KBS World",         url:"https://world.kbs.co.kr/rss/rss_news.htm",               type:"rss" },
  SGP: { name:"Channel News Asia", url:"https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml", type:"rss" },
  ARE: { name:"Al Arabiya",        url:"https://www.alarabiya.net/tools/rss",                     type:"rss" },
  SAU: { name:"Arab News",         url:"https://www.arabnews.com/rss.xml",                        type:"rss" },
  QAT: { name:"Al Jazeera",        url:"https://www.aljazeera.com/xml/rss/all.xml",               type:"rss" },
  TUR: { name:"Hurriyet Daily News", url:"https://www.hurriyetdailynews.com/rss",                 type:"rss" },
  IRN: { name:"Press TV",          url:"https://www.presstv.ir/rss",                              type:"rss" },
  PAK: { name:"Geo News",          url:"https://www.geo.tv/rss/1",                                type:"rss" },
  BGD: { name:"The Daily Star BD", url:"https://www.thedailystar.net/rss.xml",                    type:"rss" },
  LKA: { name:"Daily Mirror LK",   url:"https://www.dailymirror.lk/rss",                         type:"rss" },
  THA: { name:"Bangkok Post",      url:"https://www.bangkokpost.com/rss/data/topstories.xml",     type:"rss" },
  VNM: { name:"VnExpress",         url:"https://vnexpress.net/rss/tin-moi-nhat.rss",              type:"rss" },
  IDN: { name:"Antara News",       url:"https://en.antaranews.com/rss/news.xml",                  type:"rss" },
  MYS: { name:"Bernama",           url:"https://www.bernama.com/en/rss.php",                      type:"rss" },
  PHL: { name:"ABS-CBN News",      url:"https://news.abs-cbn.com/rss",                            type:"rss" },
  ISR: { name:"Haaretz",           url:"https://www.haaretz.com/cmlink/1.4526661",                type:"rss" },
  IRQ: { name:"Baghdad Post",      url:"https://thebaghdadpost.com/en/rss",                       type:"rss" },
  JOR: { name:"Jordan Times",      url:"https://jordantimes.com/rss.xml",                         type:"rss" },
  // Africa
  NGA: { name:"Channels TV",       url:"https://www.channelstv.com/feed/",                        type:"rss" },
  ZAF: { name:"News24",            url:"https://feeds.news24.com/articles/news24/TopStories/rss",  type:"rss" },
  KEN: { name:"Nation Africa",     url:"https://nation.africa/kenya/rss",                         type:"rss" },
  GHA: { name:"Ghana Web",         url:"https://www.ghanaweb.com/GhanaHomePage/NewsArchive/rssfeed2.php", type:"rss" },
  ETH: { name:"Addis Standard",    url:"https://addisstandard.com/feed/",                         type:"rss" },
  EGY: { name:"Al-Ahram",          url:"https://english.ahram.org.eg/rss.aspx",                   type:"rss" },
  MAR: { name:"Morocco World News", url:"https://www.moroccoworldnews.com/feed",                  type:"rss" },
  TUN: { name:"Tunisia Live",      url:"https://www.tunisia-live.net/feed/",                      type:"rss" },
  TZA: { name:"The Citizen TZ",    url:"https://www.thecitizen.co.tz/feed",                       type:"rss" },
  UGA: { name:"Monitor UG",        url:"https://www.monitor.co.ug/ugd/feed",                      type:"rss" },
  SEN: { name:"Dakar Actu",        url:"https://www.dakaractu.com/feed",                           type:"rss" },
  CMR: { name:"Cameroon Tribune",  url:"https://www.cameroon-tribune.cm/rss.xml",                 type:"rss" },
  // South America
  BRA: { name:"Folha de S.Paulo",  url:"https://feeds.folha.uol.com.br/emcimadahora/rss091.xml", type:"rss" },
  ARG: { name:"Infobae",           url:"https://www.infobae.com/feeds/rss/",                      type:"rss" },
  CHL: { name:"La Tercera",        url:"https://www.latercera.com/feed/",                         type:"rss" },
  COL: { name:"El Tiempo",         url:"https://www.eltiempo.com/rss/noticias.xml",               type:"rss" },
  PER: { name:"El Comercio PE",    url:"https://elcomercio.pe/rss/portada.xml",                   type:"rss" },
  VEN: { name:"El Nacional",       url:"https://www.el-nacional.com/feed/",                       type:"rss" },
  // Oceania
  AUS: { name:"ABC News AU",       url:"https://www.abc.net.au/news/feed/1948/rss.xml",           type:"rss" },
  NZL: { name:"RNZ News",          url:"https://www.rnz.co.nz/rss/top.xml",                       type:"rss" },
};

const nationalNewsCache = {};

async function fetchNationalNews(iso) {
  const feed = NATIONAL_NEWS_FEEDS[iso];
  if (!feed) return null;

  // Cache for 2 hours
  const cached = nationalNewsCache[iso];
  if (cached && Date.now() < cached.expires) return cached.data;

  return timed("national_news", async () => {
    const r = await axios.get(feed.url, {
      timeout: 8000,
      headers: { "User-Agent": "GlobeVoyage/2.0" },
    });
    const parsed = await xml2js.parseStringPromise(r.data, { explicitArray: false });
    const items  = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    const arr    = Array.isArray(items) ? items : [items];

    const articles = arr.filter(i => i && (i.title || i.title?._)).slice(0, 8).map(i => ({
      title:       typeof i.title === "object" ? (i.title._ || i.title.__text || "") : (i.title || ""),
      url:         i.link?.href || i.link || i.guid?._ || i.guid || "",
      source:      feed.name,
      country_iso: iso,
      published_at:i.pubDate || i.updated || i["dc:date"] || null,
      description: typeof i.description === "object"
        ? (i.description._ || "").replace(/<[^>]*>/g, "").slice(0, 200)
        : (i.description || "").replace(/<[^>]*>/g, "").slice(0, 200),
      risk_level:  riskScore((typeof i.title === "object" ? i.title._ : i.title) || ""),
    })).filter(a => a.title);

    const data = { source: feed.name, articles };
    nationalNewsCache[iso] = { data, expires: Date.now() + 2*60*60*1000 };
    return data;
  });
}

// ══════════════════════════════════════════════════════════════════
// VERIFICATION AI — Mistral Large + Web Search (Agents API)
// Runs AFTER all data sources are collected for a country.
// Purpose: verify that collected data is current, real, and accurate.
// Uses Mistral's web_search tool for live internet cross-checking.
// Flags stale, suspicious or contradictory data before it gets saved.
// ══════════════════════════════════════════════════════════════════
async function runVerificationAI(countryName, continent, rawData) {
  if(!ENV.MISTRAL_API_KEY) {
    console.log(`[VerifyAI] No MISTRAL_API_KEY — skipping verification for ${countryName}`);
    return null;
  }

  return timed("verification_ai", async () => {
    const today = new Date().toISOString().split("T")[0];

    const summary = {
      weather:     rawData.weather?.now
        ? `${rawData.weather.now.temp}°C, ${rawData.weather.now.condition}` : null,
      top_news:    (rawData.news||[]).slice(0,4).map(n => n.title),
      events:      (rawData.events||[]).slice(0,4).map(e => `${e.name} (${e.date||"TBC"})`),
      briefing:    rawData.ai?.briefing || null,
      safety:      rawData.ai?.safety_summary || null,
      cost_meal:   rawData.costOfLiving?.meal_cheap ? `$${rawData.costOfLiving.meal_cheap}` : null,
      air_quality: rawData.airQuality?.aqi_label || null,
      nat_news:    rawData.nationalNews?.articles?.slice(0,3).map(a => a.title) || [],
    };

    const prompt = `You are a senior travel intelligence analyst and fact-checker for GlobeVoyage, a real-time global travel app used by millions.

Today is ${today}. Your job is to verify travel data for ${countryName} (${continent}).

USE YOUR WEB SEARCH to look up:
1. Current news about ${countryName} — any conflicts, disasters, strikes, elections, or major events happening RIGHT NOW
2. Current travel advisories or warnings for ${countryName} from any government
3. Whether the events listed below are real and upcoming
4. Verify the safety situation is accurately described
5. Any major breaking stories our pipeline may have missed

Here is what our pipeline collected today:
${JSON.stringify(summary, null, 2)}

After searching, respond ONLY in valid JSON with no markdown fences:
{
  "verified": true,
  "confidence": 0.95,
  "flags": [],
  "corrections": {},
  "current_alerts": [],
  "verification_notes": "Brief summary of what you searched and found",
  "data_freshness": "fresh",
  "safety_level": "safe",
  "safety_detail": "One current honest sentence about safety right now",
  "trending_topic": "The single most notable current thing about this country right now",
  "missed_stories": [],
  "verified_at": "${new Date().toISOString()}"
}

Field definitions:
- verified: false if data has serious errors
- confidence: 0.0-1.0 how confident you are the data is accurate
- flags: list of specific problems found e.g. ["Outdated safety warning", "Event cancelled"]
- corrections: object of what to change e.g. {"safety_summary": "corrected text"}
- current_alerts: urgent alerts users must see e.g. ["Airport strike May 15", "Flooding in capital"]
- data_freshness: "fresh" | "stale" | "mixed"
- safety_level: "safe" | "caution" | "warning" | "danger"
- missed_stories: important current stories our sources missed`;

    // Use Mistral Agents API with web_search tool enabled
    const r = await axios.post(
      "https://api.mistral.ai/v1/agents/completions",
      {
        agent_id: null, // use inline tools instead of a saved agent
        model:    "mistral-large-latest",
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            type: "function",
            function: {
              name:        "web_search",
              description: "Search the web for current information",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query" }
                },
                required: ["query"]
              }
            }
          }
        ],
        tool_choice:  "auto",
        temperature:  0.1,
        max_tokens:   1200,
      },
      {
        headers: {
          Authorization:  `Bearer ${ENV.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 50000,
      }
    );

    // Handle tool_calls — Mistral may call web_search, then we need to respond
    // For simplicity we handle one round of tool calls using Mistral's built-in search
    let finalText = "";
    const choice = r.data?.choices?.[0];

    if(choice?.finish_reason === "tool_calls") {
      // Mistral wants to search — re-run using the chat completions endpoint
      // with the web_search_preview tool which handles search server-side
      const r2 = await axios.post(
        "https://api.mistral.ai/v1/chat/completions",
        {
          model:    "mistral-large-latest",
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search" }],
          tool_choice:  "auto",
          temperature:  0.1,
          max_tokens:   1200,
        },
        {
          headers: {
            Authorization:  `Bearer ${ENV.MISTRAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 50000,
        }
      );
      finalText = r2.data?.choices?.[0]?.message?.content || "";
    } else {
      finalText = choice?.message?.content || "";
    }

    if(!finalText) return null;

    try {
      return JSON.parse(finalText.replace(/```json|```/g, "").trim());
    } catch(e) {
      // If Mistral wrapped in explanation text, extract the JSON block
      const match = finalText.match(/\{[\s\S]*\}/);
      if(match) {
        try { return JSON.parse(match[0]); } catch(e2) {}
      }
      console.error(`[VerifyAI] JSON parse error for ${countryName}:`, e.message);
      return null;
    }
  });
}

async function runPipeline(iso, countryName, continent) {
  const start = Date.now();
  console.log(`🌍 Pipeline: ${countryName} (${iso})`);
  const safe = async (fn, fallback) => { try{ return await fn(); }catch(e){ return fallback; } };

  const geo = await safe(()=>fetchGeoapify(countryName, iso), {});

  const [wiki,wv,places,weather,news,gNews,gdacs,tm,eb,phq,social,
         photos,airQuality,flights,costOfLiving,countryMeta,airbnb,
         booking,tripadvisor,flightPrices,currencyRates,googlePlaces,travelAdvisor,hotelDeals,youtubeVideos,waqi,
         nationalNews] = await Promise.all([
    safe(()=>fetchWikipedia(countryName),         {summary:""}),
    safe(()=>fetchWikivoyage(countryName),        {sections:{},highlights:[]}),
    safe(()=>fetchFoursquare(countryName, iso),   []),
    safe(()=>fetchWeather(countryName),           {now:null,forecast:[]}),
    safe(()=>fetchNews(countryName, iso),         []),
    safe(()=>fetchGoogleNews(countryName),        []),
    safe(()=>fetchGDACS(countryName),             []),
    safe(()=>fetchTicketmaster(countryName, iso), []),
    safe(()=>fetchEventbrite(countryName),        []),
    safe(()=>fetchPredictHQ(countryName),         []),
    safe(()=>fetchSocialTrends(countryName),      []),
    safe(()=>fetchUnsplash(countryName),          []),
    safe(()=>fetchAirQuality(countryName, iso),   null),
    safe(()=>fetchFlights(countryName, iso),      null),
    safe(()=>fetchCostOfLiving(countryName),      null),
    safe(()=>fetchRestCountries(iso),             null),
    safe(()=>fetchAirbnb(countryName, iso),       null),
    safe(()=>fetchBooking(countryName, iso),      null),
    safe(()=>fetchTripadvisor(countryName, iso),  null),
    safe(()=>fetchFlightPrices(countryName, iso), null),
    safe(()=>fetchCurrencyRates(iso),             null),
    safe(()=>fetchGooglePlaces(countryName, iso), null),
    safe(()=>fetchTravelAdvisor(countryName, iso),null),
    safe(()=>fetchHotelDeals(countryName, iso),   null),
    safe(()=>fetchYoutubeVideos(countryName, iso),null),
    safe(()=>fetchWAQI(countryName, iso),         null),
    safe(()=>fetchNationalNews(iso),              null),
  ]);

  const allNews   = [...(news||[]),...(gNews||[])].slice(0,10);
  const allEvents = [...(tm||[]),...(eb||[]),...(phq||[])].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(0,12);
  const safetyFlags = [
    ...(gdacs||[]).map(g=>({...g,type:"disaster"})),
    ...allNews.filter(n=>n.risk_level==="high").map(n=>({date:n.published_at?.split("T")[0],type:"news",description:n.title,severity:"high"}))
  ].slice(0,6);

  const ai = await safe(()=>runMistral(countryName,continent,{wiki,wv,places,weather,news:allNews,gdacs,events:allEvents,social,airQuality:airQuality||waqi,costOfLiving,countryMeta,booking,tripadvisor,travelAdvisor}),null);

  // Verification AI — cross-checks all collected data for currency, accuracy, safety
  const verification = await safe(()=>runVerificationAI(countryName, continent, {
    weather, news:allNews, events:allEvents, costOfLiving,
    airQuality:airQuality||waqi, nationalNews, ai,
  }), null);

  const {error} = await supabase.from("country_intel").upsert({
    iso, country_name:countryName, continent, last_updated:new Date().toISOString(),
    wiki_summary:wiki?.summary||"", wiki_highlights:wv?.highlights||[], wiki_sections:wv?.sections||{},
    top_places:places||[], weather_now:weather?.now, weather_forecast:weather?.forecast||[],
    news_headlines:allNews, safety_flags:safetyFlags, gdacs_alerts:gdacs||[],
    events:allEvents, geoapify:geo||{}, trending_spots:social||[], sentiment:{},
    ai_briefing:ai?.briefing||null, ai_vibe:ai?.vibe||null,
    ai_recommendations:ai?.recommendations||[], ai_calendar:ai?.calendar||[],
    ai_trending_now:ai?.trending_now||[], ai_safety_summary:ai?.safety_summary||null,
    ai_best_months:ai?.best_months||[], ai_avoid_if:ai?.avoid_if||null, ai_hidden_gem:ai?.hidden_gem||null,
    photos:          photos||[],
    air_quality:     airQuality||waqi||null,
    flights:         flights||null,
    cost_of_living:  costOfLiving||null,
    country_meta:    countryMeta||null,
    airbnb:          airbnb||null,
    booking:         booking||null,
    tripadvisor:     tripadvisor||null,
    flight_prices:   flightPrices||null,
    currency_rates:  currencyRates||null,
    google_places:   googlePlaces||null,
    restaurants:     travelAdvisor||null,
    hotel_deals:     hotelDeals||null,
    youtube_videos:  youtubeVideos||null,
    national_news:   nationalNews||null,
    verification:    verification||null,
  },{onConflict:"iso"});

  const duration = Date.now()-start;
  if(error) console.error(`❌ DB error ${countryName}:`, error.message);
  else      console.log(`✅ ${countryName} done in ${duration}ms`);

  await supabase.from("pipeline_runs").insert({
    iso, status:error?"error":"success",
    sources:Object.fromEntries(Object.entries(sourceHealth).map(([k,v])=>[k,v.ok?"ok":"fail"])),
    duration_ms:duration, error:error?.message||null,
    ran_at: new Date().toISOString(),
  });

  try {
    const { data: runs } = await supabase
      .from("pipeline_runs")
      .select("id, ran_at")
      .eq("iso", iso)
      .order("ran_at", { ascending: false });
    if(runs && runs.length > 3) {
      const toDelete = runs.slice(3).map(r => r.id);
      await supabase.from("pipeline_runs").delete().in("id", toDelete);
      console.log(`🗑  Trimmed ${toDelete.length} old run log(s) for ${iso}`);
    }
  } catch(e) {
    console.error("Log trim error:", e.message);
  }

  return {success:!error,duration};
}

async function runFullPipeline(triggerName) {
  console.log(`🚀 [${triggerName}] Pipeline starting for ${COUNTRIES.length} countries...`);
  pipelineStatus.running     = true;
  pipelineStatus.lastRunAt   = new Date().toISOString();
  pipelineStatus.lastRunName = triggerName;
  pipelineStatus.countriesLastRun = 0;
  let ran=0;
  for(let i=0;i<COUNTRIES.length;i++){
    const {iso,name,continent} = COUNTRIES[i];
    try {
      await runPipeline(iso,name,continent);
      ran++;
      pipelineStatus.countriesLastRun = ran;
    } catch(e) {
      console.error(`Pipeline error for ${name}:`, e.message);
    }
    await new Promise(r=>setTimeout(r,20000));
  }
  pipelineStatus.running = false;
  console.log(`✅ [${triggerName}] Pipeline complete — ${ran} ran`);
}

cron.schedule("0 6  * * *", () => runFullPipeline("06:00"), { timezone:"UTC" });
cron.schedule("0 14 * * *", () => runFullPipeline("14:00"), { timezone:"UTC" });
cron.schedule("0 22 * * *", () => runFullPipeline("22:00"), { timezone:"UTC" });

async function runStartupPipeline() {
  console.log("🚀 [Startup] Checking for countries with no data...");
  const { data: existing } = await supabase
    .from("country_intel")
    .select("iso");
  const existingISOs = new Set((existing||[]).map(r=>r.iso));
  const missing = COUNTRIES.filter(c => !existingISOs.has(c.iso));
  if(missing.length === 0) {
    console.log("✅ [Startup] All countries already have data — skipping pipeline");
    return;
  }
  console.log(`🌍 [Startup] ${missing.length} countries have no data yet — running pipeline for them...`);
  for(const c of missing) {
    try { await runPipeline(c.iso,c.name,c.continent); } catch(e) { console.error(e.message); }
    await new Promise(r=>setTimeout(r,20000));
  }
  console.log("✅ [Startup] Missing countries pipeline complete");
}

// ══════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ══════════════════════════════════════════════════════════════════

// ── Admin auth middleware ─────────────────────────────────────────
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"]||"";
  const b64 = authHeader.startsWith("Basic ") ? authHeader.slice(6) : "";
  const decoded = Buffer.from(b64, "base64").toString();
  const colonIndex = decoded.indexOf(":");
  const user = decoded.slice(0, colonIndex);
  const pass = decoded.slice(colonIndex + 1);
  const validUser = process.env.ADMIN_USERNAME || "admin";
  const validPass = process.env.ADMIN_PASSWORD || "changeme";
  if (user === validUser && pass === validPass) return next();
  res.setHeader("WWW-Authenticate", 'Basic realm="GlobeVoyage Mission Control"');
  res.status(401).send("Unauthorized");
}

// ── NEW: Auth verify endpoint — called directly by login.html ─────
// Validates credentials from ADMIN_USERNAME / ADMIN_PASSWORD env vars
// and returns JSON so the login page doesn't depend on HEAD behaviour.
app.post("/api/auth/verify", (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  const b64 = authHeader.startsWith("Basic ") ? authHeader.slice(6) : "";

  if (!b64) {
    return res.status(401).json({ ok: false, error: "No credentials provided" });
  }

  const decoded = Buffer.from(b64, "base64").toString();
  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) {
    return res.status(401).json({ ok: false, error: "Invalid credentials format" });
  }

  const user = decoded.slice(0, colonIndex);
  const pass = decoded.slice(colonIndex + 1);

  const validUser = process.env.ADMIN_USERNAME || "admin";
  const validPass = process.env.ADMIN_PASSWORD || "changeme";

  if (user === validUser && pass === validPass) {
    console.log(`[Auth] ✅ Login success for user: ${user}`);
    return res.json({ ok: true, user });
  }

  console.log(`[Auth] ❌ Login failed for user: ${user}`);
  return res.status(401).json({ ok: false, error: "Invalid username or password" });
});

// ── /admin_control — mission control dashboard (password protected) ──
const fs2 = require("fs");
const path2 = require("path");
app.get("/admin_control", requireAdminAuth, (req, res) => {
  const filePath = path2.join(__dirname, "admin_control.html");
  if(fs2.existsSync(filePath)) {
    res.setHeader("Content-Type","text/html");
    res.setHeader("Cache-Control","no-store");
    res.sendFile(filePath);
  } else {
    res.status(404).send("admin_control.html not found — make sure it is in the project root");
  }
});

app.get("/admin_control.html", (req,res) => res.status(404).end());
app.get("/index.js", (req,res) => res.status(404).end());
app.get("/package.json", (req,res) => res.status(404).end());

// ── Root — public landing page ────────────────────────────────────
app.get("/", (req,res) => {
  const uptimeSecs = Math.round((Date.now() - new Date(serverBoot).getTime()) / 1000);
  res.json({
    status:      "GlobeVoyage API is live 🌍",
    countries:   COUNTRIES.length,
    uptime_secs: uptimeSecs,
    ping_count:  pingCount,
    last_ping:   lastPingAt,
    booted_at:   serverBoot,
  });
});

// ── /api/status — full live status for the dashboard ─────────────
app.get("/api/status", (req,res) => {
  const now        = Date.now();
  const uptimeSecs = Math.round((now - new Date(serverBoot).getTime()) / 1000);
  const uptimeMins = Math.round(uptimeSecs / 60);
  const uptimeHrs  = (uptimeSecs / 3600).toFixed(1);
  const runHours = [6, 14, 22];
  const nowDate  = new Date();
  const nextRuns = runHours.map(h => {
    const next = new Date();
    next.setUTCHours(h, 0, 0, 0);
    if(next <= nowDate) next.setUTCDate(next.getUTCDate() + 1);
    const diffMs   = next - nowDate;
    const diffHrs  = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    return {
      time_utc:    `${String(h).padStart(2,"0")}:00 UTC`,
      runs_in:     diffHrs > 0 ? `${diffHrs}h ${diffMins}m` : `${diffMins}m`,
      timestamp:   next.toISOString(),
    };
  });
  const pingAgeMs  = lastPingAt ? now - new Date(lastPingAt).getTime() : null;
  const pingHealthy = pingAgeMs !== null && pingAgeMs < 15000;
  res.json({
    server: {
      booted_at:     serverBoot,
      uptime_secs:   uptimeSecs,
      uptime_display: uptimeSecs < 120 ? `${uptimeSecs}s`
                    : uptimeSecs < 7200 ? `${uptimeMins}m`
                    : `${uptimeHrs}h`,
    },
    keepalive: {
      healthy:        pingHealthy,
      ping_count:     pingCount,
      last_ping_at:   lastPingAt,
      ping_age_ms:    pingAgeMs,
      ping_interval:  "5s",
      status:         pingHealthy ? "✅ Pinging every 5s — server awake"
                    : pingCount === 0 ? "⏳ First ping pending..."
                    : "⚠️ Ping gap detected",
    },
    pipeline: {
      running:          pipelineStatus.running,
      last_run_at:      pipelineStatus.lastRunAt,
      last_run_trigger: pipelineStatus.lastRunName,
      countries_processed_last_run: pipelineStatus.countriesLastRun,
      schedule:         "6:00 AM, 2:00 PM, 10:00 PM (UTC)",
      next_runs:        nextRuns,
      status:           pipelineStatus.running
                          ? `🔄 Running now — ${pipelineStatus.countriesLastRun}/${COUNTRIES.length} countries done`
                          : pipelineStatus.lastRunAt
                            ? `✅ Last ran at ${new Date(pipelineStatus.lastRunAt).toUTCString()}`
                            : "⏳ Not yet run this session (next: "+nextRuns[0].time_utc+")",
    },
    geo_pipeline: {
      running:         geoPipelineRunning,
      progress_pct:    Math.round(geoStatus.countries_done / COUNTRIES.length * 100),
      countries_done:  geoStatus.countries_done,
      current_country: geoStatus.current_country,
      total_states:    geoStatus.total_states,
      total_areas:     geoStatus.total_areas,
      last_error:      geoStatus.last_error,
      status: geoPipelineRunning
        ? `🔄 Running — ${geoStatus.countries_done}/${COUNTRIES.length} countries (${geoStatus.current_country||"..."})`
        : geoStatus.completed_at
          ? `✅ Complete — ${geoStatus.total_states} states, ${geoStatus.total_areas} areas`
          : geoStatus.last_error
            ? `❌ Error: ${geoStatus.last_error}`
            : "⏳ Not yet run",
    },
  });
});

app.get("/api/intel/:iso", async (req,res) => {
  const {data,error} = await supabase.from("country_intel").select("*").eq("iso",req.params.iso.toUpperCase()).single();
  if(error||!data) return res.status(404).json({error:"No intel yet for this country"});
  res.json(data);
});

app.get("/api/intel/:iso/brief", async (req,res) => {
  const {data,error} = await supabase.from("country_intel")
    .select("iso,country_name,continent,last_updated,ai_briefing,ai_vibe,ai_recommendations,ai_trending_now,ai_calendar,ai_hidden_gem,ai_safety_summary,weather_now,safety_flags,events")
    .eq("iso",req.params.iso.toUpperCase()).single();
  if(error||!data) return res.status(404).json({error:"No intel yet"});
  res.json(data);
});

app.get("/api/intel", async (req,res) => {
  const {continent,q} = req.query;
  let query = supabase.from("country_intel")
    .select("iso,country_name,continent,last_updated,ai_briefing,ai_vibe,ai_safety_summary,weather_now,ai_best_months,ai_hidden_gem");
  if(continent) query = query.eq("continent",continent);
  if(q) query = query.ilike("country_name",`%${q}%`);
  const {data} = await query.order("country_name");
  res.json({countries:data||[],total:(data||[]).length});
});

app.post("/api/pipeline/run/:iso", async (req,res) => {
  const iso = req.params.iso.toUpperCase();
  const c = COUNTRIES.find(x=>x.iso===iso);
  if(!c) return res.status(404).json({error:"Country not in pipeline list"});
  res.json({message:`Pipeline started for ${c.name}`});
  runPipeline(iso,c.name,c.continent);
});

app.post("/api/pipeline/run-all", async (req,res) => {
  res.json({message:`Full pipeline started for ${COUNTRIES.length} countries`});
  runStartupPipeline();
});

app.get("/api/pipeline/status", async (req,res) => {
  const {data:runs}  = await supabase.from("pipeline_runs").select("iso,status,duration_ms,ran_at,error").order("ran_at",{ascending:false}).limit(100);
  const {data:intel} = await supabase.from("country_intel").select("iso,country_name,continent,last_updated").order("last_updated",{ascending:false});
  const freshCut = Date.now()-6*60*60*1000;
  const fresh = (intel||[]).filter(r=>new Date(r.last_updated).getTime()>freshCut).length;
  res.json({total_countries:COUNTRIES.length,countries_processed:(intel||[]).length,coverage_pct:Math.round((intel||[]).length/COUNTRIES.length*100),fresh,recent_runs:runs||[],country_freshness:intel||[]});
});

app.get("/api/health", async (req,res) => {
  const checks = {};

  try {
    const {error,count} = await supabase.from("country_intel").select("*",{count:"exact",head:true});
    checks.supabase = {ok:!error,label:"Supabase DB",detail:error?error.message:`Connected — ${count} countries stored`};
  } catch(e) { checks.supabase={ok:false,label:"Supabase DB",detail:e.message}; }

  checks.mistral = {ok:!!ENV.MISTRAL_API_KEY,label:"Mistral AI",detail:ENV.MISTRAL_API_KEY?"Key configured":"No API key"};
  checks.verification_ai = {
    ok: !!ENV.MISTRAL_API_KEY,
    label: "🤖 Verification AI (Mistral Large + Web Search)",
    detail: ENV.MISTRAL_API_KEY
      ? "Using Mistral Large with web search — verifies data currency, accuracy and safety each pipeline run"
      : "No MISTRAL_API_KEY — add to Render env vars to enable data verification",
  };

  gnewsResetIfNeeded();
  const gnewsRemaining = GNEWS_DAILY_CAP - gnewsCallsToday;
  sourceHealth.newsapi = {
    ...sourceHealth.newsapi,
    ok: !!ENV.GNEWS_API_KEY,
    last_check: new Date().toISOString(),
    _detail_override: ENV.GNEWS_API_KEY
      ? `Key configured — ${gnewsRemaining}/${GNEWS_DAILY_CAP} calls remaining today (resets in ${hoursUntilReset()}h)`
      : "No API key",
  };

  const liveTest = async (key, fn) => {
    const start = Date.now();
    try {
      await fn();
      const ms = Date.now()-start;
      sourceHealth[key] = { ok:true, last_check:new Date().toISOString(), response_ms:ms,
        success_count:(sourceHealth[key]?.success_count||0)+1,
        fail_count:sourceHealth[key]?.fail_count||0 };
    } catch(e) {
      const ms = Date.now()-start;
      sourceHealth[key] = { ok:false, last_check:new Date().toISOString(), response_ms:ms,
        error: e.response?.status ? `HTTP ${e.response.status}: ${e.message}` : e.message,
        success_count:sourceHealth[key]?.success_count||0,
        fail_count:(sourceHealth[key]?.fail_count||0)+1 };
    }
  };

  await Promise.allSettled([
    liveTest("wikipedia",     ()=>axios.get("https://en.wikipedia.org/w/api.php",{params:{action:"query",format:"json",titles:"France"},headers:{"User-Agent":WIKI_UA},timeout:6000})),
    liveTest("wikivoyage",    ()=>axios.get("https://en.wikivoyage.org/w/api.php",{params:{action:"query",format:"json",titles:"France"},headers:{"User-Agent":WIKI_UA},timeout:6000})),
    liveTest("foursquare",    ()=>axios.get("https://api.opentripmap.com/0.1/en/places/radius",{params:{radius:10000,lon:2.35,lat:48.85,format:"json",limit:1,apikey:"5ae2e3f221c38a28845f05b681b7e8e0898a39f3f1d2a7c3b24d7c12"},timeout:6000})),
    liveTest("google_news",   ()=>axios.get("https://news.google.com/rss/search?q=travel&hl=en&gl=US&ceid=US:en",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("gdacs",         ()=>axios.get("https://www.gdacs.org/xml/rss.xml",{timeout:8000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("eventbrite",    ()=>axios.get("https://news.google.com/rss/search?q=events+festival&hl=en&gl=US&ceid=US:en",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("social_proxy",  ()=>axios.get("https://www.bing.com/news/search?q=travel+tourism&format=RSS",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("rest_countries",()=>axios.get("https://restcountries.com/v3.1/alpha/FRA",{timeout:6000})),
    liveTest("currency",      ()=>axios.get("https://open.er-api.com/v6/latest/USD",{timeout:6000})),
    liveTest("waqi",          ()=>axios.get("https://api.waqi.info/feed/geo:48.85;2.35/?token=demo",{timeout:6000})),
    // National news RSS — sample a few representative feeds
    liveTest("news_bbc",      ()=>axios.get("https://feeds.bbci.co.uk/news/rss.xml",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_aljazeera",()=>axios.get("https://www.aljazeera.com/xml/rss/all.xml",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_foxnews",  ()=>axios.get("https://moxie.foxnews.com/google-publisher/latest.xml",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_nhk",      ()=>axios.get("https://www3.nhk.or.jp/rss/news/cat0.xml",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_dw",       ()=>axios.get("https://rss.dw.com/rdf/rss-en-all",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_abc_au",   ()=>axios.get("https://www.abc.net.au/news/feed/1948/rss.xml",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_cna",      ()=>axios.get("https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_trt",      ()=>axios.get("https://www.hurriyetdailynews.com/rss",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_rt",       ()=>axios.get("https://www.rt.com/rss/",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_france24", ()=>axios.get("https://www.france24.com/en/rss",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_xinhua",   ()=>axios.get("https://www.xinhuanet.com/english/rss/worldrss.xml",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_ndtv",     ()=>axios.get("https://feeds.feedburner.com/ndtvnews-top-stories",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_channels_tv",()=>axios.get("https://www.channelstv.com/feed/",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_news24",   ()=>axios.get("https://feeds.news24.com/articles/news24/TopStories/rss",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_cbc",      ()=>axios.get("https://www.cbc.ca/cmlink/rss-topstories",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_abc_br",   ()=>axios.get("https://feeds.folha.uol.com.br/emcimadahora/rss091.xml",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    liveTest("news_rnz",      ()=>axios.get("https://www.rnz.co.nz/rss/top.xml",{timeout:6000,headers:{"User-Agent":"GlobeVoyage/2.0"}})),
    ENV.OPENWEATHER_API_KEY
      ? liveTest("openweathermap",()=>axios.get("https://api.openweathermap.org/data/2.5/weather",{params:{q:"London",appid:ENV.OPENWEATHER_API_KEY,units:"metric"},timeout:6000}))
      : Promise.resolve(sourceHealth.openweathermap={ok:false,last_check:new Date().toISOString(),error:"No API key",response_ms:0,success_count:0,fail_count:0}),
    ENV.TICKETMASTER_API_KEY
      ? liveTest("ticketmaster",  ()=>axios.get("https://app.ticketmaster.com/discovery/v2/events.json",{params:{apikey:ENV.TICKETMASTER_API_KEY,size:1},timeout:6000}))
      : Promise.resolve(sourceHealth.ticketmaster={ok:false,last_check:new Date().toISOString(),error:"No API key",response_ms:0,success_count:0,fail_count:0}),
    ENV.PREDICTHQ_API_KEY
      ? liveTest("predicthq",     ()=>axios.get("https://api.predicthq.com/v1/events/",{params:{limit:1},headers:{Authorization:`Bearer ${ENV.PREDICTHQ_API_KEY}`},timeout:6000}))
      : Promise.resolve(sourceHealth.predicthq={ok:false,last_check:new Date().toISOString(),error:"No API key",response_ms:0,success_count:0,fail_count:0}),
    ENV.GEOAPIFY_API_KEY
      ? liveTest("geoapify",      ()=>axios.get("https://api.geoapify.com/v1/geocode/search",{params:{text:"Paris",type:"city",apiKey:ENV.GEOAPIFY_API_KEY,limit:1},timeout:6000}))
      : Promise.resolve(sourceHealth.geoapify={ok:false,last_check:new Date().toISOString(),error:"No API key",response_ms:0,success_count:0,fail_count:0}),
    ENV.UNSPLASH_ACCESS_KEY
      ? liveTest("unsplash",      ()=>axios.get("https://api.unsplash.com/search/photos",{params:{query:"travel",per_page:1},headers:{Authorization:`Client-ID ${ENV.UNSPLASH_ACCESS_KEY}`},timeout:6000}))
      : Promise.resolve(sourceHealth.unsplash={ok:false,last_check:new Date().toISOString(),error:"No API key",response_ms:0,success_count:0,fail_count:0}),
    ENV.OPENAQ_API_KEY
      ? liveTest("openaq",        ()=>axios.get("https://api.openaq.org/v3/locations",{params:{limit:1},headers:{"X-API-Key":ENV.OPENAQ_API_KEY},timeout:6000}))
      : liveTest("openaq",        ()=>axios.get("https://api.openaq.org/v3/locations",{params:{limit:1},timeout:6000})),
  ]);

  const paidSources = {
    newsapi:        { key: ENV.GNEWS_API_KEY,         detail: ENV.GNEWS_API_KEY ? (() => { gnewsResetIfNeeded(); return `Key configured — ${GNEWS_DAILY_CAP-gnewsCallsToday}/${GNEWS_DAILY_CAP} calls remaining today`; })() : "No API key" },
    aviationstack:  { key: ENV.AVIATIONSTACK_API_KEY, detail: ENV.AVIATIONSTACK_API_KEY ? "Key configured (100 req/month — not live-tested)" : "No API key" },
    numbeo:         { key: ENV.RAPIDAPI_KEY,          detail: ENV.RAPIDAPI_KEY ? "RapidAPI key configured" : "No RapidAPI key" },
    airbnb:         { key: ENV.RAPIDAPI_KEY,          detail: ENV.RAPIDAPI_KEY ? "RapidAPI key configured" : "No RapidAPI key" },
    booking:        { key: ENV.RAPIDAPI_KEY,          detail: ENV.RAPIDAPI_KEY ? "RapidAPI key configured" : "No RapidAPI key" },
    tripadvisor:    { key: ENV.RAPIDAPI_KEY,          detail: ENV.RAPIDAPI_KEY ? "RapidAPI key configured" : "No RapidAPI key" },
    skyscanner:     { key: ENV.RAPIDAPI_KEY,          detail: ENV.RAPIDAPI_KEY ? "RapidAPI key configured" : "No RapidAPI key" },
    google_places:  { key: ENV.RAPIDAPI_KEY,          detail: ENV.RAPIDAPI_KEY ? "RapidAPI key configured" : "No RapidAPI key" },
    travel_advisor: { key: ENV.RAPIDAPI_KEY,          detail: ENV.RAPIDAPI_KEY ? "RapidAPI key configured" : "No RapidAPI key" },
    hotels_com:     { key: ENV.RAPIDAPI_KEY,          detail: ENV.RAPIDAPI_KEY ? "RapidAPI key configured" : "No RapidAPI key" },
    youtube:        { key: ENV.RAPIDAPI_KEY,          detail: ENV.RAPIDAPI_KEY ? "RapidAPI key configured" : "No RapidAPI key" },
  };
  Object.entries(paidSources).forEach(([k, v]) => {
    const existing = sourceHealth[k];
    sourceHealth[k] = {
      ok:             !!v.key,
      last_check:     new Date().toISOString(),
      response_ms:    existing?.response_ms||0,
      error:          v.key ? null : "No API key configured",
      success_count:  existing?.success_count||0,
      fail_count:     existing?.fail_count||0,
      _detail_override: v.detail,
    };
  });

  const sources = ["wikipedia","wikivoyage","foursquare","openweathermap","newsapi","google_news",
    "gdacs","ticketmaster","eventbrite","predicthq","geoapify","social_proxy",
    "unsplash","openaq","aviationstack","numbeo","rest_countries","airbnb",
    "booking","tripadvisor","skyscanner","currency","google_places","travel_advisor","hotels_com","youtube","waqi",
    "verification_ai",
    // National news channels
    "news_bbc","news_aljazeera","news_foxnews","news_nhk","news_dw","news_abc_au",
    "news_cna","news_trt","news_rt","news_france24","news_xinhua","news_ndtv",
    "news_channels_tv","news_news24","news_cbc","news_abc_br","news_rnz",
  ];
  const labelMap = {
    wikipedia:"Wikipedia", wikivoyage:"Wikivoyage", foursquare:"Places (OpenTripMap)",
    openweathermap:"OpenWeatherMap", newsapi:"GNews API", google_news:"Google News RSS",
    gdacs:"GDACS Disasters", ticketmaster:"Ticketmaster", eventbrite:"Eventbrite (RSS)",
    predicthq:"PredictHQ", geoapify:"Geoapify", social_proxy:"Social Trends (RSS)",
    unsplash:"Unsplash Photos", openaq:"OpenAQ Air Quality", aviationstack:"Aviationstack Flights",
    numbeo:"Numbeo Cost of Living", rest_countries:"REST Countries", airbnb:"Airbnb (RapidAPI)",
    booking:"Booking.com", tripadvisor:"TripAdvisor", skyscanner:"Skyscanner Flights",
    currency:"Currency Exchange", google_places:"Google Places", travel_advisor:"Travel Advisor",
    hotels_com:"Hotels.com", youtube:"YouTube Travel Videos", waqi:"World Air Quality Index",
    verification_ai:"🤖 Verification AI (Mistral Large + Web Search)",
    // National news
    news_bbc:"📺 BBC News (UK)", news_aljazeera:"📺 Al Jazeera (Qatar)",
    news_foxnews:"📺 Fox News (USA)", news_nhk:"📺 NHK World (Japan)",
    news_dw:"📺 Deutsche Welle (Germany)", news_abc_au:"📺 ABC News (Australia)",
    news_cna:"📺 Channel News Asia (Singapore)", news_trt:"📺 Hurriyet Daily News (Turkey)",
    news_rt:"📺 RT News (Russia)", news_france24:"📺 France 24 (France)",
    news_xinhua:"📺 Xinhua News (China)", news_ndtv:"📺 NDTV (India)",
    news_channels_tv:"📺 Channels TV (Nigeria)", news_news24:"📺 News24 (South Africa)",
    news_cbc:"📺 CBC News (Canada)", news_abc_br:"📺 Folha de S.Paulo (Brazil)",
    news_rnz:"📺 RNZ News (New Zealand)",
  };
  sources.forEach(k=>{
    const h=sourceHealth[k]||{};
    const detail = h._detail_override || (h.ok!=null?(h.ok?`Last OK (${h.response_ms}ms)`:h.error):"Not yet tested");
    checks[k]={ok:h.ok??null,label:labelMap[k]||k,detail,last_check:h.last_check||null,
      success_count:h.success_count||0,fail_count:h.fail_count||0,response_ms:h.response_ms||null};
  });

  const envKeys=[
    {label:"Mistral AI + Verify", key:"MISTRAL_API_KEY"},
    {label:"OpenWeatherMap",      key:"OPENWEATHER_API_KEY"},
    {label:"Ticketmaster",        key:"TICKETMASTER_API_KEY"},
    {label:"PredictHQ",           key:"PREDICTHQ_API_KEY"},
    {label:"GNews API",           key:"GNEWS_API_KEY"},
    {label:"Geoapify",            key:"GEOAPIFY_API_KEY"},
    {label:"Unsplash",            key:"UNSPLASH_ACCESS_KEY"},
    {label:"OpenAQ",              key:"OPENAQ_API_KEY"},
    {label:"Aviationstack",       key:"AVIATIONSTACK_API_KEY"},
    {label:"RapidAPI",            key:"RAPIDAPI_KEY"},
  ];
  checks.env_keys={ok:true,label:"API Keys",keys:envKeys.map(k=>({label:k.label,configured:!!process.env[k.key]}))};

  const {data:pipeData} = await supabase.from("country_intel").select("iso,last_updated");
  const fc = Date.now()-6*60*60*1000;
  const freshCount = (pipeData||[]).filter(r=>new Date(r.last_updated).getTime()>fc).length;
  checks.pipeline={ok:freshCount>0,label:"Pipeline",detail:`${(pipeData||[]).length}/${COUNTRIES.length} processed, ${freshCount} fresh (<6h)`,total:COUNTRIES.length,processed:(pipeData||[]).length,fresh:freshCount};

  res.json({status:Object.values(checks).filter(c=>c.ok===false).length===0?"healthy":"degraded",timestamp:new Date().toISOString(),checks});
});

app.get("/api/countries", (req,res) => {
  const byCont={};
  COUNTRIES.forEach(c=>{if(!byCont[c.continent])byCont[c.continent]=[];byCont[c.continent].push(c);});
  res.json({total:COUNTRIES.length,by_continent:byCont,all:COUNTRIES});
});

// ══════════════════════════════════════════════════════════════════
// TEXTURE PROXY
// ══════════════════════════════════════════════════════════════════
const TEXTURES={"earth-day":"https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg","earth-night":"https://unpkg.com/three-globe@2.30.0/example/img/earth-night.jpg","earth-clouds":"https://unpkg.com/three-globe@2.30.0/example/img/earth-clouds.png","earth-water":"https://unpkg.com/three-globe@2.30.0/example/img/earth-water.png"};
const textureCache = {};

app.options("/texture/:name", (req,res) => {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,HEAD,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","*");
  res.status(204).end();
});

app.get("/texture/:name",(req,res)=>{
  const name = req.params.name;
  const sourceUrl = TEXTURES[name];
  if(!sourceUrl) return res.status(404).end();
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,HEAD,OPTIONS");
  res.setHeader("Cache-Control","public,max-age=86400");
  res.setHeader("Content-Type", sourceUrl.endsWith(".png")?"image/png":"image/jpeg");
  if(textureCache[name]) return res.send(textureCache[name]);
  axios.get(sourceUrl,{responseType:"arraybuffer",timeout:15000,headers:{"User-Agent":"GlobeVoyage/2.0"}})
    .then(r=>{const buf=Buffer.from(r.data);textureCache[name]=buf;console.log(`Texture cached: ${name} (${Math.round(buf.length/1024)}kb)`);res.send(buf);})
    .catch(e=>{console.error(`Texture fetch failed: ${name}`,e.message);res.status(502).end();});
});

// ══════════════════════════════════════════════════════════════════
// GEODATA PROXY
// ══════════════════════════════════════════════════════════════════
let geojsonCache=null,geojsonFetching=false,geojsonWaiters=[];
function fetchGeoJSON(cb){
  if(geojsonCache)return cb(null,geojsonCache);
  geojsonWaiters.push(cb);if(geojsonFetching)return;geojsonFetching=true;
  let data="";
  https.get("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",res=>{
    res.on("data",c=>data+=c);
    res.on("end",()=>{
      try{
        const p=JSON.parse(data);
        p.features=p.features.map(f=>({type:"Feature",properties:{name:f.properties.NAME||"Unknown",iso:f.properties.ISO_A3||f.properties.NAME||"Unknown",continent:f.properties.CONTINENT||"",pop:f.properties.POP_EST||0,subregion:f.properties.SUBREGION||""},geometry:f.geometry}));
        geojsonCache=p;geojsonWaiters.splice(0).forEach(w=>w(null,geojsonCache));
      }catch(e){geojsonWaiters.splice(0).forEach(w=>w(e,null));}
      geojsonFetching=false;
    });
  }).on("error",e=>{geojsonFetching=false;geojsonWaiters.splice(0).forEach(w=>w(e,null));});
}
app.get("/geodata",(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Cache-Control","public,max-age=3600");
  fetchGeoJSON((err,data)=>err?res.status(502).json({error:"geo fail"}):res.json(data));
});
fetchGeoJSON(()=>console.log("GeoJSON cached ✓"));

// ══════════════════════════════════════════════════════════════════
// DESTINATIONS CRUD
// ══════════════════════════════════════════════════════════════════
app.get("/api/destinations",async(req,res)=>{const{data,error}=await supabase.from("destinations").select("*");if(error)return res.status(500).json({error:error.message});res.json(data);});
app.get("/api/destinations/:id",async(req,res)=>{const{data,error}=await supabase.from("destinations").select("*").eq("id",req.params.id).single();if(error)return res.status(404).json({error:error.message});res.json(data);});
app.post("/api/destinations",async(req,res)=>{const{name,country,description,image_url,price,iso,lat,lng}=req.body;const{data,error}=await supabase.from("destinations").insert([{name,country,description,image_url,price,iso,lat,lng}]).select();if(error)return res.status(500).json({error:error.message});res.status(201).json(data[0]);});
app.put("/api/destinations/:id",async(req,res)=>{const{name,country,description,image_url,price}=req.body;const{data,error}=await supabase.from("destinations").update({name,country,description,image_url,price}).eq("id",req.params.id).select();if(error)return res.status(500).json({error:error.message});res.json(data[0]);});
app.delete("/api/destinations/:id",async(req,res)=>{const{error}=await supabase.from("destinations").delete().eq("id",req.params.id);if(error)return res.status(500).json({error:error.message});res.json({message:"Deleted"});});

// ══════════════════════════════════════════════════════════════════
// GEO HIERARCHY API ENDPOINTS
// ══════════════════════════════════════════════════════════════════

app.get("/api/geo/countries/:iso/states", async (req, res) => {
  const iso = req.params.iso.toUpperCase();
  try {
    const { data, error } = await supabase
      .from("states")
      .select("id,name,ascii_name,state_code,type,capital,population,area_km2,latitude,longitude,timezone")
      .eq("country_iso", iso)
      .order("name");
    if(error) return res.status(500).json({ error: error.message });
    if(!data || data.length === 0) {
      fetchAndSaveStates(iso).catch(console.error);
      return res.json({ states:[], loading:true, message:"States loading — check back in 30 seconds" });
    }
    res.json({ states: data, total: data.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/geo/states/:id/areas", async (req, res) => {
  const stateId = parseInt(req.params.id);
  if(isNaN(stateId)) return res.status(400).json({ error:"Invalid state ID" });
  try {
    const { data: state } = await supabase
      .from("states").select("id,geoname_id,name,country_iso").eq("id", stateId).single();
    if(!state) return res.status(404).json({ error:"State not found" });
    const { data, error } = await supabase
      .from("areas")
      .select("id,name,ascii_name,area_code,type,population,latitude,longitude,timezone")
      .eq("state_id", stateId)
      .order("population", { ascending:false });
    if(error) return res.status(500).json({ error: error.message });
    if(!data || data.length === 0) {
      fetchAndSaveAreas(state.id, state.geoname_id, state.country_iso).catch(console.error);
      return res.json({ areas:[], loading:true, message:"Areas loading — check back in 30 seconds" });
    }
    res.json({ areas: data, total: data.length, state_name: state.name });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/geo/areas/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if(isNaN(id)) return res.status(400).json({ error:"Invalid area ID" });
  try {
    const { data, error } = await supabase
      .from("areas").select("*").eq("id", id).single();
    if(error || !data) return res.status(404).json({ error:"Area not found" });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/geo/search", async (req, res) => {
  const q    = (req.query.q||"").trim();
  const type = req.query.type||"all";
  const iso  = req.query.iso?.toUpperCase()||null;
  if(q.length < 2) return res.status(400).json({ error:"Query must be at least 2 characters" });
  try {
    const results = {};
    if(type === "all" || type === "state") {
      let sq = supabase.from("states").select("id,name,state_code,type,country_iso,population")
        .ilike("name", `%${q}%`).limit(10);
      if(iso) sq = sq.eq("country_iso", iso);
      const { data } = await sq;
      results.states = data||[];
    }
    if(type === "all" || type === "area") {
      let aq = supabase.from("areas").select("id,name,type,country_iso,state_id,population")
        .ilike("name", `%${q}%`).limit(10);
      if(iso) aq = aq.eq("country_iso", iso);
      const { data } = await aq;
      results.areas = data||[];
    }
    res.json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/geo/stats", async (req, res) => {
  try {
    const [statesRes, areasRes] = await Promise.all([
      supabase.from("states").select("*", { count:"exact", head:true }),
      supabase.from("areas").select("*",  { count:"exact", head:true }),
    ]);
    if(statesRes.error) {
      return res.json({
        total_states:0, total_areas:0, countries_loaded:0, countries_pending:195,
        coverage_pct:0, per_country:{}, geo_pipeline_running:geoPipelineRunning,
        setup_needed:true,
        message:"Run geo_migration.sql in Supabase first to create states and areas tables",
      });
    }
    const totalStates = statesRes.count||0;
    const totalAreas  = areasRes.count||0;

    // Count distinct countries that have at least one state loaded
    const { data:perCountry } = await supabase
      .from("states")
      .select("country_iso")
      .order("country_iso");

    const countryCounts = {};
    (perCountry||[]).forEach(r => {
      countryCounts[r.country_iso] = (countryCounts[r.country_iso]||0) + 1;
    });
    const loaded  = Object.keys(countryCounts).length;
    const pending = COUNTRIES.length - loaded;

    // List which countries still need loading
    const loadedSet   = new Set(Object.keys(countryCounts));
    const pendingList = COUNTRIES.filter(c => !loadedSet.has(c.iso)).map(c => c.name);

    res.json({
      total_states:      totalStates,
      total_areas:       totalAreas,
      countries_loaded:  loaded,
      countries_pending: pending,
      coverage_pct:      Math.round(loaded / COUNTRIES.length * 100),
      pending_countries: pendingList.slice(0, 20), // first 20 for display
      per_country:       countryCounts,
      geo_pipeline_running: geoPipelineRunning,
      geo_pipeline_status: {
        running:         geoPipelineRunning,
        countries_done:  geoStatus.countries_done,
        countries_total: COUNTRIES.length,
        progress_pct:    Math.round(geoStatus.countries_done / COUNTRIES.length * 100),
        current_country: geoStatus.current_country,
        last_error:      geoStatus.last_error,
        total_states:    geoStatus.total_states,
        total_areas:     geoStatus.total_areas,
        completed_at:    geoStatus.completed_at,
      },
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/geo/pipeline/status", (req, res) => {
  res.json({
    running:         geoPipelineRunning,
    countries_done:  geoStatus.countries_done,
    countries_total: COUNTRIES.length,
    progress_pct:    Math.round(geoStatus.countries_done / COUNTRIES.length * 100),
    total_states:    geoStatus.total_states,
    total_areas:     geoStatus.total_areas,
    current_country: geoStatus.current_country,
    last_error:      geoStatus.last_error,
    started_at:      geoStatus.started_at,
    completed_at:    geoStatus.completed_at,
  });
});

app.get("/api/geo/test", async (req, res) => {
  try {
    const t = Date.now();
    const r = await axios.post(
      "https://countriesnow.space/api/v0.1/countries/states",
      { country: "Nigeria" },
      { timeout: 10000 }
    );
    const ms = Date.now() - t;
    if (r.data?.error) {
      return res.json({ ok: false, error: r.data.msg || "CountriesNow returned an error" });
    }
    const states = r.data?.data?.states || [];
    res.json({
      ok:          true,
      source:      "CountriesNow API (countriesnow.space) — free, no key, no rate limits",
      response_ms: ms,
      test_result: `Nigeria has ${states.length} states — e.g. "${states[0]?.name}"`,
      message:     "CountriesNow is working — ready to run geo pipeline! No API key needed.",
    });
  } catch(e) {
    res.json({
      ok:    false,
      error: e.message,
      fix:   "countriesnow.space may be temporarily down — try again in a minute",
    });
  }
});

app.post("/api/geo/pipeline/start", async (req, res) => {
  if(geoPipelineRunning) {
    return res.json({
      message:         "Already running",
      progress_pct:    Math.round(geoStatus.countries_done / COUNTRIES.length * 100),
      current_country: geoStatus.current_country,
    });
  }
  const forceAll = req.query.force === "true";
  res.json({ message:"Geo pipeline started", force_all: forceAll });
  runGeoPipeline(forceAll).catch(console.error);
});

app.post("/api/geo/pipeline/country/:iso", async (req, res) => {
  const iso = req.params.iso.toUpperCase();
  const country = COUNTRIES.find(c=>c.iso===iso);
  if(!country) return res.status(404).json({ error:"Unknown ISO" });
  res.json({ message:`Geo pipeline started for ${country.name}` });
  (async () => {
    const statesAdded = await fetchAndSaveStates(iso);
    if(statesAdded > 0) {
      const { data:savedStates } = await supabase.from("states")
        .select("id, geoname_id").eq("country_iso", iso);
      for(const state of savedStates||[]) {
        await fetchAndSaveAreas(state.id, state.geoname_id, iso);
        await new Promise(r=>setTimeout(r,250));
      }
    }
    console.log(`✅ [GeoPipeline] ${country.name} complete`);
  })().catch(console.error);
});

// ══════════════════════════════════════════════════════════════════
// GLOBE
// ══════════════════════════════════════════════════════════════════
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
  canvas{
    position:absolute;top:0;left:0;
    width:100%!important;height:100%!important;
    touch-action:none;display:block;
  }
  #loading{
    position:absolute;top:50%;left:50%;
    transform:translate(-50%,-50%);
    color:#5bb8ff;font-size:10px;letter-spacing:4px;
    transition:opacity 0.8s;text-align:center;pointer-events:none;z-index:10;
  }
  #bar{width:130px;height:1px;background:rgba(91,184,255,0.15);margin:12px auto 0;border-radius:1px;overflow:hidden}
  #fill{height:100%;background:linear-gradient(90deg,#3a8fff,#7dd4ff);width:0%;transition:width 0.3s;}
  #hint{
    position:absolute;top:12px;left:50%;transform:translateX(-50%);
    color:rgba(140,185,240,0.4);font-size:9px;letter-spacing:3px;
    pointer-events:none;white-space:nowrap;transition:opacity 1.4s;z-index:5;
  }
  #card{
    position:absolute;left:0;right:0;bottom:0;z-index:20;
    background:linear-gradient(to bottom, rgba(6,10,20,0) 0%, rgba(6,10,20,0.97) 12%, #060a14 100%);
    padding:32px 20px 28px;
    transform:translateY(100%);
    transition:transform 0.4s cubic-bezier(0.22,1,0.36,1);
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

  var W=window.innerWidth, H=window.innerHeight;
  var canvas=document.getElementById('c');
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
  var camera=new THREE.PerspectiveCamera(45, W/H, 0.1, 1000);
  camera.position.z=2.8;

  var fillEl=document.getElementById('fill');
  var loadEl=document.getElementById('loading');
  var prog=0;
  function progress(n){
    prog=Math.max(prog,n);
    fillEl.style.width=prog+'%';
    if(prog>=100)setTimeout(function(){loadEl.style.opacity='0';},400);
  }
  progress(20);

  var isDrag=false, isPinch=false;
  var autoSpin=true, spinSpeed=0.0013;
  var momX=0, momY=0, fric=0.90;
  var lx=0, ly=0, lDist=0;
  var CAM_DEFAULT = 2.8;
  var CAM_COUNTRY = 1.9;
  var CAM_MIN     = 1.3;
  var CAM_MAX     = 5.5;
  var targetZ = CAM_DEFAULT;
  var camZ    = CAM_DEFAULT;
  var zoomVel = 0;
  var tapX=0,tapY=0,tapT=0,lastTap=0;
  var holdTimer=null,isHeld=false;
  var selectedISO=null,cardOpen=false;
  function shouldSpin(){ return !selectedISO&&!isHeld&&camZ>CAM_MIN+0.3; }

  (function(){
    var geo=new THREE.BufferGeometry(),v=[];
    for(var i=0;i<2000;i++){
      var th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=50+Math.random()*30;
      v.push(r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph));
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
    scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.065})));
  })();

  scene.add(new THREE.AmbientLight(0x1a2540,0.9));
  var sun=new THREE.DirectionalLight(0xffeedd,4.5);
  sun.position.set(5,2.5,4);scene.add(sun);
  var bounce=new THREE.DirectionalLight(0x3a6aff,0.7);
  bounce.position.set(-4,1,-3);scene.add(bounce);
  var polar=new THREE.DirectionalLight(0xaaccff,0.35);
  polar.position.set(0,8,0);scene.add(polar);

  var earthGroup=new THREE.Group();
  earthGroup.rotation.z=0.41;
  scene.add(earthGroup);

  var uEarth={
    dayTexture:{value:null},nightTexture:{value:null},specTexture:{value:null},
    sunDirection:{value:new THREE.Vector3(5,2.5,4).normalize()},
  };
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(1,72,72),new THREE.ShaderMaterial({
    uniforms:uEarth,
    vertexShader:'varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'precision highp float;uniform sampler2D dayTexture,nightTexture,specTexture;uniform vec3 sunDirection;varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;void main(){vec3 n=normalize(vNormal);vec3 sun=normalize(sunDirection);float cosA=dot(n,sun);float dayA=smoothstep(-0.18,0.45,cosA);vec3 day=texture2D(dayTexture,vUv).rgb;float lum=dot(day,vec3(0.299,0.587,0.114));day=mix(vec3(lum),day,1.35);day=pow(day,vec3(0.88));vec3 night=texture2D(nightTexture,vUv).rgb;night=pow(night,vec3(0.75))*2.2;vec3 spec=texture2D(specTexture,vUv).rgb;vec3 color=mix(night,day,dayA);vec3 vd=normalize(cameraPosition-vWorldPos);vec3 hv=normalize(sun+vd);float sp=pow(max(dot(n,hv),0.0),90.0);float sp2=pow(max(dot(n,hv),0.0),18.0)*0.06;color+=vec3(0.7,0.82,1.0)*(sp*0.9+sp2)*spec.r*dayA;float term=smoothstep(0.0,0.18,cosA)*smoothstep(0.38,0.18,cosA);color+=vec3(0.9,0.45,0.15)*term*0.28;float rim=pow(1.0-max(dot(n,vd),0.0),3.8);color=mix(color,mix(vec3(0.04,0.08,0.28),vec3(0.28,0.62,1.0),smoothstep(-0.3,0.6,cosA)),rim*0.72);gl_FragColor=vec4(color,1.0);}'
  }));
  earthGroup.add(earthMesh);

  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.09,48,48),new THREE.ShaderMaterial({
    uniforms:{sd:{value:new THREE.Vector3(5,2.5,4).normalize()}},
    vertexShader:'varying vec3 vN,vP;void main(){vN=normal;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 sd;varying vec3 vN,vP;void main(){vec3 vd=normalize(cameraPosition-(modelMatrix*vec4(vP,1.0)).xyz);float rim=pow(1.0-abs(dot(normalize(vN),vd)),2.4);float d=dot(normalize((normalMatrix*vec4(vN,0.0)).xyz),normalize(sd));vec3 col=mix(vec3(0.03,0.06,0.28),vec3(0.22,0.56,1.0),smoothstep(-0.15,0.6,d));gl_FragColor=vec4(col,rim*0.62);}',
    transparent:true,side:THREE.FrontSide,depthWrite:false,blending:THREE.AdditiveBlending
  })));

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

  var card     = document.getElementById('card');
  var backdrop = document.getElementById('backdrop');

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
    targetZ=CAM_COUNTRY;
  }
  function closeCard(){
    card.classList.remove('open');
    backdrop.classList.remove('on');
    cardOpen=false;
    targetZ=CAM_DEFAULT;
    if(shouldSpin())autoSpin=true;
  }
  document.getElementById('card-close').addEventListener('click',function(e){
    e.stopPropagation();dismissSelection();
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

  var raycaster=new THREE.Raycaster();
  function handleTap(sx,sy){
    var cardEl=document.getElementById('card');
    var cardRect=cardEl.getBoundingClientRect();
    if(cardOpen && sy > cardRect.top) return;
    var ndc=new THREE.Vector2((sx/W)*2-1,-(sy/H)*2+1);
    raycaster.setFromCamera(ndc,camera);
    var sphereHits=raycaster.intersectObject(earthMesh);
    if(!sphereHits.length){ if(selectedISO)dismissSelection(); return; }
    var fills=[];
    earthGroup.traverse(function(o){if(o.isMesh&&o.userData.iso)fills.push(o);});
    var hits=raycaster.intersectObjects(fills,false);
    if(hits.length>0){setSelected(hits[0].object.userData.iso);return;}
    var localPt=earthGroup.worldToLocal(sphereHits[0].point.clone());
    var ll=v3toll(localPt);
    for(var i=0;i<allFeatures.length;i++){
      if(pipFeature(ll.lon,ll.lat,allFeatures[i])){setSelected(allFeatures[i].properties.iso);return;}
    }
    if(selectedISO)dismissSelection();
  }

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
      var s=0.004*(camZ/CAM_DEFAULT);
      earthGroup.rotation.y+=dx*s;
      earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+dy*s));
      momX=dx*s;momY=dy*s;
      lx=t.clientX;ly=t.clientY;
      autoSpin=false;
    }else if(isPinch&&e.touches.length===2){
      var d=tDist(e.touches[0],e.touches[1]);
      var delta=(lDist-d)*0.016;
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
      if(now-lastTap<260&&dx<18&&dy2<18){
        targetZ=camZ<CAM_DEFAULT-0.3?CAM_DEFAULT:CAM_MIN+0.3;
      }
      lastTap=now;
      if(dx<10&&dy2<10&&dt<280)handleTap(tapX,tapY);
      if(Math.abs(momX)>0.001||Math.abs(momY)>0.001){
        setTimeout(function(){if(!isDrag&&!isHeld&&shouldSpin())autoSpin=true;},1800);
      }else if(shouldSpin()){autoSpin=true;}
    }
    isDrag=false;isPinch=false;
  },{passive:false});

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
    var diff=targetZ-camZ;
    zoomVel=(zoomVel+diff*0.035)*0.75;
    camZ+=zoomVel;
    camera.position.z=camZ;
    if(camZ<CAM_MIN+0.25&&!selectedISO)autoSpin=false;
    else if(!selectedISO&&!isHeld&&!isDrag&&shouldSpin())autoSpin=true;
    if(cloudMesh)cloudMesh.rotation.y+=spinSpeed*1.12;
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

// ══════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════
const PORT = process.env.PORT||3000;
app.listen(PORT, async()=>{
  console.log(`GlobeVoyage API on port ${PORT} — ${COUNTRIES.length} countries`);
  await ensureScripts();
  console.log("Pre-warming texture cache...");
  for(const [name, url] of Object.entries(TEXTURES)) {
    axios.get(url,{responseType:"arraybuffer",timeout:20000,headers:{"User-Agent":"GlobeVoyage/2.0"}})
      .then(r=>{textureCache[name]=Buffer.from(r.data);console.log(`✓ Texture cached: ${name} (${Math.round(textureCache[name].length/1024)}kb)`);})
      .catch(e=>console.error(`✗ Texture pre-warm failed: ${name}`,e.message));
  }
  setTimeout(runStartupPipeline, 15000);
  setTimeout(resumeGeoPipelineIfIncomplete, 30000); // auto-resume geo if incomplete after restart
});
