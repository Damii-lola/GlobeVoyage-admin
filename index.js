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
  // OpenTripMap: REMOVED
};

// ══════════════════════════════════════════════════════════════════
// GNEWS RATE LIMIT GUARD
// Free tier = 10 requests/day hard cap.
// We cache per-country for 12 hours and cap daily calls at 8
// (leaving 2 in reserve) so the health check never blows the budget.
// ══════════════════════════════════════════════════════════════════
const gnewsCache   = new Map(); // iso → { data, ts }
const GNEWS_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours in ms
let   gnewsCallsToday = 0;
let   gnewsResetAt    = Date.now() + 24 * 60 * 60 * 1000;
const GNEWS_DAILY_CAP = 8; // never burn all 10 — leave 2 buffer

function gnewsResetIfNeeded() {
  if (Date.now() > gnewsResetAt) {
    gnewsCallsToday = 0;
    gnewsResetAt    = Date.now() + 24 * 60 * 60 * 1000;
  }
}

function gnewsBudgetAvailable() {
  gnewsResetIfNeeded();
  return gnewsCallsToday < GNEWS_DAILY_CAP;
}

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

// Self-ping keepalive
const SELF = process.env.RENDER_EXTERNAL_URL || "https://globevoyage-admin.onrender.com";
setInterval(() => {
  const mod = SELF.startsWith("https") ? https : http;
  mod.get(SELF+"/", r=>r.resume()).on("error",()=>{});
}, 4*60*1000);

// MediaWiki REQUIRES a descriptive User-Agent or returns 403
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
function recordHealth(source, ok, ms, detail, err) {
  sourceHealth[source] = {
    ok, last_check: new Date().toISOString(),
    response_ms: ms,
    detail: detail || (ok ? `Last OK (${ms}ms)` : (err || "Failed")),
    error: err||null,
    success_count: (sourceHealth[source]?.success_count||0)+(ok?1:0),
    fail_count:    (sourceHealth[source]?.fail_count||0)+(ok?0:1),
  };
}
async function timed(source, fn, detailFn) {
  const t = Date.now();
  try {
    const r = await fn();
    const ms = Date.now()-t;
    const detail = detailFn ? detailFn(r, ms) : `Last OK (${ms}ms)`;
    recordHealth(source, true, ms, detail, null);
    return r;
  } catch(e) {
    const ms = Date.now()-t;
    recordHealth(source, false, ms, `Request failed: ${e.message}`, e.message);
    throw e;
  }
}

// ══════════════════════════════════════════════════════════════════
// CAPITAL COORDINATES (for weather, events, etc.)
// ══════════════════════════════════════════════════════════════════
const geoCoordCache = {
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
  PRT:{lat:38.7223,lon:-9.1393},  ROU:{lat:44.4268,lon:26.1025},
  RUS:{lat:55.7558,lon:37.6173},  SMR:{lat:43.9424,lon:12.4578},
  SRB:{lat:44.7866,lon:20.4489},  SVK:{lat:48.1486,lon:17.1077},
  SVN:{lat:46.0569,lon:14.5058},  ESP:{lat:40.4168,lon:-3.7038},
  SWE:{lat:59.3293,lon:18.0686},  CHE:{lat:46.9481,lon:7.4474},
  UKR:{lat:50.4501,lon:30.5234},  GBR:{lat:51.5074,lon:-0.1278},
  ATG:{lat:17.1274,lon:-61.8468}, BHS:{lat:25.0480,lon:-77.3554},
  BRB:{lat:13.1939,lon:-59.5432}, BLZ:{lat:17.2510,lon:-88.7590},
  CAN:{lat:45.4215,lon:-75.6972}, CRI:{lat:9.9281,lon:-84.0907},
  CUB:{lat:23.1136,lon:-82.3666}, DMA:{lat:15.3092,lon:-61.3794},
  DOM:{lat:18.4861,lon:-69.9312}, SLV:{lat:13.6929,lon:-89.2182},
  GRD:{lat:12.0561,lon:-61.7488}, GTM:{lat:14.6349,lon:-90.5069},
  HTI:{lat:18.5944,lon:-72.3074}, HND:{lat:14.0723,lon:-87.2020},
  JAM:{lat:17.9970,lon:-76.7936}, MEX:{lat:19.4326,lon:-99.1332},
  NIC:{lat:12.1328,lon:-86.2826}, PAN:{lat:8.9936,lon:-79.5197},
  KNA:{lat:17.3026,lon:-62.7177}, LCA:{lat:14.0101,lon:-60.9875},
  VCT:{lat:13.1600,lon:-61.2248}, TTO:{lat:10.6918,lon:-61.2225},
  USA:{lat:38.9072,lon:-77.0369},
  ARG:{lat:-34.6037,lon:-58.3816},BOL:{lat:-16.5000,lon:-68.1500},
  BRA:{lat:-15.7801,lon:-47.9292},CHL:{lat:-33.4489,lon:-70.6693},
  COL:{lat:4.7110,lon:-74.0721},  ECU:{lat:-0.1807,lon:-78.4678},
  GUY:{lat:6.8013,lon:-58.1551},  PRY:{lat:-25.2867,lon:-57.6470},
  PER:{lat:-12.0464,lon:-77.0428},SUR:{lat:5.8664,lon:-55.1668},
  URY:{lat:-34.9011,lon:-56.1645},VEN:{lat:10.4806,lon:-66.9036},
  AUS:{lat:-35.2809,lon:149.1300},FJI:{lat:-18.1416,lon:178.4415},
  KIR:{lat:1.3290,lon:172.9790},  MHL:{lat:7.1315,lon:171.1845},
  FSM:{lat:6.9248,lon:158.1618},  NRU:{lat:-0.5228,lon:166.9315},
  NZL:{lat:-41.2865,lon:174.7762},PLW:{lat:7.5150,lon:134.5825},
  PNG:{lat:-9.4438,lon:147.1803}, WSM:{lat:-13.8314,lon:-171.8720},
  SLB:{lat:-9.4456,lon:160.0168}, TON:{lat:-21.1394,lon:-175.2049},
  TUV:{lat:-8.5200,lon:179.1960}, VUT:{lat:-17.7334,lon:168.3210},
};

// ══════════════════════════════════════════════════════════════════
// ISO-3166 alpha-2 ↔ alpha-3 mapping (for GNews country param)
// GNews requires 2-letter codes; we store 3-letter ISOs
// ══════════════════════════════════════════════════════════════════
const ISO3_TO_2 = {
  DZA:"dz",AGO:"ao",BEN:"bj",BWA:"bw",BFA:"bf",BDI:"bi",CPV:"cv",CMR:"cm",
  CAF:"cf",TCD:"td",COM:"km",COD:"cd",COG:"cg",CIV:"ci",DJI:"dj",EGY:"eg",
  GNQ:"gq",ERI:"er",SWZ:"sz",ETH:"et",GAB:"ga",GMB:"gm",GHA:"gh",GIN:"gn",
  GNB:"gw",KEN:"ke",LSO:"ls",LBR:"lr",LBY:"ly",MDG:"mg",MWI:"mw",MLI:"ml",
  MRT:"mr",MUS:"mu",MAR:"ma",MOZ:"mz",NAM:"na",NER:"ne",NGA:"ng",RWA:"rw",
  STP:"st",SEN:"sn",SLE:"sl",SOM:"so",ZAF:"za",SSD:"ss",SDN:"sd",TZA:"tz",
  TGO:"tg",TUN:"tn",UGA:"ug",ZMB:"zm",ZWE:"zw",
  AFG:"af",ARM:"am",AZE:"az",BHR:"bh",BGD:"bd",BTN:"bt",BRN:"bn",KHM:"kh",
  CHN:"cn",CYP:"cy",GEO:"ge",IND:"in",IDN:"id",IRN:"ir",IRQ:"iq",ISR:"il",
  JPN:"jp",JOR:"jo",KAZ:"kz",KWT:"kw",KGZ:"kg",LAO:"la",LBN:"lb",MYS:"my",
  MDV:"mv",MNG:"mn",MMR:"mm",NPL:"np",PRK:"kp",OMN:"om",PAK:"pk",PSE:"ps",
  PHL:"ph",QAT:"qa",SAU:"sa",SGP:"sg",KOR:"kr",LKA:"lk",SYR:"sy",TWN:"tw",
  TJK:"tj",THA:"th",TLS:"tl",TUR:"tr",TKM:"tm",ARE:"ae",UZB:"uz",VNM:"vn",
  YEM:"ye",
  ALB:"al",AND:"ad",AUT:"at",BLR:"by",BEL:"be",BIH:"ba",BGR:"bg",HRV:"hr",
  CZE:"cz",DNK:"dk",EST:"ee",FIN:"fi",FRA:"fr",DEU:"de",GRC:"gr",HUN:"hu",
  ISL:"is",IRL:"ie",ITA:"it",XKX:"xk",LVA:"lv",LIE:"li",LTU:"lt",LUX:"lu",
  MLT:"mt",MDA:"md",MCO:"mc",MNE:"me",NLD:"nl",MKD:"mk",NOR:"no",POL:"pl",
  PRT:"pt",ROU:"ro",RUS:"ru",SMR:"sm",SRB:"rs",SVK:"sk",SVN:"si",ESP:"es",
  SWE:"se",CHE:"ch",UKR:"ua",GBR:"gb",
  ATG:"ag",BHS:"bs",BRB:"bb",BLZ:"bz",CAN:"ca",CRI:"cr",CUB:"cu",DMA:"dm",
  DOM:"do",SLV:"sv",GRD:"gd",GTM:"gt",HTI:"ht",HND:"hn",JAM:"jm",MEX:"mx",
  NIC:"ni",PAN:"pa",KNA:"kn",LCA:"lc",VCT:"vc",TTO:"tt",USA:"us",
  ARG:"ar",BOL:"bo",BRA:"br",CHL:"cl",COL:"co",ECU:"ec",GUY:"gy",PRY:"py",
  PER:"pe",SUR:"sr",URY:"uy",VEN:"ve",
  AUS:"au",FJI:"fj",KIR:"ki",MHL:"mh",FSM:"fm",NRU:"nr",NZL:"nz",PLW:"pw",
  PNG:"pg",WSM:"ws",SLB:"sb",TON:"to",TUV:"tv",VUT:"vu",
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

// ── WEATHER ───────────────────────────────────────────────────────
async function fetchWeather(iso) {
  if(!ENV.OPENWEATHER_API_KEY) return null;
  const geo = geoCoordCache[iso];
  if(!geo) return null;
  return timed("openweathermap", async () => {
    const r = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
      params:{ lat:geo.lat, lon:geo.lon, appid:ENV.OPENWEATHER_API_KEY, units:"metric" },
      timeout:8000
    });
    const d = r.data;
    return {
      temp: Math.round(d.main.temp),
      feels_like: Math.round(d.main.feels_like),
      humidity: d.main.humidity,
      condition: d.weather[0]?.description||"",
      wind: Math.round((d.wind?.speed||0)*3.6),
      icon: d.weather[0]?.icon||"",
    };
  });
}

// ── GOOGLE NEWS RSS (primary — free, unlimited) ───────────────────
async function fetchGoogleNewsRSS(countryName) {
  return timed("google_news", async () => {
    const q = encodeURIComponent(`${countryName} travel tourism`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`;
    const r = await axios.get(url, { timeout:10000, responseType:"text" });
    const parsed = await xml2js.parseStringPromise(r.data, { explicitArray:false });
    const items = parsed?.rss?.channel?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    return arr.slice(0,8).map(i => ({
      title: i.title||"",
      url:   i.link||"",
      source: i.source?._||i.source||"Google News",
      pub_date: i.pubDate||"",
      risk_level: guessRisk(i.title||""),
    }));
  });
}

// ── GNEWS API (secondary — rate-limited, cached aggressively) ─────
// Strategy:
//   1. Always check cache first — return cached data if < 12h old
//   2. Only call API if budget remains (8 calls/day cap)
//   3. On success, cache the result for 12 hours
//   4. On failure, record error but DON'T throw — return null so
//      the pipeline falls back to Google News RSS gracefully
async function fetchGNewsAPI(iso, countryName) {
  if(!ENV.GNEWS_API_KEY) return null;

  // Check in-memory cache first
  const cached = gnewsCache.get(iso);
  if(cached && (Date.now() - cached.ts) < GNEWS_CACHE_TTL) {
    return cached.data;
  }

  // Check daily budget
  if(!gnewsBudgetAvailable()) {
    console.log(`[GNews] Daily cap reached (${gnewsCallsToday}/${GNEWS_DAILY_CAP}) — skipping for ${iso}`);
    // Return stale cache if available, else null
    return cached ? cached.data : null;
  }

  const alpha2 = ISO3_TO_2[iso];
  if(!alpha2) return null;

  const t = Date.now();
  try {
    // Use /v4/search with topic=travel — more reliable than top-headlines
    // which requires country codes that aren't always supported
    const r = await axios.get("https://gnews.io/api/v4/search", {
      params:{
        q:         `${countryName} travel`,
        lang:      "en",
        country:   alpha2,
        max:       5,
        apikey:    ENV.GNEWS_API_KEY,
        sortby:    "publishedAt",
      },
      timeout: 10000
    });
    gnewsCallsToday++;
    const ms = Date.now()-t;
    const articles = (r.data?.articles||[]).map(a => ({
      title:      a.title||"",
      url:        a.url||"",
      source:     a.source?.name||"GNews",
      pub_date:   a.publishedAt||"",
      risk_level: guessRisk(a.title||""),
    }));
    // Cache the result
    gnewsCache.set(iso, { data: articles, ts: Date.now() });
    recordHealth("newsapi", true, ms, `Last OK (${ms}ms) — ${gnewsCallsToday}/${GNEWS_DAILY_CAP} today`);
    return articles;
  } catch(e) {
    const ms = Date.now()-t;
    const status = e.response?.status;
    let detail = `Request failed: ${e.message}`;
    if(status === 429) {
      detail = `Rate limited — daily cap hit. Resets in ~${hoursUntilReset()}h`;
    } else if(status === 403) {
      detail = `API key rejected (403) — check key in Render env vars`;
    } else if(status === 400) {
      detail = `Bad request (400) — country code "${alpha2}" may be unsupported`;
    }
    recordHealth("newsapi", false, ms, detail, e.message);
    return null; // graceful fallback — don't throw
  }
}

function hoursUntilReset() {
  return Math.max(0, Math.round((gnewsResetAt - Date.now()) / 3600000));
}

function guessRisk(title) {
  const t = title.toLowerCase();
  if(/war|attack|terror|bomb|shoot|kill|crisis|conflict|coup|unrest|protest|riot|evacuate|warning|danger|unsafe/.test(t)) return "high";
  if(/storm|flood|quake|hurricane|strike|delay|crowd|busy|surge|expensive/.test(t)) return "medium";
  return "low";
}

// ── COMBINED NEWS (Google RSS primary + GNews secondary) ──────────
// Returns merged, deduped headlines. Google RSS is free and unlimited
// so it always runs. GNews supplements with paid-tier depth only
// when budget allows.
async function fetchNews(iso, countryName) {
  const [rssNews, gnewsData] = await Promise.allSettled([
    fetchGoogleNewsRSS(countryName),
    fetchGNewsAPI(iso, countryName),
  ]);

  const rssArticles   = rssNews.status   === "fulfilled" ? (rssNews.value   || []) : [];
  const gnewsArticles = gnewsData.status === "fulfilled" ? (gnewsData.value || []) : [];

  // Merge and dedupe by title
  const seen = new Set();
  const merged = [...rssArticles, ...gnewsArticles].filter(a => {
    if(!a.title || seen.has(a.title)) return false;
    seen.add(a.title);
    return true;
  });

  return merged.slice(0,10);
}

// ── GDACS DISASTERS ───────────────────────────────────────────────
async function fetchGDACS(countryName) {
  return timed("gdacs", async () => {
    const r = await axios.get("https://www.gdacs.org/xml/rss.xml", { timeout:12000, responseType:"text" });
    const parsed = await xml2js.parseStringPromise(r.data, { explicitArray:false });
    const items = parsed?.rss?.channel?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    return arr
      .filter(i => (i.title||"").toLowerCase().includes(countryName.toLowerCase()) ||
                   (i.description||"").toLowerCase().includes(countryName.toLowerCase()))
      .slice(0,3)
      .map(i => ({ title:i.title||"", link:i.link||"", date:i.pubDate||"" }));
  });
}

// ── TICKETMASTER EVENTS ───────────────────────────────────────────
async function fetchTicketmaster(iso, countryName) {
  if(!ENV.TICKETMASTER_API_KEY) return [];
  const alpha2 = ISO3_TO_2[iso];
  if(!alpha2) return [];
  return timed("ticketmaster", async () => {
    const r = await axios.get("https://app.ticketmaster.com/discovery/v2/events.json", {
      params:{ apikey:ENV.TICKETMASTER_API_KEY, countryCode:alpha2.toUpperCase(), size:5,
               classificationName:"music,arts,sports,festival", sort:"date,asc" },
      timeout:8000
    });
    return (r.data?._embedded?.events||[]).map(e => ({
      name:   e.name,
      date:   e.dates?.start?.localDate||"",
      venue:  e._embedded?.venues?.[0]?.name||"",
      city:   e._embedded?.venues?.[0]?.city?.name||"",
      url:    e.url||"",
      source: "Ticketmaster",
    }));
  });
}

// ── EVENTBRITE RSS ────────────────────────────────────────────────
async function fetchEventbriteRSS(countryName) {
  return timed("eventbrite", async () => {
    const q = encodeURIComponent(countryName);
    const r = await axios.get(`https://www.eventbrite.com/d/${q}/events/?format=rss`, {
      timeout:10000, responseType:"text",
      headers:{ "User-Agent":"GlobeVoyage/2.0 (travel-app)" }
    });
    const parsed = await xml2js.parseStringPromise(r.data, { explicitArray:false });
    const items = parsed?.rss?.channel?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    return arr.slice(0,5).map(i => ({
      name:   i.title||"",
      date:   i.pubDate||"",
      url:    i.link||"",
      source: "Eventbrite",
    }));
  });
}

// ── PREDICTHQ EVENTS ─────────────────────────────────────────────
async function fetchPredictHQ(iso, countryName) {
  if(!ENV.PREDICTHQ_API_KEY) return [];
  const alpha2 = ISO3_TO_2[iso];
  if(!alpha2) return [];
  return timed("predicthq", async () => {
    const r = await axios.get("https://api.predicthq.com/v1/events/", {
      headers:{ Authorization:`Bearer ${ENV.PREDICTHQ_API_KEY}` },
      params:{ country:alpha2.toUpperCase(), limit:5, sort:"rank",
               "label[]":["festival","concert","sports","conference"],
               active_gte: new Date().toISOString().split("T")[0] },
      timeout:8000
    });
    return (r.data?.results||[]).map(e => ({
      name:   e.title||"",
      date:   e.start||"",
      city:   e.geo?.address?.city||"",
      source: "PredictHQ",
    }));
  });
}

// ── GEOAPIFY PLACES ───────────────────────────────────────────────
// (replaces OpenTripMap — no key needed for basic use, or use Geoapify key)
async function fetchGeoapifyPlaces(iso) {
  if(!ENV.GEOAPIFY_API_KEY) return [];
  const geo = geoCoordCache[iso];
  if(!geo) return [];
  return timed("geoapify", async () => {
    const r = await axios.get("https://api.geoapify.com/v2/places", {
      params:{
        categories: "tourism.attraction,tourism.sights,natural,entertainment",
        filter:     `circle:${geo.lon},${geo.lat},50000`,
        limit:      10,
        apiKey:     ENV.GEOAPIFY_API_KEY,
      },
      timeout:10000
    });
    return (r.data?.features||[]).map(f => ({
      name:     f.properties?.name||"",
      category: f.properties?.categories?.[0]||"",
      address:  f.properties?.formatted||"",
      lat:      f.geometry?.coordinates?.[1],
      lon:      f.geometry?.coordinates?.[0],
    })).filter(p => p.name);
  });
}

// ── SOCIAL TRENDS RSS ─────────────────────────────────────────────
async function fetchSocialTrends(countryName) {
  return timed("social_proxy", async () => {
    const q = encodeURIComponent(`${countryName} travel`);
    const r = await axios.get(`https://trends.google.com/trends/trendingsearches/daily/rss?geo=US&q=${q}`, {
      timeout:10000, responseType:"text"
    });
    const parsed = await xml2js.parseStringPromise(r.data, {explicitArray:false}).catch(()=>null);
    if(!parsed) return [];
    const items = parsed?.rss?.channel?.item||[];
    const arr = Array.isArray(items)?items:[items];
    return arr.slice(0,5).map(i=>({ term:i.title||"", traffic:i["ht:approx_traffic"]||"" }));
  });
}

// ══════════════════════════════════════════════════════════════════
// MISTRAL AI — FULL INTEL GENERATION
// ══════════════════════════════════════════════════════════════════
async function generateMistralIntel(countryName, contextData) {
  if(!ENV.MISTRAL_API_KEY) throw new Error("No Mistral key");
  const { wiki, voyage, weather, news, disasters, events, trends } = contextData;

  const prompt = `You are a professional travel intelligence analyst for GlobeVoyage, a premium travel app.
Generate a comprehensive JSON travel intelligence report for: ${countryName}

Context data:
- Wikipedia: ${wiki?.summary?.slice(0,800)||"N/A"}
- Wikivoyage highlights: ${JSON.stringify(voyage?.highlights?.slice(0,5)||[])}
- Wikivoyage sections: ${JSON.stringify(voyage?.sections||{})}
- Weather now: ${weather ? `${weather.temp}°C, ${weather.condition}, humidity ${weather.humidity}%` : "N/A"}
- Recent news: ${(news||[]).slice(0,5).map(n=>n.title).join(" | ")||"N/A"}
- Active disasters: ${(disasters||[]).map(d=>d.title).join(", ")||"None"}
- Upcoming events: ${(events||[]).slice(0,3).map(e=>e.name).join(", ")||"N/A"}
- Trending: ${(trends||[]).map(t=>t.term).join(", ")||"N/A"}

Return ONLY valid JSON (no markdown, no extra text):
{
  "ai_briefing": "2-3 sentence vivid travel overview",
  "ai_vibe": "One evocative tagline (e.g. 'Where ancient meets electric')",
  "ai_safety_summary": "Current safety overview (2 sentences)",
  "ai_avoid_if": "Who should avoid this destination right now",
  "ai_best_months": ["Jan","Feb",...up to 4 best months to visit],
  "ai_hidden_gem": "One specific hidden gem spot with why it's special",
  "ai_recommendations": [
    {
      "title": "Experience name",
      "why": "Why it's unmissable right now",
      "type": "Cultural|Adventure|Food|Nature|Urban",
      "risk": "none|low|medium|high",
      "when": "Best time of day/year",
      "rating": 4.5
    }
  ],
  "ai_trending_now": [
    {
      "name": "Trending spot or experience",
      "why_trending": "Brief reason",
      "best_time": "When to go",
      "warning": "Optional caution"
    }
  ],
  "ai_calendar": [
    {
      "date": "Month Year",
      "label": "Event/Festival name",
      "color": "green|amber|red",
      "reason": "Why travelers should know"
    }
  ]
}`;

  const r = await axios.post("https://api.mistral.ai/v1/chat/completions", {
    model: "mistral-small-latest",
    messages: [{ role:"user", content:prompt }],
    temperature: 0.7,
    max_tokens: 1500,
  }, {
    headers:{ Authorization:`Bearer ${ENV.MISTRAL_API_KEY}`, "Content-Type":"application/json" },
    timeout: 30000,
  });

  const raw = r.data.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```json\s*/,"").replace(/^```\s*/,"").replace(/\s*```$/,"");
  return JSON.parse(cleaned);
}

// ══════════════════════════════════════════════════════════════════
// FULL PIPELINE FOR ONE COUNTRY
// ══════════════════════════════════════════════════════════════════
async function runCountryPipeline(iso, countryName) {
  const startTime = Date.now();
  console.log(`[Pipeline] Starting: ${countryName} (${iso})`);

  try {
    // Fetch all data sources in parallel
    const [wiki, voyage, weather, disasters, tmEvents, ebEvents, phqEvents, geoapify, trends] = await Promise.allSettled([
      fetchWikipedia(countryName),
      fetchWikivoyage(countryName),
      fetchWeather(iso),
      fetchGDACS(countryName),
      fetchTicketmaster(iso, countryName),
      fetchEventbriteRSS(countryName),
      fetchPredictHQ(iso, countryName),
      fetchGeoapifyPlaces(iso),
      fetchSocialTrends(countryName),
    ]);

    const wikiData     = wiki.status     === "fulfilled" ? wiki.value     : null;
    const voyageData   = voyage.status   === "fulfilled" ? voyage.value   : null;
    const weatherData  = weather.status  === "fulfilled" ? weather.value  : null;
    const disasterData = disasters.status=== "fulfilled" ? disasters.value: [];
    const allEvents    = [
      ...(tmEvents.status  === "fulfilled" ? tmEvents.value  : []),
      ...(ebEvents.status  === "fulfilled" ? ebEvents.value  : []),
      ...(phqEvents.status === "fulfilled" ? phqEvents.value : []),
    ];
    const placesData   = geoapify.status === "fulfilled" ? geoapify.value : [];
    const trendData    = trends.status   === "fulfilled" ? trends.value   : [];

    // Fetch news (combined Google RSS + GNews with rate limiting)
    const newsData = await fetchNews(iso, countryName);

    // Generate AI intel
    let aiData = {};
    try {
      aiData = await generateMistralIntel(countryName, {
        wiki: wikiData, voyage: voyageData, weather: weatherData,
        news: newsData, disasters: disasterData, events: allEvents, trends: trendData,
      });
    } catch(e) {
      console.error(`[Mistral] Failed for ${iso}:`, e.message);
    }

    const duration = Date.now() - startTime;

    // Upsert to Supabase
    const { error } = await supabase.from("country_intel").upsert({
      iso,
      country_name:     countryName,
      continent:        COUNTRIES.find(c=>c.iso===iso)?.continent||"",
      last_updated:     new Date().toISOString(),
      wiki_summary:     wikiData?.summary||null,
      voyage_sections:  voyageData?.sections||null,
      voyage_highlights:voyageData?.highlights||null,
      weather_now:      weatherData||null,
      news_headlines:   newsData||[],
      disaster_alerts:  disasterData||[],
      events:           allEvents||[],
      places:           placesData||[],
      trends:           trendData||[],
      ...aiData,
      pipeline_duration_ms: duration,
    }, { onConflict:"iso" });

    if(error) throw new Error(error.message);

    // Log pipeline run
    await supabase.from("pipeline_runs").insert({
      iso, status:"success", ran_at:new Date().toISOString(), duration_ms:duration
    }).catch(()=>{});

    console.log(`[Pipeline] ✓ ${countryName} in ${Math.round(duration/1000)}s`);
    return { success:true, duration };

  } catch(e) {
    const duration = Date.now() - startTime;
    await supabase.from("pipeline_runs").insert({
      iso, status:"error", ran_at:new Date().toISOString(), duration_ms:duration, error:e.message
    }).catch(()=>{});
    console.error(`[Pipeline] ✗ ${countryName}:`, e.message);
    return { success:false, error:e.message, duration };
  }
}

// ══════════════════════════════════════════════════════════════════
// HEALTH CHECK ENDPOINT
// ══════════════════════════════════════════════════════════════════
app.get("/api/health", async (req, res) => {
  const checks = {};

  // Supabase
  try {
    const t = Date.now();
    const { count, error } = await supabase.from("country_intel").select("*", {count:"exact",head:true});
    const ms = Date.now()-t;
    checks.supabase = { ok:!error, detail:error ? error.message : `Connected — ${count} countries stored`, response_ms:ms };
  } catch(e) {
    checks.supabase = { ok:false, detail:e.message };
  }

  // Mistral
  try {
    const t = Date.now();
    await axios.get("https://api.mistral.ai/v1/models", {
      headers:{ Authorization:`Bearer ${ENV.MISTRAL_API_KEY}` }, timeout:5000
    });
    checks.mistral = { ok:true, detail:"Key configured", response_ms:Date.now()-t };
  } catch(e) {
    checks.mistral = { ok:false, detail:e.response?.status===401?"Invalid API key":e.message };
  }

  // Wikipedia (lightweight check)
  try {
    const t = Date.now();
    await axios.get("https://en.wikipedia.org/w/api.php",{
      params:{action:"query",format:"json",titles:"Main_Page"},
      headers:{"User-Agent":WIKI_UA}, timeout:5000
    });
    checks.wikipedia = { ok:true, label:"Wikipedia", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
  } catch(e) {
    checks.wikipedia = { ok:false, label:"Wikipedia", detail:e.message };
  }

  // Wikivoyage (lightweight check)
  try {
    const t = Date.now();
    await axios.get("https://en.wikivoyage.org/w/api.php",{
      params:{action:"query",format:"json",titles:"France"},
      headers:{"User-Agent":WIKI_UA}, timeout:5000
    });
    checks.wikivoyage = { ok:true, label:"Wikivoyage", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
  } catch(e) {
    checks.wikivoyage = { ok:false, label:"Wikivoyage", detail:e.message };
  }

  // OpenWeatherMap
  if(ENV.OPENWEATHER_API_KEY) {
    try {
      const t = Date.now();
      await axios.get("https://api.openweathermap.org/data/2.5/weather",{
        params:{q:"London",appid:ENV.OPENWEATHER_API_KEY,units:"metric"}, timeout:5000
      });
      checks.openweathermap = { ok:true, label:"OpenWeatherMap", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
    } catch(e) {
      checks.openweathermap = { ok:false, label:"OpenWeatherMap", detail:e.message };
    }
  } else {
    checks.openweathermap = { ok:false, label:"OpenWeatherMap", detail:"No API key configured" };
  }

  // GNews — health check shows budget status WITHOUT making an API call
  // This is the critical fix: we never waste a budget call just for the health dashboard
  gnewsResetIfNeeded();
  if(ENV.GNEWS_API_KEY) {
    const remaining = GNEWS_DAILY_CAP - gnewsCallsToday;
    const resetsIn  = hoursUntilReset();
    checks.newsapi = {
      ok:     true, // key is configured — that's what we can confirm without burning quota
      label:  "GNews API",
      detail: `Key configured — ${remaining}/${GNEWS_DAILY_CAP} calls remaining today (resets in ${resetsIn}h)`,
      response_ms: 0,
      // Expose live runtime stats the dashboard can display
      budget_remaining: remaining,
      budget_cap:       GNEWS_DAILY_CAP,
      resets_in_hours:  resetsIn,
    };
  } else {
    checks.newsapi = { ok:false, label:"GNews API", detail:"No API key — set GNEWS_API_KEY in Render env vars" };
  }

  // Google News RSS (free, always test it)
  try {
    const t = Date.now();
    const q = encodeURIComponent("travel tourism");
    await axios.get(`https://news.google.com/rss/search?q=${q}&hl=en`, { timeout:8000, responseType:"text" });
    checks.google_news = { ok:true, label:"Google News RSS", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
  } catch(e) {
    checks.google_news = { ok:false, label:"Google News RSS", detail:e.message };
  }

  // GDACS
  try {
    const t = Date.now();
    await axios.get("https://www.gdacs.org/xml/rss.xml", { timeout:8000, responseType:"text" });
    checks.gdacs = { ok:true, label:"GDACS Disasters", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
  } catch(e) {
    checks.gdacs = { ok:false, label:"GDACS Disasters", detail:e.message };
  }

  // Ticketmaster
  if(ENV.TICKETMASTER_API_KEY) {
    try {
      const t = Date.now();
      await axios.get("https://app.ticketmaster.com/discovery/v2/events.json",{
        params:{apikey:ENV.TICKETMASTER_API_KEY,size:1}, timeout:5000
      });
      checks.ticketmaster = { ok:true, label:"Ticketmaster", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
    } catch(e) {
      checks.ticketmaster = { ok:false, label:"Ticketmaster", detail:e.message };
    }
  } else {
    checks.ticketmaster = { ok:false, label:"Ticketmaster", detail:"No API key configured" };
  }

  // Eventbrite RSS
  try {
    const t = Date.now();
    await axios.get("https://www.eventbrite.com/d/france/events/?format=rss", {
      timeout:8000, responseType:"text", headers:{"User-Agent":"GlobeVoyage/2.0"}
    });
    checks.eventbrite = { ok:true, label:"Eventbrite (RSS)", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
  } catch(e) {
    checks.eventbrite = { ok:false, label:"Eventbrite (RSS)", detail:e.message };
  }

  // PredictHQ
  if(ENV.PREDICTHQ_API_KEY) {
    try {
      const t = Date.now();
      await axios.get("https://api.predicthq.com/v1/events/",{
        headers:{Authorization:`Bearer ${ENV.PREDICTHQ_API_KEY}`},
        params:{limit:1}, timeout:5000
      });
      checks.predicthq = { ok:true, label:"PredictHQ", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
    } catch(e) {
      checks.predicthq = { ok:false, label:"PredictHQ", detail:e.message };
    }
  } else {
    checks.predicthq = { ok:false, label:"PredictHQ", detail:"No API key configured" };
  }

  // Geoapify
  if(ENV.GEOAPIFY_API_KEY) {
    try {
      const t = Date.now();
      await axios.get("https://api.geoapify.com/v2/places",{
        params:{categories:"tourism.attraction",filter:"circle:2.35,48.85,5000",limit:1,apiKey:ENV.GEOAPIFY_API_KEY},
        timeout:8000
      });
      checks.geoapify = { ok:true, label:"Geoapify", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
    } catch(e) {
      checks.geoapify = { ok:false, label:"Geoapify", detail:e.message };
    }
  } else {
    checks.geoapify = { ok:false, label:"Geoapify", detail:"No API key configured" };
  }

  // Social Trends (Google Trends RSS)
  try {
    const t = Date.now();
    await axios.get("https://trends.google.com/trends/trendingsearches/daily/rss?geo=US", {
      timeout:8000, responseType:"text"
    });
    checks.social_proxy = { ok:true, label:"Social Trends (RSS)", detail:`Last OK (${Date.now()-t}ms)`, response_ms:Date.now()-t };
  } catch(e) {
    checks.social_proxy = { ok:false, label:"Social Trends (RSS)", detail:e.message };
  }

  // Pipeline stats
  try {
    const { count: processed } = await supabase.from("country_intel").select("*",{count:"exact",head:true});
    const sixHoursAgo = new Date(Date.now()-6*60*60*1000).toISOString();
    const { count: fresh } = await supabase.from("country_intel")
      .select("*",{count:"exact",head:true})
      .gte("last_updated", sixHoursAgo);
    checks.pipeline = { processed, fresh };
  } catch(e) {
    checks.pipeline = { processed:0, fresh:0 };
  }

  // Env keys summary
  checks.env_keys = {
    ok: true,
    keys: [
      { label:"Mistral AI",      configured: !!ENV.MISTRAL_API_KEY },
      { label:"OpenWeatherMap",  configured: !!ENV.OPENWEATHER_API_KEY },
      { label:"Ticketmaster",    configured: !!ENV.TICKETMASTER_API_KEY },
      { label:"PredictHQ",       configured: !!ENV.PREDICTHQ_API_KEY },
      { label:"GNews API",       configured: !!ENV.GNEWS_API_KEY },
      { label:"Geoapify",        configured: !!ENV.GEOAPIFY_API_KEY },
    ]
  };

  res.json({ status:"ok", timestamp:new Date().toISOString(), checks });
});

// ══════════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════════

app.get("/", (req, res) => res.json({ service:"GlobeVoyage API", status:"running", version:"2.1" }));

// Destinations (for Expo app)
app.get("/api/destinations", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("destinations")
      .select("*")
      .order("created_at", { ascending:false });
    if(error) return res.status(500).json({ error:error.message });
    res.json(data||[]);
  } catch(e) {
    res.status(500).json({ error:e.message });
  }
});

// All countries list
app.get("/api/countries", (req, res) => {
  res.json({ all: COUNTRIES, total: COUNTRIES.length });
});

// All intel (summary cards for dashboard)
app.get("/api/intel", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("country_intel")
      .select("iso,country_name,continent,last_updated,ai_briefing,ai_vibe,ai_best_months,weather_now")
      .order("last_updated", { ascending:false });
    if(error) return res.status(500).json({ error:error.message });

    // Merge with full country list so all 195 appear (even unpopulated ones)
    const map = {};
    (data||[]).forEach(c => { map[c.iso] = c; });
    const countries = COUNTRIES.map(c => map[c.iso] || { iso:c.iso, country_name:c.name, continent:c.continent });
    res.json({ countries, total:countries.length });
  } catch(e) {
    res.status(500).json({ error:e.message });
  }
});

// Single country detail
app.get("/api/intel/:iso", async (req, res) => {
  try {
    const iso = req.params.iso.toUpperCase();
    const { data, error } = await supabase
      .from("country_intel")
      .select("*")
      .eq("iso", iso)
      .single();
    if(error) return res.status(404).json({ error:"Country not found in intel database" });
    res.json(data);
  } catch(e) {
    res.status(500).json({ error:e.message });
  }
});

// Pipeline status
app.get("/api/pipeline/status", async (req, res) => {
  try {
    const [{ count:processed }, { data:freshness }, { data:runs }] = await Promise.all([
      supabase.from("country_intel").select("*",{count:"exact",head:true}),
      supabase.from("country_intel").select("iso,last_updated").order("last_updated",{ascending:false}),
      supabase.from("pipeline_runs").select("*").order("ran_at",{ascending:false}).limit(50),
    ]);
    res.json({
      countries_processed: processed||0,
      country_freshness:   freshness||[],
      recent_runs:         runs||[],
    });
  } catch(e) {
    res.status(500).json({ error:e.message });
  }
});

// Run pipeline for one country
app.post("/api/pipeline/run/:iso", async (req, res) => {
  const iso = req.params.iso.toUpperCase();
  const country = COUNTRIES.find(c => c.iso === iso);
  if(!country) return res.status(404).json({ error:"Unknown ISO code" });
  res.json({ message:`Pipeline started for ${country.name}`, iso });
  runCountryPipeline(iso, country.name).catch(console.error);
});

// Run full pipeline (all 195, throttled)
app.post("/api/pipeline/run-all", async (req, res) => {
  res.json({ message:"Full pipeline started", total:COUNTRIES.length });
  (async () => {
    // Hot countries first, then alphabetical
    const ordered = [
      ...COUNTRIES.filter(c => HOT_ISOS.has(c.iso)),
      ...COUNTRIES.filter(c => !HOT_ISOS.has(c.iso)),
    ];
    for(const c of ordered) {
      await runCountryPipeline(c.iso, c.name);
      await new Promise(r => setTimeout(r, 2000)); // 2s between runs to respect rate limits
    }
  })().catch(console.error);
});

// Globe WebGL endpoint
app.get("/globe", (req, res) => {
  if(!THREE_JS || !EARCUT_JS) {
    return res.status(503).send("Globe scripts not loaded yet. Retry in 30s.");
  }
  // Fetch country coordinates for globe markers
  const countryMarkers = COUNTRIES.map(c => {
    const g = geoCoordCache[c.iso];
    return g ? { iso:c.iso, name:c.name, lat:g.lat, lon:g.lon } : null;
  }).filter(Boolean);

  res.setHeader("Content-Type","text/html");
  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;overflow:hidden;background:#080c14}
  canvas{display:block;width:100%!important;height:100%!important}
  #info{position:absolute;top:10px;left:50%;transform:translateX(-50%);
    color:#c9a96e;font-family:sans-serif;font-size:11px;letter-spacing:2px;
    pointer-events:none;text-align:center;text-transform:uppercase}
</style>
</head><body>
<div id="info">Tap a country to explore</div>
<script>${THREE_JS}</script>
<script>${EARCUT_JS}</script>
<script>
const COUNTRIES = ${JSON.stringify(countryMarkers)};
const W = window.innerWidth, H = window.innerHeight;
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(45, W/H, 0.1, 1000);
camera.position.set(0, 0, 2.8);
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Globe
const globeGeo  = new THREE.SphereGeometry(1, 64, 64);
const globeMat  = new THREE.MeshPhongMaterial({ color:0x1a3a5c, shininess:30, specular:0x224466 });
const globe     = new THREE.Mesh(globeGeo, globeMat);
scene.add(globe);

// Atmosphere glow
const atmGeo    = new THREE.SphereGeometry(1.03, 32, 32);
const atmMat    = new THREE.MeshPhongMaterial({
  color:0x2277cc, transparent:true, opacity:0.12, side:THREE.FrontSide
});
scene.add(new THREE.Mesh(atmGeo, atmMat));

// Grid lines
const gridMat = new THREE.LineBasicMaterial({ color:0x1e3a5f, transparent:true, opacity:0.4 });
for(let lat=-75; lat<=75; lat+=15) {
  const pts=[];
  for(let lng=-180; lng<=180; lng+=5) {
    const phi=(90-lat)*Math.PI/180, theta=(lng+180)*Math.PI/180;
    pts.push(new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)));
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
}
for(let lng=-180; lng<=180; lng+=30) {
  const pts=[];
  for(let lat=-90; lat<=90; lat+=5) {
    const phi=(90-lat)*Math.PI/180, theta=(lng+180)*Math.PI/180;
    pts.push(new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)));
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
}

// Country markers
const markerMat = new THREE.MeshBasicMaterial({ color:0xc9a96e });
const markerGeo = new THREE.SphereGeometry(0.012, 8, 8);
const markers   = [];
COUNTRIES.forEach(c => {
  const phi   = (90-c.lat)*Math.PI/180;
  const theta = (c.lon+180)*Math.PI/180;
  const mesh  = new THREE.Mesh(markerGeo, markerMat.clone());
  mesh.position.set(
    1.02*Math.sin(phi)*Math.cos(theta),
    1.02*Math.cos(phi),
    1.02*Math.sin(phi)*Math.sin(theta)
  );
  mesh.userData = c;
  scene.add(mesh);
  markers.push(mesh);
});

// Lighting
scene.add(new THREE.AmbientLight(0x334466, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 3, 5);
scene.add(sun);

// Interaction
let isDragging=false, prevX=0, prevY=0, velX=0, velY=0;
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

renderer.domElement.addEventListener("touchstart", e=>{
  isDragging=true; prevX=e.touches[0].clientX; prevY=e.touches[0].clientY; velX=velY=0;
},{passive:true});
renderer.domElement.addEventListener("touchmove", e=>{
  if(!isDragging) return;
  velX=(e.touches[0].clientX-prevX)*0.005;
  velY=(e.touches[0].clientY-prevY)*0.005;
  globe.rotation.y+=velX; globe.rotation.x+=velY;
  markers.forEach(m=>{m.parent.rotation.y=globe.rotation.y;m.parent.rotation.x=globe.rotation.x;});
  scene.children.filter(c=>c.type==="Line").forEach(l=>{l.rotation.copy(globe.rotation);});
  prevX=e.touches[0].clientX; prevY=e.touches[0].clientY;
},{passive:true});
renderer.domElement.addEventListener("touchend", e=>{
  if(!isDragging){return;}
  isDragging=false;
  // Tap detection
  if(Math.abs(velX)<0.002 && Math.abs(velY)<0.002){
    const touch=e.changedTouches[0];
    mouse.x=(touch.clientX/W)*2-1; mouse.y=-(touch.clientY/H)*2+1;
    raycaster.setFromCamera(mouse, camera);
    const hits=raycaster.intersectObjects(markers);
    if(hits.length){
      const c=hits[0].object.userData;
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:"DESTINATIONS",name:c.name,iso:c.iso}));
      document.getElementById("info").textContent="✈ "+c.name;
      setTimeout(()=>{ document.getElementById("info").textContent="Tap a country to explore"; },3000);
    }
  }
},{passive:true});

// Mouse support (desktop preview)
renderer.domElement.addEventListener("mousedown",e=>{isDragging=true;prevX=e.clientX;prevY=e.clientY;velX=velY=0;});
renderer.domElement.addEventListener("mousemove",e=>{
  if(!isDragging)return;
  velX=(e.clientX-prevX)*0.005; velY=(e.clientY-prevY)*0.005;
  globe.rotation.y+=velX; globe.rotation.x+=velY;
  prevX=e.clientX; prevY=e.clientY;
});
renderer.domElement.addEventListener("mouseup",()=>{isDragging=false;});

// Animate
(function animate(){
  requestAnimationFrame(animate);
  if(!isDragging){
    velX*=0.95; velY*=0.95;
    globe.rotation.y+=velX+0.002;
    globe.rotation.x+=velY;
  }
  // Keep markers/grid synced with globe rotation
  markers.forEach(m=>{
    const phi=(90-m.userData.lat)*Math.PI/180;
    const theta=(m.userData.lon+180)*Math.PI/180;
    const base = new THREE.Vector3(
      Math.sin(phi)*Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi)*Math.sin(theta)
    );
    base.applyEuler(globe.rotation).multiplyScalar(1.02);
    m.position.copy(base);
  });
  renderer.render(scene, camera);
})();

window.addEventListener("resize",()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});
</script>
</body></html>`);
});

// ══════════════════════════════════════════════════════════════════
// SCHEDULED CRON — refresh hot countries every 6h, all others daily
// ══════════════════════════════════════════════════════════════════
cron.schedule("0 */6 * * *", async () => {
  console.log("[Cron] Refreshing hot countries...");
  const hot = COUNTRIES.filter(c => HOT_ISOS.has(c.iso));
  for(const c of hot) {
    await runCountryPipeline(c.iso, c.name);
    await new Promise(r => setTimeout(r, 3000));
  }
});

cron.schedule("0 2 * * *", async () => {
  console.log("[Cron] Nightly refresh — remaining countries...");
  const rest = COUNTRIES.filter(c => !HOT_ISOS.has(c.iso));
  for(const c of rest) {
    await runCountryPipeline(c.iso, c.name);
    await new Promise(r => setTimeout(r, 3000));
  }
});

// ══════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
ensureScripts().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ GlobeVoyage API running on port ${PORT}`);
    console.log(`📊 GNews budget: ${GNEWS_DAILY_CAP} calls/day cap (free tier = 10/day)`);
  });
});
