const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cron = require("node-cron");

dotenv.config();

const app = express();
app.use(express.json());

const JBOARD_API_URL = process.env.JBOARD_API_URL;
const API_KEY = process.env.JBOARD_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function getEmployersByPage(page = 1, perPage = 15) {
  const response = await axios.get(`${JBOARD_API_URL}/employers`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    params: {
      page,
      per_page: perPage,
    },
  });

  if (response.status !== 200 || !response.data || !Array.isArray(response.data.items)) {
    throw new Error("Failed to fetch employers data or unexpected structure");
  }

  return response.data;
}

async function fetchAndUpdateEmployers(page = 1, perPage = 15) {
  try {
    const employersData = await getEmployersByPage(page, perPage);
    const employers = employersData.items;

    if (employers.length === 0) return false;

    for (const employer of employers) {
      await updateEmployerInfo(employer);
    }

    return employersData.current_page < employersData.last_page;
  } catch (error) {
    console.error("Error fetching and updating employers:", error.message);
    throw error;
  }
}

function extractValidJSON(inputString) {
  const jsonMatch = inputString.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error("Error parsing JSON:", error.message);
    }
  }
  return null;
}

async function updateEmployerInfo(employer) {
  try {
    const prompt = `Please respond with a JSON object that includes updated fields for 'website' and 'description' for the following employer. !! Search the internet to find the correct company platform domain, not the LinkedIn profile link or others.!! And if the description is empty, please make a professional summary about the company with 5 or 7 sentences. - Name: ${employer.name} - Current Website: ${employer.website} - Description: ${employer.description} !!! Respond ONLY with JSON format. Do not include anything else. !!! {"website": "updated website URL here", "description": "updated description here"}`;

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [{ role: "system", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const completion = response.data.choices[0].message.content;
    const updatedData = extractValidJSON(completion);

    if (updatedData) {
      await axios.patch(
        `${JBOARD_API_URL}/employers/${employer.id}`,
        {
          ...employer,
          website: updatedData.website || employer.website,
          description: updatedData.description || employer.description,
        },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (error) {
    console.error("Error updating employer info via ChatGPT:", error.message);
  }
}

async function processEmployersUntilDone(perPage = 15) {
  let page = 1;
  while (true) {
    const hasMorePages = await fetchAndUpdateEmployers(page, perPage);
    if (!hasMorePages) break;
    page++;
  }
}

app.post("/test-employers", async (req, res) => {
  const { page, perPage } = req.body;
  try {
    await processEmployersUntilDone(perPage || 15);
    res.status(200).json({ message: "Employers processed successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

cron.schedule("0 * * * *", async () => {
  console.log("Running scheduled job: Fetching and updating employers...");
  try {
    const firstPageData = await getEmployersByPage();

    const newEmployers = firstPageData.items.filter((employer) => {
      const createdAt = new Date(employer.created_at);
      return new Date() - createdAt <= 3600000;
    });

    if (newEmployers.length > 0) {
      await processEmployersUntilDone();
      console.log("All employers updated successfully.");
    } else {
      console.log("No new employers found in the last hour.");
    }
  } catch (error) {
    console.error("Error during scheduled job:", error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
