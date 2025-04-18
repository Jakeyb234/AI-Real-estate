// backend/api/comps.js (Node.js + Express + Cheerio)

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cheerio from "cheerio";
import { config } from "dotenv";
import { OpenAI } from "openai";

config();
const app = express();
const PORT = process.env.PORT || 3001;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.json());

// Helper to extract comps from Rightmove (basic example, limited fields)
async function scrapeRightmove(postcode) {
  const url = `https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=POSTCODE^${postcode}`;
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const comps = [];
  $(".propertyCard-wrapper").each((_, el) => {
    const address = $(el).find(".propertyCard-address").text().trim();
    const priceText = $(el).find(".propertyCard-priceValue").text().replace(/[^0-9]/g, "");
    const price = parseInt(priceText);
    const title = $(el).find(".propertyCard-title").text();
    const bedsMatch = title.match(/(\d+)[-\s]?bed/);
    const beds = bedsMatch ? parseInt(bedsMatch[1]) : null;

    comps.push({
      address,
      price,
      beds,
      baths: null,
      sqft: null,
      soldDate: null,
    });
  });
  return comps.slice(0, 10);
}

app.post("/api/comps", async (req, res) => {
  const { query } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "Extract key info from real estate query." },
        { role: "user", content: query }
      ],
      functions: [
        {
          name: "get_comps_query",
          parameters: {
            type: "object",
            properties: {
              postcode: { type: "string" },
              bedrooms: { type: "number" },
            },
            required: ["postcode"]
          }
        }
      ],
      function_call: { name: "get_comps_query" }
    });

    const { postcode } = completion.choices[0].message.function_call.arguments;
    const comps = await scrapeRightmove(postcode);
    res.json({ comps });
  } catch (err) {
    console.error("Error in /api/comps:", err);
    res.status(500).json({ error: "Failed to retrieve comps" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
