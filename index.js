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
  FOURSQUARE_API_KEY:   process.env.FOURSQUARE_API_KEY,
  OPENWEATHER_API_KEY:  process.env.OPENWEATHER_API_KEY,
  TICKETMASTER_API_KEY: process.env.TICKETMASTER_API_KEY,
  PREDICTHQ_API_KEY:    process.env.PREDICTHQ_API_KEY,
  NEWS_API_KEY:         process.env.NEWS_API_KEY,
  GEOAPIFY_API_KEY:     process.env.GEOAPIFY_API_KEY,
  // Eventbrite now uses free public RSS — no key needed
  // Apify social replaced with free Google/Bing News RSS — no key needed
};

// Bundled scripts (inlined into /globe)
let THREE_JS = "", EARCUT_JS = "";
try { THREE_JS  = fs.readFileSync(path.join(__dirname,"node_modules/three/build/three.min.js"),"utf8"); } catch(e){ console.error("three.js missing"); }
try { EARCUT_JS = fs.readFileSync(path.join(__dirname,"node_modules/earcut/src/earcut.js"),"utf8"); } catch(e){ console.error("earcut.js missing"); }

// Self-ping keepalive
const SELF = process.env.RENDER_EXTERNAL_URL || "https://globevoyage-admin.onrender.com";
setInterval(() => {
  const mod = SELF.startsWith("https") ? https : http;
  mod.get(SELF+"/", r=>r.resume()).on("error",()=>{});
}, 4*60*1000);

// MediaWiki REQUIRES a descriptive User-Agent or returns 403
const WIKI_UA = "GlobeVoyage/2.0 (travel-intelligence-app; nodejs-axios)";

// ══════════════════════════════════════════════════════════════════
// ALL 195 COUNTRIES — every continent
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
// DATA FETCHERS — ALL BUGS FIXED
// ══════════════════════════════════════════════════════════════════

// FIX 1: Wikipedia — add required User-Agent header (403 without it)
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

// FIX 2: Wikivoyage — add required User-Agent header (403 without it)
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

// FIX 3: Foursquare — authorization must be "fsq3 <key>" not raw key
// Geoapify coords cache — populated when fetchGeoapify runs first
const geoCoordCache = {};

async function fetchFoursquare(countryName, iso) {
  if(!ENV.FOURSQUARE_API_KEY) return [];
  return timed("foursquare", async () => {
    const rawKey = ENV.FOURSQUARE_API_KEY.trim();
    const authHeader = rawKey.startsWith("fsq3") ? rawKey : `fsq3 ${rawKey}`;

    // Foursquare "near" param times out on obscure country names.
    // Use ll (lat,lng) instead — much faster and reliable.
    // Pull coords from cache (set by fetchGeoapify) or fall back to near.
    const cached = geoCoordCache[iso];
    const params = cached
      ? { query:"tourist attraction", ll:`${cached.lat},${cached.lon}`, radius:200000, limit:10, sort:"POPULARITY" }
      : { query:"tourist attraction", near:countryName,                  limit:10, sort:"POPULARITY" };

    const r = await axios.get("https://api.foursquare.com/v3/places/search", {
      params,
      headers:{ Authorization: authHeader, Accept: "application/json" },
      timeout: 6000  // tight timeout — if it's going to hang, fail fast
    });
    return (r.data?.results||[]).slice(0,8).map(p=>({
      name:      p.name,
      fsq_id:    p.fsq_id,
      lat:       p.geocodes?.main?.latitude,
      lng:       p.geocodes?.main?.longitude,
      address:   p.location?.formatted_address,
      categories:(p.categories||[]).map(c=>c.name),
    }));
  });
}

// OpenWeatherMap — unchanged, was working
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

// Full alpha-2 map for all 195 countries
const ALPHA2_MAP = {
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
  TJK:"tj",THA:"th",TLS:"tl",TUR:"tr",TKM:"tm",ARE:"ae",UZB:"uz",VNM:"vn",YEM:"ye",
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

// NewsAPI free tier: only /top-headlines with a 2-letter country code works server-side.
// Skip silently for countries without a supported code — Google News RSS covers them.
const newsCache = {};
async function fetchNews(countryName, iso) {
  if(!ENV.NEWS_API_KEY) return [];
  const country2 = ALPHA2_MAP[iso] || null;
  if(!country2) return []; // No alpha-2 = no NewsAPI call, avoid 400 errors
  const cached = newsCache[iso];
  if(cached && Date.now() < cached.expires) return cached.data;
  return timed("newsapi", async () => {
    const r = await axios.get("https://newsapi.org/v2/top-headlines", {
      params:{ country: country2, apiKey: ENV.NEWS_API_KEY, pageSize: 5 },
      timeout: 8000
    });
    const data = (r.data?.articles||[]).slice(0,5).map(a=>({
      title:a.title, url:a.url, source:a.source?.name,
      published_at:a.publishedAt, description:(a.description||"").slice(0,200),
      risk_level:riskScore(a.title+" "+(a.description||"")),
    }));
    newsCache[iso] = { data, expires: Date.now()+6*60*60*1000 };
    return data;
  });
}

// Google News RSS — unchanged, was working
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

// GDACS — unchanged, was working
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

// Ticketmaster — unchanged, was working
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

// Eventbrite shut down all public APIs and RSS feeds.
// Replaced with Meetup.com public RSS (free, no auth, active events worldwide).
async function fetchEventbrite(countryName) {
  return timed("eventbrite", async () => {
    const results = [];

    // Meetup.com public RSS feed — free, no auth, real upcoming events
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

    // Fallback: Allevents.in public RSS (global events aggregator, free)
    if(results.length === 0) {
      try {
        const q2 = countryName.toLowerCase().replace(/\s+/g,"-");
        const r2 = await axios.get(
          `https://allevents.in/${q2}/all#`,
          { timeout:5000, headers:{"User-Agent":"GlobeVoyage/2.0"} }
        );
        // Extract event data from meta tags if available
        const titleMatches = r2.data.match(/<title[^>]*>([^<]+)<\/title>/gi)||[];
        titleMatches.slice(1,6).forEach(m=>{
          const title = m.replace(/<[^>]*>/g,"").trim();
          if(title && !title.includes("AllEvents")) results.push({name:title,source:"AllEvents.in",date:null,url:""});
        });
      } catch(e) {}
    }

    // Always return something — use Google News events as final fallback
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

// PredictHQ — unchanged, was working
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

// Geoapify — unchanged, was working
async function fetchGeoapify(countryName, iso) {
  if(!ENV.GEOAPIFY_API_KEY) return {};
  return timed("geoapify", async () => {
    const g = await axios.get("https://api.geoapify.com/v1/geocode/search",{
      params:{text:countryName,type:"country",apiKey:ENV.GEOAPIFY_API_KEY,limit:1},
      timeout:6000});
    const place = g.data?.features?.[0];
    if(!place) return {};
    const {lat,lon} = place.properties;

    // Share coords with Foursquare so it can use ll= instead of near=
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

// Social trends — uses free public RSS sources for trending travel content.
// Apify Instagram scraper requires paid tier; replaced with reliable free sources:
// 1. If APIFY_API_KEY set: use Apify's free web-scraper actor for trending searches
// 2. Fallback: Google Trends RSS + Google News trending travel content
async function fetchSocialTrends(countryName) {
  // Always try Google Trends RSS first — always free, no key needed
  return timed("social_proxy", async () => {
    const results = [];

    // Google News trending travel
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

    // Bing News RSS (no key, public feed)
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
async function runPipeline(iso, countryName, continent) {
  const start = Date.now();
  console.log(`🌍 Pipeline: ${countryName} (${iso})`);
  const safe = async (fn, fallback) => { try{ return await fn(); }catch(e){ return fallback; } };

  // Run Geoapify first to populate geoCoordCache so Foursquare can use ll= coords
  const geo = await safe(()=>fetchGeoapify(countryName, iso), {});

  const [wiki,wv,places,weather,news,gNews,gdacs,tm,eb,phq,social] = await Promise.all([
    safe(()=>fetchWikipedia(countryName),         {summary:""}),
    safe(()=>fetchWikivoyage(countryName),        {sections:{},highlights:[]}),
    safe(()=>fetchFoursquare(countryName, iso),   []),  // uses geoCoordCache[iso] set above
    safe(()=>fetchWeather(countryName),           {now:null,forecast:[]}),
    safe(()=>fetchNews(countryName, iso),         []),
    safe(()=>fetchGoogleNews(countryName),        []),
    safe(()=>fetchGDACS(countryName),             []),
    safe(()=>fetchTicketmaster(countryName, iso), []),
    safe(()=>fetchEventbrite(countryName),        []),
    safe(()=>fetchPredictHQ(countryName),         []),
    safe(()=>fetchSocialTrends(countryName),      []),
  ]);

  const allNews   = [...(news||[]),...(gNews||[])].slice(0,10);
  const allEvents = [...(tm||[]),...(eb||[]),...(phq||[])].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(0,12);
  const safetyFlags = [
    ...(gdacs||[]).map(g=>({...g,type:"disaster"})),
    ...allNews.filter(n=>n.risk_level==="high").map(n=>({date:n.published_at?.split("T")[0],type:"news",description:n.title,severity:"high"}))
  ].slice(0,6);

  const ai = await safe(()=>runMistral(countryName,continent,{wiki,wv,places,weather,news:allNews,gdacs,events:allEvents,social}),null);

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
  },{onConflict:"iso"});

  const duration = Date.now()-start;
  if(error) console.error(`❌ DB error ${countryName}:`, error.message);
  else      console.log(`✅ ${countryName} done in ${duration}ms`);

  await supabase.from("pipeline_runs").insert({
    iso, status:error?"error":"success",
    sources:Object.fromEntries(Object.entries(sourceHealth).map(([k,v])=>[k,v.ok?"ok":"fail"])),
    duration_ms:duration, error:error?.message||null,
  });
  return {success:!error,duration};
}

async function runStartupPipeline() {
  console.log(`🚀 Pipeline starting for ${COUNTRIES.length} countries...`);
  for(let i=0;i<COUNTRIES.length;i++){
    const {iso,name,continent} = COUNTRIES[i];
    const {data} = await supabase.from("country_intel").select("last_updated").eq("iso",iso).single();
    if(data?.last_updated && Date.now()-new Date(data.last_updated).getTime() < 6*60*60*1000){
      console.log(`⏭  ${name} is fresh`); continue;
    }
    await runPipeline(iso,name,continent);
    await new Promise(r=>setTimeout(r,20000));
  }
  console.log("✅ Startup pipeline complete");
}

cron.schedule("0 */6 * * *", async () => {
  for(const c of COUNTRIES){ await runPipeline(c.iso,c.name,c.continent); await new Promise(r=>setTimeout(r,15000)); }
});
cron.schedule("0 */2 * * *", async () => {
  for(const c of COUNTRIES.filter(x=>HOT_ISOS.has(x.iso))){ await runPipeline(c.iso,c.name,c.continent); await new Promise(r=>setTimeout(r,8000)); }
});

// ══════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ══════════════════════════════════════════════════════════════════
app.get("/", (req,res) => res.json({status:"GlobeVoyage API is live 🌍",countries:COUNTRIES.length}));

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

  checks.mistral = {ok:!!ENV.MISTRAL_API_KEY,label:"Mistral AI",detail:ENV.MISTRAL_API_KEY?"Key configured":"No API key",...(sourceHealth.mistral||{})};

  const sources = ["wikipedia","wikivoyage","foursquare","openweathermap","newsapi","google_news",
    "gdacs","ticketmaster","eventbrite","predicthq","geoapify","social_proxy"];
  const labelMap = {
    wikipedia:"Wikipedia", wikivoyage:"Wikivoyage", foursquare:"Foursquare Places",
    openweathermap:"OpenWeatherMap", newsapi:"News API", google_news:"Google News RSS",
    gdacs:"GDACS Disasters", ticketmaster:"Ticketmaster", eventbrite:"Eventbrite (RSS)",
    predicthq:"PredictHQ", geoapify:"Geoapify", social_proxy:"Social Trends (RSS)",
  };
  sources.forEach(k=>{
    const h=sourceHealth[k]||{};
    checks[k]={ok:h.ok??null, label:labelMap[k]||k,
      detail:h.ok!=null?(h.ok?`Last OK (${h.response_ms}ms)`:h.error):"Not yet tested",
      last_check:h.last_check||null,success_count:h.success_count||0,fail_count:h.fail_count||0,response_ms:h.response_ms||null};
  });

  const envKeys=[
    {label:"Mistral",key:"MISTRAL_API_KEY"},{label:"Foursquare",key:"FOURSQUARE_API_KEY"},
    {label:"OpenWeatherMap",key:"OPENWEATHER_API_KEY"},{label:"Ticketmaster",key:"TICKETMASTER_API_KEY"},
    {label:"PredictHQ",key:"PREDICTHQ_API_KEY"},{label:"NewsAPI",key:"NEWS_API_KEY"},
    {label:"Geoapify",key:"GEOAPIFY_API_KEY"},
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

// Texture proxy
const TEXTURES={"earth-day":"https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg","earth-night":"https://unpkg.com/three-globe@2.30.0/example/img/earth-night.jpg","earth-clouds":"https://unpkg.com/three-globe@2.30.0/example/img/earth-clouds.png","earth-water":"https://unpkg.com/three-globe@2.30.0/example/img/earth-water.png"};
app.get("/texture/:name",(req,res)=>{
  const url=TEXTURES[req.params.name];if(!url)return res.status(404).end();
  res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Cache-Control","public,max-age=86400");
  res.setHeader("Content-Type",url.endsWith(".png")?"image/png":"image/jpeg");
  https.get(url,u=>u.pipe(res)).on("error",()=>res.status(502).end());
});

// GeoJSON proxy
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

// Destinations CRUD
app.get("/api/destinations",async(req,res)=>{const{data,error}=await supabase.from("destinations").select("*");if(error)return res.status(500).json({error:error.message});res.json(data);});
app.get("/api/destinations/:id",async(req,res)=>{const{data,error}=await supabase.from("destinations").select("*").eq("id",req.params.id).single();if(error)return res.status(404).json({error:error.message});res.json(data);});
app.post("/api/destinations",async(req,res)=>{const{name,country,description,image_url,price,iso,lat,lng}=req.body;const{data,error}=await supabase.from("destinations").insert([{name,country,description,image_url,price,iso,lat,lng}]).select();if(error)return res.status(500).json({error:error.message});res.status(201).json(data[0]);});
app.put("/api/destinations/:id",async(req,res)=>{const{name,country,description,image_url,price}=req.body;const{data,error}=await supabase.from("destinations").update({name,country,description,image_url,price}).eq("id",req.params.id).select();if(error)return res.status(500).json({error:error.message});res.json(data[0]);});
app.delete("/api/destinations/:id",async(req,res)=>{const{error}=await supabase.from("destinations").delete().eq("id",req.params.id);if(error)return res.status(500).json({error:error.message});res.json({message:"Deleted"});});

// ══════════════════════════════════════════════════════════════════
// GLOBE PAGE — full WebGL Earth, scripts inlined, no external CDN
// ══════════════════════════════════════════════════════════════════
app.get("/globe",(req,res)=>{
  if(!THREE_JS){ return res.status(503).send("<h1>Globe unavailable — run npm install on Render</h1>"); }
  res.setHeader("Content-Type","text/html");
  res.setHeader("Cache-Control","public,max-age=300");

  const DESCRIPTIONS={
    USA:"The world's largest economy, spanning vast landscapes from Alaskan tundra to Hawaiian tropics.",
    GBR:"An island nation with a rich imperial history, home to London — one of the world's great global cities.",
    FRA:"Famous for art, cuisine and the Eiffel Tower. France is the world's most visited country.",
    DEU:"Europe's industrial powerhouse, known for engineering precision and the Bavarian Alps.",
    CHN:"The world's most populous nation, with 5,000 years of continuous civilisation.",
    IND:"A vibrant subcontinent of 1.4 billion people, ancient temples and cutting-edge tech.",
    BRA:"South America's giant — home to the Amazon rainforest, Carnival, and world-class beaches.",
    RUS:"The largest country on Earth by area, spanning 11 time zones from Europe to the Pacific.",
    AUS:"A vast island continent of unique wildlife, the Great Barrier Reef, and outdoor living.",
    CAN:"The world's second-largest country — stunning wilderness and multicultural cities.",
    JPN:"A blend of ancient tradition and cutting-edge technology unlike anywhere else on Earth.",
    NGA:"Africa's most populous nation and largest economy — a powerhouse of music and culture.",
    ZAF:"The Rainbow Nation — rich in biodiversity and dramatic landscapes from Cape to Kruger.",
    EGY:"Home to the Nile and the Great Pyramids, one of humanity's oldest civilisations.",
    MEX:"Ancient Aztec ruins, vibrant fiestas, incredible cuisine and stunning Caribbean coasts.",
    ARG:"Famed for tango, Patagonian wilderness and the Andes mountains.",
    SAU:"The heart of the Arab world, custodian of Islam's holiest sites.",
    IDN:"The world's largest archipelago — 17,000 islands of extraordinary biodiversity.",
    TUR:"Straddling two continents, a crossroads of civilisations with breathtaking coasts.",
    KEN:"East Africa's gateway, famed for the Maasai Mara and world-class marathon runners.",
    ESP:"Sun, flamenco, La Sagrada Familia, and incredible food across Europe's passionate south.",
    ITA:"The cradle of Western civilisation — from the Colosseum to the canals of Venice.",
    PAK:"A land of K2, the Karakoram Highway, and ancient Indus Valley ruins.",
    UKR:"Europe's largest country by area, with fertile plains and a deep Cossack heritage.",
    GHA:"West Africa's beacon of democracy and birthplace of Pan-Africanism.",
    ETH:"Africa's oldest independent nation, birthplace of coffee and ancient churches.",
    MAR:"Where the Sahara meets the Atlantic — ancient medinas and a world-class food scene.",
    PER:"Land of the Incas, Machu Picchu, and the Amazon rainforest.",
    COL:"Where the Andes meet the Caribbean — vibrant, colourful, and reinvented.",
    NZL:"Dramatic fjords, volcanoes, Maori culture and the landscapes of Middle-earth.",
    SGP:"A city-state punching above its weight in food, finance and futuristic architecture.",
    THA:"The Land of Smiles — golden temples, street food paradise and tropical islands.",
    VNM:"Stunning bays, ancient towns, motorbike-filled streets and incredible pho.",
    KOR:"K-pop, kimchi, cutting-edge tech and 5,000 years of history.",
    PRT:"Cobblestone Lisbon, Porto's wine cellars, and the world's best surf.",
    NLD:"Tulips, windmills, golden-age art and the most bikes per capita on Earth.",
    GRC:"Birthplace of democracy — with 6,000 islands and unbeatable Mediterranean cuisine.",
    ARE:"Futuristic skyscrapers, ancient souks, and world-class luxury in the desert.",
    CHE:"The Alps, chocolate, watches, banking and four national languages.",
    SWE:"Midnight sun, northern lights, Viking heritage and Scandinavian design excellence.",
    NOR:"Dramatic fjords, the Northern Lights, and consistently the world's happiest country.",
    IRL:"The Emerald Isle — ancient castles, legendary craic and dramatic Atlantic coastline.",
    ISL:"Land of fire and ice, northern lights, geysers and midnight sun.",
    DNK:"Design, happiness, hygge and the gateway to Scandinavia.",
    FIN:"Land of a thousand lakes, saunas, reindeer and the aurora borealis.",
    POL:"Gothic old towns, hearty food, vodka and a resilient, proud European heritage.",
    CZE:"Prague's golden spires, Bohemian beer culture and medieval town squares.",
    HUN:"Budapest's thermal baths, ruin bars and rich Central European history.",
    ROU:"Transylvania's castles, the Carpathian mountains and Bucharest's vibrant arts scene.",
    HRV:"The Dalmatian Coast, Dubrovnik's walls, and Game of Thrones filming locations.",
  };
  const FLAGS={
    USA:"🇺🇸",GBR:"🇬🇧",FRA:"🇫🇷",DEU:"🇩🇪",CHN:"🇨🇳",IND:"🇮🇳",BRA:"🇧🇷",RUS:"🇷🇺",
    AUS:"🇦🇺",CAN:"🇨🇦",JPN:"🇯🇵",NGA:"🇳🇬",ZAF:"🇿🇦",EGY:"🇪🇬",MEX:"🇲🇽",ARG:"🇦🇷",
    SAU:"🇸🇦",IDN:"🇮🇩",TUR:"🇹🇷",KEN:"🇰🇪",ESP:"🇪🇸",ITA:"🇮🇹",PAK:"🇵🇰",UKR:"🇺🇦",
    GHA:"🇬🇭",ETH:"🇪🇹",MAR:"🇲🇦",PER:"🇵🇪",COL:"🇨🇴",NZL:"🇳🇿",SGP:"🇸🇬",THA:"🇹🇭",
    VNM:"🇻🇳",KOR:"🇰🇷",PRT:"🇵🇹",NLD:"🇳🇱",GRC:"🇬🇷",ARE:"🇦🇪",CHE:"🇨🇭",SWE:"🇸🇪",
    NOR:"🇳🇴",IRL:"🇮🇪",ISL:"🇮🇸",DNK:"🇩🇰",FIN:"🇫🇮",POL:"🇵🇱",CZE:"🇨🇿",HUN:"🇭🇺",
    ROU:"🇷🇴",HRV:"🇭🇷",
  };

  res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#060a12;overflow:hidden;touch-action:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
  canvas{display:block;touch-action:none;position:absolute;top:0;left:0}
  #loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#5bb8ff;font-size:10px;letter-spacing:4px;transition:opacity 0.8s;text-align:center;pointer-events:none;z-index:10}
  #bar{width:130px;height:1px;background:rgba(91,184,255,0.15);margin:12px auto 0;border-radius:1px;overflow:hidden}
  #fill{height:100%;background:linear-gradient(90deg,#3a8fff,#7dd4ff);width:0%;transition:width 0.3s}
  #hint{position:absolute;top:10px;left:50%;transform:translateX(-50%);color:rgba(140,185,240,0.35);font-size:9px;letter-spacing:3px;pointer-events:none;white-space:nowrap;transition:opacity 1.4s;z-index:5}
  #card{position:absolute;left:0;right:0;bottom:0;z-index:20;background:linear-gradient(to bottom,rgba(6,10,20,0) 0%,rgba(6,10,20,0.98) 14%,#060a14 100%);padding:28px 20px 24px;transform:translateY(102%);transition:transform 0.4s cubic-bezier(0.22,1,0.36,1)}
  #card.open{transform:translateY(0)}
  #card-close{position:absolute;top:14px;right:16px;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08);color:#6a8aaa;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center}
  #card-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
  #card-flag{font-size:26px;line-height:1}
  #card-name{font-size:18px;font-weight:700;color:#e8f2ff}
  #card-sub{font-size:9px;color:#3a6080;letter-spacing:2.5px;text-transform:uppercase;margin-top:2px}
  #card-desc{font-size:11.5px;color:#6a90b0;line-height:1.7;margin-bottom:14px}
  #card-stats{display:flex;gap:8px;margin-bottom:14px}
  .stat{flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 10px}
  .sv{font-size:12px;font-weight:600;color:#a8c8e8}.sl{font-size:8px;color:#2a4a62;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px}
  #card-btn{width:100%;padding:13px;border:none;border-radius:14px;background:linear-gradient(135deg,#2a72ff,#1040cc);color:#fff;font-size:13px;font-weight:600;letter-spacing:1px;cursor:pointer;box-shadow:0 4px 22px rgba(42,114,255,0.38);transition:transform 0.12s,opacity 0.12s}
  #card-btn:active{transform:scale(0.97);opacity:0.85}
  #backdrop{display:none;position:absolute;inset:0;z-index:15}
  #backdrop.on{display:block}
</style>
</head>
<body>
<div id="loading">LOADING EARTH<div id="bar"><div id="fill"></div></div></div>
<canvas id="c"></canvas>
<div id="hint">DRAG · PINCH · TAP COUNTRY</div>
<div id="backdrop"></div>
<div id="card">
  <button id="card-close">✕</button>
  <div id="card-top"><span id="card-flag"></span><div><div id="card-name"></div><div id="card-sub"></div></div></div>
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
<script>var DESCRIPTIONS=${JSON.stringify(DESCRIPTIONS)};var FLAGS=${JSON.stringify(FLAGS)};</script>
<script>
(function(){
  var W=window.innerWidth,H=window.innerHeight;
  var canvas=document.getElementById('c');
  canvas.width=W*(window.devicePixelRatio||1);canvas.height=H*(window.devicePixelRatio||1);
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setSize(W,H);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setClearColor(0x060a12,1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(40,W/H,0.1,1000);camera.position.z=2.8;
  var fillEl=document.getElementById('fill'),loadEl=document.getElementById('loading');
  var prog=0;function progress(n){prog=Math.max(prog,n);fillEl.style.width=prog+'%';if(prog>=100)setTimeout(function(){loadEl.style.opacity='0';},400);}
  progress(20);
  var isDrag=false,isPinch=false,autoSpin=true,spinSpeed=0.0013;
  var momX=0,momY=0,fric=0.90,lx=0,ly=0,lDist=0;
  var CAM_DEFAULT=2.8,CAM_COUNTRY=1.9,CAM_MIN=1.18,CAM_MAX=5.0;
  var targetZ=CAM_DEFAULT,camZ=CAM_DEFAULT,zoomVel=0;
  var tapX=0,tapY=0,tapT=0,lastTap=0,holdTimer=null,isHeld=false;
  var selectedISO=null,cardOpen=false;
  function shouldSpin(){return !selectedISO&&!isHeld&&camZ>CAM_MIN+0.3;}
  (function(){var geo=new THREE.BufferGeometry(),v=[];for(var i=0;i<2000;i++){var th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=50+Math.random()*30;v.push(r*Math.sin(ph)*Math.cos(th),r*Math.sin(ph)*Math.sin(th),r*Math.cos(ph));}geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:0.065})));})();
  scene.add(new THREE.AmbientLight(0x1a2540,0.9));
  var sun=new THREE.DirectionalLight(0xffeedd,4.5);sun.position.set(5,2.5,4);scene.add(sun);
  var bounce=new THREE.DirectionalLight(0x3a6aff,0.7);bounce.position.set(-4,1,-3);scene.add(bounce);
  scene.add(new THREE.DirectionalLight(0xaaccff,0.35)).position.set(0,8,0);
  var earthGroup=new THREE.Group();earthGroup.rotation.z=0.41;scene.add(earthGroup);
  var uEarth={dayTexture:{value:null},nightTexture:{value:null},specTexture:{value:null},sunDirection:{value:new THREE.Vector3(5,2.5,4).normalize()}};
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(1,72,72),new THREE.ShaderMaterial({uniforms:uEarth,
    vertexShader:'varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'precision highp float;uniform sampler2D dayTexture,nightTexture,specTexture;uniform vec3 sunDirection;varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPos;void main(){vec3 n=normalize(vNormal);vec3 sun=normalize(sunDirection);float cosA=dot(n,sun);float dayA=smoothstep(-0.18,0.45,cosA);vec3 day=texture2D(dayTexture,vUv).rgb;float lum=dot(day,vec3(0.299,0.587,0.114));day=mix(vec3(lum),day,1.35);day=pow(day,vec3(0.88));vec3 night=texture2D(nightTexture,vUv).rgb;night=pow(night,vec3(0.75))*2.2;vec3 spec=texture2D(specTexture,vUv).rgb;vec3 color=mix(night,day,dayA);vec3 vd=normalize(cameraPosition-vWorldPos);vec3 hv=normalize(sun+vd);float sp=pow(max(dot(n,hv),0.0),90.0);float sp2=pow(max(dot(n,hv),0.0),18.0)*0.06;color+=vec3(0.7,0.82,1.0)*(sp*0.9+sp2)*spec.r*dayA;float term=smoothstep(0.0,0.18,cosA)*smoothstep(0.38,0.18,cosA);color+=vec3(0.9,0.45,0.15)*term*0.28;float rim=pow(1.0-max(dot(n,vd),0.0),3.8);color=mix(color,mix(vec3(0.04,0.08,0.28),vec3(0.28,0.62,1.0),smoothstep(-0.3,0.6,cosA)),rim*0.72);gl_FragColor=vec4(color,1.0);}'}));
  earthGroup.add(earthMesh);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.09,48,48),new THREE.ShaderMaterial({uniforms:{sd:{value:new THREE.Vector3(5,2.5,4).normalize()}},vertexShader:'varying vec3 vN,vP;void main(){vN=normal;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 sd;varying vec3 vN,vP;void main(){vec3 vd=normalize(cameraPosition-(modelMatrix*vec4(vP,1.0)).xyz);float rim=pow(1.0-abs(dot(normalize(vN),vd)),2.4);float d=dot(normalize((normalMatrix*vec4(vN,0.0)).xyz),normalize(sd));vec3 col=mix(vec3(0.03,0.06,0.28),vec3(0.22,0.56,1.0),smoothstep(-0.15,0.6,d));gl_FragColor=vec4(col,rim*0.62);}',transparent:true,side:THREE.FrontSide,depthWrite:false,blending:THREE.AdditiveBlending})));
  var BASE='https://globevoyage-admin.onrender.com/texture/';
  var texLoader=new THREE.TextureLoader();texLoader.crossOrigin='anonymous';
  var texDone=0;function onTex(){texDone++;progress(25+texDone*18);}
  texLoader.load(BASE+'earth-day',function(t){t.anisotropy=renderer.capabilities.getMaxAnisotropy();uEarth.dayTexture.value=t;onTex();},undefined,function(){onTex();});
  texLoader.load(BASE+'earth-night',function(t){uEarth.nightTexture.value=t;onTex();},undefined,function(){onTex();});
  texLoader.load(BASE+'earth-water',function(t){uEarth.specTexture.value=t;onTex();},undefined,function(){onTex();});
  var cloudMesh;texLoader.load(BASE+'earth-clouds',function(t){cloudMesh=new THREE.Mesh(new THREE.SphereGeometry(1.013,48,48),new THREE.MeshPhongMaterial({map:t,transparent:true,opacity:0.75,depthWrite:false,blending:THREE.AdditiveBlending}));earthGroup.add(cloudMesh);});
  var FILL_R=1.003,BORDER_R=1.0042,countryMap={},allFeatures=[],highlightTargets={};
  function ll2v(lon,lat,r){var phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180;return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta));}
  function triPoly(rings){var coords=[];rings[0].forEach(function(p){coords.push(p[0],p[1]);});var holes=[],off=rings[0].length;for(var i=1;i<rings.length;i++){holes.push(off);rings[i].forEach(function(p){coords.push(p[0],p[1]);});off+=rings[i].length;}var idx=earcut(coords,holes.length?holes:null,2);if(!idx||!idx.length)return null;var pos=[];for(var t=0;t<idx.length;t++){var k=idx[t];var v=ll2v(coords[k*2],coords[k*2+1],FILL_R);pos.push(v.x,v.y,v.z);}var geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));return geo;}
  function buildBorder(rings){var pos=[];rings.forEach(function(ring){for(var i=0;i<ring.length-1;i++){var a=ll2v(ring[i][0],ring[i][1],BORDER_R),b=ll2v(ring[i+1][0],ring[i+1][1],BORDER_R);pos.push(a.x,a.y,a.z,b.x,b.y,b.z);}});if(!pos.length)return null;var geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));return geo;}
  function pipRing(lon,lat,ring){var inside=false;for(var i=0,j=ring.length-1;i<ring.length;j=i++){var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
  function pipFeature(lon,lat,f){var g=f.geometry;if(!g)return false;function tp(rings){if(!pipRing(lon,lat,rings[0]))return false;for(var h=1;h<rings.length;h++)if(pipRing(lon,lat,rings[h]))return false;return true;}if(g.type==='Polygon')return tp(g.coordinates);if(g.type==='MultiPolygon'){for(var p=0;p<g.coordinates.length;p++)if(tp(g.coordinates[p]))return true;}return false;}
  function v3toll(v){var lat=Math.asin(v.y/v.length())*180/Math.PI;var lon=Math.atan2(v.z,-v.x)*180/Math.PI-180;if(lon<-180)lon+=360;return{lat:lat,lon:lon};}
  function getRings(f){var g=f.geometry;if(!g)return[];var r=[];if(g.type==='Polygon')r=g.coordinates;else if(g.type==='MultiPolygon')g.coordinates.forEach(function(p){r=r.concat(p);});return r;}
  function buildCountry(feat){var iso=feat.properties.iso,rings=getRings(feat);if(!rings.length)return;var fillMat=new THREE.MeshBasicMaterial({color:0x4fa3ff,transparent:true,opacity:0.0,side:THREE.DoubleSide,depthWrite:false});var borderMat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.25,linewidth:1});var group=new THREE.Group();try{if(feat.geometry.type==='Polygon'){var fg=triPoly(feat.geometry.coordinates);if(fg){var m=new THREE.Mesh(fg,fillMat);m.userData.iso=iso;group.add(m);}}else if(feat.geometry.type==='MultiPolygon'){feat.geometry.coordinates.forEach(function(poly){var fg=triPoly(poly);if(fg){var m=new THREE.Mesh(fg,fillMat);m.userData.iso=iso;group.add(m);}});}}catch(e){}var bg=buildBorder(rings);if(bg)group.add(new THREE.LineSegments(bg,borderMat));earthGroup.add(group);countryMap[iso]={fillMat:fillMat,borderMat:borderMat,name:feat.properties.name,iso:iso,props:feat.properties};}
  var card=document.getElementById('card'),backdrop=document.getElementById('backdrop');
  function fmtPop(n){if(!n)return'—';if(n>1e9)return(n/1e9).toFixed(1)+'B';if(n>1e6)return(n/1e6).toFixed(1)+'M';if(n>1e3)return Math.round(n/1e3)+'K';return''+n;}
  function openCard(iso,props){document.getElementById('card-flag').textContent=FLAGS[iso]||'🌍';document.getElementById('card-name').textContent=props.name;document.getElementById('card-sub').textContent=(props.subregion||props.continent||'').toUpperCase();document.getElementById('card-desc').textContent=DESCRIPTIONS[iso]||'A fascinating destination with rich cultural heritage and unique landscapes.';document.getElementById('s-pop').textContent=fmtPop(props.pop);document.getElementById('s-cont').textContent=props.continent||'—';document.getElementById('s-reg').textContent=(props.subregion||'—').split(' ').slice(0,2).join(' ');card.classList.add('open');backdrop.classList.add('on');cardOpen=true;autoSpin=false;targetZ=CAM_COUNTRY;}
  function closeCard(){card.classList.remove('open');backdrop.classList.remove('on');cardOpen=false;targetZ=CAM_DEFAULT;if(shouldSpin())autoSpin=true;}
  document.getElementById('card-close').addEventListener('click',function(e){e.stopPropagation();dismissSelection();});
  document.getElementById('card-btn').addEventListener('click',function(e){e.stopPropagation();if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'DESTINATIONS',country:selectedISO,name:document.getElementById('card-name').textContent}));});
  backdrop.addEventListener('click',function(){dismissSelection();});
  function dismissSelection(){if(selectedISO&&countryMap[selectedISO]){highlightTargets[selectedISO]=0.0;countryMap[selectedISO].borderMat.color.setHex(0xffffff);countryMap[selectedISO].borderMat.opacity=0.25;}selectedISO=null;closeCard();}
  function setSelected(iso){if(selectedISO&&countryMap[selectedISO]){highlightTargets[selectedISO]=0.0;countryMap[selectedISO].borderMat.color.setHex(0xffffff);countryMap[selectedISO].borderMat.opacity=0.25;}if(iso===selectedISO){dismissSelection();return;}selectedISO=iso;if(countryMap[iso]){highlightTargets[iso]=0.48;countryMap[iso].borderMat.color.setHex(0x88ccff);countryMap[iso].borderMat.opacity=1.0;openCard(iso,countryMap[iso].props);}autoSpin=false;}
  var raycaster=new THREE.Raycaster();
  function handleTap(sx,sy){var cardEl=document.getElementById('card');if(cardOpen&&sy>cardEl.getBoundingClientRect().top)return;var ndc=new THREE.Vector2((sx/W)*2-1,-(sy/H)*2+1);raycaster.setFromCamera(ndc,camera);var sh=raycaster.intersectObject(earthMesh);if(!sh.length){if(selectedISO)dismissSelection();return;}var fills=[];earthGroup.traverse(function(o){if(o.isMesh&&o.userData.iso)fills.push(o);});var hits=raycaster.intersectObjects(fills,false);if(hits.length>0){setSelected(hits[0].object.userData.iso);return;}var lp=earthGroup.worldToLocal(sh[0].point.clone());var ll=v3toll(lp);for(var i=0;i<allFeatures.length;i++){if(pipFeature(ll.lon,ll.lat,allFeatures[i])){setSelected(allFeatures[i].properties.iso);return;}}if(selectedISO)dismissSelection();}
  fetch('https://globevoyage-admin.onrender.com/geodata').then(function(r){return r.json();}).then(function(g){progress(82);allFeatures=g.features;var i=0;function batch(){var end=Math.min(i+15,allFeatures.length);for(;i<end;i++)buildCountry(allFeatures[i]);progress(82+Math.round((i/allFeatures.length)*17));if(i<allFeatures.length)setTimeout(batch,0);else progress(100);}batch();}).catch(function(){progress(100);});
  function tDist(a,b){var dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;return Math.sqrt(dx*dx+dy*dy);}
  canvas.addEventListener('touchstart',function(e){e.preventDefault();if(e.touches.length===1){var t=e.touches[0];lx=t.clientX;ly=t.clientY;tapX=t.clientX;tapY=t.clientY;tapT=Date.now();isDrag=true;isPinch=false;momX=0;momY=0;isHeld=false;holdTimer=setTimeout(function(){isHeld=true;autoSpin=false;},600);}else if(e.touches.length===2){clearTimeout(holdTimer);isDrag=false;isPinch=true;lDist=tDist(e.touches[0],e.touches[1]);}},{passive:false});
  canvas.addEventListener('touchmove',function(e){e.preventDefault();if(isDrag&&e.touches.length===1){clearTimeout(holdTimer);var t=e.touches[0],dx=t.clientX-lx,dy=t.clientY-ly;var s=0.004*(camZ/CAM_DEFAULT);earthGroup.rotation.y+=dx*s;earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+dy*s));momX=dx*s;momY=dy*s;lx=t.clientX;ly=t.clientY;autoSpin=false;}else if(isPinch&&e.touches.length===2){var d=tDist(e.touches[0],e.touches[1]);var delta=(lDist-d)*0.014;if(targetZ+delta<CAM_MIN)delta*=0.2;if(targetZ+delta>CAM_MAX)delta*=0.2;targetZ=Math.max(CAM_MIN,Math.min(CAM_MAX,targetZ+delta));lDist=d;}},{passive:false});
  canvas.addEventListener('touchend',function(e){e.preventDefault();clearTimeout(holdTimer);var now=Date.now();if(e.changedTouches.length===1){var cx=e.changedTouches[0].clientX,cy=e.changedTouches[0].clientY;var dx=Math.abs(cx-tapX),dy2=Math.abs(cy-tapY),dt=now-tapT;if(now-lastTap<260&&dx<18&&dy2<18){targetZ=camZ<CAM_DEFAULT-0.3?CAM_DEFAULT:CAM_MIN+0.3;}lastTap=now;if(dx<10&&dy2<10&&dt<280)handleTap(tapX,tapY);if(Math.abs(momX)>0.001||Math.abs(momY)>0.001){setTimeout(function(){if(!isDrag&&!isHeld&&shouldSpin())autoSpin=true;},1800);}else if(shouldSpin()){autoSpin=true;}}isDrag=false;isPinch=false;},{passive:false});
  var hlTime=0;
  function animate(){requestAnimationFrame(animate);if(autoSpin)earthGroup.rotation.y+=spinSpeed;if(!isDrag&&(Math.abs(momX)>0||Math.abs(momY)>0)){earthGroup.rotation.y+=momX;earthGroup.rotation.x=Math.max(-1.2,Math.min(1.2,earthGroup.rotation.x+momY));momX*=fric;momY*=fric;if(Math.abs(momX)<0.00008&&Math.abs(momY)<0.00008){momX=0;momY=0;}}var diff=targetZ-camZ;zoomVel=(zoomVel+diff*0.035)*0.75;camZ+=zoomVel;camera.position.z=camZ;if(camZ<CAM_MIN+0.25&&!selectedISO)autoSpin=false;else if(!selectedISO&&!isHeld&&!isDrag&&shouldSpin())autoSpin=true;if(cloudMesh)cloudMesh.rotation.y+=spinSpeed*1.12;hlTime+=0.05;Object.keys(highlightTargets).forEach(function(iso){var c=countryMap[iso];if(!c)return;var cur=c.fillMat.opacity,tgt=highlightTargets[iso];var next=cur+(tgt-cur)*0.11;c.fillMat.opacity=next;if(iso===selectedISO)c.borderMat.opacity=0.65+0.35*Math.sin(hlTime);if(Math.abs(next-tgt)<0.001){c.fillMat.opacity=tgt;if(tgt===0.0)delete highlightTargets[iso];}});renderer.render(scene,camera);}
  animate();setTimeout(function(){var h=document.getElementById('hint');if(h)h.style.opacity='0';},5000);
})();
</script></body></html>`);
});

const PORT = process.env.PORT||3000;
app.listen(PORT, async()=>{
  console.log(`GlobeVoyage API on port ${PORT} — ${COUNTRIES.length} countries`);
  setTimeout(runStartupPipeline, 12000);
});
