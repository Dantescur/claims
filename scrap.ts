import axios from "axios";
import * as cheerio from "cheerio";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { WebSocketServer } from "ws";

const url = "http://api.chatwars.me/webview/map";
const logFilePath = path.join(__dirname, "log.txt");

const recordedEntries = new Set<string>();

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.send("Connected to the notification service!");

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
          recordedEntries.add(location);

          wss.clients.forEach((client) => {
            if (client.readyState === client.OPEN) {
              client.send(`New ⚔️ detected at location: ${location}`);
            }
          });
        }
      } else {
        if (recordedEntries.has(location)) {
          recordedEntries.delete(location);
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

cron.schedule("* * * * *", () => {
  logMessage("Checking for new entries...");
  checkForNewEntries();
});

console.log("WebSocket server running on ws://localhost:8080");
