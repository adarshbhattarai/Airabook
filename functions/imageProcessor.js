const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const path = require("path");
const os = require("os");
const fs = require("fs");
const BusBoy = require("busboy");
const { assertStorageAllowance, addStorageUsage } = require("./utils/limits");

// Make sure Admin SDK is initialized (safe even if done elsewhere)
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const ALLOWED_MIME_PREFIXES = ["image/", "video/"];

/**
 * Handles Busboy events for streaming file uploads to Cloud Storage
 * and writing their signed URLs to Firestore.
 *
 * @param {BusBoy} busboy
 * @param {string} uid - Firebase Auth user ID
 * @param {import("express").Response} res
 * @param {FirebaseFirestore.Firestore} db
 */
function handleBusboyEvents(busboy, uid, res, db) {
  const tmpdir = os.tmpdir();
  const writePromises = [];
  const uploads = {};

  // Handle each incoming file
  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
      mimetype.startsWith(prefix)
    );

    if (!isAllowed) {
      console.warn(`Rejected file "${filename}" with type "${mimetype}"`);
      file.resume(); // drain the stream
      res.status(400).send("Invalid file type. Only images and videos are allowed.");
      return;
    }

    const filepath = path.join(tmpdir, filename);
    const writeStream = fs.createWriteStream(filepath);
    file.pipe(writeStream);

    const writePromise = new Promise((resolve, reject) => {
      file.on("end", () => {
        writeStream.end();
      });

      writeStream.on("finish", () => {
        uploads[filename] = { filepath, mimetype };
        resolve();
      });

      writeStream.on("error", reject);
    });

    writePromises.push(writePromise);
  });

  // When all files have been read
  busboy.on("finish", async () => {
    try {
      await Promise.all(writePromises);

      // Compute total incoming size from temp files
      let totalSizeBytes = 0;
      for (const { filepath } of Object.values(uploads)) {
        try {
          const stat = fs.statSync(filepath);
          totalSizeBytes += stat.size || 0;
        } catch (err) {
          console.warn("Could not stat temp upload:", err?.message);
        }
      }

      if (totalSizeBytes > 0) {
        await assertStorageAllowance(db, uid, totalSizeBytes);
      }

      const bucket = admin.storage().bucket();
      let uploadedTotal = 0;
      const uploadTasks = Object.entries(uploads).map(
        async ([filename, { filepath, mimetype }]) => {
          // Upload to Storage
          const [file] = await bucket.upload(filepath, {
            destination: `media/${uid}/${filename}`,
            metadata: { contentType: mimetype },
          });

          const [meta] = await file.getMetadata();
          const sizeBytes = parseInt(meta?.size || "0", 10) || 0;
          uploadedTotal += sizeBytes;

          // Make signed URL
          const [publicUrl] = await file.getSignedUrl({
            action: "read",
            expires: "03-09-2491",
          });

          // Save URL record in Firestore
          const db = admin.firestore();
          return db
            .collection("mediaUrls")
            .add({
              url: publicUrl,
              userId: uid,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
      );

      await Promise.all(uploadTasks);
      if (uploadedTotal > 0) {
        await addStorageUsage(db, uid, uploadedTotal);
      }

      res.status(200).send("Files uploaded successfully.");
    } catch (error) {
      console.error("Error uploading files:", error);
      const status = error?.code === "resource-exhausted" ? 403 : 500;
      res.status(status).send(error?.message || "Error uploading files.");
    }
  });
}

exports.uploadMedia = onRequest(async (req, res) => {
  console.log("uploadMedia function triggered");

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const authHeader = req.headers.authorization || "";
  const hasBearer = authHeader.startsWith("Bearer ");

  if (!hasBearer) {
    return res.status(401).send("Unauthorized");
  }

  const idToken = authHeader.split("Bearer ")[1];

  let uid;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (error) {
    console.error("Error while verifying Firebase ID token:", error);
    return res.status(403).send("Unauthorized");
  }

  const busboy = new BusBoy({ headers: req.headers });
  handleBusboyEvents(busboy, uid, res, db);
  busboy.end(req.rawBody);
});

// Export helper for tests
if (process.env.NODE_ENV === "test") {
  exports.handleBusboyEvents = handleBusboyEvents;
}
