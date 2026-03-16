const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { FieldValue } = require("firebase-admin/firestore");

const DISPLAY_NAME_MAX_LENGTH = 50;
const WRITING_CONTEXT_MAX_LENGTH = 200;
const SUPPORTED_SPEAKING_LANGUAGES = new Set(["English", "Nepali", "Korean"]);

exports.updateUserProfile = onCall(
  { region: "us-central1", cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated to update a profile.");
    }

    const { uid, token } = request.auth;
    const data = request.data || {};

    const displayName = typeof data.displayName === "string" ? data.displayName.trim() : "";
    const writingContext = typeof data.writingContext === "string" ? data.writingContext : "";
    const agentSpeakingLanguage = typeof data.agentSpeakingLanguage === "string" ? data.agentSpeakingLanguage : "English";
    const userSpeakingLanguage = typeof data.userSpeakingLanguage === "string" ? data.userSpeakingLanguage : "English";
    const photoURL = typeof data.photoURL === "string" ? data.photoURL.trim() : "";

    if (!displayName) {
      throw new HttpsError("invalid-argument", "Display name is required.");
    }

    if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      throw new HttpsError("invalid-argument", `Display name cannot exceed ${DISPLAY_NAME_MAX_LENGTH} characters.`);
    }

    if (writingContext.length > WRITING_CONTEXT_MAX_LENGTH) {
      throw new HttpsError("invalid-argument", `Writing context cannot exceed ${WRITING_CONTEXT_MAX_LENGTH} characters.`);
    }

    if (!SUPPORTED_SPEAKING_LANGUAGES.has(agentSpeakingLanguage)) {
      throw new HttpsError("invalid-argument", "Unsupported agent speaking language.");
    }

    if (!SUPPORTED_SPEAKING_LANGUAGES.has(userSpeakingLanguage)) {
      throw new HttpsError("invalid-argument", "Unsupported user speaking language.");
    }

    try {
      const db = admin.firestore();
      const auth = admin.auth();
      const userRef = db.collection("users").doc(uid);

      await auth.updateUser(uid, {
        displayName,
        photoURL: photoURL || null,
      });

      await userRef.set(
        {
          displayName,
          displayNameLower: displayName.toLowerCase(),
          email: token.email || "",
          emailVerified: !!token.email_verified,
          photoURL: photoURL || null,
          updatedAt: FieldValue.serverTimestamp(),
          profile: {
            writingContext,
            agentSpeakingLanguage,
            userSpeakingLanguage,
            updatedAt: FieldValue.serverTimestamp(),
          },
          // Legacy mirrors retained temporarily for older reads.
          writingContext,
          language: agentSpeakingLanguage,
          agentSpeakingLanguage,
          userSpeakingLanguage,
        },
        { merge: true },
      );

      logger.info(`Updated profile for ${uid}`, {
        structuredData: true,
        uid,
        agentSpeakingLanguage,
        userSpeakingLanguage,
      });

      return {
        success: true,
        profile: {
          writingContext,
          agentSpeakingLanguage,
          userSpeakingLanguage,
        },
      };
    } catch (error) {
      logger.error(`Failed to update profile for ${uid}`, error);
      throw new HttpsError("internal", error?.message || "Failed to update profile.");
    }
  },
);
