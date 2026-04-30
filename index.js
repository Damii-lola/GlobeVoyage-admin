// index.js — Render Backend (Node/Express)
// All env vars live here on Render dashboard

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// Supabase client — set these in Render environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ──────────────────────────────────────────────
// HEALTH CHECK
// ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "GlobeVoyage API is live 🌍" });
});

// ──────────────────────────────────────────────
// DESTINATIONS — used by Admin, Preview & App
// ──────────────────────────────────────────────

// GET all destinations
app.get("/api/destinations", async (req, res) => {
  const { data, error } = await supabase.from("destinations").select("*");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET single destination
app.get("/api/destinations/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("destinations")
    .select("*")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// POST create destination (admin only)
app.post("/api/destinations", async (req, res) => {
  const { name, country, description, image_url, price } = req.body;
  const { data, error } = await supabase
    .from("destinations")
    .insert([{ name, country, description, image_url, price }])
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

// PUT update destination (admin only)
app.put("/api/destinations/:id", async (req, res) => {
  const { name, country, description, image_url, price } = req.body;
  const { data, error } = await supabase
    .from("destinations")
    .update({ name, country, description, image_url, price })
    .eq("id", req.params.id)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// DELETE destination (admin only)
app.delete("/api/destinations/:id", async (req, res) => {
  const { error } = await supabase
    .from("destinations")
    .delete()
    .eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Deleted successfully" });
});

// ──────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GlobeVoyage API running on port ${PORT}`));
