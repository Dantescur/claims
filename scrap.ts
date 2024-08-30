import axios from "axios";
import * as cheerio from "cheerio";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { WebSocketServer } from "ws"; // Import WebSocket library

const url = "http://api.chatwars.me/webview/map";
const logFilePath = path.join(__dirname, "log.txt");

// In-memory Set to track recorded entries
const recordedEntries = new Set<string>();

// Create a WebSocket server
const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws) => {
  console.log("New client connected");

  // Send a welcome message to the client
  ws.send("Connected to the notification service!");

  // Handle disconnection
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

function logMessage(message: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;

  console.log(logEntry.trim());

  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) {
      console.error(`Failed to write log: ${err}`);
    }
  });
}

async function checkForNewEntries() {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    $(".map-cell").each((_, element) => {
      const bottomLeftText = $(element).find(".bottom-left-text").text();
      const bottomRightText = $(element).find(".bottom-right-text").text();
      const topRightText = $(element).find(".top-right-text").text().trim();
      const location = `${bottomRightText}${topRightText}`;

      if (bottomLeftText.includes("⚔️")) {
        if (!recordedEntries.has(location)) {
          logMessage(`New ⚔️ detected at location: ${location}`);
          recordedEntries.add(location); // Add new entry to the Set

          // Notify all connected clients
          wss.clients.forEach((client) => {
            if (client.readyState === client.OPEN) {
              client.send(`New ⚔️ detected at location: ${location}`);
            }
          });
        }
      } else {
        if (recordedEntries.has(location)) {
          recordedEntries.delete(location); // Remove entry if it no longer contains "⚔️"
        }
      }
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logMessage(`Error fetching the page: ${error.message}`);
    } else {
      logMessage(`An unknown error occurred: ${JSON.stringify(error)}`);
    }
  }
}

// Schedule the check for new entries every minute
cron.schedule("* * * * *", () => {
  logMessage("Checking for new entries...");
  checkForNewEntries();
});

console.log("WebSocket server running on ws://localhost:8080");
