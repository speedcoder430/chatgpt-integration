// Import necessary modules
const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const moment = require("moment");
const cron = require("node-cron"); // Added for scheduling tasks

// Load environment variables from .env file
dotenv.config();

// Create express app
const app = express();
app.use(express.json());

// Define external API URLs and keys from environment variables
const JBOARD_API_URL = process.env.JBOARD_API_URL;
const API_KEY = process.env.JBOARD_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Middleware to parse JSON requests
app.use(express.json());

// Function to get recent employers created within the last 24 hours
async function getRecentEmployers() {
  try {
    const allRecentEmployers = [];
    let currentPage = 1;
    const perPage = 15;
    while (true) {
      const response = await axios.get(`${JBOARD_API_URL}/employers`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        params: {
          page: currentPage,
          per_page: perPage,
        },
      });

      if (response.status !== 200)
        throw new Error("Failed to fetch employers data");

      const employersData = response.data;
      // const recentEmployers = employersData.items.filter((employer) => {
      //   const createdAt = moment(employer.created_at);
      //   return moment().diff(createdAt, "hours") <= 24;
      // });
      
      if (!employersData || !Array.isArray(employersData.items)) {
        throw new Error("Unexpected data structure from API");
      }    

      console.log(employersData);

      allRecentEmployers.push(...employersData.items);

      if (currentPage >= employersData.last_page) break;
      currentPage++;
    }
    return allRecentEmployers;
  } catch (error) {
    console.error("Error fetching employer data:", error);
    throw error;
  }
}

// Function to send data to ChatGPT and get updated information
async function updateEmployerInfo(employer) {
  try {
    const prompt = `Please respond with a JSON object that includes updated fields for 'website' and 'description' for the following employer. Search the internet to find the correct company platform domain, not the LinkedIn profile link or others. And if the description is empty, please make a professional summary about the company with 5 or 7 sentences.
    - Name: ${employer.name}
    - Current Website: ${employer.website}
    - Description: ${employer.description}
    !!! Respond only with JSON format. Do not include \`\`\`json\\n{\\n 
    {
        "website": "updated website URL here",
        "description": "updated description here"
    }`;

    console.log("prompt: ", prompt);

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const completion = response.data.choices[0].message.content;
    console.log("chatgpt resposne : ", completion);

    try {
      const jsonMatch = completion;
      const updatedData = JSON.parse(jsonMatch);

      const updateResponse = await axios.patch(
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

      return updateResponse.data;
    } catch (parseError) {
      console.error("Parsing error in ChatGPT response:", parseError);
      throw new Error("ChatGPT did not return valid JSON");
    }
  } catch (error) {
    console.error("Error updating employer info via ChatGPT:", error.message);
    throw error;
  }
}

// async function postNewBlog(title) {
//   const alias = title.trim().toLowerCase().replace(/\s+/g, "-");
//   function getFormattedDate() {
//     const today = new Date();
//     const year = today.getFullYear();
//     const month = String(today.getMonth() + 1).padStart(2, "0"); // Months are 0-based
//     const day = String(today.getDate()).padStart(2, "0");
//     return `${year}-${month}-${day}`;
//   }
//   try {
//     const prompt = "Write a professional and SEO-friendly blog post about career development for Workday professionals. Use the following structure: 1. Introduction: Start with a hook that addresses challenges or opportunities in advancing a career in Workday. 2. Main Content: Provide actionable advice, including best practices for skill enhancement, certifications, networking, and leveraging Workday’s ecosystem for career growth. 3. Examples and Insights: Include examples of career paths, success stories, or trends in the Workday job market. 4. Conclusion: Summarize the key takeaways and include a call to action encouraging readers to explore more resources or take the next step in their career journey. Ensure the content is tailored for Workday professionals, engaging, and focused on the category 'Career Focus.' Use a professional yet approachable tone. Title the blog with a compelling phrase that aligns with the topic, such as 'Unlocking Career Success in Workday: Expert Strategies for Professionals. !!! Only answer with the blog. Do not include any other answer part.";
//     const response = await axios.post(
//       "https://api.openai.com/v1/chat/completions",
//       {
//         model: "gpt-4o",
//         messages: [{ role: "user", content: prompt }],
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${OPENAI_API_KEY}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );
//     const completion = response.data.choices[0].message.content;

//     function markdownToHTML(markdown) {
//       // Replace headers with <h1>, <h2>, etc.
//       let html = markdown
//         .replace(/^# (.*$)/gm, '<h1>$1</h1>')        // Convert # header to <h1>
//         .replace(/^## (.*$)/gm, '<h2>$1</h2>')       // Convert ## header to <h2>
//         .replace(/^### (.*$)/gm, '<h3>$1</h3>')      // Convert ### header to <h3>
//         .replace(/^#### (.*$)/gm, '<h4>$1</h4>')     // Convert #### header to <h4>
//         .replace(/^##### (.*$)/gm, '<h5>$1</h5>')    // Convert ##### header to <h5>
//         .replace(/^###### (.*$)/gm, '<h6>$1</h6>')   // Convert ###### header to <h6>
//         .replace(/\n/g, '<br>')                       // Add <br> for new lines
//         .replace(/^\* (.*$)/gm, '<ul><li>$1</li></ul>')  // Convert * item to <ul><li></li></ul>
//         .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>') // Bold text with ** or __
    
//       return html;
//     }

//     const htmlCompletion = markdownToHTML(completion);

//     console.log(htmlCompletion);
//     function generateSEOData(title, htmlCompletion) {
//       const seoTitle = title.length > 17 ? title.slice(0, 14) + "..." : title;
//       const seoDescription = htmlCompletion.length > 50 ? htmlCompletion.slice(0, 47) + "..." : htmlCompletion;
//       return { seoTitle, seoDescription };
//     }
//     const { seoTitle, seoDescription } = generateSEOData(title, htmlCompletion);

//     console.log({
//       alias: alias,
//       title: title,
//       content: htmlCompletion,
//       image:
//         "https://jboard-tenant.s3.us-west-1.amazonaws.com/blogs/UhaaPgl54PHqFmmgxbAqaiXvsNrFMB8ABUclRAQu.jpg",
//       author: "Dan Park",
//       blog_category_id: 30057,
//       posted_at: getFormattedDate(),
//       featured: true,
//       status: "active",
//       seo_title: seoTitle,
//       seo_description: seoDescription,
//     });
//     try {
//       const createBlogResponse = await axios.post(
//         `${JBOARD_API_URL}/blogs`,
//         {
//           alias: alias,
//           title: title,
//           content: htmlCompletion,
//           image:
//             "https://jboard-tenant.s3.us-west-1.amazonaws.com/blogs/UhaaPgl54PHqFmmgxbAqaiXvsNrFMB8ABUclRAQu.jpg",
//           author: "Dan Park",
//           blog_category_id: 30057,
//           posted_at: getFormattedDate(),
//           featured: true,
//           status: "active",
//           seo_title: seoTitle,
//           seo_description: seoDescription,
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${API_KEY}`,
//             "Content-Type": "application/json",
//           },
//         }
//       );
//       console.log(createBlogResponse.data);
//       return createBlogResponse.data;
//     } catch (parseError) {
//       console.error("Parsing error in ChatGPT response:", parseError);
//       throw new Error("ChatGPT did not return valid JSON");
//     }
//   } catch (error) {
//     console.error("Error updating employer info via ChatGPT:", error.message);
//     throw error;
//   }
// }

// Endpoint to fetch recent employers
app.get("/api/employers", async (req, res) => {
  try {
    const recentEmployers = await getRecentEmployers();
    res.json(recentEmployers);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error fetching employer data", message: error.message });
  }
});

// app.get("/api/new-blog", async (req, res) => {
//   try {
//     const newBlog = await postNewBlog("New Test Blog");
//     res.json(newBlog);
//   } catch (error) {
//     res
//       .status(500)
//       .json({ error: "Error fetching employer data", message: error.message });
//   }
// });

// Endpoint to fetch and update employers with ChatGPT
app.get("/api/update-employers", async (req, res) => {
  try {
    const recentEmployers = await getRecentEmployers();

    const updatedEmployers = await Promise.all(
      recentEmployers.map(async (employer) => {
        console.log("employer", employer)
        const updatedInfo = await updateEmployerInfo(employer);
        return { ...employer, ...updatedInfo };
      })
    );

    res.json(updatedEmployers);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error updating employer data", message: error.message });
  }
});

// Schedule the job to run every 24 hours
cron.schedule("5 14 * * *", async () => {
  console.log("Running scheduled job: Updating employer data...");
  try {
    const recentEmployers = await getRecentEmployers();

    await Promise.all(
      recentEmployers.map(async (employer) => {
        await updateEmployerInfo(employer);
      })
    );

    console.log("Scheduled job completed successfully.");
  } catch (error) {
    console.error("Error during scheduled job:", error.message);
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
