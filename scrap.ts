import axios from "axios";
import * as cheerio from "cheerio";
import cron from "node-cron";
import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import winston from "winston";
import { IncomingMessage } from "http";

// Load environment variables
dotenv.config();

// Constants
const url = "http://api.chatwars.me/webview/map";
const recordedEntries = new Set<string>();

// Environment variables
const PORT = process.env.PORT || 8080;
const AUTH_TOKEN = process.env.WS_AUTH_TOKEN;
if (!AUTH_TOKEN) {
  throw new Error("Missing WS_AUTH_TOKEN in environment variables.");
}

// Logger setup
const formats = winston.format;
const { timestamp, errors, json } = formats;

const logger = winston.createLogger({
  level: "info",
  format: formats.combine(errors({ stack: true }), timestamp(), json()),
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: formats.combine(formats.colorize(), formats.simple()),
    }),
  );
}

// Express app setup
const app = express();
const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});

// Rate Limiting Middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});

const rateLimitMap = new Map<WebSocket, number[]>();

function isRateLimit(ws: WebSocket): boolean {
  const now = Date.now();
  let timestamps = rateLimitMap.get(ws) || [];

  timestamps = timestamps.filter(
    (timestamp) => now - timestamp < 15 * 60 * 1000,
  );

  if (timestamps.length >= 100) {
    return true;
  }

  timestamps.push(now);
  rateLimitMap.set(ws, timestamps);
  return false;
}

app.use("/", apiLimiter);

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  if (!isValidClient(req)) {
    ws.close(1008, "Unauthorized");
    return;
  }

  ws.on("message", (message) => {
    if (isRateLimit(ws)) {
      logger.warn("Rate limit exceeded for client");
      ws.send("Rate limit exceeded. Try again later.");
    }
    return;
  });

  logger.info("New client connected");
  ws.send("Connected to the notification service!");

  ws.on("close", () => {
    logger.info("Client disconnected");
  });
});

// Check for new entries and notify clients
async function checkForNewEntries() {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    $(".map-cell").each((_, element) => {
      const bottomLeftText = $(element).find(".bottom-left-text").text();
      const bottomRightText = $(element).find(".bottom-right-text").text();
      const topRightText = $(element).find(".top-right-text").text().trim();
      const location = `${sanitize(bottomRightText)}${sanitize(topRightText)}`;

      if (sanitize(bottomLeftText).includes("⚔️")) {
        if (!recordedEntries.has(location)) {
          logger.info(`New ⚔️ detected at location: ${location}`);
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
  } catch (error) {
    logger.error(
      `Error fetching the page: ${
        error instanceof Error ? error.message : JSON.stringify(error)
      }`,
    );
  }
}

// Validate client using authentication token
function isValidClient(req: IncomingMessage): boolean {
  const token = req.headers["sec-websocket-protocol"];
  return token === AUTH_TOKEN;
}

// Sanitize inputs to prevent injection attacks
function sanitize(input: string): string {
  return input.replace(/[^\w\s⚔️#]/gi, "");
}

// Schedule checks for new entries every minute
cron.schedule("* * * * *", () => {
  logger.info("Checking for new entries...");
  checkForNewEntries();
});

logger.info(`WebSocket server running on ws://localhost:${PORT}`);

function shutdown() {
  logger.info("Shutting down server...");
  server.close(() => {
    logger.info("HTTP server closed.");
    wss.close(() => {
      logger.info("WebSocket server closed.");
      process.exit(0);
    });
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
