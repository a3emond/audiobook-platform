import dotenv from "dotenv";

dotenv.config(); // fill process.env with values from .env file

// helper function to ensure required env vars are present
function requireEnv(name: string): string { 
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.API_PORT || "3000", 10), // string to number because env keys/values are strings by nature 

  mongoUri: requireEnv("MONGO_URI"),

  jwt: {
    secret: requireEnv("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "7d", // default to 7 days if not specified
  },
};
