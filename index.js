const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Health check ───────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "GlobeVoyage API live 🌍" }));

// ─── Countries ──────────────────────────────────────────────────
app.get("/countries", async (req, res) => {
  const { data, error } = await supabase
    .from("countries")
    .select("*")
    .eq("published", true);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/countries/:code", async (req, res) => {
  const { data, error } = await supabase
    .from("countries")
    .select("*, destinations(*)")
    .eq("code", req.params.code.toUpperCase())
    .eq("published", true)
    .single();
  if (error) return res.status(404).json({ error: "Country not found" });
  res.json(data);
});

// ─── Destinations ────────────────────────────────────────────────
app.get("/destinations", async (req, res) => {
  const { data, error } = await supabase
    .from("destinations")
    .select("*, countries(name, code, flag_url)")
    .eq("published", true);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/destinations/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("destinations")
    .select("*, countries(name, code, flag_url)")
    .eq("id", req.params.id)
    .eq("published", true)
    .single();
  if (error) return res.status(404).json({ error: "Destination not found" });
  res.json(data);
});

// ─── Admin write routes (protect with secret header in prod) ─────
const adminAuth = (req, res, next) => {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_SECRET)
    return res.status(401).json({ error: "Unauthorized" });
  next();
};

app.post("/admin/countries", adminAuth, async (req, res) => {
  const { data, error } = await supabase.from("countries").insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/admin/countries/:id", adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("countries").update(req.body).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.post("/admin/destinations", adminAuth, async (req, res) => {
  const { data, error } = await supabase.from("destinations").insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/admin/destinations/:id", adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("destinations").update(req.body).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.listen(process.env.PORT || 4000, () =>
  console.log(`API running on port ${process.env.PORT || 4000}`)
);
