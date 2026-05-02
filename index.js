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

// ── ENV variables (set all of these in Render dashboard) ─────────────
const ENV = {
  MISTRAL_API_KEY:       process.env.MISTRAL_API_KEY,
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
  OPENWEATHER_API_KEY:   process.env.OPENWEATHER_API_KEY,
  TICKETMASTER_API_KEY:  process.env.TICKETMASTER_API_KEY,
  REDDIT_CLIENT_ID:      process.env.REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET:  process.env.REDDIT_CLIENT_SECRET,
  NEWS_API_KEY:          process.env.NEWS_API_KEY,
};

// ── Read bundled scripts ──────────────────────────────────────────────
let THREE_JS = "", EARCUT_JS = "";
try { THREE_JS  = fs.readFileSync(path.join(__dirname,"node_modules/three/build/three.min.js"),"utf8"); } catch(e){}
try { EARCUT_JS = fs.readFileSync(path.join(__dirname,"node_modules/earcut/src/earcut.js"),"utf8"); } catch(e){}

// ── Self-ping keepalive ───────────────────────────────────────────────
const SELF = process.env.RENDER_EXTERNAL_URL || "https://globevoyage-admin.onrender.com";
setInterval(() => {
  const mod = SELF.startsWith("https") ? https : http;
  mod.get(SELF + "/", r => r.resume()).on("error", ()=>{});
}, 4 * 60 * 1000);

// ════════════════════════════════════════════════════════════════════════
// ── DATA SOURCE FETCHERS ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

// ── 1. Wikipedia ──────────────────────────────────────────────────────
async function fetchWikipedia(countryName) {
  try {
    const search = await axios.get("https://en.wikipedia.org/w/api.php", {
      params: {
        action: "query", format: "json", list: "search",
        srsearch: countryName + " tourism travel", srlimit: 1,
      }, timeout: 8000
    });
    const title = search.data?.query?.search?.[0]?.title || countryName;
    const content = await axios.get("https://en.wikipedia.org/w/api.php", {
      params: {
        action: "query", format: "json", prop: "extracts",
        exintro: true, explaintext: true, titles: title,
      }, timeout: 8000
    });
    const pages = content.data?.query?.pages || {};
    const page  = Object.values(pages)[0];
    return { summary: page?.extract?.slice(0, 1200) || "", title };
  } catch(e) { return { summary: "", title: countryName }; }
}

// ── 2. Wikivoyage ─────────────────────────────────────────────────────
async function fetchWikivoyage(countryName) {
  try {
    const res = await axios.get("https://en.wikivoyage.org/w/api.php", {
      params: {
        action: "query", format: "json", prop: "extracts",
        explaintext: true, titles: countryName,
      }, timeout: 8000
    });
    const pages = res.data?.query?.pages || {};
    const page  = Object.values(pages)[0];
    const text  = page?.extract || "";
    // Extract sections: See, Do, Eat, Drink, Sleep, Stay safe
    const sections = {};
    ["See","Do","Eat","Drink","Sleep","Stay safe","Get in","Get around"].forEach(sec => {
      const match = text.match(new RegExp(`== ${sec} ==([\\s\\S]*?)(?===|$)`, "i"));
      if (match) sections[sec] = match[1].trim().slice(0, 600);
    });
    return { sections, full: text.slice(0, 2000) };
  } catch(e) { return { sections: {}, full: "" }; }
}

// ── 3. Google Places ─────────────────────────────────────────────────
async function fetchGooglePlaces(countryName, countryCode) {
  if (!ENV.GOOGLE_PLACES_API_KEY) return [];
  try {
    const search = await axios.get("https://maps.googleapis.com/maps/api/place/textsearch/json", {
      params: {
        query: `top tourist attractions in ${countryName}`,
        key: ENV.GOOGLE_PLACES_API_KEY,
        language: "en",
      }, timeout: 10000
    });
    const results = (search.data?.results || []).slice(0, 8);
    return results.map(p => ({
      name:      p.name,
      place_id:  p.place_id,
      lat:       p.geometry?.location?.lat,
      lng:       p.geometry?.location?.lng,
      rating:    p.rating,
      types:     p.types?.slice(0, 3),
      address:   p.formatted_address,
      photo_ref: p.photos?.[0]?.photo_reference || null,
      open_now:  p.opening_hours?.open_now,
    }));
  } catch(e) { return []; }
}

// ── 4. OpenWeatherMap ─────────────────────────────────────────────────
async function fetchWeather(countryName, lat, lon) {
  if (!ENV.OPENWEATHER_API_KEY) return { now: null, forecast: [] };
  try {
    const [nowRes, forecastRes] = await Promise.all([
      axios.get("https://api.openweathermap.org/data/2.5/weather", {
        params: { q: countryName, appid: ENV.OPENWEATHER_API_KEY, units: "metric" },
        timeout: 6000
      }),
      axios.get("https://api.openweathermap.org/data/2.5/forecast", {
        params: { q: countryName, appid: ENV.OPENWEATHER_API_KEY, units: "metric", cnt: 5 },
        timeout: 6000
      })
    ]);
    const n = nowRes.data;
    const now = {
      temp:       Math.round(n.main.temp),
      feels_like: Math.round(n.main.feels_like),
      condition:  n.weather[0].description,
      icon:       n.weather[0].icon,
      humidity:   n.main.humidity,
      wind:       Math.round(n.wind.speed * 3.6), // km/h
    };
    const forecast = (forecastRes.data?.list || []).slice(0, 5).map(f => ({
      date:      f.dt_txt.split(" ")[0],
      high:      Math.round(f.main.temp_max),
      low:       Math.round(f.main.temp_min),
      condition: f.weather[0].description,
      icon:      f.weather[0].icon,
    }));
    return { now, forecast };
  } catch(e) { return { now: null, forecast: [] }; }
}

// ── 5. News API ───────────────────────────────────────────────────────
async function fetchNews(countryName) {
  if (!ENV.NEWS_API_KEY) return [];
  try {
    const res = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q:        `${countryName} travel tourism safety`,
        language: "en",
        sortBy:   "publishedAt",
        pageSize: 10,
        apiKey:   ENV.NEWS_API_KEY,
      }, timeout: 8000
    });
    return (res.data?.articles || []).slice(0, 8).map(a => ({
      title:        a.title,
      url:          a.url,
      source:       a.source?.name,
      published_at: a.publishedAt,
      description:  a.description?.slice(0, 200),
      // Basic risk scoring based on keywords
      risk_level:   scoreNewsRisk(a.title + " " + (a.description || "")),
    }));
  } catch(e) { return []; }
}

function scoreNewsRisk(text) {
  const t = text.toLowerCase();
  if (/strike|protest|riot|attack|bomb|terror|earthquake|flood|hurricane|typhoon|tsunami|evacuation|emergency/.test(t)) return "high";
  if (/delay|cancell|warning|alert|caution|avoid|unrest|demonstration/.test(t)) return "medium";
  return "low";
}

// ── 6. GDACS (Global Disaster Alert) ─────────────────────────────────
async function fetchGDACS(countryName) {
  try {
    const res = await axios.get("https://www.gdacs.org/xml/rss.xml", {
      timeout: 8000,
      headers: { "User-Agent": "GlobeVoyage/1.0" }
    });
    const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });
    const items  = parsed?.rss?.channel?.item || [];
    const arr    = Array.isArray(items) ? items : [items];
    // Filter by country name
    const relevant = arr.filter(i =>
      (i.title || "").toLowerCase().includes(countryName.toLowerCase()) ||
      (i.description || "").toLowerCase().includes(countryName.toLowerCase())
    ).slice(0, 4);
    return relevant.map(i => ({
      event_type:  i["gdacs:eventtype"] || "Disaster",
      severity:    i["gdacs:alertlevel"] || "Unknown",
      description: i.title,
      date:        i.pubDate,
      url:         i.link,
    }));
  } catch(e) { return []; }
}

// ── 7. Reddit ─────────────────────────────────────────────────────────
let redditToken = null;
let redditTokenExpiry = 0;

async function getRedditToken() {
  if (!ENV.REDDIT_CLIENT_ID || !ENV.REDDIT_CLIENT_SECRET) return null;
  if (redditToken && Date.now() < redditTokenExpiry) return redditToken;
  try {
    const res = await axios.post(
      "https://www.reddit.com/api/v1/access_token",
      "grant_type=client_credentials",
      {
        auth: { username: ENV.REDDIT_CLIENT_ID, password: ENV.REDDIT_CLIENT_SECRET },
        headers: { "User-Agent": "GlobeVoyage/1.0", "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 6000,
      }
    );
    redditToken = res.data.access_token;
    redditTokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return redditToken;
  } catch(e) { return null; }
}

async function fetchReddit(countryName) {
  try {
    const token = await getRedditToken();
    const headers = token
      ? { Authorization: `Bearer ${token}`, "User-Agent": "GlobeVoyage/1.0" }
      : { "User-Agent": "GlobeVoyage/1.0" };

    const subs = ["travel", "solotravel", "backpacking", "travel_advice"];
    const posts = [];
    for (const sub of subs.slice(0, 2)) {
      try {
        const res = await axios.get(`https://oauth.reddit.com/r/${sub}/search`, {
          params: { q: countryName + " travel tips", sort: "top", t: "month", limit: 5 },
          headers, timeout: 7000
        });
        const items = res.data?.data?.children || [];
        items.forEach(c => {
          const d = c.data;
          posts.push({
            title:     d.title,
            score:     d.score,
            comments:  d.num_comments,
            url:       "https://reddit.com" + d.permalink,
            text:      (d.selftext || "").slice(0, 300),
          });
        });
      } catch(e) {}
    }
    return posts.slice(0, 8);
  } catch(e) { return []; }
}

// ── 8. Ticketmaster Events ────────────────────────────────────────────
async function fetchTicketmaster(countryName, isoCountryCode) {
  if (!ENV.TICKETMASTER_API_KEY) return [];
  try {
    const res = await axios.get("https://app.ticketmaster.com/discovery/v2/events.json", {
      params: {
        apikey:        ENV.TICKETMASTER_API_KEY,
        keyword:       countryName,
        countryCode:   isoCountryCode?.slice(0, 2) || "",
        size:          10,
        sort:          "date,asc",
        startDateTime: new Date().toISOString().split(".")[0] + "Z",
      }, timeout: 8000
    });
    const events = res.data?._embedded?.events || [];
    return events.slice(0, 8).map(e => ({
      name:    e.name,
      date:    e.dates?.start?.localDate,
      time:    e.dates?.start?.localTime,
      venue:   e._embedded?.venues?.[0]?.name,
      city:    e._embedded?.venues?.[0]?.city?.name,
      type:    e.classifications?.[0]?.segment?.name,
      url:     e.url,
      price:   e.priceRanges?.[0] ? `${e.priceRanges[0].currency} ${e.priceRanges[0].min}–${e.priceRanges[0].max}` : null,
      source:  "Ticketmaster",
    }));
  } catch(e) { return []; }
}

// ── 9. PredictHQ Events ───────────────────────────────────────────────
async function fetchPredictHQ(countryName) {
  if (!process.env.PREDICTHQ_API_KEY) return [];
  try {
    const res = await axios.get("https://api.predicthq.com/v1/events/", {
      params: {
        country:   countryName,
        active_from: new Date().toISOString().split("T")[0],
        limit:     10,
        sort:      "rank",
        "category[]": "concerts,festivals,performing-arts,sports,public-holidays,observances",
      },
      headers: { Authorization: `Bearer ${process.env.PREDICTHQ_API_KEY}` },
      timeout: 8000
    });
    return (res.data?.results || []).slice(0, 8).map(e => ({
      name:        e.title,
      date:        e.start,
      type:        e.category,
      description: e.description?.slice(0, 200),
      rank:        e.rank,
      source:      "PredictHQ",
    }));
  } catch(e) { return []; }
}

// ── 10. Google News (RSS) ─────────────────────────────────────────────
async function fetchGoogleNews(countryName) {
  try {
    const query = encodeURIComponent(`${countryName} travel tourism events 2025`);
    const res = await axios.get(
      `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`,
      { timeout: 8000, headers: { "User-Agent": "GlobeVoyage/1.0" } }
    );
    const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });
    const items  = parsed?.rss?.channel?.item || [];
    const arr    = Array.isArray(items) ? items : [items];
    return arr.slice(0, 8).map(i => ({
      title:        i.title,
      url:          i.link,
      source:       i.source?._ || i.source,
      published_at: i.pubDate,
      risk_level:   scoreNewsRisk(i.title || ""),
    }));
  } catch(e) { return []; }
}

// ── 11. Social Media Trends (via public search) ───────────────────────
// Note: Instagram/TikTok/X don't have public free APIs.
// We proxy via Apify's free scraper endpoints or use keyword trend proxies.
async function fetchSocialTrends(countryName) {
  // Using Reddit as the open social proxy (real social APIs require business approval)
  // When user sets up Meta/TikTok API keys, swap these out
  try {
    const token = await getRedditToken();
    const headers = token
      ? { Authorization: `Bearer ${token}`, "User-Agent": "GlobeVoyage/1.0" }
      : { "User-Agent": "GlobeVoyage/1.0" };
    const res = await axios.get("https://oauth.reddit.com/r/travel/search", {
      params: { q: `${countryName} beautiful trending 2025`, sort: "hot", limit: 5, t: "week" },
      headers, timeout: 7000
    });
    const posts = res.data?.data?.children || [];
    return posts.slice(0, 5).map(c => {
      const d = c.data;
      return {
        name:      d.title,
        platform:  "Reddit/r/travel",
        mentions:  d.score,
        sentiment: d.score > 500 ? "very_positive" : d.score > 100 ? "positive" : "neutral",
        url:       "https://reddit.com" + d.permalink,
        tip:       (d.selftext || "").slice(0, 150),
      };
    });
  } catch(e) { return []; }
}

// ════════════════════════════════════════════════════════════════════════
// ── MISTRAL AI SYNTHESIS ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

async function runMistralSynthesis(countryName, rawData) {
  if (!ENV.MISTRAL_API_KEY) {
    console.log("No Mistral key — skipping AI synthesis");
    return null;
  }

  const prompt = `You are a world-class travel intelligence analyst for GlobeVoyage.
You have just gathered the following raw data about ${countryName}. Your job is to synthesize this into actionable, honest travel intelligence.

RAW DATA:
---
WIKIPEDIA SUMMARY: ${rawData.wikiSummary?.slice(0, 600) || "N/A"}

WIKIVOYAGE SECTIONS: ${JSON.stringify(rawData.wikiSections || {}).slice(0, 800)}

TOP GOOGLE PLACES: ${JSON.stringify(rawData.places || []).slice(0, 600)}

WEATHER NOW: ${JSON.stringify(rawData.weather?.now || {})}

REDDIT POSTS (what real travellers say): ${rawData.redditPosts?.map(p => p.title).join(" | ").slice(0, 600) || "N/A"}

NEWS HEADLINES: ${rawData.newsHeadlines?.map(n => `[${n.risk_level}] ${n.title}`).join(" | ").slice(0, 600) || "N/A"}

GDACS DISASTER ALERTS: ${JSON.stringify(rawData.gdacs || []).slice(0, 400)}

EVENTS: ${rawData.events?.map(e => `${e.name} on ${e.date}`).join(" | ").slice(0, 500) || "None found"}

TRENDING SOCIAL CONTENT: ${rawData.trends?.map(t => t.name).join(" | ").slice(0, 400) || "N/A"}
---

Output ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "briefing": "2-3 sentence plain-English summary of what a traveller needs to know RIGHT NOW about ${countryName}",
  "recommendations": [
    {
      "title": "Name of activity or place",
      "type": "cultural|food|adventure|nature|nightlife|shopping|family",
      "when": "Best time of day or season",
      "why": "One sentence — what makes it special RIGHT NOW",
      "rating": 1-5,
      "risk": "none|low|medium|high"
    }
  ],
  "calendar": [
    {
      "date": "YYYY-MM-DD",
      "label": "Short label",
      "color": "green|amber|red",
      "reason": "Why this day is notable"
    }
  ],
  "trending_now": [
    {
      "name": "Place or experience name",
      "why_trending": "One line",
      "best_time": "Time of day",
      "warning": "Honest crowd/cost/access warning or null"
    }
  ],
  "safety_summary": "One honest sentence about current safety conditions",
  "best_months": ["Jan","Feb"],
  "avoid_if": "One sentence — who this destination is NOT for right now"
}

Keep recommendations to max 6. Keep calendar to upcoming 14 days only. Keep trending_now to max 4.`;

  try {
    const res = await axios.post(
      "https://api.mistral.ai/v1/chat/completions",
      {
        model:       "mistral-large-latest",
        messages:    [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens:  2000,
      },
      {
        headers: {
          Authorization: `Bearer ${ENV.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const text = res.data?.choices?.[0]?.message?.content || "";
    // Strip markdown fences if present
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch(e) {
    console.error(`Mistral error for ${countryName}:`, e.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════
// ── MAIN PIPELINE — runs for one country ─────────────────────────────
// ════════════════════════════════════════════════════════════════════════

async function runPipeline(iso, countryName) {
  const start = Date.now();
  console.log(`\n🌍 Pipeline starting: ${countryName} (${iso})`);
  const sources = {};

  try {
    // Run all fetchers in parallel (non-blocking — if one fails, others continue)
    const [
      wikiData, wikiVoyData, places, weather,
      news, gdacs, reddit, tmEvents, phqEvents,
      googleNews, trends
    ] = await Promise.allSettled([
      fetchWikipedia(countryName),
      fetchWikivoyage(countryName),
      fetchGooglePlaces(countryName, iso),
      fetchWeather(countryName, null, null),
      fetchNews(countryName),
      fetchGDACS(countryName),
      fetchReddit(countryName),
      fetchTicketmaster(countryName, iso),
      fetchPredictHQ(countryName),
      fetchGoogleNews(countryName),
      fetchSocialTrends(countryName),
    ]);

    const get  = (r, fallback) => r.status === "fulfilled" ? r.value : fallback;
    const wiki = get(wikiData,    { summary: "", title: countryName });
    const wv   = get(wikiVoyData, { sections: {}, full: "" });
    const pl   = get(places,      []);
    const wx   = get(weather,     { now: null, forecast: [] });
    const nw   = get(news,        []);
    const gd   = get(gdacs,       []);
    const rd   = get(reddit,      []);
    const tm   = get(tmEvents,    []);
    const ph   = get(phqEvents,   []);
    const gn   = get(googleNews,  []);
    const tr   = get(trends,      []);

    sources.wikipedia  = wikiData.status;
    sources.wikivoyage = wikiVoyData.status;
    sources.places     = places.status;
    sources.weather    = weather.status;
    sources.news       = news.status;
    sources.gdacs      = gdacs.status;
    sources.reddit     = reddit.status;
    sources.ticketmaster = tmEvents.status;
    sources.predicthq  = phqEvents.status;
    sources.googlenews = googleNews.status;
    sources.social     = trends.status;

    const allNews   = [...nw, ...gn].slice(0, 10);
    const allEvents = [...tm, ...ph].sort((a, b) => (a.date||"").localeCompare(b.date||"")).slice(0, 12);

    // Safety flags from GDACS + high-risk news
    const safetyFlags = [
      ...gd.map(g => ({ ...g, type: "disaster" })),
      ...allNews.filter(n => n.risk_level === "high").map(n => ({
        date: n.published_at?.split("T")[0],
        type: "news",
        description: n.title,
        severity: "high",
      }))
    ].slice(0, 6);

    // ── Run Mistral synthesis ──
    const aiResult = await runMistralSynthesis(countryName, {
      wikiSummary:   wiki.summary,
      wikiSections:  wv.sections,
      places:        pl,
      weather:       wx,
      redditPosts:   rd,
      newsHeadlines: allNews,
      gdacs:         gd,
      events:        allEvents,
      trends:        tr,
    });

    // ── Upsert into Supabase ──
    const { error } = await supabase
      .from("country_intel")
      .upsert({
        iso,
        country_name:      countryName,
        last_updated:      new Date().toISOString(),
        wiki_summary:      wiki.summary,
        wiki_highlights:   pl.slice(0, 4),
        wiki_sections:     wv.sections,
        top_places:        pl,
        weather_now:       wx.now,
        weather_forecast:  wx.forecast,
        news_headlines:    allNews,
        safety_flags:      safetyFlags,
        gdacs_alerts:      gd,
        trending_spots:    tr,
        events:            allEvents,
        sentiment:         { reddit_posts: rd.slice(0, 4) },
        ai_briefing:       aiResult?.briefing || null,
        ai_recommendations: aiResult?.recommendations || [],
        ai_calendar:       aiResult?.calendar || [],
        ai_trending_now:   aiResult?.trending_now || [],
      }, { onConflict: "iso" });

    if (error) throw error;

    const duration = Date.now() - start;
    console.log(`✅ ${countryName} done in ${duration}ms`);

    await supabase.from("pipeline_runs").insert({
      iso, status: "success", sources,
      duration_ms: duration
    });

    return { success: true, duration, sources };

  } catch(e) {
    console.error(`❌ Pipeline failed for ${countryName}:`, e.message);
    await supabase.from("pipeline_runs").insert({
      iso, status: "error", sources,
      duration_ms: Date.now() - start,
      error: e.message
    });
    return { success: false, error: e.message };
  }
}

// ── Country list — covers all GlobeVoyage destinations ────────────────
const COUNTRIES = [
  {iso:"FRA",name:"France"}, {iso:"USA",name:"United States"},
  {iso:"GBR",name:"United Kingdom"}, {iso:"JPN",name:"Japan"},
  {iso:"ITA",name:"Italy"}, {iso:"ESP",name:"Spain"},
  {iso:"DEU",name:"Germany"}, {iso:"AUS",name:"Australia"},
  {iso:"CAN",name:"Canada"}, {iso:"BRA",name:"Brazil"},
  {iso:"IND",name:"India"}, {iso:"CHN",name:"China"},
  {iso:"RUS",name:"Russia"}, {iso:"ZAF",name:"South Africa"},
  {iso:"EGY",name:"Egypt"}, {iso:"NGA",name:"Nigeria"},
  {iso:"MEX",name:"Mexico"}, {iso:"ARG",name:"Argentina"},
  {iso:"SAU",name:"Saudi Arabia"}, {iso:"IDN",name:"Indonesia"},
  {iso:"TUR",name:"Turkey"}, {iso:"KEN",name:"Kenya"},
  {iso:"GHA",name:"Ghana"}, {iso:"ETH",name:"Ethiopia"},
  {iso:"MAR",name:"Morocco"}, {iso:"PER",name:"Peru"},
  {iso:"COL",name:"Colombia"}, {iso:"NZL",name:"New Zealand"},
  {iso:"THA",name:"Thailand"}, {iso:"VNM",name:"Vietnam"},
  {iso:"KOR",name:"South Korea"}, {iso:"PRT",name:"Portugal"},
  {iso:"NLD",name:"Netherlands"}, {iso:"GRC",name:"Greece"},
  {iso:"PAK",name:"Pakistan"}, {iso:"UKR",name:"Ukraine"},
  {iso:"SGP",name:"Singapore"}, {iso:"CHE",name:"Switzerland"},
  {iso:"SWE",name:"Sweden"}, {iso:"NOR",name:"Norway"},
];

// ── Staggered startup pipeline ────────────────────────────────────────
// Runs on deploy — staggers each country 30 seconds apart so Render
// doesn't get hammered with 40 parallel requests on boot
async function runStartupPipeline() {
  console.log("🚀 Starting initial pipeline run for all countries...");
  for (let i = 0; i < COUNTRIES.length; i++) {
    const { iso, name } = COUNTRIES[i];
    // Skip if recently updated (within 6 hours)
    const { data } = await supabase
      .from("country_intel")
      .select("last_updated")
      .eq("iso", iso)
      .single();
    if (data?.last_updated) {
      const age = Date.now() - new Date(data.last_updated).getTime();
      if (age < 6 * 60 * 60 * 1000) {
        console.log(`⏭  ${name} — fresh (${Math.round(age/60000)}min ago), skipping`);
        continue;
      }
    }
    await runPipeline(iso, name);
    // 30-second gap between countries
    if (i < COUNTRIES.length - 1) await new Promise(r => setTimeout(r, 30000));
  }
  console.log("✅ Initial pipeline complete");
}

// ── Scheduled refresh ─────────────────────────────────────────────────
// Every 6 hours — refresh all countries in rotation
// Staggers them: 5 countries at a time with gaps
cron.schedule("0 */6 * * *", async () => {
  console.log("⏰ Scheduled refresh starting...");
  for (let i = 0; i < COUNTRIES.length; i++) {
    await runPipeline(COUNTRIES[i].iso, COUNTRIES[i].name);
    await new Promise(r => setTimeout(r, 15000)); // 15s between each
  }
});

// High-traffic countries refresh more often (every 2 hours)
const HOT_COUNTRIES = ["FRA","USA","GBR","JPN","ITA","ESP","THA","AUS"];
cron.schedule("0 */2 * * *", async () => {
  for (const iso of HOT_COUNTRIES) {
    const c = COUNTRIES.find(x => x.iso === iso);
    if (c) await runPipeline(c.iso, c.name);
    await new Promise(r => setTimeout(r, 10000));
  }
});

// ════════════════════════════════════════════════════════════════════════
// ── API ENDPOINTS ────────────────────────────────════════════════════
// ════════════════════════════════════════════════════════════════════════

app.get("/", (req, res) => res.json({ status: "GlobeVoyage API is live 🌍" }));

// Get full intel for a country
app.get("/api/intel/:iso", async (req, res) => {
  const { data, error } = await supabase
    .from("country_intel")
    .select("*")
    .eq("iso", req.params.iso.toUpperCase())
    .single();
  if (error || !data) return res.status(404).json({ error: "No intel for this country yet" });
  res.json(data);
});

// Get Mistral briefing + recommendations only (lightweight for mobile)
app.get("/api/intel/:iso/brief", async (req, res) => {
  const { data, error } = await supabase
    .from("country_intel")
    .select("iso,country_name,last_updated,ai_briefing,ai_recommendations,ai_trending_now,ai_calendar,weather_now,safety_flags,events")
    .eq("iso", req.params.iso.toUpperCase())
    .single();
  if (error || !data) return res.status(404).json({ error: "No intel yet" });
  res.json(data);
});

// Manually trigger a single country refresh
app.post("/api/pipeline/run/:iso", async (req, res) => {
  const iso  = req.params.iso.toUpperCase();
  const country = COUNTRIES.find(c => c.iso === iso);
  if (!country) return res.status(404).json({ error: "Country not in pipeline list" });
  res.json({ message: `Pipeline started for ${country.name}` });
  // Run async so response returns immediately
  runPipeline(iso, country.name);
});

// Pipeline status
app.get("/api/pipeline/status", async (req, res) => {
  const { data } = await supabase
    .from("pipeline_runs")
    .select("iso,status,duration_ms,ran_at,error")
    .order("ran_at", { ascending: false })
    .limit(50);
  const { data: intel } = await supabase
    .from("country_intel")
    .select("iso,country_name,last_updated")
    .order("last_updated", { ascending: false });
  res.json({ recent_runs: data || [], country_freshness: intel || [] });
});

// ── Texture proxy (unchanged) ─────────────────────────────────────────
const TEXTURES = {
  "earth-day":    "https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg",
  "earth-night":  "https://unpkg.com/three-globe@2.30.0/example/img/earth-night.jpg",
  "earth-clouds": "https://unpkg.com/three-globe@2.30.0/example/img/earth-clouds.png",
  "earth-water":  "https://unpkg.com/three-globe@2.30.0/example/img/earth-water.png",
};
app.get("/texture/:name", (req, res) => {
  const url = TEXTURES[req.params.name];
  if (!url) return res.status(404).end();
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public,max-age=86400");
  res.setHeader("Content-Type", url.endsWith(".png")?"image/png":"image/jpeg");
  https.get(url, u => u.pipe(res)).on("error",()=>res.status(502).end());
});

// ── GeoJSON proxy (unchanged) ─────────────────────────────────────────
let geojsonCache=null, geojsonFetching=false, geojsonWaiters=[];
function fetchGeoJSON(cb){
  if(geojsonCache) return cb(null,geojsonCache);
  geojsonWaiters.push(cb);
  if(geojsonFetching) return;
  geojsonFetching=true;
  let data="";
  https.get("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",res=>{
    res.on("data",c=>data+=c);
    res.on("end",()=>{
      try{
        const p=JSON.parse(data);
        p.features=p.features.map(f=>({
          type:"Feature",
          properties:{
            name:f.properties.NAME||"Unknown",
            iso:f.properties.ISO_A3||f.properties.NAME||"Unknown",
            continent:f.properties.CONTINENT||"",
            pop:f.properties.POP_EST||0,
            subregion:f.properties.SUBREGION||"",
          },
          geometry:f.geometry
        }));
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

// ── Destinations CRUD (unchanged) ─────────────────────────────────────
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
  const { name, country, description, image_url, price, iso, lat, lng } = req.body;
  const { data, error } = await supabase.from("destinations").insert([{ name, country, description, image_url, price, iso, lat, lng }]).select();
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

// ── Globe page (unchanged from previous version) ──────────────────────
// ... (keep your existing /globe route exactly as it is)

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`GlobeVoyage API running on port ${PORT}`);
  // Start pipeline after a 10-second delay to let server stabilise
  setTimeout(runStartupPipeline, 10000);
});
