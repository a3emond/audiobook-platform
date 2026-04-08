import bcrypt from "bcrypt";

import { logger } from "../config/logger.js";
import { AuthModel } from "../modules/auth/auth.model.js";
import { UserModel } from "../modules/users/user.model.js";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function seedInitialAdminUser(): Promise<void> {
  const rawEmail = process.env.INITIAL_ADMIN_EMAIL?.trim();
  const rawPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const rawDisplayName = process.env.INITIAL_ADMIN_DISPLAY_NAME?.trim();
  const preferredLocale = process.env.INITIAL_ADMIN_LOCALE === "fr" ? "fr" : "en";

  if (!rawEmail && !rawPassword) {
    logger.debug("initial_admin seed skipped (no env vars configured)");
    return;
  }

  if (!rawEmail || !rawPassword) {
    logger.warn(
      "initial_admin seed skipped (set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD)",
    );
    return;
  }

  const email = normalizeEmail(rawEmail);
  const bcryptRounds = Number(process.env.BCRYPT_ROUNDS || 12);

  const user = await UserModel.findOneAndUpdate(
    { email },
    {
      $set: {
        role: "admin",
        "profile.preferredLocale": preferredLocale,
        ...(rawDisplayName ? { "profile.displayName": rawDisplayName } : {}),
      },
      $setOnInsert: {
        email,
      },
    },
    {
      returnDocument: "after",
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  let auth = await AuthModel.findOne({ userId: user._id }).select("+passwordHash");
  if (!auth) {
    const passwordHash = await bcrypt.hash(rawPassword, bcryptRounds);
    auth = await AuthModel.create({
      userId: user._id,
      email,
      passwordHash,
      providers: [],
    });

    logger.info("initial_admin created", { email, userId: String(user._id) });
    return;
  }

  const update: {
    email?: string;
    passwordHash?: string;
  } = {};

  if (auth.email !== email) {
    update.email = email;
  }

  if (!auth.passwordHash) {
    update.passwordHash = await bcrypt.hash(rawPassword, bcryptRounds);
  }

  if (Object.keys(update).length > 0) {
    await AuthModel.updateOne({ _id: auth._id }, { $set: update });
  }

  logger.info("initial_admin ensured", { email, userId: String(user._id) });
}
