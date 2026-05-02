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
  MISTRAL_API_KEY:          process.env.MISTRAL_API_KEY,
  FOURSQUARE_API_KEY:       process.env.FOURSQUARE_API_KEY,
  OPENWEATHER_API_KEY:      process.env.OPENWEATHER_API_KEY,
  TICKETMASTER_API_KEY:     process.env.TICKETMASTER_API_KEY,
  EVENTBRITE_API_KEY:       process.env.EVENTBRITE_API_KEY,
  PREDICTHQ_API_KEY:        process.env.PREDICTHQ_API_KEY,
  NEWS_API_KEY:             process.env.NEWS_API_KEY,
  REDDIT_CLIENT_ID:         process.env.REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET:     process.env.REDDIT_CLIENT_SECRET,
  TRIPADVISOR_API_KEY:      process.env.TRIPADVISOR_API_KEY,
  YELP_API_KEY:             process.env.YELP_API_KEY,
  GEOAPIFY_API_KEY:         process.env.GEOAPIFY_API_KEY,
  APIFY_API_KEY:            process.env.APIFY_API_KEY, // for social scraping
};

let THREE_JS = "", EARCUT_JS = "";
try { THREE_JS  = fs.readFileSync(path.join(__dirname,"node_modules/three/build/three.min.js"),"utf8"); } catch(e){}
try { EARCUT_JS = fs.readFileSync(path.join(__dirname,"node_modules/earcut/src/earcut.js"),"utf8"); } catch(e){}

const SELF = process.env.RENDER_EXTERNAL_URL || "https://globevoyage-admin.onrender.com";
setInterval(() => {
  const mod = SELF.startsWith("https") ? https : http;
  mod.get(SELF+"/", r=>r.resume()).on("error",()=>{});
}, 4*60*1000);

// ══════════════════════════════════════════════════════════════════
// ALL 195 COUNTRIES — every continent
// ══════════════════════════════════════════════════════════════════
const COUNTRIES = [
  // Africa (54)
  {iso:"DZA",name:"Algeria",continent:"Africa"},
  {iso:"AGO",name:"Angola",continent:"Africa"},
  {iso:"BEN",name:"Benin",continent:"Africa"},
  {iso:"BWA",name:"Botswana",continent:"Africa"},
  {iso:"BFA",name:"Burkina Faso",continent:"Africa"},
  {iso:"BDI",name:"Burundi",continent:"Africa"},
  {iso:"CPV",name:"Cape Verde",continent:"Africa"},
  {iso:"CMR",name:"Cameroon",continent:"Africa"},
  {iso:"CAF",name:"Central African Republic",continent:"Africa"},
  {iso:"TCD",name:"Chad",continent:"Africa"},
  {iso:"COM",name:"Comoros",continent:"Africa"},
  {iso:"COD",name:"DR Congo",continent:"Africa"},
  {iso:"COG",name:"Republic of Congo",continent:"Africa"},
  {iso:"CIV",name:"Ivory Coast",continent:"Africa"},
  {iso:"DJI",name:"Djibouti",continent:"Africa"},
  {iso:"EGY",name:"Egypt",continent:"Africa"},
  {iso:"GNQ",name:"Equatorial Guinea",continent:"Africa"},
  {iso:"ERI",name:"Eritrea",continent:"Africa"},
  {iso:"SWZ",name:"Eswatini",continent:"Africa"},
  {iso:"ETH",name:"Ethiopia",continent:"Africa"},
  {iso:"GAB",name:"Gabon",continent:"Africa"},
  {iso:"GMB",name:"Gambia",continent:"Africa"},
  {iso:"GHA",name:"Ghana",continent:"Africa"},
  {iso:"GIN",name:"Guinea",continent:"Africa"},
  {iso:"GNB",name:"Guinea-Bissau",continent:"Africa"},
  {iso:"KEN",name:"Kenya",continent:"Africa"},
  {iso:"LSO",name:"Lesotho",continent:"Africa"},
  {iso:"LBR",name:"Liberia",continent:"Africa"},
  {iso:"LBY",name:"Libya",continent:"Africa"},
  {iso:"MDG",name:"Madagascar",continent:"Africa"},
  {iso:"MWI",name:"Malawi",continent:"Africa"},
  {iso:"MLI",name:"Mali",continent:"Africa"},
  {iso:"MRT",name:"Mauritania",continent:"Africa"},
  {iso:"MUS",name:"Mauritius",continent:"Africa"},
  {iso:"MAR",name:"Morocco",continent:"Africa"},
  {iso:"MOZ",name:"Mozambique",continent:"Africa"},
  {iso:"NAM",name:"Namibia",continent:"Africa"},
  {iso:"NER",name:"Niger",continent:"Africa"},
  {iso:"NGA",name:"Nigeria",continent:"Africa"},
  {iso:"RWA",name:"Rwanda",continent:"Africa"},
  {iso:"STP",name:"Sao Tome and Principe",continent:"Africa"},
  {iso:"SEN",name:"Senegal",continent:"Africa"},
  {iso:"SLE",name:"Sierra Leone",continent:"Africa"},
  {iso:"SOM",name:"Somalia",continent:"Africa"},
  {iso:"ZAF",name:"South Africa",continent:"Africa"},
  {iso:"SSD",name:"South Sudan",continent:"Africa"},
  {iso:"SDN",name:"Sudan",continent:"Africa"},
  {iso:"TZA",name:"Tanzania",continent:"Africa"},
  {iso:"TGO",name:"Togo",continent:"Africa"},
  {iso:"TUN",name:"Tunisia",continent:"Africa"},
  {iso:"UGA",name:"Uganda",continent:"Africa"},
  {iso:"ZMB",name:"Zambia",continent:"Africa"},
  {iso:"ZWE",name:"Zimbabwe",continent:"Africa"},
  // Asia (49)
  {iso:"AFG",name:"Afghanistan",continent:"Asia"},
  {iso:"ARM",name:"Armenia",continent:"Asia"},
  {iso:"AZE",name:"Azerbaijan",continent:"Asia"},
  {iso:"BHR",name:"Bahrain",continent:"Asia"},
  {iso:"BGD",name:"Bangladesh",continent:"Asia"},
  {iso:"BTN",name:"Bhutan",continent:"Asia"},
  {iso:"BRN",name:"Brunei",continent:"Asia"},
  {iso:"KHM",name:"Cambodia",continent:"Asia"},
  {iso:"CHN",name:"China",continent:"Asia"},
  {iso:"CYP",name:"Cyprus",continent:"Asia"},
  {iso:"GEO",name:"Georgia",continent:"Asia"},
  {iso:"IND",name:"India",continent:"Asia"},
  {iso:"IDN",name:"Indonesia",continent:"Asia"},
  {iso:"IRN",name:"Iran",continent:"Asia"},
  {iso:"IRQ",name:"Iraq",continent:"Asia"},
  {iso:"ISR",name:"Israel",continent:"Asia"},
  {iso:"JPN",name:"Japan",continent:"Asia"},
  {iso:"JOR",name:"Jordan",continent:"Asia"},
  {iso:"KAZ",name:"Kazakhstan",continent:"Asia"},
  {iso:"KWT",name:"Kuwait",continent:"Asia"},
  {iso:"KGZ",name:"Kyrgyzstan",continent:"Asia"},
  {iso:"LAO",name:"Laos",continent:"Asia"},
  {iso:"LBN",name:"Lebanon",continent:"Asia"},
  {iso:"MYS",name:"Malaysia",continent:"Asia"},
  {iso:"MDV",name:"Maldives",continent:"Asia"},
  {iso:"MNG",name:"Mongolia",continent:"Asia"},
  {iso:"MMR",name:"Myanmar",continent:"Asia"},
  {iso:"NPL",name:"Nepal",continent:"Asia"},
  {iso:"PRK",name:"North Korea",continent:"Asia"},
  {iso:"OMN",name:"Oman",continent:"Asia"},
  {iso:"PAK",name:"Pakistan",continent:"Asia"},
  {iso:"PSE",name:"Palestine",continent:"Asia"},
  {iso:"PHL",name:"Philippines",continent:"Asia"},
  {iso:"QAT",name:"Qatar",continent:"Asia"},
  {iso:"SAU",name:"Saudi Arabia",continent:"Asia"},
  {iso:"SGP",name:"Singapore",continent:"Asia"},
  {iso:"KOR",name:"South Korea",continent:"Asia"},
  {iso:"LKA",name:"Sri Lanka",continent:"Asia"},
  {iso:"SYR",name:"Syria",continent:"Asia"},
  {iso:"TWN",name:"Taiwan",continent:"Asia"},
  {iso:"TJK",name:"Tajikistan",continent:"Asia"},
  {iso:"THA",name:"Thailand",continent:"Asia"},
  {iso:"TLS",name:"Timor-Leste",continent:"Asia"},
  {iso:"TUR",name:"Turkey",continent:"Asia"},
  {iso:"TKM",name:"Turkmenistan",continent:"Asia"},
  {iso:"ARE",name:"United Arab Emirates",continent:"Asia"},
  {iso:"UZB",name:"Uzbekistan",continent:"Asia"},
  {iso:"VNM",name:"Vietnam",continent:"Asia"},
  {iso:"YEM",name:"Yemen",continent:"Asia"},
  // Europe (44)
  {iso:"ALB",name:"Albania",continent:"Europe"},
  {iso:"AND",name:"Andorra",continent:"Europe"},
  {iso:"AUT",name:"Austria",continent:"Europe"},
  {iso:"BLR",name:"Belarus",continent:"Europe"},
  {iso:"BEL",name:"Belgium",continent:"Europe"},
  {iso:"BIH",name:"Bosnia and Herzegovina",continent:"Europe"},
  {iso:"BGR",name:"Bulgaria",continent:"Europe"},
  {iso:"HRV",name:"Croatia",continent:"Europe"},
  {iso:"CZE",name:"Czech Republic",continent:"Europe"},
  {iso:"DNK",name:"Denmark",continent:"Europe"},
  {iso:"EST",name:"Estonia",continent:"Europe"},
  {iso:"FIN",name:"Finland",continent:"Europe"},
  {iso:"FRA",name:"France",continent:"Europe"},
  {iso:"DEU",name:"Germany",continent:"Europe"},
  {iso:"GRC",name:"Greece",continent:"Europe"},
  {iso:"HUN",name:"Hungary",continent:"Europe"},
  {iso:"ISL",name:"Iceland",continent:"Europe"},
  {iso:"IRL",name:"Ireland",continent:"Europe"},
  {iso:"ITA",name:"Italy",continent:"Europe"},
  {iso:"XKX",name:"Kosovo",continent:"Europe"},
  {iso:"LVA",name:"Latvia",continent:"Europe"},
  {iso:"LIE",name:"Liechtenstein",continent:"Europe"},
  {iso:"LTU",name:"Lithuania",continent:"Europe"},
  {iso:"LUX",name:"Luxembourg",continent:"Europe"},
  {iso:"MLT",name:"Malta",continent:"Europe"},
  {iso:"MDA",name:"Moldova",continent:"Europe"},
  {iso:"MCO",name:"Monaco",continent:"Europe"},
  {iso:"MNE",name:"Montenegro",continent:"Europe"},
  {iso:"NLD",name:"Netherlands",continent:"Europe"},
  {iso:"MKD",name:"North Macedonia",continent:"Europe"},
  {iso:"NOR",name:"Norway",continent:"Europe"},
  {iso:"POL",name:"Poland",continent:"Europe"},
  {iso:"PRT",name:"Portugal",continent:"Europe"},
  {iso:"ROU",name:"Romania",continent:"Europe"},
  {iso:"RUS",name:"Russia",continent:"Europe"},
  {iso:"SMR",name:"San Marino",continent:"Europe"},
  {iso:"SRB",name:"Serbia",continent:"Europe"},
  {iso:"SVK",name:"Slovakia",continent:"Europe"},
  {iso:"SVN",name:"Slovenia",continent:"Europe"},
  {iso:"ESP",name:"Spain",continent:"Europe"},
  {iso:"SWE",name:"Sweden",continent:"Europe"},
  {iso:"CHE",name:"Switzerland",continent:"Europe"},
  {iso:"UKR",name:"Ukraine",continent:"Europe"},
  {iso:"GBR",name:"United Kingdom",continent:"Europe"},
  // North America (23)
  {iso:"ATG",name:"Antigua and Barbuda",continent:"North America"},
  {iso:"BHS",name:"Bahamas",continent:"North America"},
  {iso:"BRB",name:"Barbados",continent:"North America"},
  {iso:"BLZ",name:"Belize",continent:"North America"},
  {iso:"CAN",name:"Canada",continent:"North America"},
  {iso:"CRI",name:"Costa Rica",continent:"North America"},
  {iso:"CUB",name:"Cuba",continent:"North America"},
  {iso:"DMA",name:"Dominica",continent:"North America"},
  {iso:"DOM",name:"Dominican Republic",continent:"North America"},
  {iso:"SLV",name:"El Salvador",continent:"North America"},
  {iso:"GRD",name:"Grenada",continent:"North America"},
  {iso:"GTM",name:"Guatemala",continent:"North America"},
  {iso:"HTI",name:"Haiti",continent:"North America"},
  {iso:"HND",name:"Honduras",continent:"North America"},
  {iso:"JAM",name:"Jamaica",continent:"North America"},
  {iso:"MEX",name:"Mexico",continent:"North America"},
  {iso:"NIC",name:"Nicaragua",continent:"North America"},
  {iso:"PAN",name:"Panama",continent:"North America"},
  {iso:"KNA",name:"Saint Kitts and Nevis",continent:"North America"},
  {iso:"LCA",name:"Saint Lucia",continent:"North America"},
  {iso:"VCT",name:"Saint Vincent and the Grenadines",continent:"North America"},
  {iso:"TTO",name:"Trinidad and Tobago",continent:"North America"},
  {iso:"USA",name:"United States",continent:"North America"},
  // South America (12)
  {iso:"ARG",name:"Argentina",continent:"South America"},
  {iso:"BOL",name:"Bolivia",continent:"South America"},
  {iso:"BRA",name:"Brazil",continent:"South America"},
  {iso:"CHL",name:"Chile",continent:"South America"},
  {iso:"COL",name:"Colombia",continent:"South America"},
  {iso:"ECU",name:"Ecuador",continent:"South America"},
  {iso:"GUY",name:"Guyana",continent:"South America"},
  {iso:"PRY",name:"Paraguay",continent:"South America"},
  {iso:"PER",name:"Peru",continent:"South America"},
  {iso:"SUR",name:"Suriname",continent:"South America"},
  {iso:"URY",name:"Uruguay",continent:"South America"},
  {iso:"VEN",name:"Venezuela",continent:"South America"},
  // Oceania (14)
  {iso:"AUS",name:"Australia",continent:"Oceania"},
  {iso:"FJI",name:"Fiji",continent:"Oceania"},
  {iso:"KIR",name:"Kiribati",continent:"Oceania"},
  {iso:"MHL",name:"Marshall Islands",continent:"Oceania"},
  {iso:"FSM",name:"Micronesia",continent:"Oceania"},
  {iso:"NRU",name:"Nauru",continent:"Oceania"},
  {iso:"NZL",name:"New Zealand",continent:"Oceania"},
  {iso:"PLW",name:"Palau",continent:"Oceania"},
  {iso:"PNG",name:"Papua New Guinea",continent:"Oceania"},
  {iso:"WSM",name:"Samoa",continent:"Oceania"},
  {iso:"SLB",name:"Solomon Islands",continent:"Oceania"},
  {iso:"TON",name:"Tonga",continent:"Oceania"},
  {iso:"TUV",name:"Tuvalu",continent:"Oceania"},
  {iso:"VUT",name:"Vanuatu",continent:"Oceania"},
];

// High-traffic countries — refresh every 2 hours
const HOT_ISOS = new Set([
  "FRA","USA","GBR","JPN","ITA","ESP","THA","AUS","DEU","CAN",
  "MEX","BRA","ARE","SGP","IND","GRC","PRT","NLD","CHE","NZL"
]);

// ══════════════════════════════════════════════════════════════════
// DATA SOURCE FETCHERS
// ══════════════════════════════════════════════════════════════════

// Track health of each source
const sourceHealth = {};
function recordHealth(source, ok, ms, err) {
  sourceHealth[source] = {
    ok, last_check: new Date().toISOString(),
    response_ms: ms, error: err||null,
    success_count: (sourceHealth[source]?.success_count||0) + (ok?1:0),
    fail_count:    (sourceHealth[source]?.fail_count||0)    + (ok?0:1),
  };
}

async function timed(source, fn) {
  const t = Date.now();
  try {
    const result = await fn();
    recordHealth(source, true, Date.now()-t, null);
    return result;
  } catch(e) {
    recordHealth(source, false, Date.now()-t, e.message);
    throw e;
  }
}

// ── 1. Wikipedia ──────────────────────────────────────────────────
async function fetchWikipedia(countryName) {
  return timed("wikipedia", async () => {
    const s = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{action:"query",format:"json",list:"search",srsearch:`${countryName} tourism travel`,srlimit:1},
      timeout:8000
    });
    const title = s.data?.query?.search?.[0]?.title || countryName;
    const c = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{action:"query",format:"json",prop:"extracts",exintro:true,explaintext:true,titles:title},
      timeout:8000
    });
    const page = Object.values(c.data?.query?.pages||{})[0];
    // Also fetch categories for tagging
    const cats = await axios.get("https://en.wikipedia.org/w/api.php", {
      params:{action:"query",format:"json",prop:"categories",titles:title,cllimit:20},
      timeout:5000
    });
    const catPage = Object.values(cats.data?.query?.pages||{})[0];
    const categories = (catPage?.categories||[]).map(c=>c.title.replace("Category:",""));
    return {
      summary: page?.extract?.slice(0,1500)||"",
      title,
      categories,
    };
  });
}

// ── 2. Wikivoyage ─────────────────────────────────────────────────
async function fetchWikivoyage(countryName) {
  return timed("wikivoyage", async () => {
    const r = await axios.get("https://en.wikivoyage.org/w/api.php", {
      params:{action:"query",format:"json",prop:"extracts",explaintext:true,titles:countryName},
      timeout:8000
    });
    const page = Object.values(r.data?.query?.pages||{})[0];
    const text = page?.extract||"";
    const sections = {};
    ["See","Do","Eat","Drink","Sleep","Stay safe","Get in","Get around","Budget","Mid-range","Splurge"].forEach(sec=>{
      const m = text.match(new RegExp(`==\\s*${sec}\\s*==([\\s\\S]*?)(?====|$)`,"i"));
      if(m) sections[sec] = m[1].trim().slice(0,600);
    });
    // Extract highlights — lines that start with * 
    const highlights = (text.match(/^\*\s+(.+)$/gm)||[]).slice(0,10).map(l=>l.replace(/^\*\s+/,""));
    return {sections, highlights, full:text.slice(0,2500)};
  });
}

// ── 3. Foursquare Places ─────────────────────────────────────────
async function fetchFoursquare(countryName) {
  if(!ENV.FOURSQUARE_API_KEY) return [];
  return timed("foursquare", async () => {
    const r = await axios.get("https://api.foursquare.com/v3/places/search", {
      params:{query:`top attraction ${countryName}`,near:countryName,limit:10,sort:"POPULARITY"},
      headers:{Authorization:ENV.FOURSQUARE_API_KEY, "Accept":"application/json"},
      timeout:10000
    });
    return (r.data?.results||[]).slice(0,8).map(p=>({
      name:      p.name,
      fsq_id:    p.fsq_id,
      lat:       p.geocodes?.main?.latitude,
      lng:       p.geocodes?.main?.longitude,
      address:   p.location?.formatted_address,
      categories: p.categories?.map(c=>c.name),
      distance:  p.distance,
    }));
  });
}

// ── 4. OpenWeatherMap ─────────────────────────────────────────────
async function fetchWeather(countryName) {
  if(!ENV.OPENWEATHER_API_KEY) return {now:null,forecast:[]};
  return timed("openweathermap", async () => {
    const [nowR,fR] = await Promise.all([
      axios.get("https://api.openweathermap.org/data/2.5/weather",{
        params:{q:countryName,appid:ENV.OPENWEATHER_API_KEY,units:"metric"},timeout:6000}),
      axios.get("https://api.openweathermap.org/data/2.5/forecast",{
        params:{q:countryName,appid:ENV.OPENWEATHER_API_KEY,units:"metric",cnt:5},timeout:6000}),
    ]);
    const n=nowR.data;
    return {
      now:{
        temp:Math.round(n.main.temp),
        feels_like:Math.round(n.main.feels_like),
        condition:n.weather[0].description,
        icon:n.weather[0].icon,
        humidity:n.main.humidity,
        wind:Math.round(n.wind.speed*3.6),
      },
      forecast:(fR.data?.list||[]).slice(0,5).map(f=>({
        date:f.dt_txt.split(" ")[0],
        high:Math.round(f.main.temp_max),
        low:Math.round(f.main.temp_min),
        condition:f.weather[0].description,
        icon:f.weather[0].icon,
      }))
    };
  });
}

// ── 5. NewsAPI ────────────────────────────────────────────────────
function riskScore(text){
  const t=(text||"").toLowerCase();
  if(/strike|protest|riot|attack|terror|quake|flood|hurricane|tsunami|evacuation|emergency|coup/.test(t)) return "high";
  if(/delay|cancel|warning|alert|caution|unrest|demonstration|closure/.test(t)) return "medium";
  return "low";
}

async function fetchNews(countryName) {
  if(!ENV.NEWS_API_KEY) return [];
  return timed("newsapi", async () => {
    const r = await axios.get("https://newsapi.org/v2/everything",{
      params:{q:`${countryName} travel tourism`,language:"en",sortBy:"publishedAt",pageSize:10,apiKey:ENV.NEWS_API_KEY},
      timeout:8000
    });
    return (r.data?.articles||[]).slice(0,8).map(a=>({
      title:a.title, url:a.url, source:a.source?.name,
      published_at:a.publishedAt, description:(a.description||"").slice(0,200),
      risk_level:riskScore(a.title+" "+(a.description||"")),
    }));
  });
}

// ── 6. Google News RSS ────────────────────────────────────────────
async function fetchGoogleNews(countryName) {
  return timed("google_news", async () => {
    const q = encodeURIComponent(`${countryName} travel tourism`);
    const r = await axios.get(`https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`,{
      timeout:8000, headers:{"User-Agent":"GlobeVoyage/1.0"}});
    const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
    const items = parsed?.rss?.channel?.item||[];
    const arr = Array.isArray(items)?items:[items];
    return arr.slice(0,8).map(i=>({
      title:i.title, url:i.link,
      source:i.source?._||i.source||"Google News",
      published_at:i.pubDate,
      risk_level:riskScore(i.title||""),
    }));
  });
}

// ── 7. GDACS ─────────────────────────────────────────────────────
async function fetchGDACS(countryName) {
  return timed("gdacs", async () => {
    const r = await axios.get("https://www.gdacs.org/xml/rss.xml",{
      timeout:8000, headers:{"User-Agent":"GlobeVoyage/1.0"}});
    const parsed = await xml2js.parseStringPromise(r.data,{explicitArray:false});
    const items = parsed?.rss?.channel?.item||[];
    const arr = Array.isArray(items)?items:[items];
    return arr.filter(i=>
      (i.title||"").toLowerCase().includes(countryName.toLowerCase())||
      (i.description||"").toLowerCase().includes(countryName.toLowerCase())
    ).slice(0,4).map(i=>({
      event_type:i["gdacs:eventtype"]||"Disaster",
      severity:i["gdacs:alertlevel"]||"Unknown",
      description:i.title, date:i.pubDate, url:i.link,
    }));
  });
}

// ── 8. Reddit ─────────────────────────────────────────────────────
let _redditToken=null, _redditExpiry=0;
async function getRedditToken(){
  if(!ENV.REDDIT_CLIENT_ID||!ENV.REDDIT_CLIENT_SECRET) return null;
  if(_redditToken&&Date.now()<_redditExpiry) return _redditToken;
  const r = await axios.post("https://www.reddit.com/api/v1/access_token",
    "grant_type=client_credentials",
    {auth:{username:ENV.REDDIT_CLIENT_ID,password:ENV.REDDIT_CLIENT_SECRET},
     headers:{"User-Agent":"GlobeVoyage/1.0","Content-Type":"application/x-www-form-urlencoded"},
     timeout:6000});
  _redditToken=r.data.access_token;
  _redditExpiry=Date.now()+(r.data.expires_in-60)*1000;
  return _redditToken;
}

async function fetchReddit(countryName) {
  return timed("reddit", async () => {
    const token = await getRedditToken().catch(()=>null);
    const headers = token
      ? {Authorization:`Bearer ${token}`,"User-Agent":"GlobeVoyage/1.0"}
      : {"User-Agent":"GlobeVoyage/1.0"};
    const posts=[];
    for(const sub of ["travel","solotravel","backpacking"]){
      try{
        const r=await axios.get(`https://oauth.reddit.com/r/${sub}/search`,{
          params:{q:`${countryName} tips`,sort:"top",t:"month",limit:4},
          headers,timeout:7000});
        (r.data?.data?.children||[]).forEach(c=>{
          const d=c.data;
          posts.push({title:d.title,score:d.score,comments:d.num_comments,
            url:"https://reddit.com"+d.permalink,
            text:(d.selftext||"").slice(0,250),
            sentiment:d.score>500?"positive":d.score>100?"neutral":"mixed"});
        });
      }catch(e){}
    }
    return posts.slice(0,9);
  });
}

// ── 9. Ticketmaster ───────────────────────────────────────────────
async function fetchTicketmaster(countryName, iso) {
  if(!ENV.TICKETMASTER_API_KEY) return [];
  return timed("ticketmaster", async () => {
    const r = await axios.get("https://app.ticketmaster.com/discovery/v2/events.json",{
      params:{apikey:ENV.TICKETMASTER_API_KEY,keyword:countryName,
        countryCode:iso?.slice(0,2)||"",size:8,sort:"date,asc",
        startDateTime:new Date().toISOString().split(".")[0]+"Z"},
      timeout:8000});
    return (r.data?._embedded?.events||[]).slice(0,8).map(e=>({
      name:e.name,date:e.dates?.start?.localDate,time:e.dates?.start?.localTime,
      venue:e._embedded?.venues?.[0]?.name,city:e._embedded?.venues?.[0]?.city?.name,
      type:e.classifications?.[0]?.segment?.name,url:e.url,
      price:e.priceRanges?.[0]?`${e.priceRanges[0].currency} ${Math.round(e.priceRanges[0].min)}–${Math.round(e.priceRanges[0].max)}`:null,
      source:"Ticketmaster"}));
  });
}

// ── 10. Eventbrite ────────────────────────────────────────────────
async function fetchEventbrite(countryName) {
  if(!ENV.EVENTBRITE_API_KEY) return [];
  return timed("eventbrite", async () => {
    const r = await axios.get("https://www.eventbriteapi.com/v3/events/search/",{
      params:{q:countryName,expand:"venue,organizer",token:ENV.EVENTBRITE_API_KEY,
        sort_by:"date","start_date.range_start":new Date().toISOString(),page_size:8},
      timeout:8000});
    return (r.data?.events||[]).slice(0,8).map(e=>({
      name:e.name?.text, date:e.start?.local?.split("T")[0],
      venue:e.venue?.name, city:e.venue?.address?.city,
      url:e.url, price:e.is_free?"Free":(e.ticket_availability?.minimum_ticket_price?.display||null),
      description:(e.description?.text||"").slice(0,150),source:"Eventbrite",
    }));
  });
}

// ── 11. PredictHQ ─────────────────────────────────────────────────
async function fetchPredictHQ(countryName) {
  if(!ENV.PREDICTHQ_API_KEY) return [];
  return timed("predicthq", async () => {
    const r = await axios.get("https://api.predicthq.com/v1/events/",{
      params:{country:countryName,active_from:new Date().toISOString().split("T")[0],
        limit:8,sort:"rank","category[]":"concerts,festivals,performing-arts,sports,public-holidays,observances"},
      headers:{Authorization:`Bearer ${ENV.PREDICTHQ_API_KEY}`},timeout:8000});
    return (r.data?.results||[]).slice(0,8).map(e=>({
      name:e.title,date:e.start,type:e.category,
      description:(e.description||"").slice(0,200),rank:e.rank,source:"PredictHQ",
    }));
  });
}

// ── 12. Tripadvisor ───────────────────────────────────────────────
async function fetchTripAdvisor(countryName) {
  if(!ENV.TRIPADVISOR_API_KEY) return [];
  return timed("tripadvisor", async () => {
    // Location search first
    const ls = await axios.get("https://api.content.tripadvisor.com/api/v1/location/search",{
      params:{searchQuery:countryName,category:"geos",key:ENV.TRIPADVISOR_API_KEY,language:"en"},
      timeout:8000});
    const locId = ls.data?.data?.[0]?.location_id;
    if(!locId) return [];
    // Get nearby attractions
    const r = await axios.get(`https://api.content.tripadvisor.com/api/v1/location/${locId}/attractions`,{
      params:{key:ENV.TRIPADVISOR_API_KEY,language:"en",limit:8},timeout:8000});
    return (r.data?.data||[]).slice(0,8).map(p=>({
      name:p.name,rating:p.rating,
      rating_count:p.num_reviews,
      category:p.category?.name,
      address:p.address_obj?.address_string,
      description:(p.description||"").slice(0,200),
      source:"TripAdvisor",
    }));
  });
}

// ── 13. Yelp ─────────────────────────────────────────────────────
async function fetchYelp(countryName) {
  if(!ENV.YELP_API_KEY) return [];
  return timed("yelp", async () => {
    const r = await axios.get("https://api.yelp.com/v3/businesses/search",{
      params:{location:countryName,term:"best restaurants attractions",limit:8,sort_by:"rating"},
      headers:{Authorization:`Bearer ${ENV.YELP_API_KEY}`},timeout:8000});
    return (r.data?.businesses||[]).slice(0,8).map(b=>({
      name:b.name,rating:b.rating,review_count:b.review_count,
      price:b.price,
      categories:b.categories?.map(c=>c.title),
      address:b.location?.display_address?.join(", "),
      source:"Yelp",
    }));
  });
}

// ── 14. Geoapify ─────────────────────────────────────────────────
async function fetchGeoapify(countryName) {
  if(!ENV.GEOAPIFY_API_KEY) return [];
  return timed("geoapify", async () => {
    // Geocode the country first
    const geo = await axios.get("https://api.geoapify.com/v1/geocode/search",{
      params:{text:countryName,type:"country",apiKey:ENV.GEOAPIFY_API_KEY,limit:1},
      timeout:6000});
    const place = geo.data?.features?.[0];
    if(!place) return [];
    const {lat,lon} = place.properties;
    // Get POIs nearby capital
    const pois = await axios.get("https://api.geoapify.com/v2/places",{
      params:{categories:"tourism,entertainment,catering",
        filter:`circle:${lon},${lat},50000`,limit:10,apiKey:ENV.GEOAPIFY_API_KEY},
      timeout:8000});
    return {
      capital_coords:{lat,lon},
      pois:(pois.data?.features||[]).slice(0,8).map(f=>({
        name:f.properties.name,category:f.properties.categories?.[0],
        address:f.properties.formatted,lat:f.properties.lat,lon:f.properties.lon,
      }))
    };
  });
}

// ── 15. Social Media via Apify (Instagram/TikTok/X scraping) ─────
async function fetchSocialTrends(countryName) {
  // Apify provides scrapers for Instagram/TikTok/X without requiring
  // official API approval. Falls back to Reddit if no key.
  if(ENV.APIFY_API_KEY){
    return timed("social_apify", async () => {
      // Run Apify Instagram hashtag scraper
      const runRes = await axios.post(
        "https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items",
        {hashtags:[countryName.toLowerCase().replace(/\s/g,"")+"travel",countryName.toLowerCase().replace(/\s/g,"")],resultsLimit:5},
        {params:{token:ENV.APIFY_API_KEY},timeout:25000}
      );
      const posts = Array.isArray(runRes.data)?runRes.data:[];
      return posts.slice(0,6).map(p=>({
        platform:"Instagram",
        caption:(p.caption||"").slice(0,150),
        likes:p.likesCount||0,
        url:p.url||"",
        sentiment:p.likesCount>10000?"very_positive":p.likesCount>1000?"positive":"neutral",
      }));
    });
  }
  // Fallback: Reddit hot posts as social proxy
  return timed("social_reddit_proxy", async () => {
    const token = await getRedditToken().catch(()=>null);
    const headers = token
      ? {Authorization:`Bearer ${token}`,"User-Agent":"GlobeVoyage/1.0"}
      : {"User-Agent":"GlobeVoyage/1.0"};
    const r = await axios.get("https://oauth.reddit.com/r/travel/search",{
      params:{q:`${countryName} beautiful trending`,sort:"hot",limit:5,t:"week"},
      headers,timeout:7000});
    return (r.data?.data?.children||[]).slice(0,5).map(c=>{
      const d=c.data;
      return {platform:"Reddit",caption:d.title,likes:d.score,
        url:"https://reddit.com"+d.permalink,
        sentiment:d.score>500?"very_positive":d.score>100?"positive":"neutral"};
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// MISTRAL AI SYNTHESIS
// ══════════════════════════════════════════════════════════════════
async function runMistral(countryName, continent, rawData) {
  if(!ENV.MISTRAL_API_KEY){
    recordHealth("mistral",false,0,"No API key");
    return null;
  }
  const prompt = `You are the AI brain of GlobeVoyage, a premium travel intelligence platform.
Analyse the following real-time data for ${countryName} (${continent}) and produce structured travel intelligence.

=== RAW DATA ===
WIKIPEDIA: ${(rawData.wiki?.summary||"").slice(0,500)}
WIKIVOYAGE SEE: ${(rawData.wv?.sections?.See||"").slice(0,300)}
WIKIVOYAGE DO: ${(rawData.wv?.sections?.Do||"").slice(0,300)}
WIKIVOYAGE STAY SAFE: ${(rawData.wv?.sections?.["Stay safe"]||"").slice(0,300)}
FOURSQUARE PLACES: ${JSON.stringify(rawData.places||[]).slice(0,400)}
WEATHER: ${JSON.stringify(rawData.weather?.now||{})}
REDDIT POSTS: ${(rawData.reddit||[]).map(p=>`[${p.score}pts] ${p.title}`).join(" | ").slice(0,500)}
NEWS HEADLINES: ${(rawData.news||[]).map(n=>`[${n.risk_level}] ${n.title}`).join(" | ").slice(0,500)}
GDACS DISASTERS: ${JSON.stringify(rawData.gdacs||[]).slice(0,300)}
EVENTS: ${(rawData.events||[]).map(e=>`${e.name} (${e.date})`).join(" | ").slice(0,400)}
TRIPADVISOR: ${JSON.stringify(rawData.tripadvisor||[]).slice(0,300)}
YELP: ${JSON.stringify(rawData.yelp||[]).slice(0,300)}
SOCIAL TRENDING: ${(rawData.social||[]).map(s=>s.caption).join(" | ").slice(0,300)}
=== END DATA ===

Output ONLY valid JSON, no markdown fences:
{
  "briefing": "2-3 sentences: what travellers need to know RIGHT NOW",
  "vibe": "One evocative sentence capturing the country's current energy",
  "recommendations": [
    {"title":"Name","type":"cultural|food|adventure|nature|nightlife|shopping|family","when":"Best time","why":"Why NOW","rating":1-5,"risk":"none|low|medium|high","source_hint":"Which source supports this"}
  ],
  "calendar": [
    {"date":"YYYY-MM-DD","label":"Short label","color":"green|amber|red","reason":"Why notable"}
  ],
  "trending_now": [
    {"name":"Place or experience","why_trending":"One line","best_time":"Time of day","warning":"Honest warning or null","platform":"Source"}
  ],
  "reddit_verdict": "What real travellers are saying in one honest sentence",
  "safety_summary": "One honest sentence about current safety",
  "best_months": ["Jan","Feb"],
  "avoid_if": "Who should NOT visit right now and why",
  "hidden_gem": "One under-the-radar recommendation"
}
Limit recommendations to 6, calendar to 14 days, trending_now to 4.`;

  return timed("mistral", async () => {
    const r = await axios.post("https://api.mistral.ai/v1/chat/completions",{
      model:"mistral-large-latest",
      messages:[{role:"user",content:prompt}],
      temperature:0.3,max_tokens:2000,
    },{
      headers:{Authorization:`Bearer ${ENV.MISTRAL_API_KEY}`,"Content-Type":"application/json"},
      timeout:35000
    });
    const text = r.data?.choices?.[0]?.message?.content||"";
    return JSON.parse(text.replace(/```json|```/g,"").trim());
  });
}

// ══════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ══════════════════════════════════════════════════════════════════
async function runPipeline(iso, countryName, continent) {
  const start=Date.now();
  console.log(`🌍 Pipeline: ${countryName} (${iso})`);
  const sources={};

  const safe = async (fn, fallback) => {
    try{ return await fn(); }catch(e){ return fallback; }
  };

  const [wiki,wv,places,weather,news,gNews,gdacs,reddit,tm,eb,phq,ta,yelp,geo,social] =
    await Promise.all([
      safe(()=>fetchWikipedia(countryName),   {summary:"",categories:[]}),
      safe(()=>fetchWikivoyage(countryName),   {sections:{},highlights:[]}),
      safe(()=>fetchFoursquare(countryName),   []),
      safe(()=>fetchWeather(countryName),      {now:null,forecast:[]}),
      safe(()=>fetchNews(countryName),         []),
      safe(()=>fetchGoogleNews(countryName),   []),
      safe(()=>fetchGDACS(countryName),        []),
      safe(()=>fetchReddit(countryName),       []),
      safe(()=>fetchTicketmaster(countryName,iso), []),
      safe(()=>fetchEventbrite(countryName),   []),
      safe(()=>fetchPredictHQ(countryName),    []),
      safe(()=>fetchTripAdvisor(countryName),  []),
      safe(()=>fetchYelp(countryName),         []),
      safe(()=>fetchGeoapify(countryName),     {}),
      safe(()=>fetchSocialTrends(countryName), []),
    ]);

  const allNews   = [...news,...gNews].slice(0,10);
  const allEvents = [...tm,...eb,...phq].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(0,12);
  const safetyFlags = [
    ...(gdacs||[]).map(g=>({...g,type:"disaster"})),
    ...allNews.filter(n=>n.risk_level==="high").map(n=>({
      date:n.published_at?.split("T")[0],type:"news",description:n.title,severity:"high",
    }))
  ].slice(0,6);

  // Mistral synthesis
  const ai = await safe(()=>runMistral(countryName,continent,{wiki,wv,places,weather,news:allNews,gdacs,reddit,events:allEvents,tripadvisor:ta,yelp,social}),null);

  const {error} = await supabase.from("country_intel").upsert({
    iso, country_name:countryName, continent, last_updated:new Date().toISOString(),
    wiki_summary:wiki.summary, wiki_highlights:wv.highlights||[], wiki_sections:wv.sections||{},
    top_places:places||[], weather_now:weather.now, weather_forecast:weather.forecast||[],
    news_headlines:allNews, safety_flags:safetyFlags, gdacs_alerts:gdacs||[],
    trending_spots:social||[], events:allEvents,
    tripadvisor:ta||[], yelp:yelp||[], geoapify:geo||{},
    sentiment:{reddit_posts:(reddit||[]).slice(0,4)},
    ai_briefing:ai?.briefing||null, ai_vibe:ai?.vibe||null,
    ai_recommendations:ai?.recommendations||[],
    ai_calendar:ai?.calendar||[], ai_trending_now:ai?.trending_now||[],
    ai_reddit_verdict:ai?.reddit_verdict||null,
    ai_safety_summary:ai?.safety_summary||null,
    ai_best_months:ai?.best_months||[],
    ai_avoid_if:ai?.avoid_if||null, ai_hidden_gem:ai?.hidden_gem||null,
  },{onConflict:"iso"});

  const duration=Date.now()-start;
  if(error){ console.error(`❌ DB error for ${countryName}:`,error.message); }
  else{ console.log(`✅ ${countryName} done in ${duration}ms`); }

  await supabase.from("pipeline_runs").insert({
    iso,status:error?"error":"success",
    sources:Object.fromEntries(Object.entries(sourceHealth).map(([k,v])=>[k,v.ok?"ok":"fail"])),
    duration_ms:duration,error:error?.message||null,
  });
  return {success:!error,duration};
}

// ── Staggered startup ─────────────────────────────────────────────
async function runStartupPipeline(){
  console.log("🚀 Startup pipeline — checking all 195 countries...");
  for(let i=0;i<COUNTRIES.length;i++){
    const {iso,name,continent}=COUNTRIES[i];
    const {data}=await supabase.from("country_intel").select("last_updated").eq("iso",iso).single();
    if(data?.last_updated){
      const age=Date.now()-new Date(data.last_updated).getTime();
      if(age<6*60*60*1000){console.log(`⏭  ${name} fresh`);continue;}
    }
    await runPipeline(iso,name,continent);
    await new Promise(r=>setTimeout(r,20000)); // 20s gap between countries
  }
  console.log("✅ Startup pipeline complete");
}

// ── Scheduled jobs ────────────────────────────────────────────────
cron.schedule("0 */6 * * *",async()=>{
  console.log("⏰ 6-hour refresh...");
  for(const c of COUNTRIES){
    await runPipeline(c.iso,c.name,c.continent);
    await new Promise(r=>setTimeout(r,15000));
  }
});
// Hot countries every 2 hours
cron.schedule("0 */2 * * *",async()=>{
  for(const c of COUNTRIES.filter(x=>HOT_ISOS.has(x.iso))){
    await runPipeline(c.iso,c.name,c.continent);
    await new Promise(r=>setTimeout(r,8000));
  }
});

// ══════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ══════════════════════════════════════════════════════════════════

app.get("/", (req,res)=>res.json({status:"GlobeVoyage API is live 🌍",countries:COUNTRIES.length}));

// Full intel for a country
app.get("/api/intel/:iso",async(req,res)=>{
  const {data,error}=await supabase.from("country_intel").select("*").eq("iso",req.params.iso.toUpperCase()).single();
  if(error||!data) return res.status(404).json({error:"No intel yet"});
  res.json(data);
});

// Lightweight brief (mobile)
app.get("/api/intel/:iso/brief",async(req,res)=>{
  const {data,error}=await supabase.from("country_intel")
    .select("iso,country_name,continent,last_updated,ai_briefing,ai_vibe,ai_recommendations,ai_trending_now,ai_calendar,ai_hidden_gem,ai_safety_summary,weather_now,safety_flags,events")
    .eq("iso",req.params.iso.toUpperCase()).single();
  if(error||!data) return res.status(404).json({error:"No intel yet"});
  res.json(data);
});

// All countries summary (for dashboard)
app.get("/api/intel",async(req,res)=>{
  const {continent,q}=req.query;
  let query=supabase.from("country_intel")
    .select("iso,country_name,continent,last_updated,ai_briefing,ai_vibe,ai_safety_summary,weather_now,ai_best_months,ai_hidden_gem");
  if(continent) query=query.eq("continent",continent);
  if(q) query=query.ilike("country_name",`%${q}%`);
  const {data,error}=await query.order("country_name");
  res.json({countries:data||[],total:(data||[]).length});
});

// Manual pipeline trigger
app.post("/api/pipeline/run/:iso",async(req,res)=>{
  const iso=req.params.iso.toUpperCase();
  const c=COUNTRIES.find(x=>x.iso===iso);
  if(!c) return res.status(404).json({error:"Country not in list"});
  res.json({message:`Pipeline started for ${c.name}`,iso});
  runPipeline(iso,c.name,c.continent);
});

// Trigger all (admin use only)
app.post("/api/pipeline/run-all",async(req,res)=>{
  res.json({message:"Full pipeline started for all 195 countries"});
  runStartupPipeline();
});

// Pipeline status
app.get("/api/pipeline/status",async(req,res)=>{
  const {data:runs}=await supabase.from("pipeline_runs")
    .select("iso,status,duration_ms,ran_at,error")
    .order("ran_at",{ascending:false}).limit(100);
  const {data:intel}=await supabase.from("country_intel")
    .select("iso,country_name,continent,last_updated")
    .order("last_updated",{ascending:false});
  const total=COUNTRIES.length;
  const done=(intel||[]).length;
  res.json({total_countries:total,countries_processed:done,coverage_pct:Math.round(done/total*100),recent_runs:runs||[],country_freshness:intel||[]});
});

// ── SYSTEM HEALTH CHECK ───────────────────────────────────────────
app.get("/api/health",async(req,res)=>{
  const checks={};
  const t=Date.now();

  // Supabase
  try{
    const {data,error}=await supabase.from("country_intel").select("count",{count:"exact",head:true});
    checks.supabase={ok:!error,label:"Supabase DB",detail:error?error.message:`Connected`,ms:Date.now()-t};
  }catch(e){checks.supabase={ok:false,label:"Supabase DB",detail:e.message};}

  // Mistral
  checks.mistral={
    ok:!!ENV.MISTRAL_API_KEY,
    label:"Mistral AI",
    detail:ENV.MISTRAL_API_KEY?"API key configured":"No API key",
    ...sourceHealth.mistral,
  };

  // All data sources
  const sources=[
    {key:"wikipedia",label:"Wikipedia"},
    {key:"wikivoyage",label:"Wikivoyage"},
    {key:"foursquare",label:"Foursquare Places"},
    {key:"openweathermap",label:"OpenWeatherMap"},
    {key:"newsapi",label:"News API"},
    {key:"google_news",label:"Google News RSS"},
    {key:"gdacs",label:"GDACS Disasters"},
    {key:"reddit",label:"Reddit"},
    {key:"ticketmaster",label:"Ticketmaster"},
    {key:"eventbrite",label:"Eventbrite"},
    {key:"predicthq",label:"PredictHQ"},
    {key:"tripadvisor",label:"TripAdvisor"},
    {key:"yelp",label:"Yelp"},
    {key:"geoapify",label:"Geoapify"},
    {key:"social_apify",label:"Social (Apify)"},
    {key:"social_reddit_proxy",label:"Social (Reddit proxy)"},
  ];
  sources.forEach(s=>{
    const h=sourceHealth[s.key];
    checks[s.key]={
      ok:h?h.ok:null,
      label:s.label,
      detail:h?(h.ok?`Last OK (${h.response_ms}ms)`:h.error):"Not yet tested",
      last_check:h?.last_check||null,
      success_count:h?.success_count||0,
      fail_count:h?.fail_count||0,
    };
  });

  // ENV key presence
  const envKeys={
    MISTRAL_API_KEY:"Mistral",FOURSQUARE_API_KEY:"Foursquare",
    OPENWEATHER_API_KEY:"OpenWeatherMap",TICKETMASTER_API_KEY:"Ticketmaster",
    EVENTBRITE_API_KEY:"Eventbrite",PREDICTHQ_API_KEY:"PredictHQ",
    NEWS_API_KEY:"NewsAPI",REDDIT_CLIENT_ID:"Reddit",
    TRIPADVISOR_API_KEY:"TripAdvisor",YELP_API_KEY:"Yelp",
    GEOAPIFY_API_KEY:"Geoapify",APIFY_API_KEY:"Apify (Social)",
  };
  checks.env_keys={
    ok:true,label:"API Keys",
    keys:Object.entries(envKeys).map(([k,label])=>({label,configured:!!process.env[k]}))
  };

  // Pipeline stats
  const {data:pipeData}=await supabase.from("country_intel")
    .select("iso,last_updated",{count:"exact"});
  const freshCutoff=Date.now()-6*60*60*1000;
  const freshCount=(pipeData||[]).filter(r=>new Date(r.last_updated).getTime()>freshCutoff).length;
  checks.pipeline={
    ok:freshCount>0,label:"Pipeline",
    detail:`${(pipeData||[]).length}/${COUNTRIES.length} countries processed, ${freshCount} fresh (<6h)`,
    total:COUNTRIES.length,
    processed:(pipeData||[]).length,
    fresh:freshCount,
  };

  const allOk=Object.values(checks).filter(c=>c.ok!==null).every(c=>c.ok===true);
  res.json({status:allOk?"healthy":"degraded",timestamp:new Date().toISOString(),checks});
});

// Countries list
app.get("/api/countries",(req,res)=>{
  const byCont={};
  COUNTRIES.forEach(c=>{ if(!byCont[c.continent])byCont[c.continent]=[]; byCont[c.continent].push(c); });
  res.json({total:COUNTRIES.length,by_continent:byCont,all:COUNTRIES});
});

// ── Texture + GeoJSON proxies (unchanged) ─────────────────────────
const TEXTURES={
  "earth-day":"https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg",
  "earth-night":"https://unpkg.com/three-globe@2.30.0/example/img/earth-night.jpg",
  "earth-clouds":"https://unpkg.com/three-globe@2.30.0/example/img/earth-clouds.png",
  "earth-water":"https://unpkg.com/three-globe@2.30.0/example/img/earth-water.png",
};
app.get("/texture/:name",(req,res)=>{
  const url=TEXTURES[req.params.name];
  if(!url)return res.status(404).end();
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public,max-age=86400");
  res.setHeader("Content-Type",url.endsWith(".png")?"image/png":"image/jpeg");
  https.get(url,u=>u.pipe(res)).on("error",()=>res.status(502).end());
});

let geojsonCache=null,geojsonFetching=false,geojsonWaiters=[];
function fetchGeoJSON(cb){
  if(geojsonCache)return cb(null,geojsonCache);
  geojsonWaiters.push(cb);
  if(geojsonFetching)return;
  geojsonFetching=true;
  let data="";
  https.get("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",res=>{
    res.on("data",c=>data+=c);
    res.on("end",()=>{
      try{
        const p=JSON.parse(data);
        p.features=p.features.map(f=>({type:"Feature",properties:{
          name:f.properties.NAME||"Unknown",iso:f.properties.ISO_A3||f.properties.NAME||"Unknown",
          continent:f.properties.CONTINENT||"",pop:f.properties.POP_EST||0,
          subregion:f.properties.SUBREGION||""},geometry:f.geometry}));
        geojsonCache=p;
        geojsonWaiters.splice(0).forEach(w=>w(null,geojsonCache));
      }catch(e){geojsonWaiters.splice(0).forEach(w=>w(e,null));}
      geojsonFetching=false;
    });
  }).on("error",e=>{geojsonFetching=false;geojsonWaiters.splice(0).forEach(w=>w(e,null));});
}
app.get("/geodata",(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public,max-age=3600");
  fetchGeoJSON((err,data)=>err?res.status(502).json({error:"geo fail"}):res.json(data));
});
fetchGeoJSON(()=>console.log("GeoJSON cached ✓"));

// ── Destinations CRUD ─────────────────────────────────────────────
app.get("/api/destinations",async(req,res)=>{
  const{data,error}=await supabase.from("destinations").select("*");
  if(error)return res.status(500).json({error:error.message});
  res.json(data);
});
app.get("/api/destinations/:id",async(req,res)=>{
  const{data,error}=await supabase.from("destinations").select("*").eq("id",req.params.id).single();
  if(error)return res.status(404).json({error:error.message});
  res.json(data);
});
app.post("/api/destinations",async(req,res)=>{
  const{name,country,description,image_url,price,iso,lat,lng}=req.body;
  const{data,error}=await supabase.from("destinations").insert([{name,country,description,image_url,price,iso,lat,lng}]).select();
  if(error)return res.status(500).json({error:error.message});
  res.status(201).json(data[0]);
});
app.put("/api/destinations/:id",async(req,res)=>{
  const{name,country,description,image_url,price}=req.body;
  const{data,error}=await supabase.from("destinations").update({name,country,description,image_url,price}).eq("id",req.params.id).select();
  if(error)return res.status(500).json({error:error.message});
  res.json(data[0]);
});
app.delete("/api/destinations/:id",async(req,res)=>{
  const{error}=await supabase.from("destinations").delete().eq("id",req.params.id);
  if(error)return res.status(500).json({error:error.message});
  res.json({message:"Deleted"});
});

// ── Globe page (keep your existing /globe route here) ─────────────
app.get("/globe",(req,res)=>{
  res.setHeader("Content-Type","text/html");
  // ... paste your existing /globe HTML response here unchanged
  res.send("<html><body><h1>Globe - paste existing /globe route here</h1></body></html>");
});

const PORT=process.env.PORT||3000;
app.listen(PORT,async()=>{
  console.log(`GlobeVoyage API on port ${PORT} — ${COUNTRIES.length} countries`);
  setTimeout(runStartupPipeline,12000);
});
